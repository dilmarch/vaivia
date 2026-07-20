create table if not exists public.trip_destinations (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    label text not null,
    google_place_id text,
    country_code text,
    country_name text,
    sort_order integer not null default 0,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_destinations_label_not_blank_check
        check (length(btrim(label)) > 0),
    constraint trip_destinations_country_code_check
        check (country_code is null or country_code ~ '^[A-Z]{2}$'),
    constraint trip_destinations_sort_order_check
        check (sort_order >= 0),
    constraint trip_destinations_trip_sort_order_key
        unique (trip_id, sort_order)
);

comment on table public.trip_destinations is
    'Normalized Google-validated destinations for a trip, including ISO 3166-1 alpha-2 country codes.';

create index if not exists trip_destinations_trip_country_idx
    on public.trip_destinations (trip_id, country_code);

drop trigger if exists set_trip_destinations_updated_at
    on public.trip_destinations;
create trigger set_trip_destinations_updated_at
before update on public.trip_destinations
for each row execute function public.set_updated_at();

alter table public.trip_destinations enable row level security;

create policy "Trip members can view trip destinations"
on public.trip_destinations
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create trip destinations"
on public.trip_destinations
for insert
to authenticated
with check (
    public.is_trip_active_member(trip_id)
    and created_by = (select auth.uid())
);

create policy "Trip members can update trip destinations"
on public.trip_destinations
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete trip destinations"
on public.trip_destinations
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

grant select, insert, update, delete on table public.trip_destinations
to authenticated;
grant all on table public.trip_destinations to service_role;
