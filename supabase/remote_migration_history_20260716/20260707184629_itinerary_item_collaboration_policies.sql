drop policy if exists "Users can create their own itinerary items" on public.itinerary_items;
drop policy if exists "Users can view their own itinerary items" on public.itinerary_items;
drop policy if exists "Users can update their own itinerary items" on public.itinerary_items;
drop policy if exists "Users can delete their own itinerary items" on public.itinerary_items;

create policy "Trip members can create itinerary items"
on public.itinerary_items
for insert
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
);

create policy "Trip members can view visible itinerary items"
on public.itinerary_items
for select
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can update visible itinerary items"
on public.itinerary_items
for update
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
)
with check (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can delete visible itinerary items"
on public.itinerary_items
for delete
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);;
