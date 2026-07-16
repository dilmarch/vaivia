alter table public.trip_ideas
add column if not exists location_city text,
add column if not exists location_region text,
add column if not exists location_country text,
add column if not exists location_country_code text,
add column if not exists location_postal_code text;;
