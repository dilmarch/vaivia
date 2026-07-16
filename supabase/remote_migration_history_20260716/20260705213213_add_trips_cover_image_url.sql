alter table public.trips
add column if not exists cover_image_url text;

comment on column public.trips.cover_image_url is 'Optional custom cover image URL for the trip. Used before fallback/generated destination cover images.';;
