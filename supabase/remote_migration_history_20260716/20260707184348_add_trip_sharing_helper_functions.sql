create or replace function public.is_trip_active_member(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_trip_owner(target_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
      and tm.status = 'active'
  );
$$;

create or replace function public.visible_trip_member_ids(target_trip_id uuid)
returns table(user_id uuid)
language sql
security definer
set search_path = public
as $$
  select tm.user_id
  from public.trip_members tm
  where tm.trip_id = target_trip_id
    and tm.status = 'active';
$$;

grant execute on function public.is_trip_active_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.visible_trip_member_ids(uuid) to authenticated;;
