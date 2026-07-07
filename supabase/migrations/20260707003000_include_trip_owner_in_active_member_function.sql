create or replace function public.is_trip_active_member(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.trips
    where trips.id = target_trip_id
      and trips.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trip_members
    where trip_members.trip_id = target_trip_id
      and trip_members.user_id = auth.uid()
      and trip_members.status = 'active'
  );
$$;
