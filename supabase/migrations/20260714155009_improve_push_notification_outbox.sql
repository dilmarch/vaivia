alter table public.notification_push_outbox
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists destination_url text,
  add column if not exists event_id text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists notification_push_outbox_status_next_attempt_idx
on public.notification_push_outbox(status, next_attempt_at, created_at);

create index if not exists notification_push_outbox_user_idx
on public.notification_push_outbox(user_id, created_at desc);

create index if not exists notification_push_outbox_event_idx
on public.notification_push_outbox(user_id, notification_type, event_id)
where event_id is not null;

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
  if new.user_id is null or new.type is null then
    return new;
  end if;

  if new.actor_user_id is not null
     and new.actor_user_id = new.user_id
     and new.type not in (
       'passport_stamp_added',
       'feature_suggestion_implemented',
       'terms_updated',
       'terms_acceptance_required',
       'trip_slug_changed'
     )
  then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_notification_preferences preferences
     where preferences.user_id = new.user_id
       and preferences.notification_type = new.type
       and preferences.push_enabled = true
  ) then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_push_subscriptions subscriptions
     where subscriptions.user_id = new.user_id
       and subscriptions.revoked_at is null
  ) then
    return new;
  end if;

  destination_url := coalesce(
    nullif(new.metadata ->> 'url', ''),
    nullif(new.metadata ->> 'href', ''),
    nullif(new.metadata ->> 'path', ''),
    '/notifications'
  );

  if left(destination_url, 1) <> '/' then
    destination_url := '/notifications';
  end if;

  event_identifier := coalesce(
    nullif(new.metadata ->> 'eventId', ''),
    nullif(new.metadata ->> 'shareId', ''),
    nullif(new.metadata ->> 'friendshipId', ''),
    nullif(new.metadata ->> 'suggestionId', ''),
    nullif(new.metadata ->> 'tripId', ''),
    new.invitation_id::text,
    new.id::text
  );

  insert into public.notification_push_outbox (
    notification_id,
    user_id,
    notification_type,
    title,
    body,
    destination_url,
    event_id,
    payload,
    updated_at
  )
  values (
    new.id,
    new.user_id,
    new.type,
    left(coalesce(nullif(new.title, ''), 'VAIVIA'), 250),
    new.body,
    destination_url,
    event_identifier,
    jsonb_build_object(
      'notificationId', new.id,
      'eventId', event_identifier,
      'type', new.type,
      'title', new.title,
      'body', new.body,
      'metadata', coalesce(new.metadata, '{}'::jsonb),
      'tripId', new.trip_id,
      'invitationId', new.invitation_id,
      'actorUserId', new.actor_user_id,
      'url', destination_url,
      'createdAt', new.created_at
    ),
    now()
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

create or replace function public.claim_notification_push_outbox(
  batch_limit integer default 25
)
returns setof public.notification_push_outbox
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select id
      from public.notification_push_outbox
     where (
             status = 'pending'
             or (
               status = 'failed'
               and attempts < 5
               and (next_attempt_at is null or next_attempt_at <= now())
             )
           )
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.notification_push_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         processed_at = null,
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;

revoke all on function public.claim_notification_push_outbox(integer) from public;
grant execute on function public.claim_notification_push_outbox(integer) to service_role;
