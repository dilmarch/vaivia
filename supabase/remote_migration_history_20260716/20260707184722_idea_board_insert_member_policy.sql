create policy "Member can add idea board rows"
on public.trip_ideas
for insert
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
);;
