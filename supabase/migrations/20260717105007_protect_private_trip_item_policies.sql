-- Tighten older leg-scoped item policies so private trip content remains
-- visible only to the creator while still allowing normal trip-leg visibility
-- for shared rows.

drop policy if exists "Trip members can create trip accommodations"
on public.trip_accommodations;

create policy "Trip members can create trip accommodations"
on public.trip_accommodations
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

drop policy if exists "Trip members can view trip accommodations"
on public.trip_accommodations;

create policy "Trip members can view trip accommodations"
on public.trip_accommodations
for select
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
);

drop policy if exists "Trip members can update trip accommodations"
on public.trip_accommodations;

create policy "Trip members can update trip accommodations"
on public.trip_accommodations
for update
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
)
with check (
  public.is_trip_active_member(trip_id)
  and (
    coalesce(is_private, false) = false
    or created_by = auth.uid()
  )
  and public.can_access_trip_leg(trip_id, trip_leg_id)
);

drop policy if exists "Trip members can delete trip accommodations"
on public.trip_accommodations;

create policy "Trip members can delete trip accommodations"
on public.trip_accommodations
for delete
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
);

drop policy if exists "Trip members can view leg-scoped trip ideas"
on public.trip_ideas;

create policy "Trip members can view leg-scoped trip ideas"
on public.trip_ideas
for select
to authenticated
using (
  (
    coalesce(is_private, false) = false
    and public.can_access_trip_leg(trip_id, trip_leg_id)
  )
  or created_by = auth.uid()
);
