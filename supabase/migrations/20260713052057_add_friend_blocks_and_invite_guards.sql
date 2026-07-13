alter table public.user_friendships
  add column if not exists blocked_by_user_id uuid references auth.users(id) on delete set null;

alter table public.user_friendships
  drop constraint if exists user_friendships_status_check;

alter table public.user_friendships
  add constraint user_friendships_status_check
  check (status in ('pending', 'accepted', 'cancelled', 'declined', 'blocked'));

create index if not exists user_friendships_blocked_by_idx
on public.user_friendships(blocked_by_user_id)
where status = 'blocked';

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
        'friend_request_accepted'
      ]::text[]
    )
  );

create or replace function public.friendship_block_exists(
  blocker_user_id uuid,
  blocked_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_friendships friendships
    where friendships.status = 'blocked'
      and friendships.blocked_by_user_id = blocker_user_id
      and (
        (
          friendships.requester_user_id = blocker_user_id
          and friendships.addressee_user_id = blocked_user_id
        )
        or
        (
          friendships.requester_user_id = blocked_user_id
          and friendships.addressee_user_id = blocker_user_id
        )
      )
  );
$$;

create or replace function public.get_user_display_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    username,
    email,
    'this person'
  )
  from public.user_profiles
  where id = target_user_id;
$$;

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

    if target_user_id is null then
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

    actor_name := public.get_user_display_name(current_user_id);

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

