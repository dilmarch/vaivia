create table if not exists public.countries (
  alpha2 text primary key,
  alpha3 text,
  common_name text not null,
  official_name text,
  flag_emoji text,
  flag_svg_url text,
  flag_png_url text,
  region text,
  subregion text,
  currencies jsonb not null default '{}'::jsonb,
  rest_countries_payload jsonb,
  source text not null default 'rest_countries',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_alpha2_check check (alpha2 ~ '^[A-Z]{2}$'),
  constraint countries_alpha3_check check (alpha3 is null or alpha3 ~ '^[A-Z]{3}$')
);

create index if not exists countries_common_name_idx
  on public.countries(common_name);

create index if not exists countries_region_idx
  on public.countries(region, subregion);

alter table public.countries enable row level security;

drop policy if exists "Countries are readable by everyone"
  on public.countries;

create policy "Countries are readable by everyone"
on public.countries
for select
to anon, authenticated
using (true);;
