alter table public.trips
  add column if not exists slug text;

create or replace function public.normalize_trip_slug(input_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(input_value, '')), '[^a-z0-9]+', '-', 'g'),
    '-+',
    '-',
    'g'
  ));
$$;

create or replace function public.trip_slug_conflicts_for_user(
  target_user_id uuid,
  target_slug text,
  excluded_trip_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips
    where trips.slug = target_slug
      and trips.archived_at is null
      and (excluded_trip_id is null or trips.id <> excluded_trip_id)
      and (
        trips.user_id = target_user_id
        or exists (
          select 1
          from public.trip_members
          where trip_members.trip_id = trips.id
            and trip_members.user_id = target_user_id
            and trip_members.status = 'active'
        )
      )
  );
$$;

create or replace function public.get_available_trip_slug(
  base_slug text,
  excluded_trip_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  normalized_base text;
  candidate text;
  suffix integer := 2;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to generate a trip slug.';
  end if;

  normalized_base := public.normalize_trip_slug(base_slug);

  if normalized_base = '' then
    normalized_base := 'trip';
  end if;

  candidate := normalized_base;

  while public.trip_slug_conflicts_for_user(
    current_user_id,
    candidate,
    excluded_trip_id
  ) loop
    candidate := normalized_base || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

create or replace function public.get_available_trip_slug_for_user(
  target_user_id uuid,
  base_slug text,
  excluded_trip_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_base text;
  candidate text;
  suffix integer := 2;
begin
  if target_user_id is null then
    raise exception 'A user is required to generate a trip slug.';
  end if;

  normalized_base := public.normalize_trip_slug(base_slug);

  if normalized_base = '' then
    normalized_base := 'trip';
  end if;

  candidate := normalized_base;

  while public.trip_slug_conflicts_for_user(
    target_user_id,
    candidate,
    excluded_trip_id
  ) loop
    candidate := normalized_base || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

with base_trips as (
  select
    id,
    public.normalize_trip_slug(coalesce(nullif(title, ''), destination, 'trip')) as base_slug,
    row_number() over (
      partition by user_id, public.normalize_trip_slug(coalesce(nullif(title, ''), destination, 'trip'))
      order by created_at nulls last, id
    ) as duplicate_index
  from public.trips
  where slug is null or btrim(slug) = ''
)
update public.trips
set slug = case
  when base_trips.base_slug = '' then 'trip-' || left(replace(trips.id::text, '-', ''), 6)
  when base_trips.duplicate_index = 1 then base_trips.base_slug
  else base_trips.base_slug || '-' || base_trips.duplicate_index::text
end
from base_trips
where trips.id = base_trips.id;

alter table public.trips
  alter column slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_slug_format_check'
      and conrelid = 'public.trips'::regclass
  ) then
    alter table public.trips
      add constraint trips_slug_format_check
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
end $$;

create unique index if not exists trips_owner_active_slug_unique_idx
  on public.trips(user_id, slug)
  where archived_at is null;

create index if not exists trips_slug_idx
  on public.trips(slug)
  where archived_at is null;

create or replace function public.set_and_validate_trip_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
  member_conflict record;
begin
  normalized_slug := public.normalize_trip_slug(coalesce(nullif(new.slug, ''), new.title, 'trip'));

  if normalized_slug = '' then
    normalized_slug := 'trip';
  end if;

  new.slug := normalized_slug;

  if public.trip_slug_conflicts_for_user(new.user_id, new.slug, new.id) then
    raise exception 'Trip slug already exists for this user.'
      using errcode = '23505';
  end if;

  for member_conflict in
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = new.id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if public.trip_slug_conflicts_for_user(
      member_conflict.user_id,
      new.slug,
      new.id
    ) then
      raise exception 'Trip slug already exists for a trip member.'
        using errcode = '23505';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists set_and_validate_trip_slug_trigger on public.trips;
create trigger set_and_validate_trip_slug_trigger
before insert or update of title, slug, user_id, archived_at
on public.trips
for each row
execute function public.set_and_validate_trip_slug();

create or replace function public.resolve_trip_member_slug_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_slug text;
  conflict_trip record;
begin
  if new.status is distinct from 'active' or new.user_id is null then
    return new;
  end if;

  select trips.slug
    into target_trip_slug
  from public.trips
  where trips.id = new.trip_id;

  if target_trip_slug is null then
    return new;
  end if;

  for conflict_trip in
    select trips.id
    from public.trips
    where trips.user_id = new.user_id
      and trips.id <> new.trip_id
      and trips.archived_at is null
      and trips.slug = target_trip_slug
    order by trips.created_at nulls last, trips.id
  loop
    update public.trips
    set slug = public.get_available_trip_slug_for_user(
      new.user_id,
      target_trip_slug,
      conflict_trip.id
    )
    where trips.id = conflict_trip.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists resolve_trip_member_slug_conflicts_trigger
on public.trip_members;
create trigger resolve_trip_member_slug_conflicts_trigger
before insert or update of status, user_id, trip_id
on public.trip_members
for each row
execute function public.resolve_trip_member_slug_conflicts();

grant execute on function public.normalize_trip_slug(text) to authenticated;
grant execute on function public.get_available_trip_slug(text, uuid) to authenticated;
