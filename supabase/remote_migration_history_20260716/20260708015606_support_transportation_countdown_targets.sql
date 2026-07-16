alter table public.trips
  add column countdown_target_type text,
  add column countdown_target_id uuid;

alter table public.trips
  add constraint trips_countdown_target_type_check
  check (
    countdown_target_type is null
    or countdown_target_type in ('itinerary_item', 'transportation_item')
  );

alter table public.trips
  add constraint trips_countdown_target_pair_check
  check (
    (countdown_target_type is null and countdown_target_id is null)
    or (countdown_target_type is not null and countdown_target_id is not null)
  );

create index trips_countdown_target_idx
  on public.trips(countdown_target_type, countdown_target_id);

update public.trips
set countdown_target_type = 'itinerary_item',
    countdown_target_id = countdown_target_itinerary_item_id
where countdown_target_itinerary_item_id is not null
  and countdown_target_type is null
  and countdown_target_id is null;

create or replace function public.validate_trip_countdown_target_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_trip_id uuid;
  target_has_time boolean;
begin
  if new.countdown_target_type is null and new.countdown_target_id is null then
    new.countdown_target_itinerary_item_id := null;
    return new;
  end if;

  if new.countdown_target_type is null or new.countdown_target_id is null then
    raise exception 'Countdown target type and id must both be set, or both be null.';
  end if;

  if new.countdown_target_type = 'itinerary_item' then
    select ii.trip_id,
           ii.start_time is not null
      into target_trip_id,
           target_has_time
    from public.itinerary_items ii
    where ii.id = new.countdown_target_id;

    if target_trip_id is null then
      raise exception 'Countdown target itinerary item does not exist.';
    end if;

    if target_trip_id <> new.id then
      raise exception 'Countdown target itinerary item must belong to the same trip.';
    end if;

    if target_has_time is not true then
      raise exception 'Countdown target itinerary item must have a specific start time.';
    end if;

    new.countdown_target_itinerary_item_id := new.countdown_target_id;
    return new;
  end if;

  if new.countdown_target_type = 'transportation_item' then
    select ti.trip_id,
           ti.departure_time is not null
      into target_trip_id,
           target_has_time
    from public.transportation_items ti
    where ti.id = new.countdown_target_id;

    if target_trip_id is null then
      raise exception 'Countdown target transportation item does not exist.';
    end if;

    if target_trip_id <> new.id then
      raise exception 'Countdown target transportation item must belong to the same trip.';
    end if;

    if target_has_time is not true then
      raise exception 'Countdown target transportation item must have a specific departure time.';
    end if;

    new.countdown_target_itinerary_item_id := null;
    return new;
  end if;

  raise exception 'Unsupported countdown target type.';
end;
$$;

drop trigger if exists validate_trip_countdown_target_v2_before_write on public.trips;

create trigger validate_trip_countdown_target_v2_before_write
before insert or update of countdown_target_type, countdown_target_id
on public.trips
for each row
execute function public.validate_trip_countdown_target_v2();

comment on column public.trips.countdown_target_type is
  'Optional countdown target kind. NULL means auto-select the first timed item after 00:00 on trips.start_date. Supported values: itinerary_item, transportation_item.';

comment on column public.trips.countdown_target_id is
  'Optional countdown target row id. Interpreted according to countdown_target_type. For transportation_item this references public.transportation_items.id.';;
