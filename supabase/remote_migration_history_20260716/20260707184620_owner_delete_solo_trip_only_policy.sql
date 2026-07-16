create policy "Owners can remove solo trips"
on public.trips
for delete
using (
  public.is_trip_owner(id)
  and not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = trips.id
      and tm.user_id <> auth.uid()
      and tm.status = 'active'
  )
);;
