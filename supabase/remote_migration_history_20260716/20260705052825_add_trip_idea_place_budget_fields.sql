alter table public.trip_ideas
add column if not exists location text,
add column if not exists formatted_address text,
add column if not exists google_place_id text,
add column if not exists location_lat double precision,
add column if not exists location_lng double precision,
add column if not exists timezone text,
add column if not exists timezone_source text default 'manual',
add column if not exists url text,
add column if not exists estimated_cost numeric default 0,
add column if not exists currency text default 'CAD',
add column if not exists sort_order integer default 0;

create index if not exists trip_ideas_trip_id_is_archived_idx
on public.trip_ideas (trip_id, is_archived);

create index if not exists trip_ideas_google_place_id_idx
on public.trip_ideas (google_place_id)
where google_place_id is not null;;
