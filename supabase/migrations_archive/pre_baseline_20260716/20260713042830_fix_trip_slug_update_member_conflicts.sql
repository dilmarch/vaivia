create or replace function public.set_and_validate_trip_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
begin
  normalized_slug := public.normalize_trip_slug(
    coalesce(nullif(new.slug, ''), new.title, '')
  );

  if normalized_slug = '' then
    normalized_slug := public.get_trip_slug_fallback_for_user(new.user_id, new.id);
  end if;

  new.slug := normalized_slug;

  if public.trip_slug_conflicts_for_user(new.user_id, new.slug, new.id) then
    raise exception 'Trip slug already exists for this user.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function public.resolve_trip_slug_conflicts_for_trip_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_user record;
  conflict_trip record;
  next_slug text;
begin
  if new.slug is null or new.archived_at is not null then
    return new;
  end if;

  for affected_user in
    select new.user_id as user_id
    union
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = new.id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if affected_user.user_id is null then
      continue;
    end if;

    for conflict_trip in
      select trips.id
      from public.trips
      where trips.user_id = affected_user.user_id
        and trips.id <> new.id
        and trips.archived_at is null
        and trips.slug = new.slug
      order by trips.created_at nulls last, trips.id
    loop
      next_slug := public.get_available_trip_slug_for_user(
        affected_user.user_id,
        new.slug,
        conflict_trip.id
      );

      if next_slug = new.slug then
        next_slug := public.get_available_trip_slug_for_user(
          affected_user.user_id,
          new.slug || '-2',
          conflict_trip.id
        );
      end if;

      perform set_config('vaivia.slug_change_reason', 'group_conflict', true);

      update public.trips
      set slug = next_slug
      where trips.id = conflict_trip.id;

      perform set_config('vaivia.slug_change_reason', '', true);
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists resolve_trip_slug_update_conflicts_trigger
on public.trips;
create trigger resolve_trip_slug_update_conflicts_trigger
after insert or update of slug
on public.trips
for each row
execute function public.resolve_trip_slug_conflicts_for_trip_members();
