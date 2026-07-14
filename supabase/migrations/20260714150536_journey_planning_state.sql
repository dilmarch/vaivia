create table if not exists public.trip_journey_planning_states (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  scenarios jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_journey_planning_states_scenarios_array_check
    check (jsonb_typeof(scenarios) = 'array')
);

alter table public.trip_journey_planning_states enable row level security;

drop policy if exists "Trip members can view journey planning state"
on public.trip_journey_planning_states;

create policy "Trip members can view journey planning state"
on public.trip_journey_planning_states
for select
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can create journey planning state"
on public.trip_journey_planning_states;

create policy "Trip members can create journey planning state"
on public.trip_journey_planning_states
for insert
to authenticated
with check (
  public.is_trip_active_member(trip_id)
  and updated_by = (select auth.uid())
);

drop policy if exists "Trip members can update journey planning state"
on public.trip_journey_planning_states;

create policy "Trip members can update journey planning state"
on public.trip_journey_planning_states
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (
  public.is_trip_active_member(trip_id)
  and updated_by = (select auth.uid())
);

grant select, insert, update on table public.trip_journey_planning_states
to authenticated;
