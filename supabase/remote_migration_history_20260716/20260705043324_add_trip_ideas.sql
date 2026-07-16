create table if not exists public.trip_ideas (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'Other',
  tags text[] not null default '{}',
  days_of_week text[] not null default '{}',
  time_of_day text[] not null default '{}',
  opens_at time,
  closes_at time,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_ideas_title_not_blank check (length(btrim(title)) > 0),
  constraint trip_ideas_days_of_week_allowed check (
    days_of_week <@ array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[]
  ),
  constraint trip_ideas_time_of_day_allowed check (
    time_of_day <@ array['early_morning','morning','afternoon','evening','late_night']::text[]
  )
);

create index if not exists trip_ideas_trip_id_idx on public.trip_ideas(trip_id);
create index if not exists trip_ideas_trip_archived_idx on public.trip_ideas(trip_id, is_archived);
create index if not exists trip_ideas_category_idx on public.trip_ideas(category);
create index if not exists trip_ideas_tags_gin_idx on public.trip_ideas using gin(tags);
create index if not exists trip_ideas_days_gin_idx on public.trip_ideas using gin(days_of_week);
create index if not exists trip_ideas_time_of_day_gin_idx on public.trip_ideas using gin(time_of_day);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trip_ideas_updated_at on public.trip_ideas;
create trigger set_trip_ideas_updated_at
before update on public.trip_ideas
for each row
execute function public.set_updated_at();

alter table public.trip_ideas enable row level security;

-- These policies support a simple owner-based trip model using public.trips.user_id.
-- If the app later adds trip collaborators, extend these policies to also check membership.
drop policy if exists "Users can view ideas for their trips" on public.trip_ideas;
create policy "Users can view ideas for their trips"
on public.trip_ideas
for select
to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_ideas.trip_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert ideas for their trips" on public.trip_ideas;
create policy "Users can insert ideas for their trips"
on public.trip_ideas
for insert
to authenticated
with check (
  exists (
    select 1
    from public.trips t
    where t.id = trip_ideas.trip_id
      and t.user_id = auth.uid()
  )
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "Users can update ideas for their trips" on public.trip_ideas;
create policy "Users can update ideas for their trips"
on public.trip_ideas
for update
to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_ideas.trip_id
      and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.trips t
    where t.id = trip_ideas.trip_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete ideas for their trips" on public.trip_ideas;
create policy "Users can delete ideas for their trips"
on public.trip_ideas
for delete
to authenticated
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_ideas.trip_id
      and t.user_id = auth.uid()
  )
);

alter table public.itinerary_items
add column if not exists source_idea_id uuid null references public.trip_ideas(id) on delete set null;

create index if not exists itinerary_items_source_idea_id_idx
on public.itinerary_items(source_idea_id);;
