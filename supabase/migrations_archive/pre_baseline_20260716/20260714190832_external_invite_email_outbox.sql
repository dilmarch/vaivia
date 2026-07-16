create table if not exists public.external_email_invite_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  invite_type text not null,
  recipient_email text not null,
  inviter_user_id uuid references auth.users(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  related_id uuid,
  subject text not null,
  template_key text not null default 'external_invite',
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
  constraint external_email_invite_outbox_event_key_key unique (event_key),
  constraint external_email_invite_outbox_invite_type_check
    check (invite_type in ('trip_invite', 'friend_invite', 'passport_stamp_share')),
  constraint external_email_invite_outbox_status_check
    check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled'))
);

create index if not exists external_email_invite_outbox_status_next_attempt_idx
on public.external_email_invite_outbox(status, next_attempt_at, created_at);

create index if not exists external_email_invite_outbox_recipient_idx
on public.external_email_invite_outbox(lower(recipient_email), created_at desc);

alter table public.external_email_invite_outbox enable row level security;

create or replace function public.queue_external_invite_email(
  invite_event_key text,
  invite_type text,
  recipient_email text,
  inviter_user_id uuid,
  trip_id uuid default null,
  related_id uuid default null,
  subject text default 'You are invited to join VAIVIA',
  payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(recipient_email));
  outbox_id uuid;
begin
  if invite_event_key is null or trim(invite_event_key) = '' then
    raise exception 'Invite event key is required';
  end if;

  if invite_type not in ('trip_invite', 'friend_invite', 'passport_stamp_share') then
    raise exception 'Invalid external invite type';
  end if;

  if normalized_email is null or normalized_email = '' or normalized_email not like '%@%' then
    raise exception 'A valid recipient email is required';
  end if;

  insert into public.external_email_invite_outbox (
    event_key,
    invite_type,
    recipient_email,
    inviter_user_id,
    trip_id,
    related_id,
    subject,
    template_key,
    payload
  )
  values (
    invite_event_key,
    invite_type,
    normalized_email,
    inviter_user_id,
    trip_id,
    related_id,
    left(coalesce(nullif(subject, ''), 'You are invited to join VAIVIA'), 250),
    'external_invite',
    coalesce(payload, '{}'::jsonb)
  )
  on conflict (event_key) do update
     set recipient_email = excluded.recipient_email,
         inviter_user_id = excluded.inviter_user_id,
         trip_id = excluded.trip_id,
         related_id = excluded.related_id,
         subject = excluded.subject,
         payload = excluded.payload,
         status = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.status
             else 'queued'
           end,
         next_attempt_at = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.next_attempt_at
             else null
           end,
         failed_at = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.failed_at
             else null
           end,
         last_error = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.last_error
             else null
           end,
         updated_at = now()
  returning id into outbox_id;

  return outbox_id;
end;
$$;

revoke all on function public.queue_external_invite_email(text, text, text, uuid, uuid, uuid, text, jsonb) from public;

create or replace function public.claim_external_email_invite_outbox(batch_limit integer default 25)
returns setof public.external_email_invite_outbox
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select id
      from public.external_email_invite_outbox
     where status = 'queued'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.external_email_invite_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;

revoke all on function public.claim_external_email_invite_outbox(integer) from public;
grant execute on function public.claim_external_email_invite_outbox(integer) to service_role;

create or replace function public.create_friend_invitation(invitee_identifier text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    normalized_identifier text := lower(trim(invitee_identifier));
    target_user_id uuid;
    existing_friendship record;
    created_invitation_id uuid;
    actor_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if normalized_identifier = '' then
        raise exception 'Friend username or email is required';
    end if;

    select user_profiles.id
      into target_user_id
      from public.user_profiles
     where lower(coalesce(user_profiles.email, '')) = normalized_identifier
        or lower(coalesce(user_profiles.username, '')) = normalized_identifier
     limit 1;

    actor_name := public.get_user_display_name(current_user_id);

    if target_user_id is null then
        if normalized_identifier like '%@%' then
            perform public.queue_external_invite_email(
                'friend_invite:' || current_user_id::text || ':' || normalized_identifier,
                'friend_invite',
                normalized_identifier,
                current_user_id,
                null,
                null,
                coalesce(actor_name, 'Someone') || ' invited you to join VAIVIA',
                jsonb_build_object(
                    'inviteType', 'friend_invite',
                    'inviterName', coalesce(actor_name, 'Someone'),
                    'recipientEmail', normalized_identifier,
                    'signupPath', '/auth/sign-up'
                )
            );
        end if;

        return null;
    end if;

    if target_user_id = current_user_id then
        raise exception 'You cannot invite yourself';
    end if;

    select *
      into existing_friendship
      from public.user_friendships friendships
     where (
              friendships.requester_user_id = current_user_id
              and friendships.addressee_user_id = target_user_id
           )
        or (
              friendships.requester_user_id = target_user_id
              and friendships.addressee_user_id = current_user_id
           )
     order by friendships.created_at desc
     limit 1;

    if existing_friendship.id is not null then
        if existing_friendship.status = 'blocked' then
            if existing_friendship.blocked_by_user_id = current_user_id then
                raise exception 'You blocked this person. Unblock them before adding them as a friend.';
            end if;
            return null;
        end if;

        if existing_friendship.status in ('pending', 'accepted') then
            return existing_friendship.id;
        end if;

        update public.user_friendships
           set requester_user_id = current_user_id,
               addressee_identifier = trim(invitee_identifier),
               addressee_user_id = target_user_id,
               status = 'pending',
               blocked_by_user_id = null,
               responded_at = null,
               updated_at = now()
         where id = existing_friendship.id
         returning id into created_invitation_id;
    else
        insert into public.user_friendships (
            requester_user_id,
            addressee_identifier,
            addressee_user_id,
            status
        )
        values (
            current_user_id,
            trim(invitee_identifier),
            target_user_id,
            'pending'
        )
        returning id into created_invitation_id;
    end if;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      body,
      metadata
    )
    values (
      target_user_id,
      current_user_id,
      'friend_request_received',
      'Friend request received',
      coalesce(actor_name, 'Someone') || ' added you as a friend.',
      jsonb_build_object('action', 'review_friend_request', 'friendshipId', created_invitation_id)
    );

    return created_invitation_id;
