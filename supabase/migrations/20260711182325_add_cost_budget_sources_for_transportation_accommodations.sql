alter table public.trip_accommodations
  add column if not exists cost numeric(12, 2),
  add column if not exists currency text;

alter table public.trip_accommodations
  drop constraint if exists trip_accommodations_cost_check,
  add constraint trip_accommodations_cost_check
    check (cost is null or cost > 0);

alter table public.trip_accommodations
  drop constraint if exists trip_accommodations_currency_check,
  add constraint trip_accommodations_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.trip_expenses
  add column if not exists accommodation_id uuid
    references public.trip_accommodations(id) on delete set null;

alter table public.trip_expenses
  drop constraint if exists trip_expenses_source_type_check,
  add constraint trip_expenses_source_type_check
    check (source_type in ('manual', 'transportation', 'itinerary_event', 'accommodation'));

create index if not exists trip_expenses_accommodation_id_idx
  on public.trip_expenses (accommodation_id);
