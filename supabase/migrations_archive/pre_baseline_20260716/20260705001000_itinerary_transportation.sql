alter table public.itinerary_items
add column if not exists transportation_mode text,
add column if not exists airline_name text,
add column if not exists airline_code text,
add column if not exists flight_number text;
