alter table public.trip_destinations
    add column if not exists latitude double precision,
    add column if not exists longitude double precision;

alter table public.trip_destinations
    drop constraint if exists trip_destinations_coordinate_pair_check,
    add constraint trip_destinations_coordinate_pair_check
        check ((latitude is null) = (longitude is null)),
    drop constraint if exists trip_destinations_latitude_check,
    add constraint trip_destinations_latitude_check
        check (latitude is null or latitude between -90 and 90),
    drop constraint if exists trip_destinations_longitude_check,
    add constraint trip_destinations_longitude_check
        check (longitude is null or longitude between -180 and 180);

comment on column public.trip_destinations.latitude is
    'Google-validated destination latitude captured when the destination is selected.';
comment on column public.trip_destinations.longitude is
    'Google-validated destination longitude captured when the destination is selected.';
