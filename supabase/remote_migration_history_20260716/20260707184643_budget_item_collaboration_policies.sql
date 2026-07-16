drop policy if exists "Users can create their own budget items" on public.budget_items;
drop policy if exists "Users can view their own budget items" on public.budget_items;
drop policy if exists "Users can update their own budget items" on public.budget_items;
drop policy if exists "Users can delete their own budget items" on public.budget_items;

create policy "Trip members can create budget items"
on public.budget_items
for insert
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
);

create policy "Trip members can view visible budget items"
on public.budget_items
for select
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can update visible budget items"
on public.budget_items
for update
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
)
with check (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);

create policy "Trip members can delete visible budget items"
on public.budget_items
for delete
using (
  public.is_trip_active_member(trip_id)
  and (is_private = false or created_by = auth.uid())
);;
