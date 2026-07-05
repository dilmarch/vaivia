create table if not exists public.transportation_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    trip_id uuid not null references public.trips(id) on delete cascade,
    title text,
    transportation_mode text,
    status text not null default 'planned',
    item_date date,
    end_date date,
    start_time time,
    end_time time,
    departure_location text,
    arrival_location text,
    location text,
    departure_timezone text,
    arrival_timezone text,
    timezone text,
    airline_name text,
    airline_code text,
    flight_number text,
    duration text,
    departure_terminal text,
    arrival_terminal text,
    flight_leg_count integer,
    visa_requirements text,
    luggage_requirements text,
    notes text,
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.transportation_items
add column if not exists user_id uuid references auth.users(id) on delete cascade,
add column if not exists trip_id uuid references public.trips(id) on delete cascade,
add column if not exists title text,
add column if not exists transportation_mode text,
add column if not exists mode text,
add column if not exists type text,
add column if not exists status text,
add column if not exists item_date date,
add column if not exists date date,
add column if not exists departure_date date,
add column if not exists arrival_date date,
add column if not exists end_date date,
add column if not exists start_time time,
add column if not exists departure_time time,
add column if not exists end_time time,
add column if not exists arrival_time time,
add column if not exists departure_location text,
add column if not exists arrival_location text,
add column if not exists location text,
add column if not exists departure_timezone text,
add column if not exists arrival_timezone text,
add column if not exists timezone text,
add column if not exists airline_name text,
add column if not exists airline_code text,
add column if not exists flight_number text,
add column if not exists duration text,
add column if not exists departure_terminal text,
add column if not exists arrival_terminal text,
add column if not exists flight_leg_count integer,
add column if not exists visa_requirements text,
add column if not exists luggage_requirements text,
add column if not exists notes text,
add column if not exists created_at timestamp with time zone not null default timezone('utc'::text, now()),
add column if not exists updated_at timestamp with time zone not null default timezone('utc'::text, now());

create index if not exists transportation_items_trip_id_idx
on public.transportation_items(trip_id);

create index if not exists transportation_items_user_id_idx
on public.transportation_items(user_id);

grant usage on schema public to authenticated;

grant select, insert, update, delete
on table public.transportation_items
to authenticated;

alter table public.transportation_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
        and tablename = 'transportation_items'
        and policyname = 'Users can view their own transportation items'
    ) then
        create policy "Users can view their own transportation items"
        on public.transportation_items
        for select
        to authenticated
        using (
            (select auth.uid()) = user_id
            or exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
        and tablename = 'transportation_items'
        and policyname = 'Users can create transportation items for their own trips'
    ) then
        create policy "Users can create transportation items for their own trips"
        on public.transportation_items
        for insert
        to authenticated
        with check (
            (select auth.uid()) = user_id
            and exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
        and tablename = 'transportation_items'
        and policyname = 'Users can update their own transportation items'
    ) then
        create policy "Users can update their own transportation items"
        on public.transportation_items
        for update
        to authenticated
        using (
            (select auth.uid()) = user_id
            or exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
        )
        with check (
            (select auth.uid()) = user_id
            and exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
        and tablename = 'transportation_items'
        and policyname = 'Users can delete their own transportation items'
    ) then
        create policy "Users can delete their own transportation items"
        on public.transportation_items
        for delete
        to authenticated
        using (
            (select auth.uid()) = user_id
            or exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
        );
    end if;
end
$$;
