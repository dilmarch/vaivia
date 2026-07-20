create or replace function public.update_trip_invitation_leg_assignments(
  target_trip_id uuid,
  target_invitation_id uuid,
  target_leg_ids uuid[] default '{}'::uuid[]
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_leg_ids uuid[];
  invitation_status text;
  invitation_invited_by uuid;
  trip_owner_id uuid;
  invited_start date;
  invited_end date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(array_agg(distinct requested_leg_id), '{}'::uuid[])
    into normalized_leg_ids
  from unnest(coalesce(target_leg_ids, '{}'::uuid[])) as requested_leg_id
  where requested_leg_id is not null;

  select trip_invitations.status, trip_invitations.invited_by, trips.user_id
    into invitation_status, invitation_invited_by, trip_owner_id
  from public.trip_invitations
  join public.trips on trips.id = trip_invitations.trip_id
  where trip_invitations.id = target_invitation_id
    and trip_invitations.trip_id = target_trip_id
  for update of trip_invitations;

  if not found then
    raise exception 'Trip invitation not found';
  end if;

  if invitation_status <> 'pending' then
    raise exception 'Only pending trip invitations can be updated';
  end if;

  if invitation_invited_by <> auth.uid() and trip_owner_id <> auth.uid() then
    raise exception 'You do not have permission to update this trip invitation';
  end if;

  if exists (
    select 1
    from unnest(normalized_leg_ids) as requested_leg_id
    where not exists (
      select 1
      from public.trip_legs
      where trip_legs.id = requested_leg_id
        and trip_legs.trip_id = target_trip_id
        and coalesce(trip_legs.leg_type, 'location') <> 'accommodation'
    )
  ) then
    raise exception 'One or more selected trip legs are not part of this trip';
  end if;

  select
    min(trip_legs.start_date),
    max(coalesce(trip_legs.end_date, trip_legs.start_date))
  into invited_start, invited_end
  from public.trip_legs
  where trip_legs.trip_id = target_trip_id
    and trip_legs.id = any(normalized_leg_ids)
    and trip_legs.start_date is not null;

  delete from public.trip_invitation_legs
  where invitation_id = target_invitation_id;

  insert into public.trip_invitation_legs (
    invitation_id,
    trip_id,
    trip_leg_id,
    is_included
  )
  select
    target_invitation_id,
    target_trip_id,
    selected_leg_id,
    true
  from unnest(normalized_leg_ids) as selected_leg_id;

  update public.trip_invitations
  set invitation_scope = 'selected_legs',
      invited_start_date = invited_start,
      invited_end_date = invited_end
  where id = target_invitation_id;

  return cardinality(normalized_leg_ids);
end;
$$;

revoke all on function public.update_trip_invitation_leg_assignments(
  uuid,
  uuid,
  uuid[]
) from public;
revoke all on function public.update_trip_invitation_leg_assignments(
  uuid,
  uuid,
  uuid[]
) from anon;
grant execute on function public.update_trip_invitation_leg_assignments(
  uuid,
  uuid,
  uuid[]
) to authenticated;
grant execute on function public.update_trip_invitation_leg_assignments(
  uuid,
  uuid,
  uuid[]
) to service_role;

comment on function public.update_trip_invitation_leg_assignments(uuid, uuid, uuid[])
  is 'Atomically replaces the selected legs and invited date window for a pending trip invitation. Only the sender or trip owner may update it.';
