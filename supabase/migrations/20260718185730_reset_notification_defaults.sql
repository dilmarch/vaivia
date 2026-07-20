alter table public.user_notification_preferences
  alter column in_app_enabled set default true,
  alter column push_enabled set default true,
  alter column email_enabled set default false;

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
  notification_type.value,
  true,
  true,
  notification_type.value = any (
    array[
      'trip_invite_received',
      'friend_request_received',
      'trip_slug_changed',
      'passport_stamp_share_received',
      'travel_email_failed'
    ]::text[]
  ),
  now()
from auth.users auth_user
cross join unnest(
  array[
    'trip_invite_received',
    'trip_invite_accepted',
    'trip_invite_declined',
    'trip_updated',
    'trip_item_added',
    'trip_item_updated',
    'trip_item_deleted',
    'accommodation_cancellation_reminder',
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
    'travel_email_failed'
  ]::text[]
) as notification_type(value)
on conflict (user_id, notification_type) do update
set
  in_app_enabled = excluded.in_app_enabled,
  push_enabled = excluded.push_enabled,
  email_enabled = excluded.email_enabled,
  updated_at = excluded.updated_at;

alter table public.user_notification_preferences
  drop constraint if exists user_notification_preferences_required_terms_update_check;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_required_terms_update_check
  check (
    notification_type <> 'terms_updated'
    or (in_app_enabled and push_enabled)
  );

create schema if not exists private;

create or replace function private.seed_default_notification_preferences_for_profile()
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
  select
    new.id,
    notification_type.value,
    true,
    true,
    notification_type.value = any (
      array[
        'trip_invite_received',
        'friend_request_received',
        'trip_slug_changed',
        'passport_stamp_share_received',
        'travel_email_failed'
      ]::text[]
    )
  from unnest(
    array[
      'trip_invite_received',
      'trip_invite_accepted',
      'trip_invite_declined',
      'trip_updated',
      'trip_item_added',
      'trip_item_updated',
      'trip_item_deleted',
      'accommodation_cancellation_reminder',
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
      'travel_email_failed'
    ]::text[]
  ) as notification_type(value)
  on conflict (user_id, notification_type) do update
  set
    in_app_enabled = excluded.in_app_enabled,
    push_enabled = excluded.push_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.seed_default_notification_preferences_for_profile()
from public, anon, authenticated;

drop trigger if exists seed_default_notification_preferences_for_profile_trigger
on public.user_profiles;

create trigger seed_default_notification_preferences_for_profile_trigger
after insert on public.user_profiles
for each row
execute function private.seed_default_notification_preferences_for_profile();
