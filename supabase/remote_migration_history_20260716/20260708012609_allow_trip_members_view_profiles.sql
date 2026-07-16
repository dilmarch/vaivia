create policy "Trip members can view basic profiles"
on public.user_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.trip_members tm
    where tm.user_id = user_profiles.id
      and public.is_trip_active_member(tm.trip_id)
  )
);;
