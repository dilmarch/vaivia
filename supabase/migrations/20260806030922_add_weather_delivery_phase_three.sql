-- Phase 3: opt-in weather email and standards-based Web Push delivery.
-- The canonical public.notifications row remains the source of truth. These
-- tables record channel delivery only and are intentionally service-role-only.

alter table public.notification_email_outbox
  add column if not exists provider text not null default 'resend',
  add column if not exists destination_identifier_hash text,
  add column if not exists idempotency_key text;

update public.notification_email_outbox
set idempotency_key = 'notification-email-' || notification_id::text
where idempotency_key is null;

alter table public.notification_email_outbox
  alter column idempotency_key set not null;

create unique index if not exists notification_email_outbox_idempotency_key_idx
on public.notification_email_outbox (idempotency_key)
where idempotency_key is not null;

alter table public.notification_push_outbox
  add column if not exists provider text not null default 'web_push',
  add column if not exists idempotency_key text;

update public.notification_push_outbox
set idempotency_key = 'notification-push-' || notification_id::text
where idempotency_key is null;

alter table public.notification_push_outbox
  alter column idempotency_key set not null;

create unique index if not exists notification_push_outbox_idempotency_key_idx
on public.notification_push_outbox (idempotency_key)
where idempotency_key is not null;

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  push_outbox_id uuid not null references public.notification_push_outbox(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid references public.user_push_subscriptions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'web_push',
  destination_identifier_hash text not null,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'retry', 'invalid', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (push_outbox_id, subscription_id)
);

create index if not exists notification_push_deliveries_outbox_status_idx
on public.notification_push_deliveries (push_outbox_id, status, next_attempt_at);

create index if not exists notification_push_deliveries_user_created_idx
on public.notification_push_deliveries (user_id, created_at desc);

alter table public.notification_push_deliveries enable row level security;

revoke all on table public.notification_email_outbox from public, anon, authenticated;
revoke all on table public.notification_push_outbox from public, anon, authenticated;
revoke all on table public.notification_push_deliveries from public, anon, authenticated;
grant all on table public.notification_email_outbox to service_role;
grant all on table public.notification_push_outbox to service_role;
grant all on table public.notification_push_deliveries to service_role;

revoke all on function public.claim_notification_email_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.claim_notification_push_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_email_outbox(integer) to service_role;
grant execute on function public.claim_notification_push_outbox(integer) to service_role;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  recipient_email text;
begin
  select users.email into recipient_email
  from auth.users
  where users.id = new.user_id
    and users.email is not null
    and users.email <> '';

  if recipient_email is null then return new; end if;

  if not exists (
    select 1 from public.user_notification_preferences preferences
    where preferences.user_id = new.user_id
      and preferences.notification_type = new.type
      and coalesce(preferences.master_enabled, true) = true
      and preferences.email_enabled = true
  ) then return new; end if;

  insert into public.notification_email_outbox (
    notification_id, user_id, notification_type, recipient_email, subject,
    template_key, payload, provider, idempotency_key
  ) values (
    new.id, new.user_id, new.type, recipient_email,
    left(coalesce(nullif(new.title, ''), 'VAIVIA notification'), 250),
    new.type,
    jsonb_build_object(
      'notificationId', new.id, 'type', new.type, 'title', new.title,
      'body', new.body, 'metadata', coalesce(new.metadata, '{}'::jsonb),
      'tripId', new.trip_id, 'invitationId', new.invitation_id,
      'actorUserId', new.actor_user_id, 'createdAt', new.created_at
    ),
    'resend', 'notification-email-' || new.id::text
  ) on conflict (notification_id) do nothing;

  return new;
end;
$$;

create or replace function public.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  destination_url text;
  event_identifier text;
begin
  if new.user_id is null or new.type is null then return new; end if;

  if new.actor_user_id is not null and new.actor_user_id = new.user_id
     and new.type not in (
       'passport_stamp_added', 'feature_suggestion_implemented',
       'terms_updated', 'terms_acceptance_required', 'trip_slug_changed'
     ) then return new; end if;

  if not exists (
    select 1 from public.user_notification_preferences preferences
    where preferences.user_id = new.user_id
      and preferences.notification_type = new.type
      and coalesce(preferences.master_enabled, true) = true
      and preferences.push_enabled = true
  ) then return new; end if;

  if not exists (
    select 1 from public.user_push_subscriptions subscriptions
    where subscriptions.user_id = new.user_id
      and subscriptions.revoked_at is null
  ) then return new; end if;

  destination_url := coalesce(
    nullif(new.metadata ->> 'deepLink', ''),
    nullif(new.metadata ->> 'url', ''),
    nullif(new.metadata ->> 'href', ''),
    nullif(new.metadata ->> 'path', ''),
    '/notifications'
  );
  if left(destination_url, 1) <> '/' or left(destination_url, 2) = '//' then
    destination_url := '/notifications';
  end if;

  event_identifier := coalesce(
    nullif(new.metadata ->> 'eventId', ''),
    nullif(new.metadata ->> 'providerAlertId', ''),
    nullif(new.metadata ->> 'shareId', ''),
    nullif(new.metadata ->> 'friendshipId', ''),
    nullif(new.metadata ->> 'suggestionId', ''),
    nullif(new.metadata ->> 'tripId', ''),
    new.invitation_id::text, new.id::text
  );

  insert into public.notification_push_outbox (
    notification_id, user_id, notification_type, title, body,
    destination_url, event_id, payload, provider, idempotency_key, updated_at
  ) values (
    new.id, new.user_id, new.type,
    left(coalesce(nullif(new.title, ''), 'VAIVIA'), 250), new.body,
    destination_url, event_identifier,
    jsonb_build_object(
      'notificationId', new.id, 'eventId', event_identifier, 'type', new.type,
      'title', new.title, 'body', new.body,
      'metadata', coalesce(new.metadata, '{}'::jsonb), 'tripId', new.trip_id,
      'invitationId', new.invitation_id, 'actorUserId', new.actor_user_id,
      'url', destination_url, 'createdAt', new.created_at
    ),
    'web_push', 'notification-push-' || new.id::text, now()
  ) on conflict (notification_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_notification_email() from public, anon, authenticated;
revoke all on function public.queue_notification_push() from public, anon, authenticated;
grant execute on function public.queue_notification_email() to service_role;
grant execute on function public.queue_notification_push() to service_role;

comment on table public.notification_push_deliveries is
  'Service-only, per-device Web Push delivery state. Contains no endpoint or encryption key.';
