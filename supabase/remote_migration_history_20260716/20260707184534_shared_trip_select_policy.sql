drop policy if exists "Active trip members can view trips" on public.trips;
create policy "Active trip members can view trips"
on public.trips
for select
using (
  public.is_trip_active_member(id)
  and archived_at is null
);;
