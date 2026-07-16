alter table public.trips
  add column countdown_target_itinerary_item_id uuid;

alter table public.trips
  add constraint trips_countdown_target_itinerary_item_id_fkey
  foreign key (countdown_target_itinerary_item_id)
  references public.itinerary_items(id)
  on delete set null;

create index trips_countdown_target_itinerary_item_id_idx
  on public.trips(countdown_target_itinerary_item_id);

create or replace function public.validate_trip_countdown_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_trip_id uuid;
begin
  if new.countdown_target_itinerary_item_id is null then
    return new;
  end if;

  select ii.trip_id
    into target_trip_id
  from public.itinerary_items ii
  where ii.id = new.countdown_target_itinerary_item_id;

  if target_trip_id is null then
    raise exception 'Countdown target itinerary item does not exist.';
  end if;

  if target_trip_id <> new.id then
    raise exception 'Countdown target itinerary item must belong to the same trip.';
  end if;

  return new;
end;
$$;

create trigger validate_trip_countdown_target_before_write
before insert or update of countdown_target_itinerary_item_id, id
on public.trips
for each row
execute function public.validate_trip_countdown_target();

comment on column public.trips.countdown_target_itinerary_item_id is
  'Optional selected itinerary item for the trip countdown. NULL means use the first itinerary item after 00:00 on trips.start_date.';;
