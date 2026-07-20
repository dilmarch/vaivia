-- Phase 2C: confirmation-gated writes from validated Google Places recommendations.
-- Google Places content remains transient. Only Place IDs and user-authored planning
-- fields are stored in trip-domain tables.

create table public.ai_place_action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  source_message_id uuid not null references public.ai_messages(id) on delete cascade,
  action_type text not null,
  source_type text not null default 'google_place',
  google_place_id text not null,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  completed_at timestamptz,
  idempotency_key uuid not null default gen_random_uuid(),
  target_record_type text,
  target_record_id uuid,
  place_details_call_count smallint not null default 0,
  place_details_outcome text not null default 'not_requested',
  failure_code text,
  constraint ai_place_action_proposals_action_type_check
    check (action_type in ('save_thing_to_do', 'save_food', 'add_itinerary')),
  constraint ai_place_action_proposals_source_type_check
    check (source_type = 'google_place'),
  constraint ai_place_action_proposals_place_id_check
    check (google_place_id ~ '^[A-Za-z0-9_-]{8,255}$'),
  constraint ai_place_action_proposals_status_check
    check (status in ('proposed', 'confirmed', 'succeeded', 'failed', 'cancelled', 'expired')),
  constraint ai_place_action_proposals_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '20 minutes'),
  constraint ai_place_action_proposals_idempotency_key_unique unique (idempotency_key),
  constraint ai_place_action_proposals_target_pair_check
    check ((target_record_type is null) = (target_record_id is null)),
  constraint ai_place_action_proposals_target_type_check
    check (target_record_type is null or target_record_type in ('trip_idea', 'trip_food_item', 'itinerary_item')),
  constraint ai_place_action_proposals_details_count_check
    check (place_details_call_count between 0 and 1),
  constraint ai_place_action_proposals_details_outcome_check
    check (place_details_outcome in ('not_requested', 'requested', 'succeeded', 'failed')),
  constraint ai_place_action_proposals_details_relationship_check
    check (
      (place_details_call_count = 0 and place_details_outcome = 'not_requested')
      or (place_details_call_count = 1 and place_details_outcome in ('requested', 'succeeded', 'failed'))
    ),
  constraint ai_place_action_proposals_failure_code_check
    check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  constraint ai_place_action_proposals_status_timestamps_check
    check (
      (status = 'proposed' and confirmed_at is null and completed_at is null)
      or (status = 'confirmed' and confirmed_at is not null and completed_at is null)
      or (status in ('succeeded', 'failed') and confirmed_at is not null and completed_at is not null)
      or (status in ('cancelled', 'expired') and confirmed_at is null and completed_at is not null)
    )
);

create index ai_place_action_proposals_user_trip_created_idx
  on public.ai_place_action_proposals (user_id, trip_id, created_at desc);

create index ai_place_action_proposals_source_message_idx
  on public.ai_place_action_proposals (source_message_id, user_id);

create index ai_place_action_proposals_expiry_idx
  on public.ai_place_action_proposals (expires_at)
  where status = 'proposed';

create unique index ai_place_action_proposals_one_open_idx
  on public.ai_place_action_proposals (user_id, source_message_id, google_place_id, action_type)
  where status = 'proposed';

alter table public.ai_place_action_proposals enable row level security;

create policy "Users can view own assistant place action proposals"
on public.ai_place_action_proposals
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
);

revoke all on table public.ai_place_action_proposals from public, anon, authenticated;
grant select on table public.ai_place_action_proposals to authenticated;
grant all on table public.ai_place_action_proposals to service_role;

