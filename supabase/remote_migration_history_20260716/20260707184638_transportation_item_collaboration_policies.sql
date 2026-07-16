drop policy if exists "Users can create their own transportation items" on public.transportation_items;
drop policy if exists "Users can view their own transportation items" on public.transportation_items;
drop policy if exists "Users can update their own transportation items" on public.transportation_items;
drop policy if exists "Users can delete their own transportation items" on public.transportation_items;

create policy "Trip members can create transportation items"
on public.transportation_items
for insert
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
);

create policy "Trip members can view visible transportation items"
on public.transportation_items
for select
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can update visible transportation items"
on public.transportation_items
for update
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
)
with check (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can delete visible transportation items"
on public.transportation_items
for delete
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);;
