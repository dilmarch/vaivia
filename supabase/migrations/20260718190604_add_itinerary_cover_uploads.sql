alter table public.itinerary_items
  add column if not exists ticket_website text,
  add column if not exists location_website text,
  add column if not exists cover_image_url text,
  add column if not exists cover_image_source text,
  add column if not exists cover_image_storage_path text;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_cover_image_source_check;

alter table public.itinerary_items
  add constraint itinerary_items_cover_image_source_check
  check (
    cover_image_source is null
    or cover_image_source in ('upload', 'external')
  );

update public.itinerary_items
set ticket_website = url
where ticket_website is null
  and url is not null;

comment on column public.itinerary_items.cover_image_url is
  'External event or venue cover URL. Uploaded images use cover_image_storage_path instead.';

comment on column public.itinerary_items.cover_image_source is
  'Origin of the itinerary cover: upload, external, or NULL.';

comment on column public.itinerary_items.cover_image_storage_path is
  'Private trip-covers object path for an uploaded itinerary cover. Never store a signed URL here.';