create or replace function public.respond_to_friend_invitation(
    friendship_id uuid,
    next_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    updated_friendship public.user_friendships;
    actor_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if next_status not in ('accepted', 'declined', 'cancelled') then
        raise exception 'Invalid friendship status';
    end if;

    update public.user_friendships
       set status = next_status,
           blocked_by_user_id = null,
           responded_at = case when next_status in ('accepted', 'declined') then now() else responded_at end,
           updated_at = now()
     where id = friendship_id
       and status = 'pending'
       and (
            (next_status = 'cancelled' and requester_user_id = current_user_id)
            or
            (next_status in ('accepted', 'declined') and addressee_user_id = current_user_id)
       )
     returning * into updated_friendship;

    if updated_friendship.id is null then
        raise exception 'Friend invitation could not be updated';
    end if;

    if next_status = 'accepted' then
        actor_name := public.get_user_display_name(current_user_id);

        insert into public.notifications (
          user_id,
          actor_user_id,
          type,
          title,
          body,
          metadata
        )
        values (
          updated_friendship.requester_user_id,
          current_user_id,
          'friend_request_accepted',
          'Friend request accepted',
          coalesce(actor_name, 'Someone') || ' accepted your friend request.',
          jsonb_build_object('friendshipId', updated_friendship.id)
        );
    end if;
end;
$$;

revoke all on function public.respond_to_friend_invitation(uuid, text) from public;
grant execute on function public.respond_to_friend_invitation(uuid, text) to authenticated;

create or replace function public.block_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if target_user_id is null or target_user_id = current_user_id then
        raise exception 'Choose a valid friend to block';
    end if;

    update public.user_friendships
       set status = 'blocked',
           blocked_by_user_id = current_user_id,
           responded_at = now(),
           updated_at = now()
     where status = 'accepted'
       and (
            (requester_user_id = current_user_id and addressee_user_id = target_user_id)
            or
            (requester_user_id = target_user_id and addressee_user_id = current_user_id)
       );

    if not found then
        raise exception 'Friend could not be blocked';
    end if;
end;
$$;

revoke all on function public.block_friend(uuid) from public;
grant execute on function public.block_friend(uuid) to authenticated;

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

  select title into trip_title
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
  end if;

  return new_invitation_id;
end;
$$;

revoke all on function public.create_trip_invitation(uuid, text, boolean) from public;
grant execute on function public.create_trip_invitation(uuid, text, boolean) to authenticated;

create or replace function public.accept_trip_invitation_with_scope(
  target_invitation_id uuid,
  target_confirmed_start_date date default null,
  target_confirmed_end_date date default null,
  target_personal_start_date date default null,
  target_personal_end_date date default null,
  target_joining_leg_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite_record public.trip_invitations;
  trip_record public.trips;
  actor_name text;
  member_id uuid;
  final_confirmed_start date;
  final_confirmed_end date;
  final_personal_start date;
  final_personal_end date;
  participant record;
  participant_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = target_invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  select * into trip_record
  from public.trips
  where id = invite_record.trip_id;

  for participant in
    select trip_record.user_id as user_id
    union
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = invite_record.trip_id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if participant.user_id is null or participant.user_id = auth.uid() then
      continue;
    end if;

    if public.friendship_block_exists(auth.uid(), participant.user_id) then
      participant_name := public.get_user_display_name(participant.user_id);
      raise exception 'You cannot join this trip because you blocked %.', coalesce(participant_name, 'someone on this trip');
    end if;

    if public.friendship_block_exists(participant.user_id, auth.uid()) then
      raise exception 'You cannot join this trip. Create a trip from your account and invite trip mates and ask them to transfer the items to the new trip.';
    end if;
  end loop;

  final_confirmed_start := coalesce(target_confirmed_start_date, invite_record.invited_start_date, trip_record.start_date);
  final_confirmed_end := coalesce(target_confirmed_end_date, invite_record.invited_end_date, trip_record.end_date);
  final_personal_start := coalesce(target_personal_start_date, final_confirmed_start);
  final_personal_end := coalesce(target_personal_end_date, final_confirmed_end);

  if final_confirmed_start is not null and final_confirmed_end is not null and final_confirmed_end < final_confirmed_start then
    raise exception 'Confirmed end date cannot be before confirmed start date';
  end if;

  if final_personal_start is not null and final_personal_end is not null and final_personal_end < final_personal_start then
    raise exception 'Personal end date cannot be before personal start date';
  end if;

  if invite_record.invited_start_date is not null and final_confirmed_start is not null and final_confirmed_start < invite_record.invited_start_date then
    raise exception 'Confirmed start date must be inside the invited date window';
  end if;

  if invite_record.invited_end_date is not null and final_confirmed_end is not null and final_confirmed_end > invite_record.invited_end_date then
    raise exception 'Confirmed end date must be inside the invited date window';
  end if;

  update public.trip_invitations
  set
    status = 'accepted',
    responded_at = now(),
    accepted_start_date = final_confirmed_start,
    accepted_end_date = final_confirmed_end,
    accepted_personal_start_date = final_personal_start,
    accepted_personal_end_date = final_personal_end
  where id = target_invitation_id;

  insert into public.trip_members (
    trip_id,
    user_id,
    role,
    status,
    invited_by,
    invitation_id,
    invited_start_date,
    invited_end_date,
    confirmed_start_date,
    confirmed_end_date,
    personal_start_date,
    personal_end_date,
    joined_at
  )
  values (
    invite_record.trip_id,
    auth.uid(),
    'member',
    'active',
    invite_record.invited_by,
    invite_record.id,
    invite_record.invited_start_date,
    invite_record.invited_end_date,
    final_confirmed_start,
    final_confirmed_end,
    final_personal_start,
    final_personal_end,
    now()
  )
  on conflict (trip_id, user_id)
  do update set
    status = 'active',
    left_at = null,
    invitation_id = excluded.invitation_id,
    invited_by = excluded.invited_by,
    invited_start_date = excluded.invited_start_date,
    invited_end_date = excluded.invited_end_date,
    confirmed_start_date = excluded.confirmed_start_date,
    confirmed_end_date = excluded.confirmed_end_date,
    personal_start_date = excluded.personal_start_date,
    personal_end_date = excluded.personal_end_date,
    joined_at = now()
  returning id into member_id;

  delete from public.trip_member_legs where trip_member_id = member_id;

  insert into public.trip_member_legs (trip_id, trip_member_id, trip_leg_id, is_joining, start_date, end_date)
  select
    invite_record.trip_id,
    member_id,
    available_legs.trip_leg_id,
    case
      when target_joining_leg_ids is null then true
      else available_legs.trip_leg_id = any(target_joining_leg_ids)
    end,
    greatest(tl.start_date, final_confirmed_start),
    least(tl.end_date, final_confirmed_end)
  from (
    select tl.id as trip_leg_id
    from public.trip_legs tl
    where tl.trip_id = invite_record.trip_id
      and (
        invite_record.invitation_scope <> 'selected_legs'
        or exists (
          select 1
          from public.trip_invitation_legs til
          where til.invitation_id = invite_record.id
            and til.trip_leg_id = tl.id
            and til.is_included = true
        )
      )
  ) available_legs
  join public.trip_legs tl on tl.id = available_legs.trip_leg_id;

  if target_joining_leg_ids is not null and exists (
    select 1
    from unnest(target_joining_leg_ids) as requested_leg_id
    where not exists (
      select 1
      from public.trip_member_legs tml
      where tml.trip_member_id = member_id
        and tml.trip_leg_id = requested_leg_id
    )
  ) then
    raise exception 'One or more selected legs are not available for this invitation';
  end if;

  actor_name := public.get_user_display_name(auth.uid());

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    target_invitation_id,
    'trip_invite_accepted',
    'Trip invite accepted',
    coalesce(actor_name, 'Someone') || ' accepted your trip invite.'
  );

  return member_id;
end;
$$;

revoke all on function public.accept_trip_invitation_with_scope(uuid, date, date, date, date, uuid[]) from public;
grant execute on function public.accept_trip_invitation_with_scope(uuid, date, date, date, date, uuid[]) to authenticated;

create or replace function public.decline_trip_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.trip_invitations;
  actor_name text;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  update public.trip_invitations
  set status = 'declined', responded_at = now()
  where id = invitation_id;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

  select title into trip_title from public.trips where id = invite_record.trip_id;

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    invitation_id,
    'trip_invite_declined',
    'Trip invite declined',
    coalesce(actor_name, 'Someone') || ' declined your invite to ' || coalesce(trip_title, 'your trip') || '.'
  );
end;
$$;

revoke all on function public.decline_trip_invitation(uuid) from public;
grant execute on function public.decline_trip_invitation(uuid) to authenticated;
