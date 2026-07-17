create or replace function public.remove_trip_member(
  target_trip_id uuid,
  target_member_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  trip_owner_id uuid;
  member_id uuid;
  deleted_member_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_trip_id is null or target_member_user_id is null then
    raise exception 'Trip and member are required';
  end if;

  if target_member_user_id = requesting_user_id then
    raise exception 'Use leave trip to remove yourself from a trip';
  end if;

  select trips.user_id
  into trip_owner_id
  from public.trips
  where trips.id = target_trip_id;

  if trip_owner_id is null or trip_owner_id <> requesting_user_id then
    raise exception 'Only the trip owner can remove trip members';
  end if;

  if target_member_user_id = trip_owner_id then
    raise exception 'Trip owner cannot be removed from the trip';
  end if;

  select trip_members.id
  into member_id
  from public.trip_members
  where trip_members.trip_id = target_trip_id
    and trip_members.user_id = target_member_user_id
    and trip_members.status = 'active'
  limit 1;

  if member_id is null then
    raise exception 'Trip member was not found';
  end if;

  delete from public.trip_members
  where trip_members.id = member_id
  returning trip_members.id into deleted_member_id;

  if deleted_member_id is null then
    raise exception 'Trip member could not be removed';
  end if;

  return deleted_member_id;
end;
$$;

revoke all on function public.remove_trip_member(uuid, uuid) from public;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;

comment on function public.remove_trip_member(uuid, uuid)
  is 'Allows the authenticated trip owner to remove another active trip member. Cascading foreign keys remove scoped leg/item assignments.';
