drop function if exists public.notify_trip_members(uuid, text, text, text, jsonb);

create or replace function public.notify_trip_members(
  target_trip_id uuid,
  notification_type text,
  notification_title text,
  notification_body text default null::text,
  notification_metadata jsonb default '{}'::jsonb,
  target_item_type text default null::text,
  target_item_ids uuid[] default null::uuid[]
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  scoped_item_ids uuid[] := coalesce(target_item_ids, array[]::uuid[]);
  has_item_scope boolean :=
    notification_type in ('trip_item_added', 'trip_item_updated', 'trip_item_deleted')
    and target_item_type in ('itinerary', 'transportation', 'accommodation')
    and coalesce(array_length(target_item_ids, 1), 0) > 0;
  has_explicit_participants boolean := false;
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

  if has_item_scope then
    select exists (
      select 1
      from public.trip_item_participants tip
      where tip.trip_id = target_trip_id
        and tip.item_type = target_item_type
        and tip.item_id = any(scoped_item_ids)
    )
    into has_explicit_participants;

    if has_explicit_participants then
      insert into public.notifications (
        user_id,
        actor_user_id,
        trip_id,
        type,
        title,
        body,
        metadata
      )
      select distinct
        resolved.user_id,
        auth.uid(),
        target_trip_id,
        notification_type,
        notification_title,
        notification_body,
        coalesce(notification_metadata, '{}'::jsonb)
      from (
        select tm.user_id
        from public.trip_item_participants tip
        join public.trip_members tm
          on tm.id = tip.trip_member_id
         and tm.trip_id = tip.trip_id
         and tm.status = 'active'
        where tip.trip_id = target_trip_id
          and tip.item_type = target_item_type
          and tip.item_id = any(scoped_item_ids)
          and tip.participant_kind = 'member'
          and tm.user_id is not null

        union

        select tm.user_id
        from public.trip_item_participants tip
        join public.trip_members tm
          on tm.user_id = tip.user_id
         and tm.trip_id = tip.trip_id
         and tm.status = 'active'
        where tip.trip_id = target_trip_id
          and tip.item_type = target_item_type
          and tip.item_id = any(scoped_item_ids)
          and tip.participant_kind = 'user'
          and tip.user_id is not null

        union

        select tm.user_id
        from public.trip_item_participants tip
        join public.trip_members tm
          on tm.invitation_id = tip.invitation_id
         and tm.trip_id = tip.trip_id
         and tm.status = 'active'
        where tip.trip_id = target_trip_id
          and tip.item_type = target_item_type
          and tip.item_id = any(scoped_item_ids)
          and tip.participant_kind = 'invitation'
          and tip.invitation_id is not null
      ) resolved
      where resolved.user_id is not null;

      return;
    end if;
  end if;

  insert into public.notifications (user_id, actor_user_id, trip_id, type, title, body, metadata)
  select
    tm.user_id,
    auth.uid(),
    target_trip_id,
    notification_type,
    notification_title,
    notification_body,
    coalesce(notification_metadata, '{}'::jsonb)
  from public.trip_members tm
  where tm.trip_id = target_trip_id
    and tm.status = 'active'
    and tm.user_id is not null
    and (
      has_item_scope
      or tm.user_id <> auth.uid()
    );
end;
$$;

grant all on function public.notify_trip_members(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  uuid[]
) to anon;
grant all on function public.notify_trip_members(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  uuid[]
) to authenticated;
grant all on function public.notify_trip_members(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  uuid[]
) to service_role;
