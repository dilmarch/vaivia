create or replace function public.get_passport_stamp_share_review(share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  share_row public.user_passport_stamp_shares;
  stamp_row public.user_passport_stamps;
  sender_profile public.user_profiles;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select shares.*
    into share_row
    from public.user_passport_stamp_shares shares
   where shares.id = share_id
     and shares.recipient_user_id = current_user_id
   limit 1;

  if share_row.id is null then
    return null;
  end if;

  select stamps.*
    into stamp_row
    from public.user_passport_stamps stamps
   where stamps.id = share_row.source_stamp_id;

  select profiles.*
    into sender_profile
    from public.user_profiles profiles
   where profiles.id = share_row.sender_user_id
   limit 1;

  return jsonb_build_object(
    'id', share_row.id,
    'status', share_row.status,
    'sender', jsonb_build_object(
      'id', share_row.sender_user_id,
      'firstName', sender_profile.first_name,
      'lastName', sender_profile.last_name,
      'username', sender_profile.username,
      'email', sender_profile.email,
      'avatarUrl', sender_profile.avatar_url,
      'displayName', coalesce(
        nullif(trim(coalesce(sender_profile.first_name, '') || ' ' || coalesce(sender_profile.last_name, '')), ''),
        sender_profile.username,
        sender_profile.email,
        'A friend'
      )
    ),
    'source_stamp',
    case
      when stamp_row.id is null then null
      else jsonb_build_object(
        'id', stamp_row.id,
        'country_code', stamp_row.country_code,
        'country_name', stamp_row.country_name,
        'flag_emoji', stamp_row.flag_emoji,
        'first_visited_on', stamp_row.first_visited_on,
        'first_entry_iata_code', stamp_row.first_entry_iata_code,
        'first_entry_icao_code', stamp_row.first_entry_icao_code,
        'first_entry_city', stamp_row.first_entry_city,
        'first_entry_airport_name', stamp_row.first_entry_airport_name,
        'welcome_label_snapshot', stamp_row.welcome_label_snapshot,
        'arrival_label_snapshot', stamp_row.arrival_label_snapshot,
        'stamp_display_country_name', stamp_row.stamp_display_country_name,
        'stamp_display_flag', stamp_row.stamp_display_flag,
        'visit_city', stamp_row.visit_city,
        'visit_region', stamp_row.visit_region,
        'visit_month', stamp_row.visit_month,
        'visit_status', stamp_row.visit_status,
        'port_of_entry_name', stamp_row.port_of_entry_name
      )
    end
  );
end;
$$;

revoke all on function public.get_passport_stamp_share_review(uuid) from public;
grant execute on function public.get_passport_stamp_share_review(uuid) to authenticated;

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
  sender_avatar_url text;
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

  select
      coalesce(
        nullif(trim(coalesce(profiles.first_name, '') || ' ' || coalesce(profiles.last_name, '')), ''),
        profiles.username,
        profiles.email,
        'A friend'
      ),
      profiles.avatar_url
    into sender_name, sender_avatar_url
    from public.user_profiles profiles
   where profiles.id = current_user_id
   limit 1;

  sender_name := coalesce(sender_name, public.get_user_display_name(current_user_id), 'A friend');

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
      begin
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
        returning * into share_row;
      exception
        when unique_violation then
          update public.user_passport_stamp_shares shares
             set updated_at = now()
           where shares.sender_user_id = current_user_id
             and shares.recipient_user_id = recipient_id
             and shares.source_stamp_id = requested_source_stamp_id
             and shares.status = 'pending'
          returning * into share_row;
      end;
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
        sender_name || ' sent you a passport stamp.',
        jsonb_build_object(
          'action', 'review_passport_stamp_share',
          'shareId', share_row.id,
          'sourceStampId', requested_source_stamp_id,
          'senderName', sender_name,
          'senderAvatarUrl', sender_avatar_url
        )
      );
    else
      update public.notifications
         set actor_user_id = current_user_id,
             title = 'Passport stamp received',
             body = sender_name || ' sent you a passport stamp.',
             metadata = jsonb_build_object(
               'action', 'review_passport_stamp_share',
               'shareId', share_row.id,
               'sourceStampId', requested_source_stamp_id,
               'senderName', sender_name,
               'senderAvatarUrl', sender_avatar_url
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

update public.notifications notifications
   set metadata = coalesce(notifications.metadata, '{}'::jsonb) ||
     jsonb_build_object(
       'senderName',
       coalesce(
         nullif(trim(coalesce(profiles.first_name, '') || ' ' || coalesce(profiles.last_name, '')), ''),
         profiles.username,
         profiles.email,
         'A friend'
       ),
       'senderAvatarUrl',
       profiles.avatar_url
     )
  from public.user_profiles profiles
 where notifications.type = 'passport_stamp_share_received'
   and notifications.actor_user_id = profiles.id
   and notifications.archived_at is null
   and (
     notifications.metadata ->> 'senderName' is null
     or notifications.metadata ->> 'senderAvatarUrl' is null
   );
