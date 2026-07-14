create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  recipient_email text not null,
  subject text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_outbox_notification_key unique (notification_id),
  constraint notification_email_outbox_status_check
    check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled'))
);

create index if not exists notification_email_outbox_status_next_attempt_idx
on public.notification_email_outbox(status, next_attempt_at, created_at);

create index if not exists notification_email_outbox_user_idx
on public.notification_email_outbox(user_id, created_at desc);

create index if not exists notification_email_outbox_notification_idx
on public.notification_email_outbox(notification_id);

alter table public.notification_email_outbox enable row level security;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  recipient_email text;
begin
  select users.email
    into recipient_email
    from auth.users
   where users.id = new.user_id
     and users.email is not null
     and users.email <> '';

  if recipient_email is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_notification_preferences preferences
     where preferences.user_id = new.user_id
       and preferences.notification_type = new.type
       and preferences.email_enabled = true
  ) then
    return new;
  end if;

  insert into public.notification_email_outbox (
    notification_id,
    user_id,
    notification_type,
    recipient_email,
    subject,
    template_key,
    payload
  )
  values (
    new.id,
    new.user_id,
    new.type,
    recipient_email,
    left(coalesce(nullif(new.title, ''), 'VAIVIA notification'), 250),
    new.type,
    jsonb_build_object(
      'notificationId', new.id,
      'type', new.type,
      'title', new.title,
      'body', new.body,
      'metadata', coalesce(new.metadata, '{}'::jsonb),
      'tripId', new.trip_id,
      'invitationId', new.invitation_id,
      'actorUserId', new.actor_user_id,
      'createdAt', new.created_at
    )
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists queue_notification_email_trigger on public.notifications;
create trigger queue_notification_email_trigger
after insert on public.notifications
for each row
execute function public.queue_notification_email();

create or replace function public.claim_notification_email_outbox(batch_limit integer default 25)
returns setof public.notification_email_outbox
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select id
      from public.notification_email_outbox
     where status = 'queued'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.notification_email_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;

revoke all on function public.claim_notification_email_outbox(integer) from public;
grant execute on function public.claim_notification_email_outbox(integer) to service_role;