end;
$$;

revoke all on function public.create_friend_invitation(text) from public;
grant execute on function public.create_friend_invitation(text) to authenticated;

create or replace function public.create_trip_invitation(
  target_trip_id uuid,
  invitee_identifier text,
  consent_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_identifier text;
  target_user_id uuid;
  target_email text;
  target_username text;
  new_invitation_id uuid;
  trip_title text;
  trip_start_date date;
  trip_end_date date;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if consent_confirmed is not true then
    raise exception 'Consent is required to share this trip';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'You do not have access to this trip';
  end if;

  normalized_identifier := lower(trim(invitee_identifier));

  if normalized_identifier is null or normalized_identifier = '' then
    raise exception 'Invitee email or username is required';
  end if;

  if normalized_identifier like '%@%' then
    target_email := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.email) = target_email
    limit 1;
  else
    target_username := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.username) = target_username
    limit 1;
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot invite yourself to your own trip';
  end if;

  if target_user_id is not null then
    if public.friendship_block_exists(auth.uid(), target_user_id) then
      raise exception 'You cannot invite this person because you blocked them.';
    end if;

    if public.friendship_block_exists(target_user_id, auth.uid()) then
      raise exception 'You cannot invite this person to this trip. Create a trip from your account and invite trip mates and ask them to transfer the items to the new trip.';
    end if;
  end if;

  select title, start_date, end_date
    into trip_title, trip_start_date, trip_end_date
  from public.trips
  where id = target_trip_id;

  insert into public.trip_invitations (
    trip_id,
    invited_by,
    invited_user_id,
    invited_email,
    invited_username,
    status,
    consent_confirmed
  )
  values (
    target_trip_id,
    auth.uid(),
    target_user_id,
    target_email,
    target_username,
    'pending',
    true
  )
  returning id into new_invitation_id;

  if target_user_id is not null then
    insert into public.notifications (
      user_id,
      actor_user_id,
      trip_id,
      invitation_id,
      type,
      title,
      body,
      metadata
    )
    values (
      target_user_id,
      auth.uid(),
      target_trip_id,
      new_invitation_id,
      'trip_invite_received',
      'Trip invite received',
      'You have been invited to join ' || coalesce(trip_title, 'a trip') || '.',
      jsonb_build_object('action', 'review_trip_invite')
    );
  elsif target_email is not null then
    actor_name := public.get_user_display_name(auth.uid());

    perform public.queue_external_invite_email(
      'trip_invite:' || new_invitation_id::text,
      'trip_invite',
      target_email,
      auth.uid(),
      target_trip_id,
      new_invitation_id,
      coalesce(actor_name, 'Someone') || ' invited you to ' || coalesce(trip_title, 'a trip') || ' on VAIVIA',
      jsonb_build_object(
        'inviteType', 'trip_invite',
        'inviterName', coalesce(actor_name, 'Someone'),
        'recipientEmail', target_email,
        'tripTitle', coalesce(trip_title, 'a trip'),
        'tripStartDate', trip_start_date,
        'tripEndDate', trip_end_date,
        'invitationId', new_invitation_id,
        'tripId', target_trip_id,
        'signupPath', '/auth/sign-up'
      )
    );
  end if;

  return new_invitation_id;
end;
$$;

revoke all on function public.create_trip_invitation(uuid, text, boolean) from public;
grant execute on function public.create_trip_invitation(uuid, text, boolean) to authenticated;
