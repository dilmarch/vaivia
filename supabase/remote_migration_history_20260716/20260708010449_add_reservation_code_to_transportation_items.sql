alter table public.transportation_items
add column if not exists reservation_code text;

comment on column public.transportation_items.reservation_code is 'Reservation code or PNR/reference code for the transportation booking.';;
