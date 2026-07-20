alter table public.trip_accommodations
  add column if not exists free_cancellation_ends_on date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trip_accommodations_cancellation_before_checkin'
      and conrelid = 'public.trip_accommodations'::regclass
  ) then
    alter table public.trip_accommodations
      add constraint trip_accommodations_cancellation_before_checkin
      check (
        free_cancellation_ends_on is null
        or free_cancellation_ends_on <= check_in_date
      );
  end if;
end
$$;

create index if not exists trip_accommodations_cancellation_due_idx
on public.trip_accommodations (free_cancellation_ends_on)
where free_cancellation_ends_on is not null
  and status <> 'cancelled';

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
        'accommodation_cancellation_reminder'
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
        'accommodation_cancellation_reminder'
      ]::text[]
    )
  );

create table if not exists public.accommodation_cancellation_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null
    references public.trip_accommodations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  free_cancellation_ends_on date not null,
  notification_id uuid unique references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint accommodation_cancellation_reminder_delivery_unique
    unique (accommodation_id, user_id, free_cancellation_ends_on)
);

create index if not exists accommodation_cancellation_reminders_user_idx
on public.accommodation_cancellation_reminder_deliveries (user_id, created_at desc);

alter table public.accommodation_cancellation_reminder_deliveries
  enable row level security;

revoke all on table public.accommodation_cancellation_reminder_deliveries
from public, anon, authenticated;

grant select, insert, update, delete
on table public.accommodation_cancellation_reminder_deliveries
to service_role;

create or replace function public.queue_due_accommodation_cancellation_reminders()
returns integer
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  accommodation_record record;
  recipient_record record;
  delivery_id uuid;
  created_notification_id uuid;
  queued_count integer := 0;
begin
  for accommodation_record in
    select
      accommodation.id,
      accommodation.trip_id,
      accommodation.created_by,
      accommodation.hotel_name,
      accommodation.free_cancellation_ends_on,
      accommodation.is_private,
      accommodation.audience_mode,
      trip.user_id as trip_owner_id,
      coalesce(nullif(trip.slug, ''), trip.id::text) as trip_route
    from public.trip_accommodations accommodation
    join public.trips trip on trip.id = accommodation.trip_id
    where accommodation.free_cancellation_ends_on >= current_date
      and accommodation.free_cancellation_ends_on <= current_date + 2
      and accommodation.status <> 'cancelled'
      and trip.archived_at is null
    order by accommodation.free_cancellation_ends_on, accommodation.id
  loop
    for recipient_record in
      with explicit_participants as (
        select member.user_id
        from public.trip_item_participants participant
        join public.trip_members member
          on member.id = participant.trip_member_id
         and member.trip_id = participant.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.trip_id = accommodation_record.trip_id
          and participant.item_type = 'accommodation'
          and participant.item_id = accommodation_record.id
          and participant.participant_kind = 'member'
          and member.user_id is not null

        union

        select member.user_id
        from public.trip_item_participants participant
        join public.trip_members member
          on member.user_id = participant.user_id
         and member.trip_id = participant.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.trip_id = accommodation_record.trip_id
          and participant.item_type = 'accommodation'
          and participant.item_id = accommodation_record.id
          and participant.participant_kind = 'user'
          and participant.user_id is not null

        union

        select member.user_id
        from public.trip_item_participants participant
        join public.trip_members member
          on member.invitation_id = participant.invitation_id
         and member.trip_id = participant.trip_id
         and member.status = 'active'
         and member.left_at is null
        where participant.trip_id = accommodation_record.trip_id
          and participant.item_type = 'accommodation'
          and participant.item_id = accommodation_record.id
          and participant.participant_kind = 'invitation'
          and participant.invitation_id is not null
      ),
      eligible_recipients as (
        select accommodation_record.created_by as user_id

        union

        select explicit_participants.user_id
        from explicit_participants
        where not accommodation_record.is_private

        union

        select member.user_id
        from public.trip_members member
        where member.trip_id = accommodation_record.trip_id
          and member.status = 'active'
          and member.left_at is null
          and member.user_id is not null
          and not accommodation_record.is_private
          and not exists (select 1 from explicit_participants)

        union

        select accommodation_record.trip_owner_id
        where not accommodation_record.is_private
          and not exists (select 1 from explicit_participants)
      )
      select distinct eligible_recipients.user_id
      from eligible_recipients
      where eligible_recipients.user_id is not null
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
        'accommodation_cancellation_reminder',
        true,
        false,
        true
      )
      on conflict (user_id, notification_type) do nothing;

      if not exists (
        select 1
        from public.user_notification_preferences preference
        where preference.user_id = recipient_record.user_id
          and preference.notification_type = 'accommodation_cancellation_reminder'
          and (
            preference.in_app_enabled
            or preference.push_enabled
            or preference.email_enabled
          )
      ) then
        continue;
      end if;

      delivery_id := null;

      insert into public.accommodation_cancellation_reminder_deliveries (
        accommodation_id,
        user_id,
        free_cancellation_ends_on
      )
      values (
        accommodation_record.id,
        recipient_record.user_id,
        accommodation_record.free_cancellation_ends_on
      )
      on conflict (accommodation_id, user_id, free_cancellation_ends_on)
      do nothing
      returning id into delivery_id;

      if delivery_id is null then
        continue;
      end if;

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
        accommodation_record.trip_id,
        'accommodation_cancellation_reminder',
        'Free cancellation ending soon',
        'Free cancellation ends on '
          || to_char(accommodation_record.free_cancellation_ends_on, 'FMMonth FMDD, YYYY')
          || ' for '
          || accommodation_record.hotel_name
          || ' booking!',
        jsonb_build_object(
          'eventId', 'accommodation-cancellation-'
            || accommodation_record.id::text
            || '-'
            || accommodation_record.free_cancellation_ends_on::text,
          'accommodationId', accommodation_record.id,
          'bookingName', accommodation_record.hotel_name,
          'freeCancellationEndsOn', accommodation_record.free_cancellation_ends_on,
          'tripId', accommodation_record.trip_id,
          'url', '/trips/' || accommodation_record.trip_route || '/accommodations'
        )
      )
      returning id into created_notification_id;

      update public.accommodation_cancellation_reminder_deliveries
      set notification_id = created_notification_id
      where id = delivery_id;

      queued_count := queued_count + 1;
    end loop;
  end loop;

  return queued_count;
end;
$$;

revoke all on function public.queue_due_accommodation_cancellation_reminders()
from public, anon, authenticated;

grant execute on function public.queue_due_accommodation_cancellation_reminders()
to service_role;
