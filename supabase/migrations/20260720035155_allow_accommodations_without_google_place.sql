alter table public.trip_accommodations
  drop constraint if exists trip_accommodations_place_required_for_standard_types;

comment on column public.trip_accommodations.google_place_id is
  'Optional Google Place identifier. Accommodations may instead use an entered address or coordinates.';
