create table if not exists public.user_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type),
  constraint user_notification_preferences_type_check
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
          'passport_stamp_added'
        ]::text[]
      )
    )
);

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists user_push_subscriptions_user_active_idx
on public.user_push_subscriptions(user_id, revoked_at, updated_at desc);

create table if not exists public.notification_push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint notification_push_outbox_notification_key unique (notification_id),
  constraint notification_push_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed'))
);

create index if not exists notification_push_outbox_status_created_idx
on public.notification_push_outbox(status, created_at);

alter table public.user_notification_preferences enable row level security;
alter table public.user_push_subscriptions enable row level security;
alter table public.notification_push_outbox enable row level security;

drop policy if exists "Users can view their notification preferences" on public.user_notification_preferences;
create policy "Users can view their notification preferences"
on public.user_notification_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create their notification preferences" on public.user_notification_preferences;
create policy "Users can create their notification preferences"
on public.user_notification_preferences
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their notification preferences" on public.user_notification_preferences;
create policy "Users can update their notification preferences"
on public.user_notification_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can view their push subscriptions" on public.user_push_subscriptions;
create policy "Users can view their push subscriptions"
on public.user_push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create their push subscriptions" on public.user_push_subscriptions;
create policy "Users can create their push subscriptions"
on public.user_push_subscriptions
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their push subscriptions" on public.user_push_subscriptions;
create policy "Users can update their push subscriptions"
on public.user_push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on table public.user_notification_preferences to authenticated;
grant select, insert, update on table public.user_push_subscriptions to authenticated;

create or replace function public.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.notification_push_outbox (
    notification_id,
    user_id,
    notification_type
  )
  values (
    new.id,
    new.user_id,
    new.type
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists queue_notification_push_trigger on public.notifications;
create trigger queue_notification_push_trigger
after insert on public.notifications
for each row
execute function public.queue_notification_push();
