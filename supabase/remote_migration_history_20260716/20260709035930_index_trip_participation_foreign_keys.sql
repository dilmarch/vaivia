-- Add single-column FK indexes the Supabase performance advisor expects for new participation tables.
create index if not exists idx_itinerary_items_trip_leg_id on public.itinerary_items(trip_leg_id);
create index if not exists idx_transportation_items_trip_leg_id on public.transportation_items(trip_leg_id);
create index if not exists idx_trip_accommodations_trip_leg_id on public.trip_accommodations(trip_leg_id);
create index if not exists idx_trip_invitation_legs_trip_leg_id on public.trip_invitation_legs(trip_leg_id);
create index if not exists idx_trip_member_legs_trip_leg_id on public.trip_member_legs(trip_leg_id);
create index if not exists idx_trip_item_participants_family_member_id on public.trip_item_participants(family_member_id);
create index if not exists idx_trip_members_invitation_id on public.trip_members(invitation_id);

-- Avoid duplicate SELECT policies caused by FOR ALL on new leg mapping tables.
drop policy if exists "Trip members can manage invitation legs" on public.trip_invitation_legs;
create policy "Trip members can insert invitation legs"
on public.trip_invitation_legs for insert
to authenticated
with check (public.is_trip_active_member(trip_id));
create policy "Trip members can update invitation legs"
on public.trip_invitation_legs for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));
create policy "Trip members can delete invitation legs"
on public.trip_invitation_legs for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can manage member legs" on public.trip_member_legs;
create policy "Trip members can insert member legs"
on public.trip_member_legs for insert
to authenticated
with check (public.is_trip_active_member(trip_id));
create policy "Trip members can update member legs"
on public.trip_member_legs for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));
create policy "Trip members can delete member legs"
on public.trip_member_legs for delete
to authenticated
using (public.is_trip_active_member(trip_id));
;
