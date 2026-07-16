create table if not exists public.user_passport_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  country_name text not null,
  flag_emoji text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_passport_stamps_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint user_passport_stamps_source_check
    check (source in ('manual')),
  constraint user_passport_stamps_user_country_unique
    unique (user_id, country_code)
);

create index if not exists user_passport_stamps_user_country_idx
  on public.user_passport_stamps(user_id, country_code);

alter table public.user_passport_stamps enable row level security;

drop policy if exists "Users can view their own passport stamps"
  on public.user_passport_stamps;
drop policy if exists "Users can create their own passport stamps"
  on public.user_passport_stamps;
drop policy if exists "Users can update their own passport stamps"
  on public.user_passport_stamps;
drop policy if exists "Users can delete their own passport stamps"
  on public.user_passport_stamps;

create policy "Users can view their own passport stamps"
on public.user_passport_stamps
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create their own passport stamps"
on public.user_passport_stamps
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their own passport stamps"
on public.user_passport_stamps
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete their own passport stamps"
on public.user_passport_stamps
for delete
to authenticated
using (user_id = (select auth.uid()));;
