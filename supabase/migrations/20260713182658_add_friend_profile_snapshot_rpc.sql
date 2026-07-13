create or replace function public.get_friend_profile_snapshot(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    friend_profile jsonb;
    friend_preferences jsonb;
    friend_points jsonb;
    friend_stamps jsonb;
    friend_bucket_list jsonb;
    friend_scratch_map jsonb;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if target_user_id is null or target_user_id = current_user_id then
        raise exception 'Invalid friend';
    end if;

    if not exists (
        select 1
          from public.user_friendships friendships
         where friendships.status = 'accepted'
           and (
                (
                    friendships.requester_user_id = current_user_id
                    and friendships.addressee_user_id = target_user_id
                )
                or
                (
                    friendships.requester_user_id = target_user_id
                    and friendships.addressee_user_id = current_user_id
                )
           )
    ) then
        raise exception 'Friend profile is not available';
    end if;

    select to_jsonb(profile)
      into friend_profile
      from (
        select
            id,
            first_name,
            last_name,
            username,
            email,
            avatar_url,
            role,
            join_date,
            created_at
          from public.user_profiles
         where id = target_user_id
         limit 1
      ) profile;

    select to_jsonb(preferences)
      into friend_preferences
      from (
        select user_id, theme_mode
          from public.user_preferences
         where user_id = target_user_id
         limit 1
      ) preferences;

    select to_jsonb(points)
      into friend_points
      from (
        select points, level, level_name
          from public.user_points
         where user_id = target_user_id
         limit 1
      ) points;

    select coalesce(jsonb_agg(to_jsonb(stamps) order by stamps.first_visited_on desc nulls last, stamps.created_at desc), '[]'::jsonb)
      into friend_stamps
      from (
        select
            id,
            country_code,
            country_name,
            flag_emoji,
            source,
            created_at,
            stamped_at,
            first_visited_on,
            first_entry_iata_code,
            first_entry_icao_code,
            first_entry_city,
            first_entry_airport_name,
            first_entry_airport_google_place_id,
            first_entry_airport_formatted_address,
            welcome_label_snapshot,
            arrival_label_snapshot,
            stamp_language_code,
            stamp_language_name,
            stamp_display_country_name,
            stamp_display_flag,
            visit_city,
            visit_region,
            visit_month,
            visit_status,
            port_of_entry_type,
            port_of_entry_name
          from public.user_passport_stamps
         where user_id = target_user_id
      ) stamps;

    select coalesce(jsonb_agg(to_jsonb(bucket_items) order by bucket_items.created_at asc), '[]'::jsonb)
      into friend_bucket_list
      from (
        select
            id,
            place_label,
            city,
            region,
            country_code,
            country_name,
            flag_emoji,
            google_place_id,
            google_formatted_address,
            latitude,
            longitude,
            status,
            completed_at,
            passport_stamp_id,
            created_at
          from public.user_travel_bucket_list
         where user_id = target_user_id
      ) bucket_items;

    select coalesce(jsonb_agg(to_jsonb(scratch_items) order by scratch_items.created_at asc), '[]'::jsonb)
      into friend_scratch_map
      from (
        select id, country_code, created_at
          from public.user_scratch_map_countries
         where user_id = target_user_id
      ) scratch_items;

    return jsonb_build_object(
        'profile', coalesce(friend_profile, '{}'::jsonb),
        'preferences', coalesce(friend_preferences, '{}'::jsonb),
        'points', coalesce(friend_points, '{}'::jsonb),
        'stamps', coalesce(friend_stamps, '[]'::jsonb),
        'bucketList', coalesce(friend_bucket_list, '[]'::jsonb),
        'scratchMapCountries', coalesce(friend_scratch_map, '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_friend_profile_snapshot(uuid) from public;
grant execute on function public.get_friend_profile_snapshot(uuid) to authenticated;
