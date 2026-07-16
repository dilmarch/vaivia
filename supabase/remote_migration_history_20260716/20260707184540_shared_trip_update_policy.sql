drop policy if exists "Active trip members can update trips" on public.trips;
create policy "Active trip members can update trips"
on public.trips
for update
using (
  public.is_trip_active_member(id)
  and archived_at is null
)
with check (
  public.is_trip_active_member(id)
);;
