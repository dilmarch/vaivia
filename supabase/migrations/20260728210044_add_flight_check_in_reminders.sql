alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required',
        'profile_onboarding_prompt',
        'theme_exploration_prompt',
        'travel_email_ready',
        'travel_email_needs_review',
        'travel_email_failed',
        'accommodation_cancellation_reminder',
        'flight_check_in_reminder'
      ]::text[]
    )
  );

alter table public.user_notification_preferences
  drop constraint if exists user_notification_preferences_type_check;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_type_check
  check (
    notification_type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required',
        'profile_onboarding_prompt',
        'theme_exploration_prompt',
        'travel_email_ready',
        'travel_email_needs_review',
        'travel_email_failed',
        'accommodation_cancellation_reminder',
        'flight_check_in_reminder'
      ]::text[]
    )
  );

insert into public.user_notification_preferences (
  user_id,
  notification_type,
  in_app_enabled,
  push_enabled,
  email_enabled,
  updated_at
)
select
  auth_user.id,
  'flight_check_in_reminder',
  true,
  true,
  true,
  now()
from auth.users auth_user
on conflict (user_id, notification_type) do update
set
  in_app_enabled = true,
  push_enabled = true,
  email_enabled = true,
  updated_at = excluded.updated_at;

create schema if not exists private;

create or replace function private.seed_flight_check_in_notification_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notification_preferences (
    user_id,
    notification_type,
    in_app_enabled,
    push_enabled,
    email_enabled
  )
  values (
    new.id,
    'flight_check_in_reminder',
    true,
    true,
    true
  )
  on conflict (user_id, notification_type) do nothing;

  return new;
end;
$$;

revoke all
on function private.seed_flight_check_in_notification_preference()
from public, anon, authenticated;

drop trigger if exists seed_flight_check_in_notification_preference_trigger
on public.user_profiles;

create trigger seed_flight_check_in_notification_preference_trigger
after insert on public.user_profiles
for each row
execute function private.seed_flight_check_in_notification_preference();

create index if not exists transportation_items_flight_check_in_due_idx
on public.transportation_items (departure_date, departure_time)
where transport_type = 'flight'
  and departure_date is not null
  and departure_time is not null
  and (status is null or status not in ('cancelled', 'completed'));

create table if not exists public.flight_check_in_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  transportation_item_id uuid not null
    references public.transportation_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  departure_at timestamptz not null,
  notification_id uuid unique
    references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint flight_check_in_reminder_delivery_unique
    unique (transportation_item_id, user_id, departure_at)
);

create index if not exists flight_check_in_reminder_deliveries_user_idx
on public.flight_check_in_reminder_deliveries (user_id, created_at desc);

alter table public.flight_check_in_reminder_deliveries
  enable row level security;

revoke all on table public.flight_check_in_reminder_deliveries
from public, anon, authenticated;

grant select, insert, update, delete
on table public.flight_check_in_reminder_deliveries
to service_role;

create or replace function public.queue_due_flight_check_in_reminders()
returns integer
language plpgsql
security invoker
set search_path = 'public', 'pg_catalog'
as $$
declare
  flight_record record;
  recipient_record record;
  delivery_id uuid;
  created_notification_id uuid;
  queued_count integer := 0;
  flight_label text;
  route_label text;
