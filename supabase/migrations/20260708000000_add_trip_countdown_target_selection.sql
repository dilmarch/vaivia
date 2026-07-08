alter table public.trips
add column if not exists countdown_target_type text null,
add column if not exists countdown_target_id uuid null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'trips_countdown_target_type_check'
          and conrelid = 'public.trips'::regclass
    ) then
        alter table public.trips
        add constraint trips_countdown_target_type_check
        check (
            countdown_target_type is null
            or countdown_target_type in (
                'itinerary_item',
                'transportation_item'
            )
        );
    end if;
end;
$$;

create index if not exists trips_countdown_target_id_idx
on public.trips(countdown_target_id);

update public.trips
set
    countdown_target_type = 'itinerary_item',
    countdown_target_id = countdown_target_itinerary_item_id
where countdown_target_itinerary_item_id is not null
  and countdown_target_type is null
  and countdown_target_id is null;

create or replace function public.validate_trip_countdown_target_selection()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.countdown_target_type is null and new.countdown_target_id is null then
        return new;
    end if;

    if new.countdown_target_type is null or new.countdown_target_id is null then
        raise exception
            'Countdown target type and countdown target id must both be set or both be null';
    end if;

    if new.countdown_target_type = 'itinerary_item' then
        if not exists (
            select 1
            from public.itinerary_items
            where itinerary_items.id = new.countdown_target_id
              and itinerary_items.trip_id = new.id
              and itinerary_items.start_time is not null
        ) then
            raise exception
                'Countdown itinerary target must belong to the same trip and have a start time';
        end if;
    elsif new.countdown_target_type = 'transportation_item' then
        if not exists (
            select 1
            from public.transportation_items
            where transportation_items.id = new.countdown_target_id
              and transportation_items.trip_id = new.id
              and transportation_items.departure_time is not null
        ) then
            raise exception
                'Countdown transportation target must belong to the same trip and have a departure time';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists validate_trip_countdown_target_selection_before_write
on public.trips;

create trigger validate_trip_countdown_target_selection_before_write
before insert or update of countdown_target_type, countdown_target_id
on public.trips
for each row
execute function public.validate_trip_countdown_target_selection();
