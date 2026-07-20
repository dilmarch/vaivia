alter table public.trip_accommodations
    add column if not exists check_out_time time without time zone;
