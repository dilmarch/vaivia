create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.ensure_trip_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (
    trip_id,
    user_id,
    role,
    status,
    joined_at,
    left_at
  )
  values (
    new.id,
    new.user_id,
    'owner',
    'active',
    coalesce(new.created_at, now()),
    null
  )
  on conflict (trip_id, user_id)
  do update set
    role = 'owner',
    status = 'active',
    left_at = null;

  return new;
end;
$$;

revoke all on function private.ensure_trip_owner_membership() from public;
revoke all on function private.ensure_trip_owner_membership() from anon;
revoke all on function private.ensure_trip_owner_membership() from authenticated;

drop trigger if exists ensure_trip_owner_membership_on_trip on public.trips;

create trigger ensure_trip_owner_membership_on_trip
after insert on public.trips
for each row
execute function private.ensure_trip_owner_membership();

insert into public.trip_members (
  trip_id,
  user_id,
  role,
  status,
  joined_at,
  left_at
)
select
  trips.id,
  trips.user_id,
  'owner',
  'active',
  coalesce(trips.created_at, now()),
  null
from public.trips
on conflict (trip_id, user_id)
do update set
  role = 'owner',
  status = 'active',
  left_at = null;
