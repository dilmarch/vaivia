alter table public.notifications
  add column if not exists severity text,
  add column if not exists deep_link text,
  add column if not exists deduplication_key text;

alter table public.notifications
  drop constraint if exists notifications_severity_check,
  add constraint notifications_severity_check
    check (
      severity is null
      or severity = any (
        array['UNKNOWN', 'MINOR', 'MODERATE', 'SEVERE', 'EXTREME']::text[]
      )
    ),
  drop constraint if exists notifications_deep_link_check,
  add constraint notifications_deep_link_check
    check (deep_link is null or left(deep_link, 1) = '/'),
  drop constraint if exists notifications_deduplication_key_length_check,
  add constraint notifications_deduplication_key_length_check
    check (
      deduplication_key is null
      or char_length(deduplication_key) between 1 and 160
    );

alter table public.notifications
  drop constraint if exists notifications_weather_deduplication_unique;

alter table public.notifications
  add constraint notifications_weather_deduplication_unique
    unique (user_id, deduplication_key);

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
        'flight_check_in_reminder',
        'weather_alert'
      ]::text[]
    )
  );

alter table public.user_notification_preferences
  add column if not exists master_enabled boolean not null default true;

create index if not exists trips_weather_monitor_active_dates_idx
on public.trips (start_date, end_date)
where archived_at is null and start_date is not null;

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
        'flight_check_in_reminder',
        'weather_alert'
      ]::text[]
    )
  );

insert into public.user_notification_preferences (
  user_id,
  notification_type,
  master_enabled,
  in_app_enabled,
  push_enabled,
  email_enabled,
  updated_at
)
select
  auth_user.id,
  'weather_alert',
  true,
  true,
  false,
  false,
  now()
from auth.users auth_user
on conflict (user_id, notification_type) do update
set
  master_enabled = excluded.master_enabled,
  in_app_enabled = excluded.in_app_enabled,
  push_enabled = false,
  email_enabled = false,
  updated_at = excluded.updated_at;

create schema if not exists private;

create or replace function private.seed_weather_alert_notification_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notification_preferences (
    user_id,
    notification_type,
    master_enabled,
    in_app_enabled,
    push_enabled,
    email_enabled
  )
  values (new.id, 'weather_alert', true, true, false, false)
  on conflict (user_id, notification_type) do nothing;

  return new;
end;
$$;

revoke all
on function private.seed_weather_alert_notification_preference()
from public, anon, authenticated;

drop trigger if exists seed_weather_alert_notification_preference_trigger
on public.user_profiles;

create trigger seed_weather_alert_notification_preference_trigger
after insert on public.user_profiles
for each row
execute function private.seed_weather_alert_notification_preference();

drop policy if exists "Users can update own app alerts"
on public.notifications;

drop policy if exists "Users can view own app alerts"
on public.notifications;

create policy "Users can view own app alerts"
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update own app alerts"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke insert, update, delete on table public.notifications from anon;
revoke insert, update, delete on table public.notifications from authenticated;
grant update (read_at, archived_at) on table public.notifications to authenticated;

create table if not exists public.weather_alert_job_runs (
  run_key text primary key,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  trips_considered integer not null default 0 check (trips_considered >= 0),
  trips_processed integer not null default 0 check (trips_processed >= 0),
  locations_checked integer not null default 0 check (locations_checked >= 0),
  notifications_created integer not null default 0
    check (notifications_created >= 0),
  errors integer not null default 0 check (errors >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists weather_alert_job_runs_started_idx
on public.weather_alert_job_runs (started_at desc);

alter table public.weather_alert_job_runs enable row level security;

revoke all on table public.weather_alert_job_runs
from public, anon, authenticated;

grant select, insert, update, delete
on table public.weather_alert_job_runs
to service_role;

comment on table public.weather_alert_job_runs is
  'Service-only idempotency ledger for the bounded scheduled weather monitor.';

comment on column public.notifications.deduplication_key is
  'Stable service-generated key. Its unique constraint prevents repeated weather notifications after read or dismissal.';