begin
  for flight_record in
    select due_flight.*
    from (
      select
        transportation.id,
        transportation.trip_id,
        transportation.created_by,
        transportation.transport_number,
        transportation.provider_name,
        transportation.departure_date,
        transportation.departure_time,
        transportation.departure_location,
        transportation.arrival_location,
        transportation.is_private,
        transportation.audience_mode,
        coalesce(timezone_name.name, 'UTC') as effective_departure_timezone,
        timezone(
          coalesce(timezone_name.name, 'UTC'),
          transportation.departure_date + transportation.departure_time
        ) as departure_at,
        trip.user_id as trip_owner_id,
        coalesce(nullif(trip.slug, ''), trip.id::text) as trip_route
      from public.transportation_items transportation
      join public.trips trip on trip.id = transportation.trip_id
      left join lateral (
        select timezone_catalog.name
        from pg_catalog.pg_timezone_names timezone_catalog
        where timezone_catalog.name = transportation.departure_timezone
        limit 1
      ) timezone_name on true
      where transportation.transport_type = 'flight'
        and transportation.departure_date is not null
        and transportation.departure_time is not null
        and transportation.departure_date
          between current_date - 1 and current_date + 2
        and coalesce(transportation.status, 'planned')
          not in ('cancelled', 'completed')
        and trip.archived_at is null
    ) due_flight
    where due_flight.departure_at > now()
      and due_flight.departure_at <= now() + interval '24 hours'
    order by due_flight.departure_at, due_flight.id
  loop
    for recipient_record in
      with explicit_participant_rows as (
        select participant.participant_kind,
               participant.trip_member_id,
               participant.invitation_id,
               participant.user_id,
               participant.family_member_id
        from public.trip_item_participants participant
        where participant.trip_id = flight_record.trip_id
          and participant.item_type = 'transportation'
          and participant.item_id = flight_record.id
      ),
      explicit_transportation_travelers as (
        select traveler.user_id, traveler.family_member_id
        from public.transportation_item_travelers traveler
        where traveler.trip_id = flight_record.trip_id
          and traveler.transportation_item_id = flight_record.id
      ),
      resolved_recipients as (
        select member.user_id
        from explicit_participant_rows participant
        join public.trip_members member
          on member.id = participant.trip_member_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.participant_kind = 'member'
          and member.user_id is not null

        union

        select member.user_id
        from explicit_participant_rows participant
        join public.trip_members member
          on member.user_id = participant.user_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.participant_kind = 'user'
          and participant.user_id is not null

        union

        select member.user_id
        from explicit_participant_rows participant
        join public.trip_members member
          on member.invitation_id = participant.invitation_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.participant_kind = 'invitation'
          and participant.invitation_id is not null
          and member.user_id is not null

        union

        select family_owner.user_id
        from explicit_participant_rows participant
        join public.user_family_members family_owner
          on family_owner.id = participant.family_member_id
        join public.trip_members member
          on member.user_id = family_owner.user_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.participant_kind = 'family_member'

        union

        select member.user_id
        from explicit_transportation_travelers traveler
        join public.trip_members member
          on member.user_id = traveler.user_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where traveler.user_id is not null

        union

        select family_owner.user_id
        from explicit_transportation_travelers traveler
        join public.user_family_members family_owner
          on family_owner.id = traveler.family_member_id
        join public.trip_members member
          on member.user_id = family_owner.user_id
         and member.trip_id = flight_record.trip_id
         and member.status = 'active'
         and member.left_at is null
        where traveler.family_member_id is not null
      ),
      audience_state as (
        select
          exists (select 1 from explicit_participant_rows)
          or exists (select 1 from explicit_transportation_travelers)
            as has_explicit_audience,
          exists (select 1 from resolved_recipients)
            as has_resolved_recipient
      ),
      eligible_recipients as (
        select resolved.user_id
        from resolved_recipients resolved

        union

        select flight_record.created_by
        from audience_state
        where flight_record.created_by is not null
          and (
            (
              audience_state.has_explicit_audience
              and not audience_state.has_resolved_recipient
            )
            or (
              not audience_state.has_explicit_audience
              and (
                flight_record.is_private
                or flight_record.audience_mode <> 'everyone'
              )
            )
          )

        union

        select member.user_id
        from public.trip_members member
        cross join audience_state
        where member.trip_id = flight_record.trip_id
          and member.status = 'active'
          and member.left_at is null
          and member.user_id is not null
          and not flight_record.is_private
          and flight_record.audience_mode = 'everyone'
          and not audience_state.has_explicit_audience

        union

        select flight_record.trip_owner_id
        from audience_state
        where flight_record.trip_owner_id is not null
          and not flight_record.is_private
          and flight_record.audience_mode = 'everyone'
          and not audience_state.has_explicit_audience
      )
      select distinct eligible.user_id
      from eligible_recipients eligible
      join public.trip_members active_member
        on active_member.trip_id = flight_record.trip_id
       and active_member.user_id = eligible.user_id
       and active_member.status = 'active'
       and active_member.left_at is null
      where eligible.user_id is not null
    loop
      insert into public.user_notification_preferences (
        user_id,
        notification_type,
        in_app_enabled,
        push_enabled,
        email_enabled
      )
      values (
        recipient_record.user_id,
        'flight_check_in_reminder',
        true,
        true,
        true
      )
      on conflict (user_id, notification_type) do nothing;

      if not exists (
        select 1
        from public.user_notification_preferences preference
        where preference.user_id = recipient_record.user_id
          and preference.notification_type = 'flight_check_in_reminder'
          and (
            preference.in_app_enabled
            or preference.push_enabled
            or preference.email_enabled
          )
      ) then
        continue;
      end if;

      delivery_id := null;

      insert into public.flight_check_in_reminder_deliveries (
        transportation_item_id,
        user_id,
        departure_at
      )
      values (
        flight_record.id,
        recipient_record.user_id,
        flight_record.departure_at
      )
      on conflict (transportation_item_id, user_id, departure_at)
      do nothing
      returning id into delivery_id;

      if delivery_id is null then
        continue;
      end if;

      flight_label := coalesce(
        nullif(btrim(flight_record.transport_number), ''),
        'your flight'
      );
      route_label := concat_ws(
        ' to ',
        nullif(btrim(flight_record.departure_location), ''),
        nullif(btrim(flight_record.arrival_location), '')
      );

      insert into public.notifications (
        user_id,
        trip_id,
        type,
        title,
        body,
        metadata
      )
      values (
        recipient_record.user_id,
        flight_record.trip_id,
        'flight_check_in_reminder',
        'Check in for ' || flight_label,
        case
          when flight_label = 'your flight' then 'Your flight'
          else flight_label
        end
          || case
               when route_label <> '' then ' from ' || route_label
               else ''
             end
          || ' departs in about 24 hours on '
          || to_char(flight_record.departure_date, 'FMDay, FMMonth FMDD')
          || ' at '
          || to_char(flight_record.departure_time, 'FMHH12:MI AM')
          || '. Check in now with '
          || coalesce(
               nullif(btrim(flight_record.provider_name), ''),
               'your airline'
             )
          || '.',
        jsonb_build_object(
          'eventId', 'flight-check-in-'
            || flight_record.id::text
            || '-'
            || extract(epoch from flight_record.departure_at)::bigint::text,
          'transportationItemId', flight_record.id,
          'flightNumber', nullif(btrim(flight_record.transport_number), ''),
          'departureAt', flight_record.departure_at,
          'departureDate', flight_record.departure_date,
          'departureTime', flight_record.departure_time,
          'departureTimezone', flight_record.effective_departure_timezone,
          'tripId', flight_record.trip_id,
          'url', '/trips/'
            || flight_record.trip_route
            || '/itinerary?view=day&date='
            || flight_record.departure_date::text
        )
      )
      returning id into created_notification_id;

      update public.flight_check_in_reminder_deliveries
      set notification_id = created_notification_id
      where id = delivery_id;

      queued_count := queued_count + 1;
    end loop;
  end loop;

  return queued_count;
end;
$$;

revoke all on function public.queue_due_flight_check_in_reminders()
from public, anon, authenticated;

grant execute on function public.queue_due_flight_check_in_reminders()
to service_role;