-- Assistant-created targets retain an immutable link to their reviewed proposal.
alter table public.trip_ideas
  add column assistant_action_proposal_id uuid references public.ai_place_action_proposals(id) on delete set null,
  add column place_source text,
  add column google_place_id_saved_at timestamptz,
  add constraint trip_ideas_place_source_check
    check (place_source is null or place_source = 'google_place_assistant'),
  add constraint trip_ideas_assistant_place_link_check
    check (
      (assistant_action_proposal_id is null and (
        (place_source is null and google_place_id_saved_at is null)
        or (place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
      ))
      or
      (assistant_action_proposal_id is not null and place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
    );

alter table public.trip_food_items
  add column assistant_action_proposal_id uuid references public.ai_place_action_proposals(id) on delete set null,
  add column place_source text,
  add column google_place_id_saved_at timestamptz,
  add constraint trip_food_items_place_source_check
    check (place_source is null or place_source = 'google_place_assistant'),
  add constraint trip_food_items_assistant_place_link_check
    check (
      (assistant_action_proposal_id is null and (
        (place_source is null and google_place_id_saved_at is null)
        or (place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
      ))
      or
      (assistant_action_proposal_id is not null and place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
    );

alter table public.itinerary_items
  add column assistant_action_proposal_id uuid references public.ai_place_action_proposals(id) on delete set null,
  add column place_source text,
  add column google_place_id_saved_at timestamptz,
  add constraint itinerary_items_place_source_check
    check (place_source is null or place_source = 'google_place_assistant'),
  add constraint itinerary_items_assistant_place_link_check
    check (
      (assistant_action_proposal_id is null and (
        (place_source is null and google_place_id_saved_at is null)
        or (place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
      ))
      or
      (assistant_action_proposal_id is not null and place_source = 'google_place_assistant' and google_place_id_saved_at is not null and google_place_id is not null)
    );

alter table public.trip_food_items
  drop constraint trip_food_items_place_required;

alter table public.trip_food_items
  add constraint trip_food_items_place_required check (
    item_type <> 'place'
    or (
      google_place_id is not null
      and length(btrim(google_place_id)) > 0
      and (
        (formatted_address is not null and length(btrim(formatted_address)) > 0)
        or (
          assistant_action_proposal_id is not null
          and place_source = 'google_place_assistant'
        )
      )
    )
  );

create unique index trip_ideas_assistant_action_proposal_idx
  on public.trip_ideas (assistant_action_proposal_id)
  where assistant_action_proposal_id is not null;

create unique index trip_food_items_assistant_action_proposal_idx
  on public.trip_food_items (assistant_action_proposal_id)
  where assistant_action_proposal_id is not null;

create unique index itinerary_items_assistant_action_proposal_idx
  on public.itinerary_items (assistant_action_proposal_id)
  where assistant_action_proposal_id is not null;

create unique index trip_ideas_assistant_place_unique_idx
  on public.trip_ideas (trip_id, google_place_id)
  where place_source = 'google_place_assistant' and google_place_id is not null;

create unique index trip_food_items_assistant_place_unique_idx
  on public.trip_food_items (trip_id, google_place_id)
  where place_source = 'google_place_assistant' and google_place_id is not null;

create or replace function public.validate_ai_place_action_target_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.ai_place_action_proposals%rowtype;
  expected_action text;
begin
  if tg_op = 'UPDATE' and not (
    old.assistant_action_proposal_id is not null
    and new.assistant_action_proposal_id is null
    and new.place_source is not distinct from old.place_source
    and new.google_place_id_saved_at is not distinct from old.google_place_id_saved_at
    and pg_catalog.pg_trigger_depth() > 1
  ) and (
    new.assistant_action_proposal_id is distinct from old.assistant_action_proposal_id
    or new.place_source is distinct from old.place_source
    or new.google_place_id_saved_at is distinct from old.google_place_id_saved_at
  ) then
    raise exception 'Assistant place linkage is immutable' using errcode = '42501';
  end if;

  if new.assistant_action_proposal_id is null then
    return new;
  end if;

  expected_action := case tg_table_name
    when 'trip_ideas' then 'save_thing_to_do'
    when 'trip_food_items' then 'save_food'
    when 'itinerary_items' then 'add_itinerary'
    else null
  end;

  select *
  into proposal
  from public.ai_place_action_proposals action_proposal
  where action_proposal.id = new.assistant_action_proposal_id
    and action_proposal.user_id = (select auth.uid())
    and action_proposal.trip_id = new.trip_id
    and action_proposal.action_type = expected_action
    and action_proposal.source_type = 'google_place'
    and action_proposal.status = 'confirmed';

  if proposal.id is null
    or new.place_source <> 'google_place_assistant'
    or new.google_place_id <> proposal.google_place_id
  then
    raise exception 'Invalid assistant place action link' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_ai_place_action_target_link() from public, anon, authenticated;

create trigger validate_trip_ideas_ai_place_link
before insert or update on public.trip_ideas
for each row execute function public.validate_ai_place_action_target_link();

create trigger validate_trip_food_items_ai_place_link
before insert or update on public.trip_food_items
for each row execute function public.validate_ai_place_action_target_link();

create trigger validate_itinerary_items_ai_place_link
before insert or update on public.itinerary_items
for each row execute function public.validate_ai_place_action_target_link();

create or replace function public.create_ai_place_action_proposal(
  target_trip_id uuid,
  target_conversation_id uuid,
  target_message_id uuid,
  target_place_id text,
  target_action_type text
)
returns table (
  proposal_id uuid,
  proposal_status text,
  proposal_expires_at timestamptz,
  existing_target_type text,
  existing_target_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_place_id text := btrim(target_place_id);
  existing_proposal public.ai_place_action_proposals%rowtype;
  duplicate_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_action_type not in ('save_thing_to_do', 'save_food', 'add_itinerary')
    or normalized_place_id !~ '^[A-Za-z0-9_-]{8,255}$'
  then
    raise exception 'Invalid action request' using errcode = '22023';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = target_conversation_id
      and conversation.trip_id = target_trip_id
      and conversation.user_id = current_user_id
  ) then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ai_messages message
    where message.id = target_message_id
      and message.conversation_id = target_conversation_id
      and message.trip_id = target_trip_id
      and message.user_id = current_user_id
      and message.role = 'assistant'
      and message.status = 'complete'
      and message.metadata ->> 'type' = 'google_places_recommendations'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(message.metadata -> 'recommendations', '[]'::jsonb)) recommendation
        where recommendation ->> 'placeId' = normalized_place_id
      )
  ) then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text || ':' || target_trip_id::text || ':' || target_action_type || ':' || normalized_place_id,
      0
    )
  );

  update public.ai_place_action_proposals
  set status = 'expired',
      completed_at = now(),
      failure_code = 'proposal_expired'
  where user_id = current_user_id
    and source_message_id = target_message_id
    and google_place_id = normalized_place_id
    and action_type = target_action_type
    and status = 'proposed'
    and expires_at <= now();

  if target_action_type = 'save_thing_to_do' then
    select idea.id
    into duplicate_id
    from public.trip_ideas idea
    where idea.trip_id = target_trip_id
      and idea.google_place_id = normalized_place_id
      and public.is_trip_active_member(idea.trip_id)
    order by idea.created_at
    limit 1;

    if duplicate_id is not null then
      return query select null::uuid, 'already_saved'::text, null::timestamptz, 'trip_idea'::text, duplicate_id;
      return;
    end if;
  elsif target_action_type = 'save_food' then
    select food.id
    into duplicate_id
    from public.trip_food_items food
    where food.trip_id = target_trip_id
      and food.google_place_id = normalized_place_id
      and public.is_trip_active_member(food.trip_id)
    order by food.created_at
    limit 1;

    if duplicate_id is not null then
      return query select null::uuid, 'already_saved'::text, null::timestamptz, 'trip_food_item'::text, duplicate_id;
      return;
    end if;
  end if;

  select *
  into existing_proposal
  from public.ai_place_action_proposals action_proposal
  where action_proposal.user_id = current_user_id
    and action_proposal.source_message_id = target_message_id
    and action_proposal.google_place_id = normalized_place_id
    and action_proposal.action_type = target_action_type
    and action_proposal.status = 'proposed'
    and action_proposal.expires_at > now()
  limit 1;

  if existing_proposal.id is null then
    insert into public.ai_place_action_proposals (
      user_id,
      trip_id,
      conversation_id,
      source_message_id,
      action_type,
      google_place_id
    ) values (
      current_user_id,
      target_trip_id,
      target_conversation_id,
      target_message_id,
      target_action_type,
      normalized_place_id
    )
    returning * into existing_proposal;
  end if;

  return query
  select existing_proposal.id, existing_proposal.status, existing_proposal.expires_at, null::text, null::uuid;
