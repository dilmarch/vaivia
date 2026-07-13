create or replace function public.notify_trip_slug_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  reason text := current_setting('vaivia.slug_change_reason', true);
  notification_body text;
begin
  if old.slug is not distinct from new.slug then
    return new;
  end if;

  if reason = 'group_conflict' then
    notification_body := 'Group trips must use the same URL for everyone. Your other trip has been updated to /trips/' || new.slug || '. Please update any bookmarks.';
  else
    notification_body := 'The trip URL changed from /trips/' || old.slug || ' to /trips/' || new.slug || '. Please update any bookmarks.';
  end if;

  for recipient in
    select new.user_id as user_id
    union
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = new.id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if recipient.user_id is null then
      continue;
    end if;

    insert into public.notifications (
      user_id,
      actor_user_id,
      trip_id,
      type,
      title,
      body,
      metadata
    )
    values (
      recipient.user_id,
      null,
      new.id,
      'trip_slug_changed',
      'Trip URL updated',
      notification_body,
      jsonb_build_object(
        'oldSlug', old.slug,
        'newSlug', new.slug,
        'oldUrl', '/trips/' || old.slug,
        'newUrl', '/trips/' || new.slug,
        'reason', coalesce(nullif(reason, ''), 'manual_or_system')
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_trip_slug_changed_trigger on public.trips;
create trigger notify_trip_slug_changed_trigger
after update of slug
on public.trips
for each row
execute function public.notify_trip_slug_changed();

create or replace function public.resolve_trip_member_slug_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_slug text;
  conflict_trip record;
  next_slug text;
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
    next_slug := public.get_available_trip_slug_for_user(
      new.user_id,
      target_trip_slug,
      conflict_trip.id
    );

    if next_slug = target_trip_slug then
      next_slug := public.get_available_trip_slug_for_user(
        new.user_id,
        target_trip_slug || '-2',
        conflict_trip.id
      );
    end if;

    perform set_config('vaivia.slug_change_reason', 'group_conflict', true);

    update public.trips
    set slug = next_slug
    where trips.id = conflict_trip.id;

    perform set_config('vaivia.slug_change_reason', '', true);
  end loop;

  return new;
end;
$$;

drop trigger if exists resolve_trip_member_slug_conflicts_trigger
on public.trip_members;
create trigger resolve_trip_member_slug_conflicts_trigger
after insert or update of status, user_id, trip_id
on public.trip_members
for each row
execute function public.resolve_trip_member_slug_conflicts();
