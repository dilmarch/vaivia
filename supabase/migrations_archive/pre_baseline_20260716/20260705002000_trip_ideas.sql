create table if not exists public.trip_ideas (
    id uuid primary key default gen_random_uuid(),
    created_by uuid not null references auth.users(id) on delete cascade,
    trip_id uuid not null references public.trips(id) on delete cascade,
    title text not null,
    description text,
    category text not null default 'Other',
    tags jsonb not null default '[]'::jsonb,
    days_of_week jsonb not null default '[]'::jsonb,
    time_of_day jsonb not null default '[]'::jsonb,
    opens_at time,
    closes_at time,
    is_archived boolean not null default false,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists trip_ideas_trip_id_idx
on public.trip_ideas(trip_id);

create index if not exists trip_ideas_created_by_idx
on public.trip_ideas(created_by);

alter table public.trip_ideas enable row level security;

create policy "Users can view their own trip ideas"
on public.trip_ideas
for select
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can create ideas for their own trips"
on public.trip_ideas
for insert
to authenticated
with check (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can update their own trip ideas"
on public.trip_ideas
for update
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
)
with check (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can delete their own trip ideas"
on public.trip_ideas
for delete
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);