end;
$$;

revoke all on function public.create_ai_place_action_proposal(uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.create_ai_place_action_proposal(uuid, uuid, uuid, text, text)
  to authenticated;

create or replace function public.reserve_ai_place_action_details_call(target_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  updated_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  update public.ai_place_action_proposals proposal
  set place_details_call_count = 1,
      place_details_outcome = 'requested'
  where proposal.id = target_proposal_id
    and proposal.user_id = current_user_id
    and proposal.status = 'proposed'
    and proposal.expires_at > now()
    and proposal.place_details_call_count = 0
    and public.is_trip_active_member(proposal.trip_id);

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.reserve_ai_place_action_details_call(uuid) from public, anon;
grant execute on function public.reserve_ai_place_action_details_call(uuid) to authenticated;

create or replace function public.complete_ai_place_action_details_call(
  target_proposal_id uuid,
  target_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  updated_count integer;
begin
  if current_user_id is null or target_outcome not in ('succeeded', 'failed') then
    return false;
  end if;

  update public.ai_place_action_proposals proposal
  set place_details_outcome = target_outcome
  where proposal.id = target_proposal_id
    and proposal.user_id = current_user_id
    and proposal.status = 'proposed'
    and proposal.place_details_call_count = 1
    and proposal.place_details_outcome = 'requested'
    and public.is_trip_active_member(proposal.trip_id);

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_ai_place_action_details_call(uuid, text) from public, anon;
grant execute on function public.complete_ai_place_action_details_call(uuid, text) to authenticated;

create or replace function public.cancel_ai_place_action_proposal(target_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  updated_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  update public.ai_place_action_proposals proposal
  set status = 'cancelled',
      completed_at = now(),
      failure_code = null
  where proposal.id = target_proposal_id
    and proposal.user_id = current_user_id
    and proposal.status = 'proposed'
    and public.is_trip_active_member(proposal.trip_id);

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.cancel_ai_place_action_proposal(uuid) from public, anon;
grant execute on function public.cancel_ai_place_action_proposal(uuid) to authenticated;

create or replace function public.confirm_ai_place_action_proposal(
  target_proposal_id uuid,
  target_fields jsonb
)
returns table (
  proposal_status text,
  target_record_type text,
  target_record_id uuid,
  failure_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  proposal public.ai_place_action_proposals%rowtype;
  new_target_id uuid;
  duplicate_id uuid;
  label_value text;
  notes_value text;
  region_value text;
  category_value text;
  availability_mode text;
  days_value text[] := '{}'::text[];
  time_of_day_value text[] := '{}'::text[];
  meal_categories_value text[] := array['any']::text[];
  opens_at_value time;
  closes_at_value time;
  item_date_value date;
  start_time_value time;
  end_time_value time;
  timezone_value text;
  status_value text;
  audience_mode_value text;
  category_id_value uuid;
  trip_leg_id_value uuid;
  candidate_uuid text;
begin
  if current_user_id is null or target_fields is null or jsonb_typeof(target_fields) <> 'object' then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  select *
  into proposal
  from public.ai_place_action_proposals action_proposal
  where action_proposal.id = target_proposal_id
    and action_proposal.user_id = current_user_id
  for update;

  if proposal.id is null or not public.is_trip_active_member(proposal.trip_id) then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  if proposal.status = 'succeeded' then
    return query select proposal.status, proposal.target_record_type, proposal.target_record_id, null::text;
    return;
  end if;

  if proposal.status <> 'proposed' then
    return query select proposal.status, proposal.target_record_type, proposal.target_record_id, coalesce(proposal.failure_code, 'action_not_available');
    return;
  end if;

  if proposal.expires_at <= now() then
    update public.ai_place_action_proposals
    set status = 'expired', completed_at = now(), failure_code = 'proposal_expired'
    where id = proposal.id;
    return query select 'expired'::text, null::text, null::uuid, 'proposal_expired'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.ai_conversations conversation
    join public.ai_messages message
      on message.id = proposal.source_message_id
     and message.conversation_id = conversation.id
     and message.trip_id = conversation.trip_id
     and message.user_id = conversation.user_id
    where conversation.id = proposal.conversation_id
      and conversation.trip_id = proposal.trip_id
      and conversation.user_id = current_user_id
      and message.role = 'assistant'
      and message.status = 'complete'
      and message.metadata ->> 'type' = 'google_places_recommendations'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(message.metadata -> 'recommendations', '[]'::jsonb)) recommendation
        where recommendation ->> 'placeId' = proposal.google_place_id
      )
  ) then
    raise exception 'Action not found' using errcode = '42501';
  end if;

  label_value := btrim(coalesce(target_fields ->> 'label', ''));
  if char_length(label_value) not between 1 and 160 then
    return query select 'proposed'::text, null::text, null::uuid, 'invalid_label'::text;
    return;
  end if;

  notes_value := nullif(btrim(coalesce(target_fields ->> 'notes', '')), '');
  if notes_value is not null and char_length(notes_value) > 2000 then
    return query select 'proposed'::text, null::text, null::uuid, 'invalid_notes'::text;
    return;
  end if;

  candidate_uuid := nullif(btrim(coalesce(target_fields ->> 'tripLegId', '')), '');
  if candidate_uuid is not null then
    if candidate_uuid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_trip_leg'::text;
      return;
    end if;
    trip_leg_id_value := candidate_uuid::uuid;
    if not public.can_access_trip_leg(proposal.trip_id, trip_leg_id_value) then
      raise exception 'Action not found' using errcode = '42501';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text || ':' || proposal.trip_id::text || ':' || proposal.action_type || ':' || proposal.google_place_id,
      0
    )
  );

  if proposal.action_type = 'save_thing_to_do' then
    if exists (
      select 1 from jsonb_object_keys(target_fields) key
      where key not in ('label', 'notes', 'category', 'availabilityMode', 'daysAvailable', 'timeOfDay', 'opensAt', 'closesAt', 'tripLegId')
    ) then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_fields'::text;
      return;
    end if;

    category_value := btrim(coalesce(target_fields ->> 'category', 'Other'));
    if category_value not in ('Food & Drink', 'Nightlife', 'Culture', 'Entertainment', 'Outdoors', 'Shopping', 'Sightseeing', 'Wellness', 'Practical', 'Other') then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_category'::text;
      return;
    end if;

    availability_mode := btrim(coalesce(target_fields ->> 'availabilityMode', 'flexible'));
    if availability_mode not in ('flexible', 'specific_time') then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
      return;
    end if;

    if target_fields ? 'daysAvailable' then
      if jsonb_typeof(target_fields -> 'daysAvailable') <> 'array' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
        return;
      end if;
      select coalesce(array_agg(distinct day_value), '{}'::text[])
      into days_value
      from jsonb_array_elements_text(target_fields -> 'daysAvailable') day_value;
      if cardinality(days_value) > 7 or exists (
        select 1 from unnest(days_value) day_value
        where day_value not in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
      ) then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
        return;
      end if;
    end if;

    if target_fields ? 'timeOfDay' then
      if jsonb_typeof(target_fields -> 'timeOfDay') <> 'array' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
        return;
      end if;
      select coalesce(array_agg(distinct time_value), '{}'::text[])
      into time_of_day_value
      from jsonb_array_elements_text(target_fields -> 'timeOfDay') time_value;
      if cardinality(time_of_day_value) > 5 or exists (
        select 1 from unnest(time_of_day_value) time_value
        where time_value not in ('early_morning', 'morning', 'afternoon', 'evening', 'late_night')
      ) then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
        return;
      end if;
    end if;

    if availability_mode = 'specific_time' then
      if coalesce(target_fields ->> 'opensAt', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(target_fields ->> 'closesAt', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_availability'::text;
        return;
      end if;
      opens_at_value := (target_fields ->> 'opensAt')::time;
      closes_at_value := (target_fields ->> 'closesAt')::time;
    end if;

    select idea.id
    into duplicate_id
    from public.trip_ideas idea
    where idea.trip_id = proposal.trip_id
      and idea.google_place_id = proposal.google_place_id
    order by idea.created_at
    limit 1;

    if duplicate_id is not null then
      update public.ai_place_action_proposals
      set status = 'failed',
          confirmed_at = now(),
          completed_at = now(),
          target_record_type = 'trip_idea',
          target_record_id = duplicate_id,
          failure_code = 'already_saved'
      where id = proposal.id;
      return query select 'failed'::text, 'trip_idea'::text, duplicate_id, 'already_saved'::text;
      return;
    end if;
  elsif proposal.action_type = 'save_food' then
    if exists (
      select 1 from jsonb_object_keys(target_fields) key
      where key not in ('label', 'notes', 'region', 'mealCategories', 'tripLegId')
    ) then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_fields'::text;
      return;
    end if;

    region_value := nullif(btrim(coalesce(target_fields ->> 'region', '')), '');
    if region_value is not null and char_length(region_value) > 160 then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_region'::text;
      return;
    end if;

    if target_fields ? 'mealCategories' then
      if jsonb_typeof(target_fields -> 'mealCategories') <> 'array' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_meal_categories'::text;
        return;
      end if;
      select coalesce(array_agg(distinct meal_value), array['any']::text[])
      into meal_categories_value
      from jsonb_array_elements_text(target_fields -> 'mealCategories') meal_value;
      if cardinality(meal_categories_value) = 0
        or cardinality(meal_categories_value) > 11
        or exists (
          select 1 from unnest(meal_categories_value) meal_value
          where meal_value not in ('any', 'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert', 'coffee', 'drinks', 'late_night', 'grocery_store')
        )
        or ('any' = any(meal_categories_value) and cardinality(meal_categories_value) > 1)
      then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_meal_categories'::text;
        return;
      end if;
    end if;

    select food.id
    into duplicate_id
    from public.trip_food_items food
    where food.trip_id = proposal.trip_id
      and food.google_place_id = proposal.google_place_id
    order by food.created_at
    limit 1;

    if duplicate_id is not null then
      update public.ai_place_action_proposals
      set status = 'failed',
          confirmed_at = now(),
          completed_at = now(),
          target_record_type = 'trip_food_item',
          target_record_id = duplicate_id,
          failure_code = 'already_saved'
      where id = proposal.id;
      return query select 'failed'::text, 'trip_food_item'::text, duplicate_id, 'already_saved'::text;
      return;
    end if;
  else
    if exists (
      select 1 from jsonb_object_keys(target_fields) key
      where key not in ('label', 'notes', 'date', 'startTime', 'endTime', 'timezone', 'status', 'audienceMode', 'categoryId', 'tripLegId')
    ) then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_fields'::text;
      return;
    end if;

    begin
      if coalesce(target_fields ->> 'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid date';
      end if;
      item_date_value := (target_fields ->> 'date')::date;
      if to_char(item_date_value, 'YYYY-MM-DD') <> target_fields ->> 'date' then
        raise exception 'invalid date';
      end if;
    exception when others then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_date'::text;
      return;
    end;

    if nullif(target_fields ->> 'startTime', '') is not null then
      if target_fields ->> 'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_time'::text;
        return;
      end if;
      start_time_value := (target_fields ->> 'startTime')::time;
    end if;

    if nullif(target_fields ->> 'endTime', '') is not null then
      if target_fields ->> 'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_time'::text;
        return;
      end if;
      end_time_value := (target_fields ->> 'endTime')::time;
    end if;

    timezone_value := btrim(coalesce(target_fields ->> 'timezone', ''));
    if char_length(timezone_value) not between 1 and 80
      or not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = timezone_value)
    then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_timezone'::text;
      return;
    end if;

    status_value := btrim(coalesce(target_fields ->> 'status', 'tentative'));
    if status_value not in ('tentative', 'confirmed') then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_status'::text;
      return;
    end if;

    audience_mode_value := btrim(coalesce(target_fields ->> 'audienceMode', 'everyone'));
    if audience_mode_value not in ('everyone', 'just_me') then
      return query select 'proposed'::text, null::text, null::uuid, 'invalid_audience'::text;
      return;
    end if;

    candidate_uuid := nullif(btrim(coalesce(target_fields ->> 'categoryId', '')), '');
    if candidate_uuid is not null then
      if candidate_uuid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        return query select 'proposed'::text, null::text, null::uuid, 'invalid_category'::text;
        return;
      end if;
      category_id_value := candidate_uuid::uuid;
      select user_category.name
      into category_value
      from public.user_categories user_category
      where user_category.id = category_id_value
        and user_category.user_id = current_user_id;
      if category_value is null then
        raise exception 'Action not found' using errcode = '42501';
      end if;
    else
      category_value := 'Activity';
    end if;
  end if;

  update public.ai_place_action_proposals
  set status = 'confirmed', confirmed_at = now(), failure_code = null
  where id = proposal.id;

  begin
    if proposal.action_type = 'save_thing_to_do' then
      insert into public.trip_ideas (
        trip_id, created_by, title, description, category, days_of_week,
        time_of_day, opens_at, closes_at, google_place_id, trip_leg_id,
        assistant_action_proposal_id, place_source, google_place_id_saved_at
      ) values (
        proposal.trip_id, current_user_id, label_value, notes_value, category_value,
        days_value, time_of_day_value, opens_at_value, closes_at_value,
        proposal.google_place_id, trip_leg_id_value, proposal.id,
        'google_place_assistant', now()
      ) returning id into new_target_id;

      update public.ai_place_action_proposals
      set status = 'succeeded', completed_at = now(),
          target_record_type = 'trip_idea', target_record_id = new_target_id
      where id = proposal.id;
      return query select 'succeeded'::text, 'trip_idea'::text, new_target_id, null::text;
    elsif proposal.action_type = 'save_food' then
      insert into public.trip_food_items (
        trip_id, created_by, item_type, name, personal_note, region,
        meal_categories, google_place_id, assistant_action_proposal_id,
        place_source, google_place_id_saved_at
      ) values (
        proposal.trip_id, current_user_id, 'place', label_value, notes_value,
        region_value, meal_categories_value, proposal.google_place_id,
        proposal.id, 'google_place_assistant', now()
      ) returning id into new_target_id;

      update public.ai_place_action_proposals
      set status = 'succeeded', completed_at = now(),
          target_record_type = 'trip_food_item', target_record_id = new_target_id
      where id = proposal.id;
      return query select 'succeeded'::text, 'trip_food_item'::text, new_target_id, null::text;
    else
      insert into public.itinerary_items (
        trip_id, created_by, title, category, category_id, status, item_date,
        start_time, end_time, timezone, timezone_source, notes, trip_leg_id,
        audience_mode, google_place_id, assistant_action_proposal_id,
        place_source, google_place_id_saved_at
      ) values (
        proposal.trip_id, current_user_id, label_value, category_value,
        category_id_value, status_value, item_date_value, start_time_value,
        end_time_value, timezone_value, 'manual', notes_value, trip_leg_id_value,
        audience_mode_value, proposal.google_place_id, proposal.id,
        'google_place_assistant', now()
      ) returning id into new_target_id;

      update public.ai_place_action_proposals
      set status = 'succeeded', completed_at = now(),
          target_record_type = 'itinerary_item', target_record_id = new_target_id
      where id = proposal.id;
      return query select 'succeeded'::text, 'itinerary_item'::text, new_target_id, null::text;
    end if;
  exception
    when unique_violation then
      update public.ai_place_action_proposals
      set status = 'failed', completed_at = now(), failure_code = 'already_saved'
      where id = proposal.id;
      return query select 'failed'::text, null::text, null::uuid, 'already_saved'::text;
    when others then
      update public.ai_place_action_proposals
      set status = 'failed', completed_at = now(), failure_code = 'target_write_failed'
      where id = proposal.id;
      return query select 'failed'::text, null::text, null::uuid, 'target_write_failed'::text;
  end;
end;
$$;

revoke all on function public.confirm_ai_place_action_proposal(uuid, jsonb) from public, anon;
grant execute on function public.confirm_ai_place_action_proposal(uuid, jsonb) to authenticated;

comment on table public.ai_place_action_proposals is
  'Short-lived, user-owned confirmation proposals for validated Google Places recommendations. Stores no provider content beyond Place IDs.';

comment on column public.ai_place_action_proposals.place_details_call_count is
  'Bounded numeric count only. Queries, coordinates, names, URLs, and provider payloads are never stored.';

comment on column public.trip_ideas.google_place_id_saved_at is
  'Tracks when a permitted Google Place ID was saved so IDs older than twelve months can be refreshed without storing Places content.';

comment on column public.trip_food_items.google_place_id_saved_at is
  'Tracks when a permitted Google Place ID was saved so IDs older than twelve months can be refreshed without storing Places content.';

comment on column public.itinerary_items.google_place_id_saved_at is
  'Tracks when a permitted Google Place ID was saved so IDs older than twelve months can be refreshed without storing Places content.';
