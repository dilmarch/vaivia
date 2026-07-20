alter table public.trip_accommodations
drop constraint if exists trip_accommodations_checkout_after_checkin;

alter table public.trip_accommodations
add constraint trip_accommodations_checkout_after_checkin
check (check_out_date >= check_in_date);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'trips_end_date_not_before_start_date'
          and conrelid = 'public.trips'::regclass
    ) then
        alter table public.trips
        add constraint trips_end_date_not_before_start_date
        check (
            start_date is null
            or end_date is null
            or end_date >= start_date
        ) not valid;
    end if;
end
$$;
