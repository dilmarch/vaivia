alter table public.trip_ideas
  add column if not exists trip_leg_id uuid references public.trip_legs(id) on delete set null;

create index if not exists trip_ideas_trip_leg_id_idx
  on public.trip_ideas(trip_id, trip_leg_id);

create index if not exists trip_legs_trip_dates_idx
  on public.trip_legs(trip_id, start_date, end_date);

create index if not exists trip_member_legs_member_leg_idx
  on public.trip_member_legs(trip_id, trip_member_id, trip_leg_id);

alter table public.trip_legs enable row level security;
alter table public.trip_member_legs enable row level security;

create or replace function public.can_access_trip_leg(
  target_trip_id uuid,
  target_trip_leg_id uuid
)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select
    target_trip_leg_id is null
    and public.is_trip_active_member(target_trip_id)
  or exists (
    select 1
    from public.trips
    where trips.id = target_trip_id
      and trips.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trip_legs
    join public.trip_member_legs
      on trip_member_legs.trip_leg_id = trip_legs.id
     and trip_member_legs.trip_id = trip_legs.trip_id
     and trip_member_legs.is_joining = true
    join public.trip_members
      on trip_members.id = trip_member_legs.trip_member_id
     and trip_members.trip_id = trip_member_legs.trip_id
     and trip_members.status = 'active'
    where trip_legs.id = target_trip_leg_id
      and trip_legs.trip_id = target_trip_id
      and trip_members.user_id = auth.uid()
  );
$$;

drop policy if exists "Trip members can view trip legs" on public.trip_legs;
drop policy if exists "Trip members can create trip legs" on public.trip_legs;
drop policy if exists "Trip members can update trip legs" on public.trip_legs;
drop policy if exists "Trip members can delete trip legs" on public.trip_legs;

create policy "Trip members can view trip legs"
on public.trip_legs
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create trip legs"
on public.trip_legs
for insert
to authenticated
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can update trip legs"
on public.trip_legs
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete trip legs"
on public.trip_legs
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view trip member legs" on public.trip_member_legs;
drop policy if exists "Trip members can create trip member legs" on public.trip_member_legs;
drop policy if exists "Trip members can update trip member legs" on public.trip_member_legs;
drop policy if exists "Trip members can delete trip member legs" on public.trip_member_legs;

create policy "Trip members can view trip member legs"
on public.trip_member_legs
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create trip member legs"
on public.trip_member_legs
for insert
to authenticated
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can update trip member legs"
on public.trip_member_legs
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete trip member legs"
on public.trip_member_legs
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view trip accommodations" on public.trip_accommodations;
drop policy if exists "Trip members can create trip accommodations" on public.trip_accommodations;
drop policy if exists "Trip members can update trip accommodations" on public.trip_accommodations;
drop policy if exists "Trip members can delete trip accommodations" on public.trip_accommodations;

alter table public.trip_accommodations enable row level security;

create policy "Trip members can view trip accommodations"
on public.trip_accommodations
for select
to authenticated
using (public.can_access_trip_leg(trip_id, trip_leg_id));

create policy "Trip members can create trip accommodations"
on public.trip_accommodations
for insert
to authenticated
with check (public.can_access_trip_leg(trip_id, trip_leg_id));

create policy "Trip members can update trip accommodations"
on public.trip_accommodations
for update
to authenticated
using (public.can_access_trip_leg(trip_id, trip_leg_id))
with check (public.can_access_trip_leg(trip_id, trip_leg_id));

create policy "Trip members can delete trip accommodations"
on public.trip_accommodations
for delete
to authenticated
using (public.can_access_trip_leg(trip_id, trip_leg_id));

drop policy if exists "Users can view transportation items for accessible trips" on public.transportation_items;
drop policy if exists "Users can create transportation items for accessible trips" on public.transportation_items;
drop policy if exists "Users can update their own transportation items" on public.transportation_items;
drop policy if exists "Users can delete their own transportation items" on public.transportation_items;
drop policy if exists "Trip members can view leg-scoped transportation items" on public.transportation_items;
drop policy if exists "Trip members can create leg-scoped transportation items" on public.transportation_items;
drop policy if exists "Trip members can update leg-scoped transportation items" on public.transportation_items;
drop policy if exists "Trip members can delete leg-scoped transportation items" on public.transportation_items;

create policy "Trip members can view leg-scoped transportation items"
on public.transportation_items
for select
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
);

create policy "Trip members can create leg-scoped transportation items"
on public.transportation_items
for insert
to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can update leg-scoped transportation items"
on public.transportation_items
for update
to authenticated
using (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
)
with check (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can delete leg-scoped transportation items"
on public.transportation_items
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
);

drop policy if exists "Trip members can view leg-scoped itinerary items" on public.itinerary_items;
drop policy if exists "Trip members can create leg-scoped itinerary items" on public.itinerary_items;
drop policy if exists "Trip members can update leg-scoped itinerary items" on public.itinerary_items;
drop policy if exists "Trip members can delete leg-scoped itinerary items" on public.itinerary_items;

alter table public.itinerary_items enable row level security;

create policy "Trip members can view leg-scoped itinerary items"
on public.itinerary_items
for select
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
);

create policy "Trip members can create leg-scoped itinerary items"
on public.itinerary_items
for insert
to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can update leg-scoped itinerary items"
on public.itinerary_items
for update
to authenticated
using (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
)
with check (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can delete leg-scoped itinerary items"
on public.itinerary_items
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.can_access_trip_leg(trip_id, trip_leg_id)
);

drop policy if exists "Trip members can view leg-scoped trip ideas" on public.trip_ideas;
drop policy if exists "Trip members can create leg-scoped trip ideas" on public.trip_ideas;
drop policy if exists "Trip members can update leg-scoped trip ideas" on public.trip_ideas;
drop policy if exists "Trip members can delete leg-scoped trip ideas" on public.trip_ideas;

create policy "Trip members can view leg-scoped trip ideas"
on public.trip_ideas
for select
to authenticated
using (public.can_access_trip_leg(trip_id, trip_leg_id));

create policy "Trip members can create leg-scoped trip ideas"
on public.trip_ideas
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can update leg-scoped trip ideas"
on public.trip_ideas
for update
to authenticated
using (
  created_by = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
)
with check (
  created_by = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

create policy "Trip members can delete leg-scoped trip ideas"
on public.trip_ideas
for delete
to authenticated
using (
  created_by = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);
