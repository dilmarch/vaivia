create or replace function public.accept_trip_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.trip_invitations;
  trip_record public.trips;
  actor_name text;
  notification_title text;
  notification_body text;
  recipient record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending'
  for update;

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  select * into trip_record
  from public.trips
  where id = invite_record.trip_id;

  update public.trip_invitations
  set status = 'accepted', responded_at = now()
  where id = invitation_id;

  insert into public.trip_members (trip_id, user_id, role, status, invited_by, joined_at)
  values (invite_record.trip_id, auth.uid(), 'member', 'active', invite_record.invited_by, now())
  on conflict (trip_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  actor_name := public.get_user_display_name(auth.uid());
  notification_title :=
    coalesce(actor_name, 'Someone') || ' joined ' || coalesce(trip_record.title, 'your trip');
  notification_body :=
    coalesce(actor_name, 'Someone') || ' has joined ' ||
    case
      when nullif(btrim(coalesce(trip_record.title, '')), '') is null then 'your trip'
      else 'the ' || trip_record.title || ' trip'
    end || '.';

  for recipient in
    select distinct recipient_user_id
    from (
      select trip_record.user_id as recipient_user_id
      union
      select trip_members.user_id
      from public.trip_members
      where trip_members.trip_id = invite_record.trip_id
        and trip_members.status = 'active'
        and trip_members.user_id is not null
    ) trip_recipients
    where recipient_user_id is not null
      and recipient_user_id <> auth.uid()
  loop
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
      recipient.recipient_user_id,
      auth.uid(),
      invite_record.trip_id,
      invitation_id,
      'trip_invite_accepted',
      notification_title,
      notification_body,
      jsonb_build_object(
        'url', '/trips/' || invite_record.trip_id::text,
        'eventId', 'trip-member-joined:' || invitation_id::text,
        'tripId', invite_record.trip_id,
        'invitationId', invitation_id,
        'actorUserId', auth.uid()
      )
    );
  end loop;
end;
$$;

create or replace function public.accept_trip_invitation_with_scope(
  target_invitation_id uuid,
  target_confirmed_start_date date default null::date,
  target_confirmed_end_date date default null::date,
  target_personal_start_date date default null::date,
  target_personal_end_date date default null::date,
  target_joining_leg_ids uuid[] default null::uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite_record public.trip_invitations;
  trip_record public.trips;
  actor_name text;
  notification_title text;
  notification_body text;
  member_id uuid;
  final_confirmed_start date;
  final_confirmed_end date;
  final_personal_start date;
  final_personal_end date;
  participant record;
  participant_name text;
  recipient record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = target_invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending'
  for update;

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
  notification_title :=
    coalesce(actor_name, 'Someone') || ' joined ' || coalesce(trip_record.title, 'your trip');
  notification_body :=
    coalesce(actor_name, 'Someone') || ' has joined ' ||
    case
      when nullif(btrim(coalesce(trip_record.title, '')), '') is null then 'your trip'
      else 'the ' || trip_record.title || ' trip'
    end || '.';

  for recipient in
    select distinct recipient_user_id
    from (
      select trip_record.user_id as recipient_user_id
      union
      select trip_members.user_id
      from public.trip_members
      where trip_members.trip_id = invite_record.trip_id
        and trip_members.status = 'active'
        and trip_members.user_id is not null
    ) trip_recipients
    where recipient_user_id is not null
      and recipient_user_id <> auth.uid()
  loop
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
      recipient.recipient_user_id,
      auth.uid(),
      invite_record.trip_id,
      target_invitation_id,
      'trip_invite_accepted',
      notification_title,
      notification_body,
      jsonb_build_object(
        'url', '/trips/' || invite_record.trip_id::text,
        'eventId', 'trip-member-joined:' || target_invitation_id::text,
        'tripId', invite_record.trip_id,
        'invitationId', target_invitation_id,
        'memberId', member_id,
        'actorUserId', auth.uid()
      )
    );
  end loop;

  return member_id;
end;
$$;
