create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint ai_conversations_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint ai_conversations_id_trip_user_key
    unique (id, trip_id, user_id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  trip_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  model text,
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check
    check (role in ('user', 'assistant')),
  constraint ai_messages_content_check
    check (char_length(btrim(content)) between 1 and 20000),
  constraint ai_messages_conversation_scope_fkey
    foreign key (conversation_id, trip_id, user_id)
    references public.ai_conversations(id, trip_id, user_id)
    on delete cascade,
  constraint ai_messages_trip_id_fkey
    foreign key (trip_id) references public.trips(id) on delete cascade,
  constraint ai_messages_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade
);

create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  event_type text not null default 'assistant_request',
  model text not null,
  occurred_at timestamptz not null default now(),
  usage_date date not null default ((now() at time zone 'utc')::date),
  constraint ai_usage_events_type_check
    check (event_type = 'assistant_request'),
  constraint ai_usage_events_model_check
    check (char_length(btrim(model)) between 1 and 120),
  constraint ai_usage_events_utc_date_check
    check (usage_date = ((occurred_at at time zone 'utc')::date))
);

create index ai_conversations_user_trip_updated_idx
  on public.ai_conversations (user_id, trip_id, updated_at desc, id desc);

create index ai_conversations_trip_id_idx
  on public.ai_conversations (trip_id);

create index ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at desc, id desc);

create index ai_messages_trip_id_idx
  on public.ai_messages (trip_id);

create index ai_messages_user_id_idx
  on public.ai_messages (user_id);

create index ai_usage_events_user_day_idx
  on public.ai_usage_events (user_id, usage_date);

create index ai_usage_events_trip_id_idx
  on public.ai_usage_events (trip_id);

create index ai_usage_events_conversation_id_idx
  on public.ai_usage_events (conversation_id)
  where conversation_id is not null;

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_conversations from public, anon;
revoke all on table public.ai_messages from public, anon;
revoke all on table public.ai_usage_events from public, anon;

grant select, insert, update, delete on table public.ai_conversations
  to authenticated;
grant select, insert on table public.ai_messages
  to authenticated;
grant select on table public.ai_usage_events
  to authenticated;

grant all on table public.ai_conversations to service_role;
grant all on table public.ai_messages to service_role;
grant all on table public.ai_usage_events to service_role;
grant usage, select on sequence public.ai_usage_events_id_seq to service_role;

create policy "Users can view own trip conversations"
on public.ai_conversations
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

create policy "Users can create own trip conversations"
on public.ai_conversations
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

create policy "Users can update own trip conversations"
on public.ai_conversations
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

create policy "Users can delete own trip conversations"
on public.ai_conversations
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

create policy "Users can view own trip assistant messages"
on public.ai_messages
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

create policy "Users can create own trip assistant messages"
on public.ai_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = conversation_id
      and conversation.trip_id = ai_messages.trip_id
      and conversation.user_id = (select auth.uid())
  )
);

create policy "Users can view own assistant usage"
on public.ai_usage_events
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.consume_ai_daily_usage(
  target_trip_id uuid,
  target_conversation_id uuid,
  target_model text,
  daily_limit integer
)
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  usage_event_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_utc_date date := (now() at time zone 'utc')::date;
  current_usage integer;
  inserted_event_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if daily_limit < 1 or daily_limit > 10000 then
    raise exception 'Invalid assistant daily limit' using errcode = '22023';
  end if;

  if target_model is null or char_length(btrim(target_model)) not between 1 and 120 then
    raise exception 'Invalid assistant model' using errcode = '22023';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'Trip access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = target_conversation_id
      and conversation.trip_id = target_trip_id
      and conversation.user_id = current_user_id
  ) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text || ':' || current_utc_date::text,
      0
    )
  );

  select count(*)::integer
  into current_usage
  from public.ai_usage_events usage_event
  where usage_event.user_id = current_user_id
    and usage_event.usage_date = current_utc_date
    and usage_event.event_type = 'assistant_request';

  if current_usage >= daily_limit then
    return query
    select false, current_usage, 0, null::bigint;
    return;
  end if;

  insert into public.ai_usage_events (
    user_id,
    trip_id,
    conversation_id,
    event_type,
    model,
    occurred_at,
    usage_date
  )
  values (
    current_user_id,
    target_trip_id,
    target_conversation_id,
    'assistant_request',
    btrim(target_model),
    now(),
    current_utc_date
  )
  returning id into inserted_event_id;

  current_usage := current_usage + 1;

  return query
  select true, current_usage, greatest(daily_limit - current_usage, 0), inserted_event_id;
end;
$$;

revoke all on function public.consume_ai_daily_usage(uuid, uuid, text, integer)
  from public, anon;
grant execute on function public.consume_ai_daily_usage(uuid, uuid, text, integer)
  to authenticated, service_role;

create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

comment on table public.ai_conversations is
  'Private, user-owned Gemini assistant conversations scoped to one accessible trip.';
comment on table public.ai_messages is
  'Persisted user and assistant messages. VAIVIA remains the conversation source of truth.';
comment on table public.ai_usage_events is
  'Immutable accepted assistant request events used for per-user UTC daily quotas.';
comment on function public.consume_ai_daily_usage(uuid, uuid, text, integer) is
  'Atomically enforces the authenticated user assistant request limit for the current UTC day.';
