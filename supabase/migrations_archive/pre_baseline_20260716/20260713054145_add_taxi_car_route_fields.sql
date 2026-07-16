alter table public.transportation_items
add column if not exists route_stops jsonb not null default '[]'::jsonb,
add column if not exists preferred_ride_provider text;

create index if not exists transportation_items_route_stops_gin_idx
on public.transportation_items
using gin (route_stops);
