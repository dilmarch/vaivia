alter table public.trip_accommodations
  add column if not exists booking_url text,
  add column if not exists is_planning_option boolean not null default false;

alter table public.trip_accommodations
  drop constraint if exists trip_accommodations_booking_url_check;

alter table public.trip_accommodations
  add constraint trip_accommodations_booking_url_check
  check (booking_url is null or booking_url ~* '^https?://[^[:space:]]+$');

create index if not exists trip_accommodations_trip_planning_status_idx
  on public.trip_accommodations (trip_id, is_planning_option, status);
