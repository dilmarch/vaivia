-- Category colour options available in the VAIVIA UI.
create table if not exists public.category_color_options (
  key text primary key,
  label text not null,
  hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null unique
);

insert into public.category_color_options (key, label, hex, sort_order) values
  ('violet_bold', 'Violet', '#A78BFA', 10),
  ('violet_soft', 'Soft Violet', '#C4B5FD', 20),
  ('indigo_bold', 'Indigo', '#818CF8', 30),
  ('blue_bold', 'Electric Blue', '#38BDF8', 40),
  ('cyan_soft', 'Soft Cyan', '#67E8F9', 50),
  ('teal_bold', 'Teal', '#2DD4BF', 60),
  ('emerald_bold', 'Emerald', '#34D399', 70),
  ('lime_bold', 'Lime', '#BEF264', 80),
  ('yellow_soft', 'Soft Yellow', '#FDE68A', 90),
  ('amber_bold', 'Amber', '#FBBF24', 100),
  ('orange_bold', 'Orange', '#FB923C', 110),
  ('coral_soft', 'Soft Coral', '#FDA4AF', 120),
  ('rose_bold', 'Rose', '#FB7185', 130),
  ('pink_bold', 'Pink', '#F472B6', 140),
  ('fuchsia_bold', 'Fuchsia', '#E879F9', 150),
  ('pearl', 'Pearl', '#F8FAFC', 160),
  ('mist', 'Mist', '#CBD5E1', 170),
  ('slate', 'Slate', '#64748B', 180),
  ('graphite', 'Graphite', '#334155', 190),
  ('obsidian', 'Obsidian', '#0F172A', 200)
on conflict (key) do update set
  label = excluded.label,
  hex = excluded.hex,
  sort_order = excluded.sort_order;

create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color_key text not null references public.category_color_options(key),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_categories_name_not_blank check (length(btrim(name)) between 1 and 40)
);

create unique index if not exists user_categories_user_lower_name_idx
  on public.user_categories (user_id, lower(btrim(name)));

create index if not exists user_categories_user_name_idx
  on public.user_categories (user_id, lower(name));

create or replace function public.vaivia_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_categories_updated_at on public.user_categories;
create trigger set_user_categories_updated_at
before update on public.user_categories
for each row execute function public.vaivia_set_updated_at();

create or replace function public.enforce_user_category_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.user_categories uc
    where uc.user_id = new.user_id
  ) >= 20 then
    raise exception 'Users can have a maximum of 20 categories.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_category_limit_before_insert on public.user_categories;
create trigger enforce_user_category_limit_before_insert
before insert on public.user_categories
for each row execute function public.enforce_user_category_limit();

create or replace function public.seed_default_user_categories(target_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_categories (user_id, name, color_key, is_default) values
    (target_user_id, 'Work', 'violet_bold', true),
    (target_user_id, 'History/Art', 'amber_bold', true),
    (target_user_id, 'Food', 'rose_bold', true),
    (target_user_id, 'Theatre/Cinema', 'fuchsia_bold', true),
    (target_user_id, 'Music', 'blue_bold', true),
    (target_user_id, 'Nature', 'emerald_bold', true),
    (target_user_id, 'Drink', 'lime_bold', true),
    (target_user_id, 'Other', 'slate', true)
  on conflict (user_id, lower(btrim(name))) do nothing;
$$;

create or replace function public.handle_new_user_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_user_categories(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seed_categories on auth.users;
create trigger on_auth_user_created_seed_categories
after insert on auth.users
for each row execute function public.handle_new_user_categories();

-- Seed default categories for current users and existing trip owners/item creators.
select public.seed_default_user_categories(id) from auth.users;

select public.seed_default_user_categories(user_id)
from public.trips
where user_id is not null;

select public.seed_default_user_categories(created_by)
from public.itinerary_items
where created_by is not null;

alter table public.itinerary_items
  add column if not exists category_id uuid references public.user_categories(id) on delete set null;

create index if not exists itinerary_items_category_id_idx
  on public.itinerary_items (category_id);

-- Backfill category_id from the existing text category where possible; otherwise use Other.
with mapped as (
  select
    ii.id as itinerary_item_id,
    uc.id as category_id
  from public.itinerary_items ii
  join public.trips t on t.id = ii.trip_id
  join public.user_categories uc
    on uc.user_id = coalesce(ii.created_by, t.user_id)
   and lower(uc.name) = case
      when lower(coalesce(ii.category, '')) in ('work') then 'work'
      when lower(coalesce(ii.category, '')) in ('history/art', 'history', 'art', 'museum', 'museums') then 'history/art'
      when lower(coalesce(ii.category, '')) in ('food', 'restaurant', 'restaurants', 'dining') then 'food'
      when lower(coalesce(ii.category, '')) in ('theatre/cinema', 'theatre', 'theater', 'cinema', 'movie', 'movies') then 'theatre/cinema'
      when lower(coalesce(ii.category, '')) in ('music', 'concert', 'concerts') then 'music'
      when lower(coalesce(ii.category, '')) in ('nature', 'outdoors', 'park', 'parks') then 'nature'
      when lower(coalesce(ii.category, '')) in ('drink', 'drinks', 'bar', 'bars', 'nightlife') then 'drink'
      else 'other'
    end
)
update public.itinerary_items ii
set category_id = mapped.category_id
from mapped
where ii.id = mapped.itinerary_item_id
  and ii.category_id is null;

alter table public.category_color_options enable row level security;
alter table public.user_categories enable row level security;

drop policy if exists "Anyone can view category colour options" on public.category_color_options;
create policy "Anyone can view category colour options"
  on public.category_color_options for select
  using (true);

drop policy if exists "Users can view own and trip-visible categories" on public.user_categories;
create policy "Users can view own and trip-visible categories"
  on public.user_categories for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.itinerary_items ii
      where ii.category_id = user_categories.id
        and public.is_trip_active_member(ii.trip_id)
        and (ii.is_private = false or ii.created_by = auth.uid())
    )
  );

drop policy if exists "Users can create own categories" on public.user_categories;
create policy "Users can create own categories"
  on public.user_categories for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own categories" on public.user_categories;
create policy "Users can update own categories"
  on public.user_categories for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own categories" on public.user_categories;
create policy "Users can delete own categories"
  on public.user_categories for delete
  using (user_id = auth.uid());

grant select on public.category_color_options to anon, authenticated;
grant select, insert, update, delete on public.user_categories to authenticated;

grant execute on function public.seed_default_user_categories(uuid) to authenticated;

grant execute on function public.enforce_user_category_limit() to authenticated;

grant execute on function public.vaivia_set_updated_at() to authenticated;;
