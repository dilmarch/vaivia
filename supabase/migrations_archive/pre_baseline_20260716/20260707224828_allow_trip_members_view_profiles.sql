drop policy if exists "Trip members can view member profiles"
on public.user_profiles;

create policy "Trip members can view member profiles"
on public.user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.trip_members viewer_membership
    join public.trip_members profile_membership
      on profile_membership.trip_id = viewer_membership.trip_id
    where viewer_membership.user_id = (select auth.uid())
      and viewer_membership.status = 'active'
      and profile_membership.user_id = user_profiles.id
      and profile_membership.status = 'active'
  )
  or exists (
    select 1
    from public.trips
    left join public.trip_members profile_membership
      on profile_membership.trip_id = trips.id
      and profile_membership.user_id = user_profiles.id
      and profile_membership.status = 'active'
    where trips.user_id = (select auth.uid())
      and (
        trips.user_id = user_profiles.id
        or profile_membership.user_id is not null
      )
  )
  or exists (
    select 1
    from public.trips
    join public.trip_members viewer_membership
      on viewer_membership.trip_id = trips.id
    where viewer_membership.user_id = (select auth.uid())
      and viewer_membership.status = 'active'
      and trips.user_id = user_profiles.id
  )
);
