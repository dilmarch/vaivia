alter table public.user_passport_stamps
  add column if not exists source_transportation_item_id uuid
    references public.transportation_items(id) on delete set null,
  add column if not exists source_arrival_at timestamptz,
  add column if not exists source_departure_country_code text,
  add column if not exists source_arrival_country_code text;

create index if not exists user_passport_stamps_source_transportation_idx
  on public.user_passport_stamps(source_transportation_item_id);
