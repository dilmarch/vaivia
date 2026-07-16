drop policy if exists "Users can view relevant trip members" on public.trip_members;
create policy "Users can view relevant trip members"
on public.trip_members
for select
using (
  user_id = auth.uid()
  or public.is_trip_active_member(trip_id)
);;
