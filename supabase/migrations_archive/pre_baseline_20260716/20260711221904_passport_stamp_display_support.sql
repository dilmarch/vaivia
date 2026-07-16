create table if not exists public.airports (
  id uuid primary key default gen_random_uuid(),
  ident text unique,
  type text,
  name text not null,
  latitude_deg numeric,
  longitude_deg numeric,
  elevation_ft integer,
  continent text,
  iso_country text,
  iso_region text,
  municipality text,
  scheduled_service boolean,
  gps_code text,
  iata_code text,
  local_code text,
  home_link text,
  wikipedia_link text,
  keywords text,
  source text not null default 'ourairports',
  updated_at timestamptz not null default now()
);

create index if not exists airports_iso_country_idx
on public.airports(iso_country);

create index if not exists airports_iata_code_idx
on public.airports(iata_code);

create index if not exists airports_municipality_idx
on public.airports(municipality);

alter table public.airports enable row level security;

drop policy if exists "Airports are readable by everyone"
  on public.airports;

create policy "Airports are readable by everyone"
on public.airports
for select
to anon, authenticated
using (true);

grant select on table public.airports to anon, authenticated;

alter table public.countries
add column if not exists primary_language_code text,
add column if not exists primary_language_name text,
add column if not exists languages jsonb,
add column if not exists capital text,
add column if not exists capital_lat numeric,
add column if not exists capital_lng numeric,
add column if not exists arrival_label text,
add column if not exists arrival_label_source text default 'fallback',
add column if not exists default_entry_airport_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'countries_default_entry_airport_id_fkey'
  ) then
    alter table public.countries
    add constraint countries_default_entry_airport_id_fkey
    foreign key (default_entry_airport_id)
    references public.airports(id)
    on delete set null;
  end if;
end;
$$;

alter table public.user_passport_stamps
add column if not exists first_visited_on date,
add column if not exists stamped_at timestamptz not null default now(),
add column if not exists source_trip_id uuid references public.trips(id) on delete set null,
add column if not exists first_entry_airport_id uuid references public.airports(id) on delete set null,
add column if not exists first_entry_iata_code text,
add column if not exists first_entry_icao_code text,
add column if not exists first_entry_city text,
add column if not exists arrival_label_snapshot text,
add column if not exists stamp_display_country_name text,
add column if not exists stamp_display_flag text;

alter table public.user_passport_stamps
drop constraint if exists user_passport_stamps_source_check;

alter table public.user_passport_stamps
add constraint user_passport_stamps_source_check
check (source in ('manual', 'auto'));

grant select on table public.countries to anon, authenticated;
grant select, insert, update, delete on table public.user_passport_stamps to authenticated;
