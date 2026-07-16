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

  -- Confirmed dates must be the invited dates or inside the invited window.
  -- Personal dates may extend before/after and apply only to this member.
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

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

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

revoke execute on function public.accept_trip_invitation_with_scope(uuid, date, date, date, date, uuid[]) from anon;
grant execute on function public.accept_trip_invitation_with_scope(uuid, date, date, date, date, uuid[]) to authenticated;
;
