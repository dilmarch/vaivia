create table if not exists public.user_travel_bucket_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_label text not null,
  city text,
  region text,
  country_code text not null,
  country_name text,
  flag_emoji text,
  google_place_id text,
  google_formatted_address text,
  latitude double precision,
  longitude double precision,
  status text not null default 'in_progress',
  completed_at timestamptz,
  completed_trip_id uuid references public.trips(id) on delete set null,
  completed_transportation_item_id uuid references public.transportation_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_travel_bucket_list_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint user_travel_bucket_list_status_check
    check (status in ('in_progress', 'completed')),
  constraint user_travel_bucket_list_place_label_not_blank_check
    check (length(btrim(place_label)) > 0),
  constraint user_travel_bucket_list_completion_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status = 'in_progress')
    )
);

create index if not exists user_travel_bucket_list_user_status_idx
on public.user_travel_bucket_list(user_id, status, created_at);

create index if not exists user_travel_bucket_list_user_country_idx
on public.user_travel_bucket_list(user_id, country_code);

alter table public.user_travel_bucket_list enable row level security;

drop policy if exists "Users can view their own travel bucket list"
on public.user_travel_bucket_list;
drop policy if exists "Users can create their own travel bucket list"
on public.user_travel_bucket_list;
drop policy if exists "Users can update their own travel bucket list"
on public.user_travel_bucket_list;
drop policy if exists "Users can delete their own travel bucket list"
on public.user_travel_bucket_list;

create policy "Users can view their own travel bucket list"
on public.user_travel_bucket_list
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own travel bucket list"
on public.user_travel_bucket_list
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own travel bucket list"
on public.user_travel_bucket_list
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own travel bucket list"
on public.user_travel_bucket_list
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on table public.user_travel_bucket_list
to authenticated;

create table if not exists public.user_scratch_map_countries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_scratch_map_countries_country_code_check
    check (country_code ~ '^[A-Z]{3}$'),
  constraint user_scratch_map_countries_user_country_unique
    unique (user_id, country_code)
);

create index if not exists user_scratch_map_countries_user_country_idx
on public.user_scratch_map_countries(user_id, country_code);

alter table public.user_scratch_map_countries enable row level security;

drop policy if exists "Users can view their own scratch map countries"
on public.user_scratch_map_countries;
drop policy if exists "Users can create their own scratch map countries"
on public.user_scratch_map_countries;
drop policy if exists "Users can update their own scratch map countries"
on public.user_scratch_map_countries;
drop policy if exists "Users can delete their own scratch map countries"
on public.user_scratch_map_countries;

create policy "Users can view their own scratch map countries"
on public.user_scratch_map_countries
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own scratch map countries"
on public.user_scratch_map_countries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own scratch map countries"
on public.user_scratch_map_countries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own scratch map countries"
on public.user_scratch_map_countries
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on table public.user_scratch_map_countries
to authenticated;
