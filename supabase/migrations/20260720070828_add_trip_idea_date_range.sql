alter table public.trip_ideas
  add column availability_start_date date,
  add column availability_end_date date,
  add constraint trip_ideas_availability_date_order_check
    check (
      availability_start_date is null
      or availability_end_date is null
      or availability_end_date >= availability_start_date
    );

comment on column public.trip_ideas.availability_start_date is
  'First local calendar date on which this trip idea can take place.';

comment on column public.trip_ideas.availability_end_date is
  'Last local calendar date on which this trip idea can take place.';
