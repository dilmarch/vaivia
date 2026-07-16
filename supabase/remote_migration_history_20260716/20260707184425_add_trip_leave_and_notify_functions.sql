create or replace function public.leave_trip(target_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.trip_members
  set status = 'left', left_at = now()
  where trip_id = target_trip_id
    and user_id = auth.uid()
    and status = 'active';

  if not exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id
      and status = 'active'
  ) then
    update public.trips
    set archived_at = now(),
        archived_reason = 'all_members_left',
        updated_at = now()
    where id = target_trip_id;
  end if;
end;
$$;

create or replace function public.notify_trip_members(
  target_trip_id uuid,
  notification_type text,
  notification_title text,
  notification_body text default null,
  notification_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'You do not have access to this trip';
  end if;

  if notification_type not in ('trip_updated', 'trip_item_added', 'trip_item_updated', 'trip_item_deleted') then
    raise exception 'Invalid notification type';
  end if;

  insert into public.notifications (user_id, actor_user_id, trip_id, type, title, body, metadata)
  select tm.user_id, auth.uid(), target_trip_id, notification_type, notification_title, notification_body, coalesce(notification_metadata, '{}'::jsonb)
  from public.trip_members tm
  where tm.trip_id = target_trip_id
    and tm.status = 'active'
    and tm.user_id <> auth.uid();
end;
$$;

grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.notify_trip_members(uuid, text, text, text, jsonb) to authenticated;;
