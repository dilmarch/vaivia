alter table public.trip_ideas
add column if not exists address text,
add column if not exists formatted_address text,
add column if not exists google_place_id text,
add column if not exists location_lat double precision,
add column if not exists location_lng double precision,
add column if not exists location_city text,
add column if not exists is_24_hours boolean not null default false,
add column if not exists ticket_type text,
add column if not exists age_policy text,
add column if not exists dress_code text,
add column if not exists other_notes text;

create index if not exists trip_ideas_location_city_idx
on public.trip_ideas(location_city);
