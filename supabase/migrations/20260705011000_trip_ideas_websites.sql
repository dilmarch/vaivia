alter table public.trip_ideas
add column if not exists location_website text,
add column if not exists ticket_website text;
