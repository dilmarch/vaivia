drop function if exists public.consume_ai_daily_usage(uuid, uuid, text, integer);

create function public.consume_ai_daily_usage(
  target_user_id uuid,
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
  current_utc_date date := (now() at time zone 'utc')::date;
  current_usage integer;
  inserted_event_id bigint;
begin
  if target_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  if daily_limit < 1 or daily_limit > 10000 then
    raise exception 'Invalid assistant daily limit' using errcode = '22023';
  end if;

  if target_model is null or char_length(btrim(target_model)) not between 1 and 120 then
    raise exception 'Invalid assistant model' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.trips trip
    where trip.id = target_trip_id
      and (
        trip.user_id = target_user_id
        or exists (
          select 1
          from public.trip_members member
          where member.trip_id = target_trip_id
            and member.user_id = target_user_id
            and member.status = 'active'
        )
      )
  ) then
    raise exception 'Trip access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = target_conversation_id
      and conversation.trip_id = target_trip_id
      and conversation.user_id = target_user_id
  ) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_user_id::text || ':' || current_utc_date::text,
      0
    )
  );

  select count(*)::integer
  into current_usage
  from public.ai_usage_events usage_event
  where usage_event.user_id = target_user_id
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
    target_user_id,
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

revoke all on function public.consume_ai_daily_usage(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_daily_usage(uuid, uuid, uuid, text, integer)
  to service_role;

comment on function public.consume_ai_daily_usage(uuid, uuid, uuid, text, integer) is
  'Service-only atomic enforcement of the per-user UTC assistant request limit.';
