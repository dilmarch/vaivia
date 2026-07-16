alter table public.itinerary_items
    add column if not exists ticket_website text,
    add column if not exists location_website text,
    add column if not exists cover_image_url text;

update public.itinerary_items
set ticket_website = url
where ticket_website is null
  and url is not null;
