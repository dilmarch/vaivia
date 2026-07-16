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
        'theme_exploration_prompt'
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
        'theme_exploration_prompt'
      ]::text[]
    )
  );

create table if not exists public.user_login_milestones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_count integer not null default 0,
  profile_prompt_notification_id uuid references public.notifications(id) on delete set null,
  theme_prompt_notification_id uuid references public.notifications(id) on delete set null,
  profile_prompted_at timestamptz,
  theme_prompted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_login_milestones_login_count_check check (login_count >= 0)
);

alter table public.user_login_milestones enable row level security;

drop policy if exists "Users can view their login milestones" on public.user_login_milestones;
create policy "Users can view their login milestones"
on public.user_login_milestones
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on table public.user_login_milestones to authenticated;

create or replace function public.record_user_login_milestone()
returns public.user_login_milestones
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  milestone public.user_login_milestones%rowtype;
  created_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text));

  insert into public.user_notification_preferences (
    user_id,
    notification_type,
    in_app_enabled,
    push_enabled,
    email_enabled,
    updated_at
  )
  values
    (current_user_id, 'profile_onboarding_prompt', true, false, false, now()),
    (current_user_id, 'theme_exploration_prompt', true, false, false, now())
  on conflict (user_id, notification_type) do update
     set push_enabled = false,
         email_enabled = false,
         updated_at = now();

  insert into public.user_login_milestones (user_id, login_count)
  values (current_user_id, 1)
  on conflict (user_id) do update
     set login_count = public.user_login_milestones.login_count + 1,
         updated_at = now()
  returning * into milestone;

  if milestone.login_count >= 2 and milestone.profile_prompted_at is null then
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      metadata
    )
    values (
      current_user_id,
      'profile_onboarding_prompt',
      'Make your profile feel travelled-in',
      'Update your profile, collect digital passport stamps for countries you have visited, scratch countries off your map, and start a wishlist of places you want to go.',
      jsonb_build_object(
        'url', '/profile#passport-stamps',
        'eventId', 'login-milestone-profile-' || current_user_id::text
      )
    )
    returning id into created_notification_id;

    update public.user_login_milestones
       set profile_prompted_at = now(),
           profile_prompt_notification_id = created_notification_id,
           updated_at = now()
     where user_id = current_user_id
     returning * into milestone;
  end if;

  if milestone.login_count >= 4 and milestone.theme_prompted_at is null then
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      metadata
    )
    values (
      current_user_id,
      'theme_exploration_prompt',
      'Explore VAIVIA themes',
      'Try the different VAIVIA themes and choose the travel mood that feels most like you.',
      jsonb_build_object(
        'url', '/settings',
        'eventId', 'login-milestone-theme-' || current_user_id::text
      )
    )
    returning id into created_notification_id;

    update public.user_login_milestones
       set theme_prompted_at = now(),
           theme_prompt_notification_id = created_notification_id,
           updated_at = now()
     where user_id = current_user_id
     returning * into milestone;
  end if;

  return milestone;
end;
$$;

revoke all on function public.record_user_login_milestone() from public;
grant execute on function public.record_user_login_milestone() to authenticated;
