alter table public.transportation_items
  drop column if exists confirmation_number,
  drop column if exists booking_reference;;
