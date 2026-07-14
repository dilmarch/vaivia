create or replace function public.send_passport_stamp_share(
  source_stamp_id uuid,
  recipient_user_ids uuid[]
)
returns setof public.user_passport_stamp_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  requested_source_stamp_id uuid := source_stamp_id;
  requested_recipient_user_ids uuid[] := recipient_user_ids;
  stamp_row public.user_passport_stamps;
  recipient_id uuid;
  share_row public.user_passport_stamp_shares;
  sender_name text;
  existing_notification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into stamp_row
    from public.user_passport_stamps stamps
   where stamps.id = requested_source_stamp_id
     and stamps.user_id = current_user_id;

  if stamp_row.id is null then
    raise exception 'Passport stamp not found';
  end if;

  sender_name := public.get_user_display_name(current_user_id);

  foreach recipient_id in array coalesce(requested_recipient_user_ids, array[]::uuid[]) loop
    if recipient_id is null or recipient_id = current_user_id then
      continue;
    end if;

    if not exists (
      select 1
        from public.user_friendships friendships
       where friendships.status = 'accepted'
         and (
              (
                friendships.requester_user_id = current_user_id
                and friendships.addressee_user_id = recipient_id
              )
              or
              (
                friendships.addressee_user_id = current_user_id
                and friendships.requester_user_id = recipient_id
              )
         )
    ) then
      continue;
    end if;

    select shares.*
      into share_row
      from public.user_passport_stamp_shares shares
     where shares.sender_user_id = current_user_id
       and shares.recipient_user_id = recipient_id
       and shares.source_stamp_id = requested_source_stamp_id
       and shares.status in ('pending', 'accepted')
     order by case when shares.status = 'pending' then 0 else 1 end,
              shares.created_at desc
     limit 1
     for update;

    if share_row.id is null then
      insert into public.user_passport_stamp_shares (
        sender_user_id,
        recipient_user_id,
        source_stamp_id,
        status
      )
      values (
        current_user_id,
        recipient_id,
        requested_source_stamp_id,
        'pending'
      )
      on conflict (sender_user_id, recipient_user_id, source_stamp_id)
        where status = 'pending'
      do update set updated_at = now()
      returning * into share_row;
    elsif share_row.status = 'pending' then
      update public.user_passport_stamp_shares
         set updated_at = now()
       where id = share_row.id
      returning * into share_row;
    else
      return next share_row;
      continue;
    end if;

    select notifications.id
      into existing_notification_id
      from public.notifications notifications
     where notifications.user_id = recipient_id
       and notifications.type = 'passport_stamp_share_received'
       and notifications.metadata ->> 'shareId' = share_row.id::text
       and notifications.archived_at is null
     order by notifications.created_at desc
     limit 1;

    if existing_notification_id is null then
      insert into public.notifications (
        user_id,
        actor_user_id,
        type,
        title,
        body,
        metadata
      )
      values (
        recipient_id,
        current_user_id,
        'passport_stamp_share_received',
        'Passport stamp received',
        coalesce(sender_name, 'A friend') || ' sent you a passport stamp.',
        jsonb_build_object(
          'action', 'review_passport_stamp_share',
          'shareId', share_row.id,
          'sourceStampId', requested_source_stamp_id
        )
      );
    else
      update public.notifications
         set actor_user_id = current_user_id,
             title = 'Passport stamp received',
             body = coalesce(sender_name, 'A friend') || ' sent you a passport stamp.',
             metadata = jsonb_build_object(
               'action', 'review_passport_stamp_share',
               'shareId', share_row.id,
               'sourceStampId', requested_source_stamp_id
             ),
             read_at = null,
             archived_at = null,
             created_at = now()
       where id = existing_notification_id;
    end if;

    return next share_row;
  end loop;

  return;
end;
$$;

revoke all on function public.send_passport_stamp_share(uuid, uuid[]) from public;
grant execute on function public.send_passport_stamp_share(uuid, uuid[]) to authenticated;

insert into public.notifications (
  user_id,
  actor_user_id,
  type,
  title,
  body,
  metadata
)
select
  shares.recipient_user_id,
  shares.sender_user_id,
  'passport_stamp_share_received',
  'Passport stamp received',
  coalesce(public.get_user_display_name(shares.sender_user_id), 'A friend') ||
    ' sent you a passport stamp.',
  jsonb_build_object(
    'action', 'review_passport_stamp_share',
    'shareId', shares.id,
    'sourceStampId', shares.source_stamp_id
  )
from public.user_passport_stamp_shares shares
where shares.status = 'pending'
  and not exists (
    select 1
      from public.notifications notifications
     where notifications.user_id = shares.recipient_user_id
       and notifications.type = 'passport_stamp_share_received'
       and notifications.metadata ->> 'shareId' = shares.id::text
       and notifications.archived_at is null
  );
