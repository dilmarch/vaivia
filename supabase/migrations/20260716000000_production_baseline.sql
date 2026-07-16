


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."accommodation_status" AS ENUM (
    'tentative',
    'booked',
    'cancelled'
);




CREATE TYPE "public"."accommodation_type" AS ENUM (
    'hotel',
    'motel',
    'home_rental',
    'hostel',
    'friend_family',
    'other'
);




CREATE TYPE "public"."travel_email_import_status" AS ENUM (
    'received',
    'processing',
    'needs_review',
    'ready',
    'imported',
    'rejected',
    'failed'
);




CREATE OR REPLACE FUNCTION "public"."accept_current_terms"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  current_terms_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id
    into current_terms_id
  from public.terms_versions
  order by published_at desc
  limit 1;

  if current_terms_id is null then
    raise exception 'No terms version is published';
  end if;

  insert into public.user_terms_acceptances (
    user_id,
    terms_version_id,
    accepted_at
  )
  values (auth.uid(), current_terms_id, now())
  on conflict (user_id, terms_version_id)
  do update set accepted_at = excluded.accepted_at;

  update public.user_profiles
     set terms_accepted_at = now(),
         terms_declined_at = null,
         terms_declined_version_id = null,
         terms_decline_delete_after = null,
         account_deletion_requested_at = null,
         updated_at = now()
   where id = auth.uid();

  return current_terms_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."accept_trip_invitation"("invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invite_record public.trip_invitations;
  actor_name text;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  update public.trip_invitations
  set status = 'accepted', responded_at = now()
  where id = invitation_id;

  insert into public.trip_members (trip_id, user_id, role, status, invited_by, joined_at)
  values (invite_record.trip_id, auth.uid(), 'member', 'active', invite_record.invited_by, now())
  on conflict (trip_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

  select title into trip_title from public.trips where id = invite_record.trip_id;

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    invitation_id,
    'trip_invite_accepted',
    'Trip invite accepted',
    coalesce(actor_name, 'Someone') || ' accepted your invite to ' || coalesce(trip_title, 'your trip') || '.'
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."accept_trip_invitation_with_scope"("target_invitation_id" "uuid", "target_confirmed_start_date" "date" DEFAULT NULL::"date", "target_confirmed_end_date" "date" DEFAULT NULL::"date", "target_personal_start_date" "date" DEFAULT NULL::"date", "target_personal_end_date" "date" DEFAULT NULL::"date", "target_joining_leg_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  invite_record public.trip_invitations;
  trip_record public.trips;
  actor_name text;
  member_id uuid;
  final_confirmed_start date;
  final_confirmed_end date;
  final_personal_start date;
  final_personal_end date;
  participant record;
  participant_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = target_invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  select * into trip_record
  from public.trips
  where id = invite_record.trip_id;

  for participant in
    select trip_record.user_id as user_id
    union
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = invite_record.trip_id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if participant.user_id is null or participant.user_id = auth.uid() then
      continue;
    end if;

    if public.friendship_block_exists(auth.uid(), participant.user_id) then
      participant_name := public.get_user_display_name(participant.user_id);
      raise exception 'You cannot join this trip because you blocked %.', coalesce(participant_name, 'someone on this trip');
    end if;

    if public.friendship_block_exists(participant.user_id, auth.uid()) then
      raise exception 'You cannot join this trip. Create a trip from your account and invite trip mates and ask them to transfer the items to the new trip.';
    end if;
  end loop;

  final_confirmed_start := coalesce(target_confirmed_start_date, invite_record.invited_start_date, trip_record.start_date);
  final_confirmed_end := coalesce(target_confirmed_end_date, invite_record.invited_end_date, trip_record.end_date);
  final_personal_start := coalesce(target_personal_start_date, final_confirmed_start);
  final_personal_end := coalesce(target_personal_end_date, final_confirmed_end);

  if final_confirmed_start is not null and final_confirmed_end is not null and final_confirmed_end < final_confirmed_start then
    raise exception 'Confirmed end date cannot be before confirmed start date';
  end if;

  if final_personal_start is not null and final_personal_end is not null and final_personal_end < final_personal_start then
    raise exception 'Personal end date cannot be before personal start date';
  end if;

  if invite_record.invited_start_date is not null and final_confirmed_start is not null and final_confirmed_start < invite_record.invited_start_date then
    raise exception 'Confirmed start date must be inside the invited date window';
  end if;

  if invite_record.invited_end_date is not null and final_confirmed_end is not null and final_confirmed_end > invite_record.invited_end_date then
    raise exception 'Confirmed end date must be inside the invited date window';
  end if;

  update public.trip_invitations
  set
    status = 'accepted',
    responded_at = now(),
    accepted_start_date = final_confirmed_start,
    accepted_end_date = final_confirmed_end,
    accepted_personal_start_date = final_personal_start,
    accepted_personal_end_date = final_personal_end
  where id = target_invitation_id;

  insert into public.trip_members (
    trip_id,
    user_id,
    role,
    status,
    invited_by,
    invitation_id,
    invited_start_date,
    invited_end_date,
    confirmed_start_date,
    confirmed_end_date,
    personal_start_date,
    personal_end_date,
    joined_at
  )
  values (
    invite_record.trip_id,
    auth.uid(),
    'member',
    'active',
    invite_record.invited_by,
    invite_record.id,
    invite_record.invited_start_date,
    invite_record.invited_end_date,
    final_confirmed_start,
    final_confirmed_end,
    final_personal_start,
    final_personal_end,
    now()
  )
  on conflict (trip_id, user_id)
  do update set
    status = 'active',
    left_at = null,
    invitation_id = excluded.invitation_id,
    invited_by = excluded.invited_by,
    invited_start_date = excluded.invited_start_date,
    invited_end_date = excluded.invited_end_date,
    confirmed_start_date = excluded.confirmed_start_date,
    confirmed_end_date = excluded.confirmed_end_date,
    personal_start_date = excluded.personal_start_date,
    personal_end_date = excluded.personal_end_date,
    joined_at = now()
  returning id into member_id;

  delete from public.trip_member_legs where trip_member_id = member_id;

  insert into public.trip_member_legs (trip_id, trip_member_id, trip_leg_id, is_joining, start_date, end_date)
  select
    invite_record.trip_id,
    member_id,
    available_legs.trip_leg_id,
    case
      when target_joining_leg_ids is null then true
      else available_legs.trip_leg_id = any(target_joining_leg_ids)
    end,
    greatest(tl.start_date, final_confirmed_start),
    least(tl.end_date, final_confirmed_end)
  from (
    select tl.id as trip_leg_id
    from public.trip_legs tl
    where tl.trip_id = invite_record.trip_id
      and (
        invite_record.invitation_scope <> 'selected_legs'
        or exists (
          select 1
          from public.trip_invitation_legs til
          where til.invitation_id = invite_record.id
            and til.trip_leg_id = tl.id
            and til.is_included = true
        )
      )
  ) available_legs
  join public.trip_legs tl on tl.id = available_legs.trip_leg_id;

  if target_joining_leg_ids is not null and exists (
    select 1
    from unnest(target_joining_leg_ids) as requested_leg_id
    where not exists (
      select 1
      from public.trip_member_legs tml
      where tml.trip_member_id = member_id
        and tml.trip_leg_id = requested_leg_id
    )
  ) then
    raise exception 'One or more selected legs are not available for this invitation';
  end if;

  actor_name := public.get_user_display_name(auth.uid());

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    target_invitation_id,
    'trip_invite_accepted',
    'Trip invite accepted',
    coalesce(actor_name, 'Someone') || ' accepted your trip invite.'
  );

  return member_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."admin_get_place_stats"("range_start" "date" DEFAULT NULL::"date", "range_end" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    current_user_id uuid := auth.uid();
    result jsonb;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if not public.is_super_admin() then
        raise exception 'Only super admins can view place stats';
    end if;

    with date_windows as (
        select
            make_date(extract(year from current_date)::int - 1, 1, 1) as last_year_start,
            make_date(extract(year from current_date)::int - 1, 12, 31) as last_year_end,
            make_date(extract(year from current_date)::int - 1, 3, 1) as last_spring_start,
            make_date(extract(year from current_date)::int - 1, 5, 31) as last_spring_end,
            make_date(extract(year from current_date)::int - 1, 6, 1) as last_summer_start,
            make_date(extract(year from current_date)::int - 1, 8, 31) as last_summer_end,
            make_date(extract(year from current_date)::int - 1, 9, 1) as last_fall_start,
            make_date(extract(year from current_date)::int - 1, 11, 30) as last_fall_end,
            make_date(extract(year from current_date)::int - 1, 12, 1) as last_winter_start,
            make_date(extract(year from current_date)::int, 2, 28)
                + case
                    when (
                        (extract(year from current_date)::int % 4 = 0
                         and extract(year from current_date)::int % 100 <> 0)
                        or extract(year from current_date)::int % 400 = 0
                    )
                    then 1
                    else 0
                end as last_winter_end,
            date_trunc('month', current_date)::date as this_month_start,
            (date_trunc('month', current_date) + interval '1 month - 1 day')::date as this_month_end,
            make_date(extract(year from current_date)::int, 1, 1) as this_year_start,
            make_date(extract(year from current_date)::int, 12, 31) as this_year_end
    ),
    trip_people as (
        select
            trips.id as trip_id,
            trips.user_id,
            null::uuid as trip_member_id,
            true as is_owner
        from public.trips
        where trips.archived_at is null

        union all

        select
            trip_members.trip_id,
            trip_members.user_id,
            trip_members.id as trip_member_id,
            false as is_owner
        from public.trip_members
        join public.trips on trips.id = trip_members.trip_id
        where trips.archived_at is null
          and trip_members.status = 'active'
          and trip_members.left_at is null
    ),
    base_legs as (
        select distinct
            trip_legs.id as leg_id,
            trips.id as trip_id,
            trip_people.user_id,
            trips.start_date as trip_start_date,
            trips.created_at::date as trip_created_date,
            nullif(btrim(trip_legs.city_name), '') as city_name,
            nullif(upper(btrim(trip_legs.region_code)), '') as region_code,
            nullif(upper(btrim(trip_legs.country_code)), '') as country_code,
            countries.common_name as country_name,
            countries.flag_emoji
        from public.trip_legs
        join public.trips on trips.id = trip_legs.trip_id
        join trip_people on trip_people.trip_id = trips.id
        left join public.countries
            on upper(countries.alpha2) = upper(trip_legs.country_code)
        where trips.archived_at is null
          and (range_start is null or trips.start_date >= range_start)
          and (range_end is null or trips.start_date <= range_end)
          and (
              trip_people.is_owner
              or not exists (
                  select 1
                  from public.trip_member_legs scoped_legs
                  where scoped_legs.trip_id = trips.id
                    and scoped_legs.trip_member_id = trip_people.trip_member_id
              )
              or exists (
                  select 1
                  from public.trip_member_legs joined_legs
                  where joined_legs.trip_id = trips.id
                    and joined_legs.trip_member_id = trip_people.trip_member_id
                    and joined_legs.trip_leg_id = trip_legs.id
                    and joined_legs.is_joining
              )
          )
    ),
    place_rows as (
        select
            'city'::text as place_type,
            lower(city_name) || '|' || coalesce(region_code, '') || '|' || coalesce(country_code, '') as place_key,
            city_name as label,
            region_code,
            country_code,
            country_name,
            flag_emoji,
            user_id,
            trip_id,
            trip_start_date,
            case
                when trip_start_date is not null and trip_created_date is not null
                then greatest(0, trip_start_date - trip_created_date)
                else null
            end as days_in_advance
        from base_legs
        where city_name is not null

        union all

        select
            'region'::text as place_type,
            region_code || '|' || coalesce(country_code, '') as place_key,
            region_code || coalesce(', ' || country_name, '') as label,
            region_code,
            country_code,
            country_name,
            flag_emoji,
            user_id,
            trip_id,
            trip_start_date,
            case
                when trip_start_date is not null and trip_created_date is not null
                then greatest(0, trip_start_date - trip_created_date)
                else null
            end as days_in_advance
        from base_legs
        where region_code is not null

        union all

        select
            'country'::text as place_type,
            country_code as place_key,
            coalesce(country_name, country_code) as label,
            null::text as region_code,
            country_code,
            country_name,
            flag_emoji,
            user_id,
            trip_id,
            trip_start_date,
            case
                when trip_start_date is not null and trip_created_date is not null
                then greatest(0, trip_start_date - trip_created_date)
                else null
            end as days_in_advance
        from base_legs
        where country_code is not null
    ),
    place_trip_rows as (
        select distinct
            place_type,
            place_key,
            trip_id,
            days_in_advance
        from place_rows
        where days_in_advance is not null
    ),
    place_summary as (
        select
            place_rows.place_type,
            place_rows.place_key,
            min(place_rows.label) as label,
            min(place_rows.region_code) as region_code,
            min(place_rows.country_code) as country_code,
            min(place_rows.country_name) as country_name,
            min(place_rows.flag_emoji) as flag_emoji,
            count(distinct place_rows.user_id)::int as user_count,
            count(distinct place_rows.trip_id)::int as trip_count,
            coalesce((
                select round(avg(place_trip_rows.days_in_advance)::numeric, 1)
                from place_trip_rows
                where place_trip_rows.place_type = place_rows.place_type
                  and place_trip_rows.place_key = place_rows.place_key
            ), 0)::numeric as avg_days_in_advance,
            min(place_rows.trip_start_date) as first_trip_start_date,
            max(place_rows.trip_start_date) as last_trip_start_date
        from place_rows
        group by place_rows.place_type, place_rows.place_key
    ),
    highlight_period_rows as (
        select 'last_year'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.last_year_start and date_windows.last_year_end

        union all

        select 'last_spring'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.last_spring_start and date_windows.last_spring_end

        union all

        select 'last_summer'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.last_summer_start and date_windows.last_summer_end

        union all

        select 'last_fall'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.last_fall_start and date_windows.last_fall_end

        union all

        select 'last_winter'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.last_winter_start and date_windows.last_winter_end

        union all

        select 'this_month'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.this_month_start and date_windows.this_month_end

        union all

        select 'this_year'::text as highlight_key, place_rows.*
        from place_rows
        cross join date_windows
        where place_rows.trip_start_date between date_windows.this_year_start and date_windows.this_year_end
    ),
    highlight_trip_rows as (
        select distinct
            highlight_key,
            place_type,
            place_key,
            trip_id,
            days_in_advance
        from highlight_period_rows
        where days_in_advance is not null
    ),
    highlight_summaries as (
        select
            highlight_period_rows.highlight_key,
            highlight_period_rows.place_type,
            highlight_period_rows.place_key,
            min(highlight_period_rows.label) as label,
            min(highlight_period_rows.country_code) as country_code,
            min(highlight_period_rows.flag_emoji) as flag_emoji,
            count(distinct highlight_period_rows.user_id)::int as user_count,
            count(distinct highlight_period_rows.trip_id)::int as trip_count,
            coalesce((
                select round(avg(highlight_trip_rows.days_in_advance)::numeric, 1)
                from highlight_trip_rows
                where highlight_trip_rows.highlight_key = highlight_period_rows.highlight_key
                  and highlight_trip_rows.place_type = highlight_period_rows.place_type
                  and highlight_trip_rows.place_key = highlight_period_rows.place_key
            ), 0)::numeric as avg_days_in_advance
        from highlight_period_rows
        group by
            highlight_period_rows.highlight_key,
            highlight_period_rows.place_type,
            highlight_period_rows.place_key
    ),
    highlight_winners as (
        select distinct on (highlight_key)
            highlight_key,
            place_type,
            place_key,
            label,
            country_code,
            flag_emoji,
            user_count,
            trip_count,
            avg_days_in_advance
        from highlight_summaries
        order by highlight_key, user_count desc, trip_count desc, label asc
    )
    select jsonb_build_object(
        'generated_at', now(),
        'range', jsonb_build_object(
            'start', range_start,
            'end', range_end
        ),
        'places', jsonb_build_object(
            'cities', coalesce((
                select jsonb_agg(to_jsonb(city_items) order by city_items.user_count desc, city_items.trip_count desc, city_items.label asc)
                from (
                    select *
                    from place_summary
                    where place_type = 'city'
                    order by user_count desc, trip_count desc, label asc
                    limit 100
                ) city_items
            ), '[]'::jsonb),
            'regions', coalesce((
                select jsonb_agg(to_jsonb(region_items) order by region_items.user_count desc, region_items.trip_count desc, region_items.label asc)
                from (
                    select *
                    from place_summary
                    where place_type = 'region'
                    order by user_count desc, trip_count desc, label asc
                    limit 100
                ) region_items
            ), '[]'::jsonb),
            'countries', coalesce((
                select jsonb_agg(to_jsonb(country_items) order by country_items.user_count desc, country_items.trip_count desc, country_items.label asc)
                from (
                    select *
                    from place_summary
                    where place_type = 'country'
                    order by user_count desc, trip_count desc, label asc
                    limit 100
                ) country_items
            ), '[]'::jsonb)
        ),
        'highlights', jsonb_build_object(
            'last_year', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'last_year'),
            'last_spring', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'last_spring'),
            'last_summer', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'last_summer'),
            'last_fall', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'last_fall'),
            'last_winter', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'last_winter'),
            'this_month', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'this_month'),
            'this_year', (select to_jsonb(highlight_winners) - 'highlight_key' from highlight_winners where highlight_key = 'this_year')
        )
    )
    into result;

    return result;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."admin_get_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with
  valid_users as (
    select id, created_at
    from auth.users
    where deleted_at is null
      and coalesce(is_anonymous, false) = false
  ),
  activated_users as (
    select distinct t.user_id
    from public.trips t
    where exists (
      select 1 from public.itinerary_items i where i.trip_id = t.id
      union all
      select 1 from public.transportation_items x where x.trip_id = t.id
      union all
      select 1 from public.trip_accommodations a where a.trip_id = t.id
      union all
      select 1 from public.trip_ideas d where d.trip_id = t.id
      union all
      select 1 from public.trip_food_items f where f.trip_id = t.id
      limit 1
    )
  ),
  monthly_activity as (
    select date_trunc('month', activity_date)::date as month,
           count(distinct user_id) as users
    from public.user_activity_daily
    where activity_date >= (date_trunc('month', current_date) - interval '11 months')::date
    group by 1
  ),
  months as (
    select generate_series(
      date_trunc('month', current_date) - interval '11 months',
      date_trunc('month', current_date),
      interval '1 month'
    )::date as month
  ),
  retention as (
    select
      count(*) filter (
        where exists (
          select 1 from public.user_activity_daily a
          where a.user_id = u.id
            and a.activity_date = (u.created_at at time zone 'utc')::date + 1
        )
      ) as d1_returned,
      count(*) filter (
        where u.created_at < now() - interval '1 day'
      ) as d1_eligible,
      count(*) filter (
        where exists (
          select 1 from public.user_activity_daily a
          where a.user_id = u.id
            and a.activity_date = (u.created_at at time zone 'utc')::date + 7
        )
      ) as d7_returned,
      count(*) filter (
        where u.created_at < now() - interval '7 days'
      ) as d7_eligible,
      count(*) filter (
        where exists (
          select 1 from public.user_activity_daily a
          where a.user_id = u.id
            and a.activity_date = (u.created_at at time zone 'utc')::date + 30
        )
      ) as d30_returned,
      count(*) filter (
        where u.created_at < now() - interval '30 days'
      ) as d30_eligible
    from valid_users u
  )
  select jsonb_build_object(
    'generated_at', now(),
    'definitions', jsonb_build_object(
      'timezone', 'UTC',
      'dau', 'Distinct authenticated users active today',
      'wau', 'Distinct authenticated users active in the trailing 7 UTC dates',
      'mau', 'Distinct authenticated users active in the trailing 30 UTC dates',
      'activated', 'User has created a trip and at least one trip item'
    ),
    'users', jsonb_build_object(
      'total', (select count(*) from valid_users),
      'new_30d', (select count(*) from valid_users where created_at >= now() - interval '30 days'),
      'dau', (select count(distinct user_id) from public.user_activity_daily where activity_date = (now() at time zone 'utc')::date),
      'wau', (select count(distinct user_id) from public.user_activity_daily where activity_date >= (now() at time zone 'utc')::date - 6),
      'mau', (select count(distinct user_id) from public.user_activity_daily where activity_date >= (now() at time zone 'utc')::date - 29),
      'activated', (select count(*) from activated_users),
      'activation_rate', (
        select case when count(*) = 0 then 0
          else round(100.0 * (select count(*) from activated_users) / count(*), 1)
        end
        from valid_users
      ),
      'zero_trips', (
        select count(*) from valid_users u
        where not exists (select 1 from public.trips t where t.user_id = u.id)
      )
    ),
    'retention', (
      select jsonb_build_object(
        'd1', case when d1_eligible = 0 then null else round(100.0 * d1_returned / d1_eligible, 1) end,
        'd7', case when d7_eligible = 0 then null else round(100.0 * d7_returned / d7_eligible, 1) end,
        'd30', case when d30_eligible = 0 then null else round(100.0 * d30_returned / d30_eligible, 1) end,
        'eligible', jsonb_build_object('d1', d1_eligible, 'd7', d7_eligible, 'd30', d30_eligible)
      ) from retention
    ),
    'monthly_mau', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'users', coalesce(a.users, 0)) order by m.month), '[]'::jsonb)
      from months m left join monthly_activity a using (month)
    ),
    'feature_activity_30d', jsonb_build_object(
      'trips', (select count(*) from public.trips where created_at >= now() - interval '30 days'),
      'itinerary_items', (select count(*) from public.itinerary_items where created_at >= now() - interval '30 days'),
      'transportation', (select count(*) from public.transportation_items where created_at >= now() - interval '30 days'),
      'accommodations', (select count(*) from public.trip_accommodations where created_at >= now() - interval '30 days'),
      'ideas', (select count(*) from public.trip_ideas where created_at >= now() - interval '30 days'),
      'food', (select count(*) from public.trip_food_items where created_at >= now() - interval '30 days'),
      'budgets', (select count(*) from public.trip_budgets where created_at >= now() - interval '30 days'),
      'expenses', (select count(*) from public.trip_expenses where created_at >= now() - interval '30 days' and deleted_at is null),
      'passport_stamps', (select count(*) from public.user_passport_stamps where created_at >= now() - interval '30 days'),
      'accepted_friendships', (select count(*) from public.user_friendships where status = 'accepted' and responded_at >= now() - interval '30 days')
    ),
    'push', jsonb_build_object(
      'enabled_users', (
        select count(distinct user_id) from public.user_push_subscriptions
        where revoked_at is null
      ),
      'adoption_rate', (
        select case when count(*) = 0 then 0 else round(
          100.0 * (
            select count(distinct user_id) from public.user_push_subscriptions where revoked_at is null
          ) / count(*), 1)
        end from valid_users
      )
    )
  )
  into result;

  return result;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."admin_update_user_profile"("target_user_id" "uuid", "target_first_name" "text", "target_last_name" "text", "target_username" "text", "target_email" "text", "target_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    normalized_role text := coalesce(nullif(trim(target_role), ''), 'basic_user');
begin
    if not public.is_super_admin() then
        raise exception 'Only super admins can update users'
            using errcode = '42501';
    end if;

    if normalized_role not in ('basic_user', 'super_admin') then
        raise exception 'Invalid user role'
            using errcode = '22023';
    end if;

    update public.user_profiles
       set first_name = nullif(trim(target_first_name), ''),
           last_name = nullif(trim(target_last_name), ''),
           username = nullif(trim(target_username), ''),
           email = nullif(trim(target_email), ''),
           role = normalized_role,
           updated_at = now()
     where user_profiles.id = target_user_id;

    if not found then
        raise exception 'User profile not found'
            using errcode = 'P0002';
    end if;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."approximate_latin_slug_input"("input_value" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  with expanded as (
    select
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              coalesce(input_value, ''),
                              'ß',
                              'ss'
                            ),
                            'ẞ',
                            'SS'
                          ),
                          'æ',
                          'ae'
                        ),
                        'Æ',
                        'AE'
                      ),
                      'œ',
                      'oe'
                    ),
                    'Œ',
                    'OE'
                  ),
                  'þ',
                  'th'
                ),
                'Þ',
                'Th'
              ),
              'ĳ',
              'ij'
            ),
            'Ĳ',
            'IJ'
          ),
          'ĸ',
          'k'
        ),
        'ŉ',
        'n'
      ) as value
  )
  select extensions.unaccent(
    translate(
      value,
      'ıİđĐłŁøØðÐħĦŋŊ',
      'iIdDlLoOdDhHnN'
    )
  )
  from expanded;
$$;




CREATE OR REPLACE FUNCTION "public"."block_friend"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if target_user_id is null or target_user_id = current_user_id then
        raise exception 'Choose a valid friend to block';
    end if;

    update public.user_friendships
       set status = 'blocked',
           blocked_by_user_id = current_user_id,
           responded_at = now(),
           updated_at = now()
     where status = 'accepted'
       and (
            (requester_user_id = current_user_id and addressee_user_id = target_user_id)
            or
            (requester_user_id = target_user_id and addressee_user_id = current_user_id)
       );

    if not found then
        raise exception 'Friend could not be blocked';
    end if;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."can_access_trip_leg"("target_trip_id" "uuid", "target_trip_leg_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select
    target_trip_leg_id is null
    and public.is_trip_active_member(target_trip_id)
  or exists (
    select 1
    from public.trips
    where trips.id = target_trip_id
      and trips.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trip_legs
    join public.trip_member_legs
      on trip_member_legs.trip_leg_id = trip_legs.id
     and trip_member_legs.trip_id = trip_legs.trip_id
     and trip_member_legs.is_joining = true
    join public.trip_members
      on trip_members.id = trip_member_legs.trip_member_id
     and trip_members.trip_id = trip_member_legs.trip_id
     and trip_members.status = 'active'
    where trip_legs.id = target_trip_leg_id
      and trip_legs.trip_id = target_trip_id
      and trip_members.user_id = auth.uid()
  );
$$;




CREATE OR REPLACE FUNCTION "public"."cancel_trip_invitation"("invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  p_invitation_id alias for $1;
  current_user_id uuid := auth.uid();
  invite_record public.trip_invitations;
  trip_owner_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select trip_invitations.*
    into invite_record
    from public.trip_invitations
   where trip_invitations.id = p_invitation_id
     and trip_invitations.status = 'pending'
   limit 1
   for update;

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  select trips.user_id
    into trip_owner_id
    from public.trips
   where trips.id = invite_record.trip_id
   limit 1;

  if invite_record.invited_by <> current_user_id
     and coalesce(trip_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> current_user_id then
    raise exception 'You cannot cancel this invitation';
  end if;

  update public.trip_invitations
     set status = 'cancelled',
         responded_at = now()
   where trip_invitations.id = invite_record.id;

  update public.notifications as notification
     set archived_at = now(),
         read_at = coalesce(notification.read_at, now())
   where notification.invitation_id = invite_record.id
     and notification.type = 'trip_invite_received'
     and notification.archived_at is null;

  update public.notification_email_outbox as outbox
     set status = 'cancelled',
         last_error = 'trip_invite_cancelled',
         next_attempt_at = null,
         updated_at = now()
   where outbox.notification_id in (
       select notification.id
         from public.notifications as notification
        where notification.invitation_id = invite_record.id
          and notification.type = 'trip_invite_received'
   )
     and outbox.status in ('queued', 'processing', 'failed');

  update public.external_email_invite_outbox as outbox
     set status = 'cancelled',
         last_error = 'trip_invite_cancelled',
         next_attempt_at = null,
         updated_at = now()
   where outbox.invite_type = 'trip_invite'
     and outbox.related_id = invite_record.id
     and outbox.status in ('queued', 'processing', 'failed');
end;
$_$;



SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."external_email_invite_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_key" "text" NOT NULL,
    "invite_type" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "inviter_user_id" "uuid",
    "trip_id" "uuid",
    "related_id" "uuid",
    "subject" "text" NOT NULL,
    "template_key" "text" DEFAULT 'external_invite'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "provider_message_id" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "external_email_invite_outbox_invite_type_check" CHECK (("invite_type" = ANY (ARRAY['trip_invite'::"text", 'friend_invite'::"text", 'passport_stamp_share'::"text"]))),
    CONSTRAINT "external_email_invite_outbox_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);




CREATE OR REPLACE FUNCTION "public"."claim_external_email_invite_outbox"("batch_limit" integer DEFAULT 25) RETURNS SETOF "public"."external_email_invite_outbox"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with claimed as (
    select id
      from public.external_email_invite_outbox
     where status = 'queued'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.external_email_invite_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;




CREATE TABLE IF NOT EXISTS "public"."notification_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "template_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "provider_message_id" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_email_outbox_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);




CREATE OR REPLACE FUNCTION "public"."claim_notification_email_outbox"("batch_limit" integer DEFAULT 25) RETURNS SETOF "public"."notification_email_outbox"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with claimed as (
    select id
      from public.notification_email_outbox
     where status = 'queued'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.notification_email_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;




CREATE TABLE IF NOT EXISTS "public"."notification_push_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "title" "text",
    "body" "text",
    "destination_url" "text",
    "event_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_push_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);




CREATE OR REPLACE FUNCTION "public"."claim_notification_push_outbox"("batch_limit" integer DEFAULT 25) RETURNS SETOF "public"."notification_push_outbox"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with claimed as (
    select id
      from public.notification_push_outbox
     where (
             status = 'pending'
             or (
               status = 'failed'
               and attempts < 5
               and (next_attempt_at is null or next_attempt_at <= now())
             )
           )
     order by created_at asc
     limit greatest(1, least(batch_limit, 100))
     for update skip locked
  )
  update public.notification_push_outbox outbox
     set status = 'processing',
         attempts = attempts + 1,
         last_attempt_at = now(),
         processed_at = null,
         updated_at = now()
    from claimed
   where outbox.id = claimed.id
  returning outbox.*;
$$;




CREATE OR REPLACE FUNCTION "public"."claim_pending_trip_invitations_for_current_user"() RETURNS TABLE("id" "uuid", "trip_id" "uuid", "trip_title" "text", "trip_slug" "text", "trip_start_date" "date", "trip_end_date" "date", "invited_by" "uuid", "inviter_name" "text", "invitation_scope" "text", "invited_start_date" "date", "invited_end_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select lower(nullif(btrim(user_profiles.email), ''))
    into current_email
    from public.user_profiles
   where user_profiles.id = current_user_id;

  if current_email is not null then
    with claimed as (
      update public.trip_invitations
         set invited_user_id = current_user_id
       where trip_invitations.status = 'pending'
         and trip_invitations.invited_user_id is null
         and lower(nullif(btrim(trip_invitations.invited_email), '')) = current_email
      returning
        trip_invitations.id,
        trip_invitations.trip_id,
        trip_invitations.invited_by
    )
    insert into public.notifications (
      user_id,
      actor_user_id,
      trip_id,
      invitation_id,
      type,
      title,
      body,
      metadata
    )
    select
      current_user_id,
      claimed.invited_by,
      claimed.trip_id,
      claimed.id,
      'trip_invite_received',
      'Trip invite received',
      'You have been invited to join ' || coalesce(trips.title, 'a trip') || '.',
      jsonb_build_object('action', 'review_trip_invite')
    from claimed
    left join public.trips on trips.id = claimed.trip_id;
  end if;

  return query
  select
    trip_invitations.id,
    trips.id as trip_id,
    trips.title as trip_title,
    trips.slug as trip_slug,
    trips.start_date as trip_start_date,
    trips.end_date as trip_end_date,
    trip_invitations.invited_by,
    coalesce(
      nullif(btrim(coalesce(inviter.first_name, '') || ' ' || coalesce(inviter.last_name, '')), ''),
      inviter.username,
      inviter.email,
      'Someone'
    ) as inviter_name,
    trip_invitations.invitation_scope,
    trip_invitations.invited_start_date,
    trip_invitations.invited_end_date
  from public.trip_invitations
  join public.trips on trips.id = trip_invitations.trip_id
  left join public.user_profiles inviter on inviter.id = trip_invitations.invited_by
  where trip_invitations.status = 'pending'
    and trip_invitations.invited_user_id = current_user_id
  order by trip_invitations.created_at asc;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."create_friend_invitation"("invitee_identifier" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    current_user_id uuid := auth.uid();
    normalized_identifier text := lower(trim(invitee_identifier));
    target_user_id uuid;
    existing_friendship record;
    created_invitation_id uuid;
    actor_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if normalized_identifier = '' then
        raise exception 'Friend username or email is required';
    end if;

    select user_profiles.id
      into target_user_id
      from public.user_profiles
     where lower(coalesce(user_profiles.email, '')) = normalized_identifier
        or lower(coalesce(user_profiles.username, '')) = normalized_identifier
     limit 1;

    actor_name := public.get_user_display_name(current_user_id);

    if target_user_id is null then
        if normalized_identifier like '%@%' then
            perform public.queue_external_invite_email(
                'friend_invite:' || current_user_id::text || ':' || normalized_identifier,
                'friend_invite',
                normalized_identifier,
                current_user_id,
                null,
                null,
                coalesce(actor_name, 'Someone') || ' invited you to join VAIVIA',
                jsonb_build_object(
                    'inviteType', 'friend_invite',
                    'inviterName', coalesce(actor_name, 'Someone'),
                    'recipientEmail', normalized_identifier,
                    'signupPath', '/auth/sign-up'
                )
            );
        end if;

        return null;
    end if;

    if target_user_id = current_user_id then
        raise exception 'You cannot invite yourself';
    end if;

    select *
      into existing_friendship
      from public.user_friendships friendships
     where (
              friendships.requester_user_id = current_user_id
              and friendships.addressee_user_id = target_user_id
           )
        or (
              friendships.requester_user_id = target_user_id
              and friendships.addressee_user_id = current_user_id
           )
     order by friendships.created_at desc
     limit 1;

    if existing_friendship.id is not null then
        if existing_friendship.status = 'blocked' then
            if existing_friendship.blocked_by_user_id = current_user_id then
                raise exception 'You blocked this person. Unblock them before adding them as a friend.';
            end if;
            return null;
        end if;

        if existing_friendship.status in ('pending', 'accepted') then
            return existing_friendship.id;
        end if;

        update public.user_friendships
           set requester_user_id = current_user_id,
               addressee_identifier = trim(invitee_identifier),
               addressee_user_id = target_user_id,
               status = 'pending',
               blocked_by_user_id = null,
               responded_at = null,
               updated_at = now()
         where id = existing_friendship.id
         returning id into created_invitation_id;
    else
        insert into public.user_friendships (
            requester_user_id,
            addressee_identifier,
            addressee_user_id,
            status
        )
        values (
            current_user_id,
            trim(invitee_identifier),
            target_user_id,
            'pending'
        )
        returning id into created_invitation_id;
    end if;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      body,
      metadata
    )
    values (
      target_user_id,
      current_user_id,
      'friend_request_received',
      'Friend request received',
      coalesce(actor_name, 'Someone') || ' added you as a friend.',
      jsonb_build_object('action', 'review_friend_request', 'friendshipId', created_invitation_id)
    );

    return created_invitation_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."create_trip_invitation"("target_trip_id" "uuid", "invitee_identifier" "text", "consent_confirmed" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_identifier text;
  target_user_id uuid;
  target_email text;
  target_username text;
  new_invitation_id uuid;
  trip_title text;
  trip_start_date date;
  trip_end_date date;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if consent_confirmed is not true then
    raise exception 'Consent is required to share this trip';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'You do not have access to this trip';
  end if;

  normalized_identifier := lower(trim(invitee_identifier));

  if normalized_identifier is null or normalized_identifier = '' then
    raise exception 'Invitee email or username is required';
  end if;

  if normalized_identifier like '%@%' then
    target_email := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.email) = target_email
    limit 1;
  else
    target_username := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.username) = target_username
    limit 1;
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot invite yourself to your own trip';
  end if;

  if target_user_id is not null then
    if public.friendship_block_exists(auth.uid(), target_user_id) then
      raise exception 'You cannot invite this person because you blocked them.';
    end if;

    if public.friendship_block_exists(target_user_id, auth.uid()) then
      raise exception 'You cannot invite this person to this trip. Create a trip from your account and invite trip mates and ask them to transfer the items to the new trip.';
    end if;
  end if;

  select title, start_date, end_date
    into trip_title, trip_start_date, trip_end_date
  from public.trips
  where id = target_trip_id;

  insert into public.trip_invitations (
    trip_id,
    invited_by,
    invited_user_id,
    invited_email,
    invited_username,
    status,
    consent_confirmed
  )
  values (
    target_trip_id,
    auth.uid(),
    target_user_id,
    target_email,
    target_username,
    'pending',
    true
  )
  returning id into new_invitation_id;

  if target_user_id is not null then
    insert into public.notifications (
      user_id,
      actor_user_id,
      trip_id,
      invitation_id,
      type,
      title,
      body,
      metadata
    )
    values (
      target_user_id,
      auth.uid(),
      target_trip_id,
      new_invitation_id,
      'trip_invite_received',
      'Trip invite received',
      'You have been invited to join ' || coalesce(trip_title, 'a trip') || '.',
      jsonb_build_object('action', 'review_trip_invite')
    );
  elsif target_email is not null then
    actor_name := public.get_user_display_name(auth.uid());

    perform public.queue_external_invite_email(
      'trip_invite:' || new_invitation_id::text,
      'trip_invite',
      target_email,
      auth.uid(),
      target_trip_id,
      new_invitation_id,
      coalesce(actor_name, 'Someone') || ' invited you to ' || coalesce(trip_title, 'a trip') || ' on VAIVIA',
      jsonb_build_object(
        'inviteType', 'trip_invite',
        'inviterName', coalesce(actor_name, 'Someone'),
        'recipientEmail', target_email,
        'tripTitle', coalesce(trip_title, 'a trip'),
        'tripStartDate', trip_start_date,
        'tripEndDate', trip_end_date,
        'invitationId', new_invitation_id,
        'tripId', target_trip_id,
        'signupPath', '/auth/sign-up'
      )
    );
  end if;

  return new_invitation_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."decline_current_terms"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  current_terms_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id
    into current_terms_id
  from public.terms_versions
  order by published_at desc
  limit 1;

  if current_terms_id is null then
    raise exception 'No terms version is published';
  end if;

  update public.user_profiles
     set terms_declined_at = now(),
         terms_declined_version_id = current_terms_id,
         terms_decline_delete_after = now() + interval '30 days',
         updated_at = now()
   where id = auth.uid();

  return current_terms_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."decline_trip_invitation"("invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invite_record public.trip_invitations;
  actor_name text;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  update public.trip_invitations
  set status = 'declined', responded_at = now()
  where id = invitation_id;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

  select title into trip_title from public.trips where id = invite_record.trip_id;

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    invitation_id,
    'trip_invite_declined',
    'Trip invite declined',
    coalesce(actor_name, 'Someone') || ' declined your invite to ' || coalesce(trip_title, 'your trip') || '.'
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."enforce_user_category_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."enforce_user_family_member_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    select count(*)
    from public.user_family_members ufm
    where ufm.user_id = new.user_id
      and ufm.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 10 then
    raise exception 'You can add up to 10 family members.';
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."enforce_user_profile_role_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
    if current_user in ('postgres', 'supabase_admin', 'service_role') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        if new.role is distinct from 'basic_user'
           and not public.is_super_admin() then
            raise exception 'Only super admins can assign user roles'
                using errcode = '42501';
        end if;
    elsif tg_op = 'UPDATE' then
        if new.role is distinct from old.role
           and not public.is_super_admin() then
            raise exception 'Only super admins can change user roles'
                using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."ensure_user_preferences_for_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_preferences (user_id, theme_mode)
  values (new.id, 'dark')
  on conflict (user_id) do nothing;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."friendship_block_exists"("blocker_user_id" "uuid", "blocked_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_friendships friendships
    where friendships.status = 'blocked'
      and friendships.blocked_by_user_id = blocker_user_id
      and (
        (
          friendships.requester_user_id = blocker_user_id
          and friendships.addressee_user_id = blocked_user_id
        )
        or
        (
          friendships.requester_user_id = blocked_user_id
          and friendships.addressee_user_id = blocker_user_id
        )
      )
  );
$$;




CREATE OR REPLACE FUNCTION "public"."get_admin_feature_suggestions"("limit_count" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "user_id" "uuid", "suggestion_type" "text", "title" "text", "message" "text", "current_path" "text", "contact_email" "text", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
    if not public.is_super_admin() then
        raise exception 'Only super admins can view feature suggestions'
            using errcode = '42501';
    end if;

    return query
    select
        feature_suggestions.id,
        feature_suggestions.user_id,
        feature_suggestions.suggestion_type,
        feature_suggestions.title,
        feature_suggestions.message,
        feature_suggestions.current_path,
        feature_suggestions.contact_email,
        feature_suggestions.status,
        feature_suggestions.created_at
    from public.feature_suggestions
    order by feature_suggestions.created_at desc
    limit greatest(1, least(coalesce(limit_count, 100), 500));
end;
$$;




CREATE OR REPLACE FUNCTION "public"."get_admin_site_stats"("range_start" "date" DEFAULT ((CURRENT_DATE - '30 days'::interval))::"date", "range_end" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    safe_start date := least(range_start, range_end);
    safe_end date := greatest(range_start, range_end);
    result jsonb;
begin
    if not public.is_super_admin() then
        raise exception 'Only super admins can view site stats'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'userCount',
        (select count(*) from public.user_profiles),
        'tripCount',
        (select count(*) from public.trips),
        'themeUsage',
        (
            with theme_modes(theme_mode, sort_order) as (
                values
                    ('dark', 1),
                    ('pink', 2),
                    ('greyscale', 3),
                    ('brat', 4),
                    ('pride', 5),
                    ('light', 6)
            ),
            theme_counts as (
                select
                    coalesce(user_preferences.theme_mode, 'dark') as theme_mode,
                    count(*) as theme_count
                from public.user_profiles
                left join public.user_preferences
                  on user_preferences.user_id = user_profiles.id
                group by coalesce(user_preferences.theme_mode, 'dark')
            )
            select jsonb_agg(
                jsonb_build_object(
                    'themeMode',
                    theme_modes.theme_mode,
                    'count',
                    coalesce(theme_counts.theme_count, 0)
                )
                order by theme_modes.sort_order
            )
            from theme_modes
            left join theme_counts
              on theme_counts.theme_mode = theme_modes.theme_mode
        ),
        'levelDistribution',
        (
            with levels(level, level_name, min_points, max_points) as (
                values
                    (1, 'Still Packing', 0, 9),
                    (2, 'Gate Daydreamer', 10, 24),
                    (3, 'Weekend Wanderer', 25, 59),
                    (4, 'Carry-On Cadet', 60, 99),
                    (5, 'Boarding Pass Boss', 100, 149),
                    (6, 'Itinerary Instigator', 150, 224),
                    (7, 'Window Seat Warrior', 225, 299),
                    (8, 'Passport Paparazzi', 300, 399),
                    (9, 'Layover Legend', 400, 499),
                    (10, 'Jet Lag Juggler', 500, 599),
                    (11, 'Terminal Celebrity', 600, 699),
                    (12, 'Frequent Flyer Flirt', 700, 799),
                    (13, 'Timezone Tactician', 800, 899),
                    (14, 'Border-Hopping Icon', 900, 999),
                    (15, 'Global Gallivanter', 1000, 1099),
                    (16, 'Customs Connoisseur', 1100, 1199),
                    (17, 'World Tour Royalty', 1200, 1299),
                    (18, 'International Mystery', 1300, 1399),
                    (19, 'Citizen of Everywhere', 1400, 1499),
                    (20, 'Main Character Abroad', 1500, null)
            ),
            level_counts as (
                select user_points.level, count(*) as user_count
                from public.user_points
                group by user_points.level
            )
            select jsonb_agg(
                jsonb_build_object(
                    'level', levels.level,
                    'levelName', levels.level_name,
                    'minPoints', levels.min_points,
                    'maxPoints', levels.max_points,
                    'count', coalesce(level_counts.user_count, 0)
                )
                order by levels.level
            )
            from levels
            left join level_counts
              on level_counts.level = levels.level
        ),
        'newUsersByDay',
        (
            select coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'date',
                        day_series.day::text,
                        'count',
                        coalesce(join_counts.user_count, 0)
                    )
                    order by day_series.day
                ),
                '[]'::jsonb
            )
            from generate_series(safe_start, safe_end, interval '1 day') as day_series(day)
            left join (
                select
                    user_profiles.join_date::date as joined_on,
                    count(*) as user_count
                from public.user_profiles
                where user_profiles.join_date::date between safe_start and safe_end
                group by user_profiles.join_date::date
            ) join_counts
              on join_counts.joined_on = day_series.day::date
        ),
        'monthlyActiveUsersByDay',
        (
            select coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'date',
                        day_series.day::text,
                        'count',
                        (
                            select count(distinct user_point_events.user_id)
                            from public.user_point_events
                            where coalesce(
                                    user_point_events.occurred_at,
                                    user_point_events.created_at
                                  )::date
                                  between (day_series.day::date - interval '29 days')::date
                                      and day_series.day::date
                        )
                    )
                    order by day_series.day
                ),
                '[]'::jsonb
            )
            from generate_series(safe_start, safe_end, interval '1 day') as day_series(day)
        )
    )
    into result;

    return result;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."get_admin_users"() RETURNS TABLE("id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "username" "text", "role" "text", "join_date" timestamp with time zone, "created_at" timestamp with time zone, "auth_method" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
    if not public.is_super_admin() then
        raise exception 'Only super admins can view users'
            using errcode = '42501';
    end if;

    return query
    select
        user_profiles.id,
        coalesce(user_profiles.email, auth_users.email)::text as email,
        user_profiles.first_name,
        user_profiles.last_name,
        user_profiles.username,
        user_profiles.role,
        user_profiles.join_date,
        user_profiles.created_at,
        case
            when exists (
                select 1
                from auth.identities
                where identities.user_id = user_profiles.id
                  and identities.provider = 'google'
            ) then 'google'
            when exists (
                select 1
                from auth.identities
                where identities.user_id = user_profiles.id
                  and identities.provider in ('azure', 'microsoft')
            ) then 'microsoft'
            when exists (
                select 1
                from auth.identities
                where identities.user_id = user_profiles.id
                  and identities.provider = 'email'
            ) then 'password'
            else coalesce(auth_users.raw_app_meta_data ->> 'provider', 'password')
        end::text as auth_method
    from public.user_profiles
    left join auth.users auth_users
      on auth_users.id = user_profiles.id
    order by user_profiles.join_date desc, user_profiles.created_at desc;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."get_available_trip_slug"("base_slug" "text", "excluded_trip_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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
    normalized_base := public.get_trip_slug_fallback_for_user(
      current_user_id,
      excluded_trip_id
    );
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




CREATE OR REPLACE FUNCTION "public"."get_available_trip_slug_for_user"("target_user_id" "uuid", "base_slug" "text", "excluded_trip_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    normalized_base := public.get_trip_slug_fallback_for_user(
      target_user_id,
      excluded_trip_id
    );
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




CREATE OR REPLACE FUNCTION "public"."get_friend_profile_snapshot"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."get_passport_stamp_share_review"("share_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."get_trip_slug_fallback_for_user"("target_user_id" "uuid", "excluded_trip_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select 'trip-' || greatest(count(*)::integer + 1, 1)::text
  from public.trips
  where trips.user_id = target_user_id
    and (excluded_trip_id is null or trips.id <> excluded_trip_id);
$$;




CREATE OR REPLACE FUNCTION "public"."get_user_display_name"("target_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    username,
    email,
    'this person'
  )
  from public.user_profiles
  where id = target_user_id;
$$;




CREATE OR REPLACE FUNCTION "public"."handle_new_user_categories"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.seed_default_user_categories(new.id);
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_profiles (id, email, first_name, last_name, username, avatar_url)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
    select exists (
        select 1
        from public.user_profiles
        where user_profiles.id = auth.uid()
          and user_profiles.role = 'super_admin'
    );
$$;




CREATE OR REPLACE FUNCTION "public"."is_trip_active_member"("target_trip_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1
    from public.trips
    where trips.id = target_trip_id
      and trips.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.trip_members
    where trip_members.trip_id = target_trip_id
      and trip_members.user_id = auth.uid()
      and trip_members.status = 'active'
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_trip_item_visible"("target_trip_id" "uuid", "target_created_by" "uuid", "target_is_private" boolean, "target_audience_mode" "text", "target_item_type" "text", "target_item_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select public.is_trip_active_member(target_trip_id)
    and (
      (coalesce(target_is_private, false) = true and target_created_by = auth.uid())
      or
      (coalesce(target_is_private, false) = false and (
        coalesce(target_audience_mode, 'everyone') = 'everyone'
        or target_created_by = auth.uid()
        or exists (
          select 1
          from public.trip_item_participants tip
          where tip.trip_id = target_trip_id
            and tip.item_type = target_item_type
            and tip.item_id = target_item_id
            and (
              tip.user_id = auth.uid()
              or exists (
                select 1 from public.trip_members tm
                where tm.id = tip.trip_member_id
                  and tm.user_id = auth.uid()
                  and tm.status = 'active'
              )
            )
        )
      ))
    );
$$;




CREATE OR REPLACE FUNCTION "public"."is_trip_owner"("target_trip_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
      and tm.status = 'active'
  );
$$;




CREATE OR REPLACE FUNCTION "public"."leave_trip"("target_trip_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."mark_app_alert_read"("alert_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.notifications
  set read_at = now()
  where id = alert_id
    and user_id = auth.uid();
end;
$$;




CREATE OR REPLACE FUNCTION "public"."normalize_trip_slug"("input_value" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      lower(public.approximate_latin_slug_input(coalesce(input_value, ''))),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    '-+',
    '-',
    'g'
  ));
$$;




CREATE OR REPLACE FUNCTION "public"."notify_feature_suggestion_implemented"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  notify_when_implemented boolean := true;
  suggestion_title text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'implemented' or coalesce(old.status, '') = 'implemented' then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  perform public.record_user_point_event(
    new.user_id,
    'feature_suggestion_implemented',
    5,
    'feature_suggestions',
    new.id,
    jsonb_build_object('action', 'implemented'),
    now(),
    'feature_suggestions:' || new.id::text || ':implemented'
  );

  if jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'notify_when_implemented') = 'boolean' then
    notify_when_implemented :=
      (coalesce(new.metadata, '{}'::jsonb)->>'notify_when_implemented')::boolean;
  end if;

  if not notify_when_implemented then
    return new;
  end if;

  suggestion_title := coalesce(nullif(btrim(new.title), ''), 'Your VAIVIA request');

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    metadata
  )
  values (
    new.user_id,
    (select auth.uid()),
    'feature_suggestion_implemented',
    'Feature request implemented',
    suggestion_title || ' is now available in VAIVIA. You earned 5 VAIVIA points.',
    jsonb_build_object(
      'featureSuggestionId', new.id,
      'suggestionType', new.suggestion_type,
      'pointsAwarded', 5
    )
  );

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."notify_trip_members"("target_trip_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text" DEFAULT NULL::"text", "notification_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."notify_trip_slug_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."queue_external_invite_email"("invite_event_key" "text", "invite_type" "text", "recipient_email" "text", "inviter_user_id" "uuid", "trip_id" "uuid" DEFAULT NULL::"uuid", "related_id" "uuid" DEFAULT NULL::"uuid", "subject" "text" DEFAULT 'You are invited to join VAIVIA'::"text", "payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_email text := lower(trim(recipient_email));
  outbox_id uuid;
begin
  if invite_event_key is null or trim(invite_event_key) = '' then
    raise exception 'Invite event key is required';
  end if;

  if invite_type not in ('trip_invite', 'friend_invite', 'passport_stamp_share') then
    raise exception 'Invalid external invite type';
  end if;

  if normalized_email is null or normalized_email = '' or normalized_email not like '%@%' then
    raise exception 'A valid recipient email is required';
  end if;

  insert into public.external_email_invite_outbox (
    event_key,
    invite_type,
    recipient_email,
    inviter_user_id,
    trip_id,
    related_id,
    subject,
    template_key,
    payload
  )
  values (
    invite_event_key,
    invite_type,
    normalized_email,
    inviter_user_id,
    trip_id,
    related_id,
    left(coalesce(nullif(subject, ''), 'You are invited to join VAIVIA'), 250),
    'external_invite',
    coalesce(payload, '{}'::jsonb)
  )
  on conflict (event_key) do update
     set recipient_email = excluded.recipient_email,
         inviter_user_id = excluded.inviter_user_id,
         trip_id = excluded.trip_id,
         related_id = excluded.related_id,
         subject = excluded.subject,
         payload = excluded.payload,
         status = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.status
             else 'queued'
           end,
         next_attempt_at = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.next_attempt_at
             else null
           end,
         failed_at = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.failed_at
             else null
           end,
         last_error = case
             when public.external_email_invite_outbox.status = 'sent' then public.external_email_invite_outbox.last_error
             else null
           end,
         updated_at = now()
  returning id into outbox_id;

  return outbox_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."queue_notification_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  recipient_email text;
begin
  select users.email
    into recipient_email
    from auth.users
   where users.id = new.user_id
     and users.email is not null
     and users.email <> '';

  if recipient_email is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_notification_preferences preferences
     where preferences.user_id = new.user_id
       and preferences.notification_type = new.type
       and preferences.email_enabled = true
  ) then
    return new;
  end if;

  insert into public.notification_email_outbox (
    notification_id,
    user_id,
    notification_type,
    recipient_email,
    subject,
    template_key,
    payload
  )
  values (
    new.id,
    new.user_id,
    new.type,
    recipient_email,
    left(coalesce(nullif(new.title, ''), 'VAIVIA notification'), 250),
    new.type,
    jsonb_build_object(
      'notificationId', new.id,
      'type', new.type,
      'title', new.title,
      'body', new.body,
      'metadata', coalesce(new.metadata, '{}'::jsonb),
      'tripId', new.trip_id,
      'invitationId', new.invitation_id,
      'actorUserId', new.actor_user_id,
      'createdAt', new.created_at
    )
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."queue_notification_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  destination_url text;
  event_identifier text;
begin
  if new.user_id is null or new.type is null then
    return new;
  end if;

  if new.actor_user_id is not null
     and new.actor_user_id = new.user_id
     and new.type not in (
       'passport_stamp_added',
       'feature_suggestion_implemented',
       'terms_updated',
       'terms_acceptance_required',
       'trip_slug_changed'
     )
  then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_notification_preferences preferences
     where preferences.user_id = new.user_id
       and preferences.notification_type = new.type
       and preferences.push_enabled = true
  ) then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_push_subscriptions subscriptions
     where subscriptions.user_id = new.user_id
       and subscriptions.revoked_at is null
  ) then
    return new;
  end if;

  destination_url := coalesce(
    nullif(new.metadata ->> 'url', ''),
    nullif(new.metadata ->> 'href', ''),
    nullif(new.metadata ->> 'path', ''),
    '/notifications'
  );

  if left(destination_url, 1) <> '/' then
    destination_url := '/notifications';
  end if;

  event_identifier := coalesce(
    nullif(new.metadata ->> 'eventId', ''),
    nullif(new.metadata ->> 'shareId', ''),
    nullif(new.metadata ->> 'friendshipId', ''),
    nullif(new.metadata ->> 'suggestionId', ''),
    nullif(new.metadata ->> 'tripId', ''),
    new.invitation_id::text,
    new.id::text
  );

  insert into public.notification_push_outbox (
    notification_id,
    user_id,
    notification_type,
    title,
    body,
    destination_url,
    event_id,
    payload,
    updated_at
  )
  values (
    new.id,
    new.user_id,
    new.type,
    left(coalesce(nullif(new.title, ''), 'VAIVIA'), 250),
    new.body,
    destination_url,
    event_identifier,
    jsonb_build_object(
      'notificationId', new.id,
      'eventId', event_identifier,
      'type', new.type,
      'title', new.title,
      'body', new.body,
      'metadata', coalesce(new.metadata, '{}'::jsonb),
      'tripId', new.trip_id,
      'invitationId', new.invitation_id,
      'actorUserId', new.actor_user_id,
      'url', destination_url,
      'createdAt', new.created_at
    ),
    now()
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."recalculate_all_user_points"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  refreshed_count integer := 0;
  profile_row record;
begin
  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trips.user_id, 'trip_created', 5, 'trips', trips.id, jsonb_build_object('backfilled', true), trips.created_at, 'trips:' || trips.id::text || ':create'
  from public.trips
  where trips.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_passport_stamps.user_id, 'passport_stamp_added', 5, 'user_passport_stamps', user_passport_stamps.id, jsonb_build_object('backfilled', true), user_passport_stamps.created_at, 'user_passport_stamps:' || user_passport_stamps.id::text || ':create'
  from public.user_passport_stamps
  where user_passport_stamps.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_friendships.requester_user_id, 'friend_added', 5, 'user_friendships', user_friendships.id, jsonb_build_object('backfilled', true, 'friendUserId', user_friendships.addressee_user_id), coalesce(user_friendships.responded_at, user_friendships.created_at), 'user_friendships:' || user_friendships.id::text || ':requester:accepted'
  from public.user_friendships
  where user_friendships.status = 'accepted'
    and user_friendships.requester_user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_friendships.addressee_user_id, 'friend_added', 5, 'user_friendships', user_friendships.id, jsonb_build_object('backfilled', true, 'friendUserId', user_friendships.requester_user_id), coalesce(user_friendships.responded_at, user_friendships.created_at), 'user_friendships:' || user_friendships.id::text || ':addressee:accepted'
  from public.user_friendships
  where user_friendships.status = 'accepted'
    and user_friendships.addressee_user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_ideas.created_by, 'idea_added', 2, 'trip_ideas', trip_ideas.id, jsonb_build_object('backfilled', true), trip_ideas.created_at, 'trip_ideas:' || trip_ideas.id::text || ':create'
  from public.trip_ideas
  where trip_ideas.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select coalesce(transportation_items.created_by, public.vaivia_trip_owner(transportation_items.trip_id)), 'transportation_added', 4, 'transportation_items', transportation_items.id, jsonb_build_object('backfilled', true), transportation_items.created_at, 'transportation_items:' || transportation_items.id::text || ':create'
  from public.transportation_items
  where coalesce(transportation_items.created_by, public.vaivia_trip_owner(transportation_items.trip_id)) is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select coalesce(itinerary_items.created_by, public.vaivia_trip_owner(itinerary_items.trip_id)), 'itinerary_event_added', 3, 'itinerary_items', itinerary_items.id, jsonb_build_object('backfilled', true), itinerary_items.created_at, 'itinerary_items:' || itinerary_items.id::text || ':create'
  from public.itinerary_items
  where coalesce(itinerary_items.created_by, public.vaivia_trip_owner(itinerary_items.trip_id)) is not null
    and not exists (
      select 1 from public.transportation_items
      where transportation_items.itinerary_item_id = itinerary_items.id
    )
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_food_items.created_by, 'food_item_added', 2, 'trip_food_items', trip_food_items.id, jsonb_build_object('backfilled', true), trip_food_items.created_at, 'trip_food_items:' || trip_food_items.id::text || ':create'
  from public.trip_food_items
  where trip_food_items.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_accommodations.created_by, 'accommodation_added', 4, 'trip_accommodations', trip_accommodations.id, jsonb_build_object('backfilled', true), trip_accommodations.created_at, 'trip_accommodations:' || trip_accommodations.id::text || ':create'
  from public.trip_accommodations
  where trip_accommodations.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_budgets.created_by, 'budget_added', 10, 'trip_budgets', trip_budgets.id, jsonb_build_object('backfilled', true), trip_budgets.created_at, 'trip_budgets:' || trip_budgets.id::text || ':create'
  from public.trip_budgets
  where trip_budgets.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_expenses.created_by, 'expense_added', 1, 'trip_expenses', trip_expenses.id, jsonb_build_object('backfilled', true), trip_expenses.created_at, 'trip_expenses:' || trip_expenses.id::text || ':create'
  from public.trip_expenses
  where trip_expenses.created_by is not null
    and trip_expenses.deleted_at is null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_idea_reactions.user_id, 'idea_reaction_added', 1, 'trip_idea_reactions', trip_idea_reactions.id, jsonb_build_object('backfilled', true), trip_idea_reactions.created_at, 'trip_idea_reactions:' || trip_idea_reactions.id::text || ':create'
  from public.trip_idea_reactions
  where trip_idea_reactions.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select news_feed_reactions.user_id, 'news_feed_reaction_added', 1, 'news_feed_reactions', news_feed_reactions.id, jsonb_build_object('backfilled', true), news_feed_reactions.created_at, 'news_feed_reactions:' || news_feed_reactions.id::text || ':create'
  from public.news_feed_reactions
  where news_feed_reactions.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  for profile_row in
    select user_profiles.id
      from public.user_profiles
  loop
    perform public.refresh_user_points(profile_row.id);
    refreshed_count := refreshed_count + 1;
  end loop;

  return refreshed_count;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."record_user_activity"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  requesting_user uuid := auth.uid();
  today_utc date := (now() at time zone 'utc')::date;
begin
  if requesting_user is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_activity_daily (
    user_id, activity_date, first_active_at, last_active_at
  )
  values (requesting_user, today_utc, now(), now())
  on conflict (user_id, activity_date)
  do update set last_active_at = excluded.last_active_at;
end;
$$;




CREATE TABLE IF NOT EXISTS "public"."user_point_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "points" integer NOT NULL,
    "source_table" "text",
    "source_id" "uuid",
    "unique_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE OR REPLACE FUNCTION "public"."record_user_point_event"("target_user_id" "uuid", "event_type" "text", "point_delta" integer, "source_table" "text" DEFAULT NULL::"text", "source_id" "uuid" DEFAULT NULL::"uuid", "metadata" "jsonb" DEFAULT '{}'::"jsonb", "occurred_at" timestamp with time zone DEFAULT "now"(), "unique_key" "text" DEFAULT NULL::"text") RETURNS "public"."user_point_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  event_row public.user_point_events;
begin
  if $1 is null or $2 is null or $3 is null then
    return null;
  end if;

  if $8 is not null then
    select *
      into event_row
      from public.user_point_events
     where user_point_events.unique_key = $8
     limit 1;

    if event_row.id is not null then
      perform public.refresh_user_points($1);
      return event_row;
    end if;
  end if;

  insert into public.user_point_events (
    user_id,
    event_type,
    points,
    source_table,
    source_id,
    metadata,
    occurred_at,
    unique_key
  )
  values (
    $1,
    $2,
    $3,
    $4,
    $5,
    coalesce($6, '{}'::jsonb),
    coalesce($7, now()),
    $8
  )
  returning * into event_row;

  perform public.refresh_user_points($1);

  return event_row;
end;
$_$;




CREATE TABLE IF NOT EXISTS "public"."user_points" (
    "user_id" "uuid" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "level_name" "text" DEFAULT 'Still Packing'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE OR REPLACE FUNCTION "public"."refresh_user_points"("target_user_id" "uuid") RETURNS "public"."user_points"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  total_points integer;
  level_info jsonb;
  points_row public.user_points;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  select coalesce(sum(user_point_events.points), 0)::integer
    into total_points
    from public.user_point_events
   where user_point_events.user_id = target_user_id;

  level_info := public.vaivia_level_for_points(total_points);

  insert into public.user_points (
    user_id,
    points,
    level,
    level_name,
    updated_at
  )
  values (
    target_user_id,
    total_points,
    (level_info->>'level')::integer,
    level_info->>'name',
    now()
  )
  on conflict (user_id) do update
    set points = excluded.points,
        level = excluded.level,
        level_name = excluded.level_name,
        updated_at = now()
  returning * into points_row;

  return points_row;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."request_account_deletion_after_terms_decline"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_profiles
     set account_deletion_requested_at = now(),
         terms_decline_delete_after = coalesce(terms_decline_delete_after, now() + interval '30 days'),
         updated_at = now()
   where id = auth.uid();
end;
$$;




CREATE OR REPLACE FUNCTION "public"."request_current_user_account_deletion"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_profiles
     set account_deletion_requested_at = now(),
         updated_at = now()
   where id = auth.uid();
end;
$$;




CREATE OR REPLACE FUNCTION "public"."resolve_trip_member_slug_conflicts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."resolve_trip_slug_conflicts_for_trip_members"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."respond_to_friend_invitation"("friendship_id" "uuid", "next_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    current_user_id uuid := auth.uid();
    updated_friendship public.user_friendships;
    actor_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if next_status not in ('accepted', 'declined', 'cancelled') then
        raise exception 'Invalid friendship status';
    end if;

    update public.user_friendships
       set status = next_status,
           blocked_by_user_id = null,
           responded_at = case
               when next_status in ('accepted', 'declined') then now()
               else responded_at
           end,
           updated_at = now()
     where id = friendship_id
       and (
            (
                next_status = 'cancelled'
                and requester_user_id = current_user_id
                and status in ('pending', 'declined')
            )
            or
            (
                next_status in ('accepted', 'declined')
                and addressee_user_id = current_user_id
                and status = 'pending'
            )
       )
     returning * into updated_friendship;

    if updated_friendship.id is null then
        raise exception 'Friend invitation could not be updated';
    end if;

    if next_status = 'accepted' then
        actor_name := public.get_user_display_name(current_user_id);

        insert into public.notifications (
          user_id,
          actor_user_id,
          type,
          title,
          body,
          metadata
        )
        values (
          updated_friendship.requester_user_id,
          current_user_id,
          'friend_request_accepted',
          'Friend request accepted',
          coalesce(actor_name, 'Someone') || ' accepted your friend request.',
          jsonb_build_object('friendshipId', updated_friendship.id)
        );
    end if;
end;
$$;




CREATE TABLE IF NOT EXISTS "public"."user_passport_stamp_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "source_stamp_id" "uuid" NOT NULL,
    "accepted_stamp_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_passport_stamp_shares_not_self_check" CHECK (("sender_user_id" <> "recipient_user_id")),
    CONSTRAINT "user_passport_stamp_shares_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);




CREATE OR REPLACE FUNCTION "public"."respond_to_passport_stamp_share"("share_id" "uuid", "next_status" "text", "stamp_patch" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."user_passport_stamp_shares"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  current_user_id uuid := auth.uid();
  share_row public.user_passport_stamp_shares;
  source_stamp public.user_passport_stamps;
  accepted_stamp public.user_passport_stamps;
  visit_year integer;
  visit_month integer;
  first_visited_on date;
  actor_name text;
  feed_body text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('accepted', 'declined') then
    raise exception 'Invalid passport stamp response';
  end if;

  select *
    into share_row
    from public.user_passport_stamp_shares
   where id = share_id
     and recipient_user_id = current_user_id
     and status = 'pending'
   for update;

  if share_row.id is null then
    raise exception 'Passport stamp share could not be found';
  end if;

  select *
    into source_stamp
    from public.user_passport_stamps
   where id = share_row.source_stamp_id;

  if source_stamp.id is null then
    raise exception 'Shared passport stamp could not be found';
  end if;

  if next_status = 'declined' then
    update public.user_passport_stamp_shares
       set status = 'declined',
           responded_at = now(),
           updated_at = now()
     where id = share_id
     returning * into share_row;

    return share_row;
  end if;

  visit_year := nullif(stamp_patch->>'firstVisitYear', '')::integer;
  visit_month := nullif(stamp_patch->>'visitMonth', '')::integer;

  if visit_year is null then
    visit_year := extract(year from coalesce(source_stamp.first_visited_on, source_stamp.stamped_at::date, source_stamp.created_at::date));
  end if;

  if visit_month is null then
    visit_month := coalesce(source_stamp.visit_month, extract(month from coalesce(source_stamp.first_visited_on, source_stamp.stamped_at::date, source_stamp.created_at::date))::integer);
  end if;

  if visit_year > extract(year from current_date)::integer
     or (
       visit_year = extract(year from current_date)::integer
       and visit_month > extract(month from current_date)::integer
     ) then
    raise exception 'Passport stamps cannot be added for future travel';
  end if;

  first_visited_on := make_date(visit_year, greatest(1, least(12, visit_month)), 1);

  insert into public.user_passport_stamps (
    user_id,
    country_code,
    country_name,
    flag_emoji,
    source,
    first_visited_on,
    stamped_at,
    first_entry_iata_code,
    first_entry_icao_code,
    first_entry_city,
    first_entry_airport_name,
    first_entry_airport_google_place_id,
    first_entry_airport_formatted_address,
    welcome_label_snapshot,
    arrival_label_snapshot,
    stamp_display_country_name,
    stamp_display_flag,
    visit_city,
    visit_region,
    visit_month,
    visit_status,
    port_of_entry_type,
    port_of_entry_name,
    updated_at
  )
  values (
    current_user_id,
    source_stamp.country_code,
    source_stamp.country_name,
    source_stamp.flag_emoji,
    'manual',
    first_visited_on,
    now(),
    source_stamp.first_entry_iata_code,
    source_stamp.first_entry_icao_code,
    coalesce(nullif(stamp_patch->>'airportCity', ''), source_stamp.first_entry_city),
    coalesce(nullif(stamp_patch->>'airportName', ''), source_stamp.first_entry_airport_name),
    source_stamp.first_entry_airport_google_place_id,
    source_stamp.first_entry_airport_formatted_address,
    source_stamp.welcome_label_snapshot,
    source_stamp.arrival_label_snapshot,
    source_stamp.stamp_display_country_name,
    source_stamp.stamp_display_flag,
    coalesce(nullif(stamp_patch->>'visitCity', ''), source_stamp.visit_city),
    coalesce(nullif(stamp_patch->>'visitRegion', ''), source_stamp.visit_region),
    visit_month,
    case when stamp_patch->>'visitStatus' = 'lived' then 'lived' else coalesce(source_stamp.visit_status, 'visited') end,
    source_stamp.port_of_entry_type,
    coalesce(nullif(stamp_patch->>'portOfEntryName', ''), source_stamp.port_of_entry_name),
    now()
  )
  returning * into accepted_stamp;

  update public.user_passport_stamp_shares
     set status = 'accepted',
         accepted_stamp_id = accepted_stamp.id,
         responded_at = now(),
         updated_at = now()
   where id = share_id
   returning * into share_row;

  actor_name := public.get_user_display_name(current_user_id);
  feed_body :=
    coalesce(actor_name, 'A friend') ||
    ' added a new passport stamp: ' ||
    coalesce(accepted_stamp.stamp_display_country_name, accepted_stamp.country_name) ||
    ' in ' ||
    visit_year::text ||
    case when coalesce(accepted_stamp.visit_city, '') <> '' then
      ', entered in ' || accepted_stamp.visit_city
    else
      ''
    end ||
    case when coalesce(accepted_stamp.port_of_entry_name, '') <> '' then
      ' via ' || accepted_stamp.port_of_entry_name
    else
      ''
    end ||
    '.';

  insert into public.news_feed_posts (
    post_key,
    user_id,
    actor_user_id,
    audience_user_id,
    post_type,
    title,
    body,
    meta,
    metadata
  )
  values (
    'passport-stamp-share-' || share_row.id::text,
    current_user_id,
    current_user_id,
    share_row.sender_user_id,
    'friends',
    'Friend added a passport stamp',
    feed_body,
    'Passport stamp',
    jsonb_build_object(
      'shareId', share_row.id,
      'stampId', accepted_stamp.id,
      'countryCode', accepted_stamp.country_code
    )
  )
  on conflict (post_key) do nothing;

  return share_row;
end;
$$;




CREATE TABLE IF NOT EXISTS "public"."user_email_import_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "inbound_token" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotated_at" timestamp with time zone
);




CREATE OR REPLACE FUNCTION "public"."rotate_user_email_import_address"("target_user_id" "uuid", "new_inbound_token" "text") RETURNS "public"."user_email_import_addresses"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    new_address public.user_email_import_addresses;
begin
    if target_user_id is null then
        raise exception 'target_user_id is required';
    end if;

    if new_inbound_token is null or length(trim(new_inbound_token)) < 32 then
        raise exception 'new_inbound_token is invalid';
    end if;

    update public.user_email_import_addresses
    set
        is_active = false,
        rotated_at = now()
    where
        user_id = target_user_id
        and is_active = true;

    insert into public.user_email_import_addresses (
        user_id,
        inbound_token,
        is_active
    )
    values (
        target_user_id,
        lower(trim(new_inbound_token)),
        true
    )
    returning * into new_address;

    return new_address;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."seed_default_user_categories"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."send_passport_stamp_share"("source_stamp_id" "uuid", "recipient_user_ids" "uuid"[]) RETURNS SETOF "public"."user_passport_stamp_shares"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."set_and_validate_trip_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."set_marketing_email_consent"("consent" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_profiles
     set marketing_emails_consent = consent,
         marketing_emails_consented_at = case when consent then now() else null end,
         marketing_emails_consent_decided_at = now(),
         updated_at = now()
   where id = auth.uid();
end;
$$;




CREATE OR REPLACE FUNCTION "public"."set_transportation_item_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."trip_slug_conflicts_for_user"("target_user_id" "uuid", "target_slug" "text", "excluded_trip_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."unfriend_user"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
    current_user_id uuid := auth.uid();
    updated_friendship public.user_friendships;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if target_user_id is null or target_user_id = current_user_id then
        raise exception 'Invalid friend';
    end if;

    update public.user_friendships
       set status = 'cancelled',
           blocked_by_user_id = null,
           updated_at = now()
     where status = 'accepted'
       and (
            (
                requester_user_id = current_user_id
                and addressee_user_id = target_user_id
            )
            or
            (
                requester_user_id = target_user_id
                and addressee_user_id = current_user_id
            )
       )
     returning * into updated_friendship;

    if updated_friendship.id is null then
        raise exception 'Friendship could not be removed';
    end if;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_level_for_points"("raw_points" integer) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  with normalized as (
    select greatest(coalesce(raw_points, 0), 0) as points
  ),
  level_row as (
    select
      case
        when points between 0 and 9 then 1
        when points between 10 and 24 then 2
        when points between 25 and 59 then 3
        when points between 60 and 99 then 4
        when points between 100 and 149 then 5
        when points between 150 and 224 then 6
        when points between 225 and 299 then 7
        when points between 300 and 399 then 8
        when points between 400 and 499 then 9
        when points between 500 and 599 then 10
        when points between 600 and 699 then 11
        when points between 700 and 799 then 12
        when points between 800 and 899 then 13
        when points between 900 and 999 then 14
        when points between 1000 and 1099 then 15
        when points between 1100 and 1199 then 16
        when points between 1200 and 1299 then 17
        when points between 1300 and 1399 then 18
        when points between 1400 and 1499 then 19
        else 20
      end as level,
      points
    from normalized
  )
  select jsonb_build_object(
    'level', level,
    'name',
      case level
        when 1 then 'Still Packing'
        when 2 then 'Gate Daydreamer'
        when 3 then 'Weekend Wanderer'
        when 4 then 'Carry-On Cadet'
        when 5 then 'Boarding Pass Boss'
        when 6 then 'Itinerary Instigator'
        when 7 then 'Window Seat Warrior'
        when 8 then 'Passport Paparazzi'
        when 9 then 'Layover Legend'
        when 10 then 'Jet Lag Juggler'
        when 11 then 'Terminal Celebrity'
        when 12 then 'Frequent Flyer Flirt'
        when 13 then 'Timezone Tactician'
        when 14 then 'Border-Hopping Icon'
        when 15 then 'Global Gallivanter'
        when 16 then 'Customs Connoisseur'
        when 17 then 'World Tour Royalty'
        when 18 then 'International Mystery'
        when 19 then 'Citizen of Everywhere'
        else 'Main Character Abroad'
      end,
    'minPoints',
      case level
        when 1 then 0
        when 2 then 10
        when 3 then 25
        when 4 then 60
        when 5 then 100
        when 6 then 150
        when 7 then 225
        when 8 then 300
        when 9 then 400
        else (level - 5) * 100
      end,
    'maxPoints',
      case level
        when 1 then 9
        when 2 then 24
        when 3 then 59
        when 4 then 99
        when 5 then 149
        when 6 then 224
        when 7 then 299
        when 8 then 399
        when 9 then 499
        when 20 then null
        else ((level - 5) * 100) + 99
      end
  )
  from level_row;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_points_after_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  owner_id uuid;
begin
  if TG_TABLE_NAME = 'trips' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'user_passport_stamps' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'trip_ideas' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'transportation_items' then
    owner_id := coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id));
  elsif TG_TABLE_NAME = 'itinerary_items' then
    owner_id := coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id));
  elsif TG_TABLE_NAME = 'trip_food_items' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_accommodations' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_budgets' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_expenses' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_idea_reactions' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'news_feed_reactions' then
    owner_id := old.user_id;
  else
    owner_id := null;
  end if;

  if TG_TABLE_NAME = 'itinerary_items'
     and exists (
       select 1 from public.transportation_items
        where transportation_items.itinerary_item_id = old.id
     ) then
    return old;
  end if;

  perform public.record_user_point_event(
    owner_id,
    TG_ARGV[0],
    -1,
    TG_TABLE_NAME,
    old.id,
    jsonb_build_object('action', 'deleted'),
    now(),
    TG_TABLE_NAME || ':' || old.id::text || ':delete'
  );

  return old;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_points_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  owner_id uuid;
begin
  if TG_TABLE_NAME = 'trips' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'feature_suggestions' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'user_passport_stamps' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'trip_ideas' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'transportation_items' then
    owner_id := coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id));
  elsif TG_TABLE_NAME = 'itinerary_items' then
    owner_id := coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id));
  elsif TG_TABLE_NAME = 'trip_food_items' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_accommodations' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_budgets' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_expenses' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_idea_reactions' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'news_feed_reactions' then
    owner_id := new.user_id;
  else
    owner_id := null;
  end if;

  if TG_TABLE_NAME = 'itinerary_items'
     and exists (
       select 1 from public.transportation_items
        where transportation_items.itinerary_item_id = new.id
     ) then
    return new;
  end if;

  perform public.record_user_point_event(
    owner_id,
    TG_ARGV[0],
    TG_ARGV[1]::integer,
    TG_TABLE_NAME,
    new.id,
    jsonb_build_object('action', 'created'),
    coalesce(new.created_at, now()),
    TG_TABLE_NAME || ':' || new.id::text || ':create'
  );

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_points_friendship_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if old.status = 'accepted' then
    perform public.record_user_point_event(
      old.requester_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.addressee_user_id, 'action', 'deleted'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':requester:delete'
    );
    perform public.record_user_point_event(
      old.addressee_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.requester_user_id, 'action', 'deleted'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':addressee:delete'
    );
  end if;

  return old;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_points_friendship_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if TG_OP = 'INSERT' and new.status = 'accepted' then
    perform public.record_user_point_event(
      new.requester_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.addressee_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, new.created_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':requester:accepted'
    );
    perform public.record_user_point_event(
      new.addressee_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.requester_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, new.created_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':addressee:accepted'
    );
    return new;
  end if;

  if TG_OP = 'UPDATE'
     and old.status is distinct from 'accepted'
     and new.status = 'accepted' then
    perform public.record_user_point_event(
      new.requester_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.addressee_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':requester:accepted'
    );
    perform public.record_user_point_event(
      new.addressee_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.requester_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':addressee:accepted'
    );
  elsif TG_OP = 'UPDATE'
     and old.status = 'accepted'
     and new.status is distinct from 'accepted' then
    perform public.record_user_point_event(
      old.requester_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.addressee_user_id, 'action', 'removed'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':requester:removed'
    );
    perform public.record_user_point_event(
      old.addressee_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.requester_user_id, 'action', 'removed'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':addressee:removed'
    );
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_points_trip_expense_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.record_user_point_event(
      old.created_by,
      'expense_deleted',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('action', 'soft_deleted'),
      coalesce(new.deleted_at, now()),
      TG_TABLE_NAME || ':' || old.id::text || ':delete'
    );
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."vaivia_trip_owner"("trip_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select trips.user_id
    from public.trips
   where trips.id = trip_id
   limit 1;
$$;




CREATE OR REPLACE FUNCTION "public"."validate_transportation_item_traveler"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item_trip_id uuid;
begin
  select ti.trip_id
    into item_trip_id
  from public.transportation_items ti
  where ti.id = new.transportation_item_id;

  if item_trip_id is null then
    raise exception 'Transportation item not found.';
  end if;

  if new.trip_id <> item_trip_id then
    raise exception 'Traveler trip_id must match transportation item trip_id.';
  end if;

  if new.user_id is not null and not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = item_trip_id
      and tm.user_id = new.user_id
      and tm.status = 'active'
  ) then
    raise exception 'Selected user must be an active member of this trip.';
  end if;

  if new.family_member_id is not null and not exists (
    select 1
    from public.trip_family_members tfm
    join public.user_family_members ufm on ufm.id = tfm.family_member_id
    where tfm.trip_id = item_trip_id
      and tfm.family_member_id = new.family_member_id
      and tfm.status = 'going'
      and ufm.user_id = new.created_by
  ) then
    raise exception 'Selected family member must be marked as going on this trip by the current user.';
  end if;

  if new.guest_name is not null then
    new.guest_name = nullif(btrim(new.guest_name), '');
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."validate_trip_countdown_target"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  target_trip_id uuid;
begin
  if new.countdown_target_itinerary_item_id is null then
    return new;
  end if;

  select ii.trip_id
    into target_trip_id
  from public.itinerary_items ii
  where ii.id = new.countdown_target_itinerary_item_id;

  if target_trip_id is null then
    raise exception 'Countdown target itinerary item does not exist.';
  end if;

  if target_trip_id <> new.id then
    raise exception 'Countdown target itinerary item must belong to the same trip.';
  end if;

  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."validate_trip_countdown_target_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  target_trip_id uuid;
  target_has_time boolean;
begin
  if new.countdown_target_type is null and new.countdown_target_id is null then
    new.countdown_target_itinerary_item_id := null;
    return new;
  end if;

  if new.countdown_target_type is null or new.countdown_target_id is null then
    raise exception 'Countdown target type and id must both be set, or both be null.';
  end if;

  if new.countdown_target_type = 'itinerary_item' then
    select ii.trip_id,
           ii.start_time is not null
      into target_trip_id,
           target_has_time
    from public.itinerary_items ii
    where ii.id = new.countdown_target_id;

    if target_trip_id is null then
      raise exception 'Countdown target itinerary item does not exist.';
    end if;

    if target_trip_id <> new.id then
      raise exception 'Countdown target itinerary item must belong to the same trip.';
    end if;

    if target_has_time is not true then
      raise exception 'Countdown target itinerary item must have a specific start time.';
    end if;

    new.countdown_target_itinerary_item_id := new.countdown_target_id;
    return new;
  end if;

  if new.countdown_target_type = 'transportation_item' then
    select ti.trip_id,
           ti.departure_time is not null
      into target_trip_id,
           target_has_time
    from public.transportation_items ti
    where ti.id = new.countdown_target_id;

    if target_trip_id is null then
      raise exception 'Countdown target transportation item does not exist.';
    end if;

    if target_trip_id <> new.id then
      raise exception 'Countdown target transportation item must belong to the same trip.';
    end if;

    if target_has_time is not true then
      raise exception 'Countdown target transportation item must have a specific departure time.';
    end if;

    new.countdown_target_itinerary_item_id := null;
    return new;
  end if;

  raise exception 'Unsupported countdown target type.';
end;
$$;




CREATE OR REPLACE FUNCTION "public"."visible_trip_member_ids"("target_trip_id" "uuid") RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tm.user_id
  from public.trip_members tm
  where tm.trip_id = target_trip_id
    and tm.status = 'active';
$$;




CREATE TABLE IF NOT EXISTS "public"."airports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ident" "text",
    "type" "text",
    "name" "text" NOT NULL,
    "latitude_deg" numeric,
    "longitude_deg" numeric,
    "elevation_ft" integer,
    "continent" "text",
    "iso_country" "text",
    "iso_region" "text",
    "municipality" "text",
    "scheduled_service" boolean,
    "gps_code" "text",
    "iata_code" "text",
    "local_code" "text",
    "home_link" "text",
    "wikipedia_link" "text",
    "keywords" "text",
    "source" "text" DEFAULT 'ourairports'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."budget_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text",
    "estimated_amount" numeric(10,2) DEFAULT 0,
    "actual_amount" numeric(10,2) DEFAULT 0,
    "currency" "text" DEFAULT 'CAD'::"text",
    "paid_status" "text" DEFAULT 'unpaid'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_private" boolean DEFAULT false NOT NULL,
    CONSTRAINT "budget_items_paid_status_check" CHECK (("paid_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text", 'reimbursable'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."category_color_options" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "hex" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    CONSTRAINT "category_color_options_hex_check" CHECK (("hex" ~ '^#[0-9A-Fa-f]{6}$'::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "invitation_id" "uuid",
    "invited_start_date" "date",
    "invited_end_date" "date",
    "confirmed_start_date" "date",
    "confirmed_end_date" "date",
    "personal_start_date" "date",
    "personal_end_date" "date",
    CONSTRAINT "trip_members_confirmed_dates_check" CHECK ((("confirmed_end_date" IS NULL) OR ("confirmed_start_date" IS NULL) OR ("confirmed_end_date" >= "confirmed_start_date"))),
    CONSTRAINT "trip_members_invited_dates_check" CHECK ((("invited_end_date" IS NULL) OR ("invited_start_date" IS NULL) OR ("invited_end_date" >= "invited_start_date"))),
    CONSTRAINT "trip_members_personal_dates_check" CHECK ((("personal_end_date" IS NULL) OR ("personal_start_date" IS NULL) OR ("personal_end_date" >= "personal_start_date"))),
    CONSTRAINT "trip_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))),
    CONSTRAINT "trip_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'left'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "destination" "text",
    "start_date" "date",
    "end_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cover_image_url" "text",
    "archived_at" timestamp with time zone,
    "archived_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "countdown_target_itinerary_item_id" "uuid",
    "countdown_target_type" "text",
    "countdown_target_id" "uuid",
    "slug" "text" NOT NULL,
    "cover_image_source" "text",
    "cover_image_unsplash_id" "text",
    "cover_image_photographer_name" "text",
    "cover_image_photographer_url" "text",
    "cover_image_storage_path" "text",
    CONSTRAINT "trips_countdown_target_pair_check" CHECK (((("countdown_target_type" IS NULL) AND ("countdown_target_id" IS NULL)) OR (("countdown_target_type" IS NOT NULL) AND ("countdown_target_id" IS NOT NULL)))),
    CONSTRAINT "trips_countdown_target_type_check" CHECK ((("countdown_target_type" IS NULL) OR ("countdown_target_type" = ANY (ARRAY['itinerary_item'::"text", 'transportation_item'::"text"])))),
    CONSTRAINT "trips_cover_image_source_check" CHECK ((("cover_image_source" IS NULL) OR ("cover_image_source" = ANY (ARRAY['upload'::"text", 'unsplash'::"text", 'external'::"text"])))),
    CONSTRAINT "trips_slug_format_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);




COMMENT ON COLUMN "public"."trips"."cover_image_url" IS 'Optional custom cover image URL for the trip. Used before fallback/generated destination cover images.';



COMMENT ON COLUMN "public"."trips"."countdown_target_itinerary_item_id" IS 'Optional selected itinerary item for the trip countdown. NULL means use the first itinerary item after 00:00 on trips.start_date.';



COMMENT ON COLUMN "public"."trips"."countdown_target_type" IS 'Optional countdown target kind. NULL means auto-select the first timed item after 00:00 on trips.start_date. Supported values: itinerary_item, transportation_item.';



COMMENT ON COLUMN "public"."trips"."countdown_target_id" IS 'Optional countdown target row id. Interpreted according to countdown_target_type. For transportation_item this references public.transportation_items.id.';



COMMENT ON COLUMN "public"."trips"."cover_image_source" IS 'Origin of cover_image_url: upload, unsplash, external, or NULL for legacy/fallback.';



COMMENT ON COLUMN "public"."trips"."cover_image_unsplash_id" IS 'Unsplash photo ID when cover_image_source is unsplash; used for API tracking.';



COMMENT ON COLUMN "public"."trips"."cover_image_photographer_name" IS 'Photographer display name required for Unsplash attribution.';



COMMENT ON COLUMN "public"."trips"."cover_image_photographer_url" IS 'Attributed photographer profile URL, including Unsplash UTM parameters when applicable.';



COMMENT ON COLUMN "public"."trips"."cover_image_storage_path" IS 'Private Supabase Storage object path for uploaded trip covers. Never store a signed URL here.';



CREATE TABLE IF NOT EXISTS "public"."user_friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "addressee_identifier" "text" NOT NULL,
    "addressee_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "blocked_by_user_id" "uuid",
    CONSTRAINT "user_friendships_not_self_check" CHECK ((("addressee_user_id" IS NULL) OR ("requester_user_id" <> "addressee_user_id"))),
    CONSTRAINT "user_friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text", 'declined'::"text", 'blocked'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "username" "text",
    "email" "text",
    "avatar_url" "text",
    "join_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "terms_accepted_at" timestamp with time zone,
    "marketing_emails_consent" boolean DEFAULT false NOT NULL,
    "marketing_emails_consented_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    "biometric_login_enabled" boolean DEFAULT false NOT NULL,
    "biometric_login_enabled_at" timestamp with time zone,
    "role" "text" DEFAULT 'basic_user'::"text" NOT NULL,
    "marketing_emails_consent_decided_at" timestamp with time zone,
    "terms_declined_at" timestamp with time zone,
    "terms_declined_version_id" "uuid",
    "terms_decline_delete_after" timestamp with time zone,
    "account_deletion_requested_at" timestamp with time zone,
    "data_center_preference" "text" DEFAULT 'supabase-current'::"text" NOT NULL,
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['basic_user'::"text", 'super_admin'::"text"]))),
    CONSTRAINT "user_profiles_username_format" CHECK ((("username" IS NULL) OR ("username" ~ '^[A-Za-z0-9_]+$'::"text"))),
    CONSTRAINT "user_profiles_username_length" CHECK ((("username" IS NULL) OR (("char_length"("username") >= 3) AND ("char_length"("username") <= 30))))
);




COMMENT ON COLUMN "public"."user_profiles"."terms_accepted_at" IS 'Timestamp when the user accepted VAIVIA terms during signup/onboarding.';



COMMENT ON COLUMN "public"."user_profiles"."marketing_emails_consent" IS 'Whether the user opted in to marketing emails about promotions and app updates.';



COMMENT ON COLUMN "public"."user_profiles"."marketing_emails_consented_at" IS 'Timestamp when the user opted in to marketing emails, if applicable.';



COMMENT ON COLUMN "public"."user_profiles"."onboarding_completed_at" IS 'Timestamp when the user completed the first VAIVIA onboarding flow.';



COMMENT ON COLUMN "public"."user_profiles"."biometric_login_enabled" IS 'Whether the user enabled biometric/passkey-style login preferences for supported PWA devices.';



COMMENT ON COLUMN "public"."user_profiles"."biometric_login_enabled_at" IS 'Timestamp when biometric/passkey-style login preferences were enabled, if applicable.';



COMMENT ON COLUMN "public"."user_profiles"."marketing_emails_consent_decided_at" IS 'Timestamp when the user explicitly chose yes or no for marketing email consent.';



COMMENT ON COLUMN "public"."user_profiles"."terms_declined_at" IS 'Timestamp when the user declined the current required terms version.';



COMMENT ON COLUMN "public"."user_profiles"."terms_decline_delete_after" IS 'Date after which an account that declined required terms may be eligible for deletion.';



COMMENT ON COLUMN "public"."user_profiles"."data_center_preference" IS 'User-facing data centre preference. Currently limited to the active Supabase project region.';



CREATE OR REPLACE VIEW "public"."connected_public_user_profiles" AS
 SELECT "id",
    "first_name",
    "last_name",
    "username",
    "avatar_url",
    "role",
    "join_date",
    "created_at"
   FROM "public"."user_profiles"
  WHERE (("id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."user_friendships" "friendships"
          WHERE (("friendships"."status" = 'accepted'::"text") AND ((("friendships"."requester_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."addressee_user_id" = "user_profiles"."id")) OR (("friendships"."addressee_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."requester_user_id" = "user_profiles"."id")))))) OR (EXISTS ( SELECT 1
           FROM ("public"."trip_members" "viewer_membership"
             JOIN "public"."trip_members" "profile_membership" ON (("profile_membership"."trip_id" = "viewer_membership"."trip_id")))
          WHERE (("viewer_membership"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer_membership"."status" = 'active'::"text") AND ("profile_membership"."user_id" = "user_profiles"."id") AND ("profile_membership"."status" = 'active'::"text")))) OR (EXISTS ( SELECT 1
           FROM ("public"."trips"
             LEFT JOIN "public"."trip_members" "profile_membership" ON ((("profile_membership"."trip_id" = "trips"."id") AND ("profile_membership"."user_id" = "user_profiles"."id") AND ("profile_membership"."status" = 'active'::"text"))))
          WHERE (("trips"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("trips"."user_id" = "user_profiles"."id") OR ("profile_membership"."user_id" IS NOT NULL))))) OR (EXISTS ( SELECT 1
           FROM ("public"."trips"
             JOIN "public"."trip_members" "viewer_membership" ON (("viewer_membership"."trip_id" = "trips"."id")))
          WHERE (("viewer_membership"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer_membership"."status" = 'active'::"text") AND ("trips"."user_id" = "user_profiles"."id")))));




COMMENT ON VIEW "public"."connected_public_user_profiles" IS 'Email-free profile identity rows visible to connected users through accepted friendships or shared active trips.';



CREATE TABLE IF NOT EXISTS "public"."countries" (
    "alpha2" "text" NOT NULL,
    "alpha3" "text",
    "common_name" "text" NOT NULL,
    "official_name" "text",
    "flag_emoji" "text",
    "flag_svg_url" "text",
    "flag_png_url" "text",
    "region" "text",
    "subregion" "text",
    "currencies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rest_countries_payload" "jsonb",
    "source" "text" DEFAULT 'rest_countries'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_language_code" "text",
    "primary_language_name" "text",
    "languages" "jsonb",
    "capital" "text",
    "capital_lat" numeric,
    "capital_lng" numeric,
    "arrival_label" "text",
    "arrival_label_source" "text" DEFAULT 'fallback'::"text",
    "default_entry_airport_id" "uuid",
    "welcome_label" "text",
    "welcome_label_source" "text" DEFAULT 'fallback'::"text" NOT NULL,
    CONSTRAINT "countries_alpha2_check" CHECK (("alpha2" ~ '^[A-Z]{2}$'::"text")),
    CONSTRAINT "countries_alpha3_check" CHECK ((("alpha3" IS NULL) OR ("alpha3" ~ '^[A-Z]{3}$'::"text")))
);




CREATE TABLE IF NOT EXISTS "public"."currency_exchange_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rate_date" "date" NOT NULL,
    "base_currency" "text" NOT NULL,
    "target_currency" "text" NOT NULL,
    "rate" numeric(18,8) NOT NULL,
    "provider" "text" DEFAULT 'frankfurter'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "currency_exchange_rates_base_currency_check" CHECK (("base_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "currency_exchange_rates_rate_check" CHECK (("rate" > (0)::numeric)),
    CONSTRAINT "currency_exchange_rates_target_currency_check" CHECK (("target_currency" ~ '^[A-Z]{3}$'::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."feature_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "suggestion_type" "text" DEFAULT 'feature'::"text" NOT NULL,
    "title" "text",
    "message" "text" NOT NULL,
    "current_path" "text",
    "contact_email" "text",
    "user_agent" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feature_suggestions_message_not_blank_check" CHECK (("btrim"("message") <> ''::"text")),
    CONSTRAINT "feature_suggestions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'qa'::"text", 'archived'::"text", 'implemented'::"text"]))),
    CONSTRAINT "feature_suggestions_title_not_blank_check" CHECK ((("title" IS NULL) OR ("btrim"("title") <> ''::"text"))),
    CONSTRAINT "feature_suggestions_type_check" CHECK (("suggestion_type" = ANY (ARRAY['feature'::"text", 'bug'::"text", 'feedback'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."itinerary_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'activity'::"text",
    "status" "text" DEFAULT 'tentative'::"text",
    "item_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "location" "text",
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "end_date" "date",
    "timezone" "text",
    "timezone_source" "text" DEFAULT 'manual'::"text",
    "url" "text",
    "google_place_id" "text",
    "location_lat" double precision,
    "location_lng" double precision,
    "formatted_address" "text",
    "source_idea_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_private" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category_id" "uuid",
    "trip_leg_id" "uuid",
    "audience_mode" "text" DEFAULT 'everyone'::"text" NOT NULL,
    CONSTRAINT "itinerary_items_audience_mode_check" CHECK (("audience_mode" = ANY (ARRAY['everyone'::"text", 'custom'::"text", 'just_me'::"text"]))),
    CONSTRAINT "itinerary_items_status_check" CHECK (("status" = ANY (ARRAY['tentative'::"text", 'confirmed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."language_welcome_labels" (
    "language_code" "text" NOT NULL,
    "language_name" "text",
    "welcome_label" "text" NOT NULL,
    "source" "text" DEFAULT 'curated'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "language_welcome_labels_language_code_check" CHECK (("language_code" ~ '^[a-z]{3}$'::"text")),
    CONSTRAINT "language_welcome_labels_welcome_label_check" CHECK (("length"("btrim"("welcome_label")) > 0))
);




CREATE TABLE IF NOT EXISTS "public"."news_feed_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_key" "text" NOT NULL,
    "user_id" "uuid",
    "actor_user_id" "uuid",
    "audience_user_id" "uuid",
    "post_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "meta" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);




CREATE TABLE IF NOT EXISTS "public"."news_feed_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_key" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "trip_id" "uuid",
    "invitation_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "archived_at" timestamp with time zone,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['trip_invite_received'::"text", 'trip_invite_accepted'::"text", 'trip_invite_declined'::"text", 'trip_updated'::"text", 'trip_item_added'::"text", 'trip_item_updated'::"text", 'trip_item_deleted'::"text", 'trip_slug_changed'::"text", 'friend_request_received'::"text", 'friend_request_accepted'::"text", 'passport_stamp_share_received'::"text", 'passport_stamp_share_accepted'::"text", 'passport_stamp_share_declined'::"text", 'passport_stamp_added'::"text", 'feature_suggestion_implemented'::"text", 'terms_updated'::"text", 'terms_acceptance_required'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."terms_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_number" integer NOT NULL,
    "title" "text" DEFAULT 'VAIVIA Terms and Privacy Notice'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "change_type" "text" DEFAULT 'major'::"text" NOT NULL,
    "requires_acceptance" boolean DEFAULT true NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "terms_versions_change_type_check" CHECK (("change_type" = ANY (ARRAY['major'::"text", 'minor'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."transportation_item_travelers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transportation_item_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "family_member_id" "uuid",
    "guest_name" "text",
    "traveler_note" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transportation_item_travelers_one_traveler_check" CHECK (((((("user_id" IS NOT NULL))::integer + (("family_member_id" IS NOT NULL))::integer) + ((("guest_name" IS NOT NULL) AND ("btrim"("guest_name") <> ''::"text")))::integer) = 1))
);




COMMENT ON TABLE "public"."transportation_item_travelers" IS 'People that a transportation item applies to: active trip users, saved family members, or one-off guest names.';



CREATE TABLE IF NOT EXISTS "public"."transportation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "itinerary_item_id" "uuid",
    "title" "text",
    "transport_type" "text" DEFAULT 'flight'::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text",
    "provider_name" "text",
    "provider_code" "text",
    "transport_number" "text",
    "departure_date" "date",
    "departure_time" time without time zone,
    "departure_timezone" "text",
    "departure_location" "text",
    "departure_formatted_address" "text",
    "departure_google_place_id" "text",
    "departure_lat" double precision,
    "departure_lng" double precision,
    "departure_terminal" "text",
    "departure_gate" "text",
    "departure_platform" "text",
    "arrival_date" "date",
    "arrival_time" time without time zone,
    "arrival_timezone" "text",
    "arrival_location" "text",
    "arrival_formatted_address" "text",
    "arrival_google_place_id" "text",
    "arrival_lat" double precision,
    "arrival_lng" double precision,
    "arrival_terminal" "text",
    "arrival_gate" "text",
    "arrival_platform" "text",
    "seat_number" "text",
    "cabin_class" "text",
    "fare_class" "text",
    "baggage_info" "text",
    "pickup_location" "text",
    "pickup_formatted_address" "text",
    "pickup_google_place_id" "text",
    "pickup_lat" double precision,
    "pickup_lng" double precision,
    "dropoff_location" "text",
    "dropoff_formatted_address" "text",
    "dropoff_google_place_id" "text",
    "dropoff_lat" double precision,
    "dropoff_lng" double precision,
    "cost" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'CAD'::"text",
    "paid_status" "text" DEFAULT 'unpaid'::"text",
    "booking_url" "text",
    "provider_url" "text",
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "is_private" boolean DEFAULT false NOT NULL,
    "reservation_code" "text",
    "trip_leg_id" "uuid",
    "audience_mode" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "route_stops" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "preferred_ride_provider" "text",
    CONSTRAINT "transportation_items_audience_mode_check" CHECK (("audience_mode" = ANY (ARRAY['everyone'::"text", 'custom'::"text", 'just_me'::"text"]))),
    CONSTRAINT "transportation_items_paid_status_check" CHECK (("paid_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text", 'partial'::"text", 'refunded'::"text"]))),
    CONSTRAINT "transportation_items_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'booked'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text"]))),
    CONSTRAINT "transportation_items_transport_type_check" CHECK (("transport_type" = ANY (ARRAY['flight'::"text", 'train'::"text", 'bus'::"text", 'ferry'::"text", 'car'::"text", 'rental_car'::"text", 'rideshare'::"text", 'taxi'::"text", 'subway'::"text", 'tram'::"text", 'walking'::"text", 'other'::"text"])))
);




COMMENT ON COLUMN "public"."transportation_items"."reservation_code" IS 'Reservation code or PNR/reference code for the transportation booking.';



CREATE TABLE IF NOT EXISTS "public"."travel_email_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'resend'::"text" NOT NULL,
    "provider_email_id" "text" NOT NULL,
    "message_id" "text",
    "sender_email" "text",
    "recipient_email" "text",
    "subject" "text",
    "status" "public"."travel_email_import_status" DEFAULT 'received'::"public"."travel_email_import_status" NOT NULL,
    "raw_text" "text",
    "raw_html" "text",
    "attachment_count" integer DEFAULT 0 NOT NULL,
    "extraction_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);




CREATE TABLE IF NOT EXISTS "public"."trip_accommodations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "hotel_name" "text" NOT NULL,
    "google_place_id" "text",
    "google_maps_url" "text",
    "address" "text",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "region" "text",
    "country" "text",
    "postal_code" "text",
    "latitude" double precision,
    "longitude" double precision,
    "check_in_date" "date" NOT NULL,
    "check_out_date" "date" NOT NULL,
    "check_in_time_start" time without time zone,
    "check_in_time_end" time without time zone,
    "accommodation_type" "public"."accommodation_type" DEFAULT 'hotel'::"public"."accommodation_type" NOT NULL,
    "status" "public"."accommodation_status" DEFAULT 'tentative'::"public"."accommodation_status" NOT NULL,
    "website" "text",
    "is_private" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trip_leg_id" "uuid",
    "audience_mode" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "cost" numeric(12,2),
    "currency" "text",
    CONSTRAINT "trip_accommodations_audience_mode_check" CHECK (("audience_mode" = ANY (ARRAY['everyone'::"text", 'custom'::"text", 'just_me'::"text"]))),
    CONSTRAINT "trip_accommodations_checkout_after_checkin" CHECK (("check_out_date" > "check_in_date")),
    CONSTRAINT "trip_accommodations_cost_check" CHECK ((("cost" IS NULL) OR ("cost" > (0)::numeric))),
    CONSTRAINT "trip_accommodations_currency_check" CHECK ((("currency" IS NULL) OR ("currency" ~ '^[A-Z]{3}$'::"text"))),
    CONSTRAINT "trip_accommodations_place_required_for_standard_types" CHECK ((("accommodation_type" = ANY (ARRAY['friend_family'::"public"."accommodation_type", 'other'::"public"."accommodation_type"])) OR ("google_place_id" IS NOT NULL))),
    CONSTRAINT "trip_accommodations_time_window_valid" CHECK ((("check_in_time_start" IS NULL) OR ("check_in_time_end" IS NULL) OR ("check_in_time_end" > "check_in_time_start"))),
    CONSTRAINT "trip_accommodations_website_url_valid" CHECK ((("website" IS NULL) OR ("website" ~* '^https?://.+'::"text")))
);




CREATE TABLE IF NOT EXISTS "public"."trip_budget_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "linked_expense_category" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_budget_categories_linked_expense_category_check" CHECK (("linked_expense_category" = ANY (ARRAY['accommodations'::"text", 'transportation'::"text", 'entertainment'::"text", 'food'::"text", 'drink'::"text", 'souvenirs'::"text", 'other'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trip_budget_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "linked_expense_category" "text" NOT NULL,
    "planned_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_budget_line_items_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "trip_budget_line_items_linked_expense_category_check" CHECK (("linked_expense_category" = ANY (ARRAY['accommodations'::"text", 'transportation'::"text", 'entertainment'::"text", 'food'::"text", 'drink'::"text", 'souvenirs'::"text", 'other'::"text"]))),
    CONSTRAINT "trip_budget_line_items_planned_amount_check" CHECK (("planned_amount" >= (0)::numeric))
);




CREATE TABLE IF NOT EXISTS "public"."trip_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "reporting_currency" "text" DEFAULT 'CAD'::"text" NOT NULL,
    "total_budget_amount" numeric(12,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_budgets_reporting_currency_check" CHECK (("reporting_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "trip_budgets_total_budget_amount_check" CHECK ((("total_budget_amount" IS NULL) OR ("total_budget_amount" >= (0)::numeric)))
);




CREATE TABLE IF NOT EXISTS "public"."trip_expense_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "storage_bucket" "text" DEFAULT 'expense-receipts'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint,
    "uploaded_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_expense_receipts_file_size_check" CHECK ((("file_size_bytes" IS NULL) OR ("file_size_bytes" <= 10485760))),
    CONSTRAINT "trip_expense_receipts_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text", 'application/pdf'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trip_expense_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "participant_kind" "text" NOT NULL,
    "trip_member_id" "uuid",
    "invitation_id" "uuid",
    "family_member_id" "uuid",
    "user_id" "uuid",
    "guest_name" "text",
    "split_amount" numeric(12,2) NOT NULL,
    "split_percentage" numeric(7,4),
    "currency" "text" NOT NULL,
    "amount_in_reporting_currency" numeric(12,2),
    "is_included" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_expense_splits_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "trip_expense_splits_participant_kind_check" CHECK (("participant_kind" = ANY (ARRAY['member'::"text", 'invitation'::"text", 'family_member'::"text", 'guest'::"text"]))),
    CONSTRAINT "trip_expense_splits_split_amount_check" CHECK (("split_amount" >= (0)::numeric)),
    CONSTRAINT "trip_expense_splits_split_percentage_check" CHECK ((("split_percentage" IS NULL) OR (("split_percentage" >= (0)::numeric) AND ("split_percentage" <= (100)::numeric))))
);




CREATE TABLE IF NOT EXISTS "public"."trip_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "expense_date" "date" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "reporting_currency" "text" NOT NULL,
    "fetched_exchange_rate" numeric(18,8),
    "manual_exchange_rate" numeric(18,8),
    "exchange_rate_used" numeric(18,8) NOT NULL,
    "exchange_rate_is_manual" boolean DEFAULT false NOT NULL,
    "amount_in_reporting_currency" numeric(12,2) GENERATED ALWAYS AS ("round"(("amount" * "exchange_rate_used"), 2)) STORED,
    "paid_by_trip_member_id" "uuid",
    "paid_by_invitation_id" "uuid",
    "paid_by_family_member_id" "uuid",
    "paid_by_user_id" "uuid",
    "paid_by_guest_name" "text",
    "split_method" "text" DEFAULT 'equal'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "transportation_item_id" "uuid",
    "itinerary_event_id" "uuid",
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "accommodation_id" "uuid",
    "original_amount" numeric(12,2),
    "original_currency" "text",
    "transaction_date" "date",
    "budget_category_id" "uuid",
    CONSTRAINT "trip_expenses_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "trip_expenses_category_check" CHECK (("category" = ANY (ARRAY['accommodations'::"text", 'transportation'::"text", 'entertainment'::"text", 'food'::"text", 'drink'::"text", 'souvenirs'::"text", 'other'::"text"]))),
    CONSTRAINT "trip_expenses_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "trip_expenses_exchange_rate_used_check" CHECK (("exchange_rate_used" > (0)::numeric)),
    CONSTRAINT "trip_expenses_fetched_exchange_rate_check" CHECK ((("fetched_exchange_rate" IS NULL) OR ("fetched_exchange_rate" > (0)::numeric))),
    CONSTRAINT "trip_expenses_manual_exchange_rate_check" CHECK ((("manual_exchange_rate" IS NULL) OR ("manual_exchange_rate" > (0)::numeric))),
    CONSTRAINT "trip_expenses_original_amount_check" CHECK ((("original_amount" IS NULL) OR ("original_amount" > (0)::numeric))),
    CONSTRAINT "trip_expenses_original_currency_check" CHECK ((("original_currency" IS NULL) OR ("original_currency" ~ '^[A-Z]{3}$'::"text"))),
    CONSTRAINT "trip_expenses_reporting_currency_check" CHECK (("reporting_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "trip_expenses_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'transportation'::"text", 'itinerary_event'::"text", 'accommodation'::"text"]))),
    CONSTRAINT "trip_expenses_split_method_check" CHECK (("split_method" = ANY (ARRAY['equal'::"text", 'exact'::"text", 'percentage'::"text"])))
);




COMMENT ON COLUMN "public"."trip_expenses"."original_amount" IS 'Original transaction amount entered by the user. Kept alongside amount for backward compatibility.';



COMMENT ON COLUMN "public"."trip_expenses"."original_currency" IS 'Original ISO 4217 transaction currency entered by the user. Never store currency symbols here.';



COMMENT ON COLUMN "public"."trip_expenses"."transaction_date" IS 'Transaction date used when selecting and freezing the exchange_rate_used for this expense.';



CREATE TABLE IF NOT EXISTS "public"."trip_family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "family_member_id" "uuid" NOT NULL,
    "added_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "status" "text" DEFAULT 'going'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_family_members_status_check" CHECK (("status" = ANY (ARRAY['going'::"text", 'not_going'::"text", 'removed'::"text"])))
);




COMMENT ON TABLE "public"."trip_family_members" IS 'Links saved non-user family members to trips as going/not going.';



CREATE TABLE IF NOT EXISTS "public"."trip_food_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "region" "text",
    "personal_note" "text",
    "google_place_id" "text",
    "formatted_address" "text",
    "location_lat" double precision,
    "location_lng" double precision,
    "primary_place_type" "text",
    "place_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "business_status" "text",
    "regular_opening_hours" "jsonb",
    "website_url" "text",
    "phone_number" "text",
    "google_maps_url" "text",
    "facebook_url" "text",
    "instagram_url" "text",
    "meal_categories" "text"[] DEFAULT ARRAY['any'::"text"] NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_food_items_coordinates_check" CHECK (((("location_lat" IS NULL) OR (("location_lat" >= ('-90'::integer)::double precision) AND ("location_lat" <= (90)::double precision))) AND (("location_lng" IS NULL) OR (("location_lng" >= ('-180'::integer)::double precision) AND ("location_lng" <= (180)::double precision))))),
    CONSTRAINT "trip_food_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['place'::"text", 'food'::"text"]))),
    CONSTRAINT "trip_food_items_meals_allowed" CHECK ((("meal_categories" <@ ARRAY['any'::"text", 'breakfast'::"text", 'brunch'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text", 'coffee'::"text", 'drinks'::"text", 'late_night'::"text", 'grocery_store'::"text"]) AND ("cardinality"("meal_categories") > 0) AND (NOT (('any'::"text" = ANY ("meal_categories")) AND ("cardinality"("meal_categories") > 1))))),
    CONSTRAINT "trip_food_items_name_check" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "trip_food_items_place_required" CHECK ((("item_type" <> 'place'::"text") OR (("google_place_id" IS NOT NULL) AND ("length"("btrim"("google_place_id")) > 0) AND ("formatted_address" IS NOT NULL) AND ("length"("btrim"("formatted_address")) > 0)))),
    CONSTRAINT "trip_food_items_urls_check" CHECK (((("website_url" IS NULL) OR ("website_url" ~* '^https?://'::"text")) AND (("google_maps_url" IS NULL) OR ("google_maps_url" ~* '^https?://'::"text")) AND (("facebook_url" IS NULL) OR ("facebook_url" ~* '^https?://'::"text")) AND (("instagram_url" IS NULL) OR ("instagram_url" ~* '^https?://'::"text"))))
);




CREATE TABLE IF NOT EXISTS "public"."trip_food_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "food_item_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "reaction" "text" NOT NULL,
    "score" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_food_reactions_reaction_check" CHECK (("reaction" = ANY (ARRAY['heart'::"text", 'thumbs_up'::"text", 'thumbs_down'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trip_food_tried" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "food_item_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "tried_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."trip_idea_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction" "text" NOT NULL,
    "score" integer GENERATED ALWAYS AS (
CASE "reaction"
    WHEN 'heart'::"text" THEN 2
    WHEN 'thumbs_up'::"text" THEN 1
    WHEN 'thumbs_down'::"text" THEN '-1'::integer
    ELSE 0
END) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_idea_reactions_reaction_check" CHECK (("reaction" = ANY (ARRAY['heart'::"text", 'thumbs_up'::"text", 'thumbs_down'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trip_ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "days_of_week" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "time_of_day" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    "formatted_address" "text",
    "google_place_id" "text",
    "location_lat" double precision,
    "location_lng" double precision,
    "timezone" "text",
    "timezone_source" "text" DEFAULT 'manual'::"text",
    "url" "text",
    "estimated_cost" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'CAD'::"text",
    "sort_order" integer DEFAULT 0,
    "ticket_policy" "text" DEFAULT 'any'::"text",
    "age_policy" "text" DEFAULT 'all_ages'::"text",
    "dress_code" "text",
    "is_24_hours" boolean DEFAULT false NOT NULL,
    "location_city" "text",
    "location_region" "text",
    "location_country" "text",
    "location_country_code" "text",
    "location_postal_code" "text",
    "is_private" boolean DEFAULT false NOT NULL,
    "attended" boolean DEFAULT false NOT NULL,
    "trip_leg_id" "uuid",
    CONSTRAINT "trip_ideas_age_policy_check" CHECK (("age_policy" = ANY (ARRAY['all_ages'::"text", 'nineteen_plus'::"text"]))),
    CONSTRAINT "trip_ideas_days_of_week_allowed" CHECK (("days_of_week" <@ ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text", 'saturday'::"text", 'sunday'::"text"])),
    CONSTRAINT "trip_ideas_ticket_policy_check" CHECK (("ticket_policy" = ANY (ARRAY['free'::"text", 'advance_ticket'::"text", 'door_ticket'::"text", 'any'::"text"]))),
    CONSTRAINT "trip_ideas_time_of_day_allowed" CHECK (("time_of_day" <@ ARRAY['early_morning'::"text", 'morning'::"text", 'afternoon'::"text", 'evening'::"text", 'late_night'::"text"])),
    CONSTRAINT "trip_ideas_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);




CREATE TABLE IF NOT EXISTS "public"."trip_invitation_legs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "trip_leg_id" "uuid" NOT NULL,
    "is_included" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




COMMENT ON TABLE "public"."trip_invitation_legs" IS 'Legs included in a specific trip invitation.';



CREATE TABLE IF NOT EXISTS "public"."trip_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "invited_user_id" "uuid",
    "invited_email" "text",
    "invited_username" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "consent_confirmed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "invitation_scope" "text" DEFAULT 'whole_trip'::"text" NOT NULL,
    "invited_start_date" "date",
    "invited_end_date" "date",
    "accepted_start_date" "date",
    "accepted_end_date" "date",
    "accepted_personal_start_date" "date",
    "accepted_personal_end_date" "date",
    CONSTRAINT "trip_invitations_accepted_dates_check" CHECK ((("accepted_end_date" IS NULL) OR ("accepted_start_date" IS NULL) OR ("accepted_end_date" >= "accepted_start_date"))),
    CONSTRAINT "trip_invitations_has_invitee" CHECK ((("invited_user_id" IS NOT NULL) OR ("invited_email" IS NOT NULL) OR ("invited_username" IS NOT NULL))),
    CONSTRAINT "trip_invitations_invitation_scope_check" CHECK (("invitation_scope" = ANY (ARRAY['whole_trip'::"text", 'custom_dates'::"text", 'selected_legs'::"text"]))),
    CONSTRAINT "trip_invitations_invited_dates_check" CHECK ((("invited_end_date" IS NULL) OR ("invited_start_date" IS NULL) OR ("invited_end_date" >= "invited_start_date"))),
    CONSTRAINT "trip_invitations_personal_dates_check" CHECK ((("accepted_personal_end_date" IS NULL) OR ("accepted_personal_start_date" IS NULL) OR ("accepted_personal_end_date" >= "accepted_personal_start_date"))),
    CONSTRAINT "trip_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."trip_item_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "participant_kind" "text" DEFAULT 'member'::"text" NOT NULL,
    "trip_member_id" "uuid",
    "user_id" "uuid",
    "invitation_id" "uuid",
    "family_member_id" "uuid",
    "guest_name" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_item_participants_check" CHECK (("num_nonnulls"("trip_member_id", "user_id", "invitation_id", "family_member_id", "guest_name") = 1)),
    CONSTRAINT "trip_item_participants_item_type_check" CHECK (("item_type" = ANY (ARRAY['itinerary'::"text", 'transportation'::"text", 'accommodation'::"text"]))),
    CONSTRAINT "trip_item_participants_participant_kind_check" CHECK (("participant_kind" = ANY (ARRAY['member'::"text", 'invitation'::"text", 'family_member'::"text", 'guest'::"text", 'user'::"text"])))
);




COMMENT ON TABLE "public"."trip_item_participants" IS 'Shared audience/participant rows for itinerary, transportation, and accommodation items.';



CREATE TABLE IF NOT EXISTS "public"."user_family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "relationship" "text",
    "avatar_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_family_members_name_not_blank" CHECK (("btrim"("name") <> ''::"text"))
);




COMMENT ON TABLE "public"."user_family_members" IS 'Non-user family members or managed travellers saved to a user account.';



CREATE OR REPLACE VIEW "public"."trip_item_participants_display" WITH ("security_invoker"='true') AS
 SELECT "tip"."id",
    "tip"."trip_id",
    "tip"."item_type",
    "tip"."item_id",
    "tip"."participant_kind",
    "tip"."trip_member_id",
    "tip"."user_id",
    "tip"."invitation_id",
    "tip"."family_member_id",
    "tip"."guest_name",
    COALESCE(("up"."first_name" ||
        CASE
            WHEN ("up"."last_name" IS NOT NULL) THEN (' '::"text" || "up"."last_name")
            ELSE ''::"text"
        END), "up"."username", "up"."email", "ti"."invited_username", "ti"."invited_email", "ufm"."name", "tip"."guest_name") AS "display_name",
    COALESCE("up"."avatar_url", "ufm"."avatar_url") AS "avatar_url",
        CASE
            WHEN ("tip"."trip_member_id" IS NOT NULL) THEN 'accepted'::"text"
            WHEN ("tip"."user_id" IS NOT NULL) THEN 'accepted'::"text"
            WHEN ("tip"."invitation_id" IS NOT NULL) THEN COALESCE("ti"."status", 'invited'::"text")
            WHEN ("tip"."family_member_id" IS NOT NULL) THEN 'family_member'::"text"
            ELSE 'guest'::"text"
        END AS "participant_status",
    "tip"."created_at"
   FROM (((("public"."trip_item_participants" "tip"
     LEFT JOIN "public"."trip_members" "tm" ON (("tm"."id" = "tip"."trip_member_id")))
     LEFT JOIN "public"."user_profiles" "up" ON (("up"."id" = COALESCE("tip"."user_id", "tm"."user_id"))))
     LEFT JOIN "public"."trip_invitations" "ti" ON (("ti"."id" = "tip"."invitation_id")))
     LEFT JOIN "public"."user_family_members" "ufm" ON (("ufm"."id" = "tip"."family_member_id")));




CREATE TABLE IF NOT EXISTS "public"."trip_journey_planning_states" (
    "trip_id" "uuid" NOT NULL,
    "scenarios" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_journey_planning_states_scenarios_array_check" CHECK (("jsonb_typeof"("scenarios") = 'array'::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."trip_legs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "parent_leg_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "leg_type" "text" DEFAULT 'country'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "country_code" "text",
    "region_code" "text",
    "city_name" "text",
    "google_place_id" "text",
    "icon_emoji" "text",
    "icon_url" "text",
    "start_date" "date",
    "end_date" "date",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_legs_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "trip_legs_leg_type_check" CHECK (("leg_type" = ANY (ARRAY['country'::"text", 'state'::"text", 'province'::"text", 'region'::"text", 'city'::"text", 'area'::"text", 'custom'::"text"])))
);




COMMENT ON TABLE "public"."trip_legs" IS 'Editable geography/date legs for a trip, e.g. country, region/state, city, or custom segment.';



CREATE TABLE IF NOT EXISTS "public"."trip_member_legs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "trip_member_id" "uuid" NOT NULL,
    "trip_leg_id" "uuid" NOT NULL,
    "is_joining" boolean DEFAULT true NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_member_legs_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date")))
);




COMMENT ON TABLE "public"."trip_member_legs" IS 'Legs an accepted member is joining or not joining, with optional member-specific dates.';



CREATE TABLE IF NOT EXISTS "public"."user_activity_daily" (
    "user_id" "uuid" NOT NULL,
    "activity_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "first_active_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




COMMENT ON TABLE "public"."user_activity_daily" IS 'Privacy-minimised daily authenticated activity used for aggregate product analytics. One row per user per UTC day.';



CREATE TABLE IF NOT EXISTS "public"."user_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color_key" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_categories_name_not_blank" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 40)))
);




CREATE TABLE IF NOT EXISTS "public"."user_data_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "storage_path" "text",
    "export_schema_version" "text" DEFAULT '2026-07-14.1'::"text" NOT NULL,
    "failure_code" "text",
    "downloaded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_data_exports_ready_requires_archive_check" CHECK ((("status" <> 'ready'::"text") OR (("completed_at" IS NOT NULL) AND ("expires_at" IS NOT NULL) AND ("storage_path" IS NOT NULL)))),
    CONSTRAINT "user_data_exports_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'preparing'::"text", 'ready'::"text", 'expired'::"text", 'failed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_finance_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "home_currency" "text" DEFAULT 'CAD'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_finance_settings_home_currency_check" CHECK (("home_currency" ~ '^[A-Z]{3}$'::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."user_notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "in_app_enabled" boolean DEFAULT true NOT NULL,
    "push_enabled" boolean DEFAULT false NOT NULL,
    "email_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_notification_preferences_type_check" CHECK (("notification_type" = ANY (ARRAY['trip_invite_received'::"text", 'trip_invite_accepted'::"text", 'trip_invite_declined'::"text", 'trip_updated'::"text", 'trip_item_added'::"text", 'trip_item_updated'::"text", 'trip_item_deleted'::"text", 'trip_slug_changed'::"text", 'friend_request_received'::"text", 'friend_request_accepted'::"text", 'passport_stamp_share_received'::"text", 'passport_stamp_share_accepted'::"text", 'passport_stamp_share_declined'::"text", 'passport_stamp_added'::"text", 'feature_suggestion_implemented'::"text", 'terms_updated'::"text", 'terms_acceptance_required'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_onboarding_progress" (
    "user_id" "uuid" NOT NULL,
    "flow_version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "current_step" "text",
    "completed_steps" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_onboarding_progress_current_step_check" CHECK ((("current_step" IS NULL) OR ("current_step" = ANY (ARRAY['welcome'::"text", 'create_trip'::"text", 'add_first_item'::"text", 'complete'::"text"])))),
    CONSTRAINT "user_onboarding_progress_flow_version_check" CHECK (("flow_version" > 0)),
    CONSTRAINT "user_onboarding_progress_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'dismissed'::"text"])))
);




COMMENT ON TABLE "public"."user_onboarding_progress" IS 'Tracks each authenticated user contextual VAIVIA onboarding flow progress.';



COMMENT ON COLUMN "public"."user_onboarding_progress"."current_step" IS 'Stable onboarding step key such as welcome, create_trip, add_first_item, or explore_trip.';



CREATE TABLE IF NOT EXISTS "public"."user_passport_stamps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "country_code" "text" NOT NULL,
    "country_name" "text" NOT NULL,
    "flag_emoji" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_visited_on" "date",
    "stamped_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_trip_id" "uuid",
    "first_entry_airport_id" "uuid",
    "first_entry_iata_code" "text",
    "first_entry_icao_code" "text",
    "first_entry_city" "text",
    "arrival_label_snapshot" "text",
    "stamp_display_country_name" "text",
    "stamp_display_flag" "text",
    "first_entry_airport_name" "text",
    "first_entry_airport_google_place_id" "text",
    "first_entry_airport_formatted_address" "text",
    "welcome_label_snapshot" "text",
    "visit_city" "text",
    "visit_region" "text",
    "visit_month" integer,
    "visit_status" "text" DEFAULT 'visited'::"text" NOT NULL,
    "port_of_entry_type" "text",
    "port_of_entry_name" "text",
    "stamp_language_code" "text",
    "stamp_language_name" "text",
    CONSTRAINT "user_passport_stamps_country_code_check" CHECK (("country_code" ~ '^[A-Z]{2}$'::"text")),
    CONSTRAINT "user_passport_stamps_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'auto'::"text"]))),
    CONSTRAINT "user_passport_stamps_visit_month_check" CHECK ((("visit_month" IS NULL) OR (("visit_month" >= 1) AND ("visit_month" <= 12)))),
    CONSTRAINT "user_passport_stamps_visit_status_check" CHECK (("visit_status" = ANY (ARRAY['visited'::"text", 'lived'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "clock_format" "text" DEFAULT '24h'::"text" NOT NULL,
    "default_time_zone" "text",
    "itinerary_default_view" "text" DEFAULT 'list'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "countdown_display_mode" "text" DEFAULT 'days'::"text" NOT NULL,
    "theme_mode" "text" DEFAULT 'dark'::"text" NOT NULL,
    "news_feed_mode" "text" DEFAULT 'integrated'::"text" NOT NULL,
    CONSTRAINT "user_preferences_clock_format_check" CHECK (("clock_format" = ANY (ARRAY['12h'::"text", '24h'::"text"]))),
    CONSTRAINT "user_preferences_countdown_display_mode_check" CHECK (("countdown_display_mode" = ANY (ARRAY['days'::"text", 'weeks'::"text", 'hours'::"text", 'minutes'::"text", 'seconds'::"text", 'mixed'::"text"]))),
    CONSTRAINT "user_preferences_itinerary_default_view_check" CHECK (("itinerary_default_view" = ANY (ARRAY['list'::"text", 'day'::"text", 'week'::"text"]))),
    CONSTRAINT "user_preferences_news_feed_mode_check" CHECK (("news_feed_mode" = ANY (ARRAY['integrated'::"text", 'widget'::"text"]))),
    CONSTRAINT "user_preferences_theme_mode_check" CHECK (("theme_mode" = ANY (ARRAY['dark'::"text", 'pink'::"text", 'greyscale'::"text", 'brat'::"text", 'pride'::"text", 'light'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);




CREATE TABLE IF NOT EXISTS "public"."user_scratch_map_countries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "country_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_scratch_map_countries_country_code_check" CHECK (("country_code" ~ '^[A-Z]{3}$'::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."user_terms_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "terms_version_id" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."user_travel_bucket_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "place_label" "text" NOT NULL,
    "city" "text",
    "region" "text",
    "country_code" "text" NOT NULL,
    "country_name" "text",
    "flag_emoji" "text",
    "google_place_id" "text",
    "google_formatted_address" "text",
    "latitude" double precision,
    "longitude" double precision,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_trip_id" "uuid",
    "completed_transportation_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "passport_stamp_id" "uuid",
    CONSTRAINT "user_travel_bucket_list_completion_check" CHECK (((("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL)) OR ("status" = 'in_progress'::"text"))),
    CONSTRAINT "user_travel_bucket_list_country_code_check" CHECK (("country_code" ~ '^[A-Z]{2}$'::"text")),
    CONSTRAINT "user_travel_bucket_list_place_label_not_blank_check" CHECK (("length"("btrim"("place_label")) > 0)),
    CONSTRAINT "user_travel_bucket_list_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text"])))
);




ALTER TABLE ONLY "public"."airports"
    ADD CONSTRAINT "airports_ident_key" UNIQUE ("ident");



ALTER TABLE ONLY "public"."airports"
    ADD CONSTRAINT "airports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_color_options"
    ADD CONSTRAINT "category_color_options_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."category_color_options"
    ADD CONSTRAINT "category_color_options_sort_order_key" UNIQUE ("sort_order");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("alpha2");



ALTER TABLE ONLY "public"."currency_exchange_rates"
    ADD CONSTRAINT "currency_exchange_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."currency_exchange_rates"
    ADD CONSTRAINT "currency_exchange_rates_unique_key" UNIQUE ("rate_date", "base_currency", "target_currency", "provider");



ALTER TABLE ONLY "public"."external_email_invite_outbox"
    ADD CONSTRAINT "external_email_invite_outbox_event_key_key" UNIQUE ("event_key");



ALTER TABLE ONLY "public"."external_email_invite_outbox"
    ADD CONSTRAINT "external_email_invite_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_suggestions"
    ADD CONSTRAINT "feature_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."language_welcome_labels"
    ADD CONSTRAINT "language_welcome_labels_pkey" PRIMARY KEY ("language_code");



ALTER TABLE ONLY "public"."news_feed_posts"
    ADD CONSTRAINT "news_feed_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_feed_posts"
    ADD CONSTRAINT "news_feed_posts_post_key_key" UNIQUE ("post_key");



ALTER TABLE ONLY "public"."news_feed_reactions"
    ADD CONSTRAINT "news_feed_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_feed_reactions"
    ADD CONSTRAINT "news_feed_reactions_post_key_user_id_emoji_key" UNIQUE ("post_key", "user_id", "emoji");



ALTER TABLE ONLY "public"."notification_email_outbox"
    ADD CONSTRAINT "notification_email_outbox_notification_key" UNIQUE ("notification_id");



ALTER TABLE ONLY "public"."notification_email_outbox"
    ADD CONSTRAINT "notification_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_push_outbox"
    ADD CONSTRAINT "notification_push_outbox_notification_key" UNIQUE ("notification_id");



ALTER TABLE ONLY "public"."notification_push_outbox"
    ADD CONSTRAINT "notification_push_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms_versions"
    ADD CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms_versions"
    ADD CONSTRAINT "terms_versions_version_number_key" UNIQUE ("version_number");



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transportation_items"
    ADD CONSTRAINT "transportation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travel_email_imports"
    ADD CONSTRAINT "travel_email_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travel_email_imports"
    ADD CONSTRAINT "travel_email_imports_provider_email_id_key" UNIQUE ("provider_email_id");



ALTER TABLE ONLY "public"."trip_accommodations"
    ADD CONSTRAINT "trip_accommodations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_budget_categories"
    ADD CONSTRAINT "trip_budget_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_budget_categories"
    ADD CONSTRAINT "trip_budget_categories_trip_name_key" UNIQUE ("trip_id", "name");



ALTER TABLE ONLY "public"."trip_budget_line_items"
    ADD CONSTRAINT "trip_budget_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_expense_receipts"
    ADD CONSTRAINT "trip_expense_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_family_members"
    ADD CONSTRAINT "trip_family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_family_members"
    ADD CONSTRAINT "trip_family_members_unique" UNIQUE ("trip_id", "family_member_id");



ALTER TABLE ONLY "public"."trip_food_items"
    ADD CONSTRAINT "trip_food_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_food_items"
    ADD CONSTRAINT "trip_food_items_trip_id_id_unique" UNIQUE ("trip_id", "id");



ALTER TABLE ONLY "public"."trip_food_reactions"
    ADD CONSTRAINT "trip_food_reactions_one_per_user" UNIQUE ("food_item_id", "user_id");



ALTER TABLE ONLY "public"."trip_food_reactions"
    ADD CONSTRAINT "trip_food_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_food_tried"
    ADD CONSTRAINT "trip_food_tried_one_per_user" UNIQUE ("food_item_id", "user_id");



ALTER TABLE ONLY "public"."trip_food_tried"
    ADD CONSTRAINT "trip_food_tried_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_one_per_user_per_idea" UNIQUE ("idea_id", "user_id");



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_ideas"
    ADD CONSTRAINT "trip_ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_ideas"
    ADD CONSTRAINT "trip_ideas_trip_id_id_unique" UNIQUE ("trip_id", "id");



ALTER TABLE ONLY "public"."trip_invitation_legs"
    ADD CONSTRAINT "trip_invitation_legs_invitation_id_trip_leg_id_key" UNIQUE ("invitation_id", "trip_leg_id");



ALTER TABLE ONLY "public"."trip_invitation_legs"
    ADD CONSTRAINT "trip_invitation_legs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_item_type_item_id_family_member_id_key" UNIQUE ("item_type", "item_id", "family_member_id");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_item_type_item_id_guest_name_key" UNIQUE ("item_type", "item_id", "guest_name");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_item_type_item_id_invitation_id_key" UNIQUE ("item_type", "item_id", "invitation_id");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_item_type_item_id_trip_member_id_key" UNIQUE ("item_type", "item_id", "trip_member_id");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_item_type_item_id_user_id_key" UNIQUE ("item_type", "item_id", "user_id");



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_journey_planning_states"
    ADD CONSTRAINT "trip_journey_planning_states_pkey" PRIMARY KEY ("trip_id");



ALTER TABLE ONLY "public"."trip_legs"
    ADD CONSTRAINT "trip_legs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_member_legs"
    ADD CONSTRAINT "trip_member_legs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_member_legs"
    ADD CONSTRAINT "trip_member_legs_trip_member_id_trip_leg_id_key" UNIQUE ("trip_member_id", "trip_leg_id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_activity_daily"
    ADD CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("user_id", "activity_date");



ALTER TABLE ONLY "public"."user_categories"
    ADD CONSTRAINT "user_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_data_exports"
    ADD CONSTRAINT "user_data_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_email_import_addresses"
    ADD CONSTRAINT "user_email_import_addresses_inbound_token_key" UNIQUE ("inbound_token");



ALTER TABLE ONLY "public"."user_email_import_addresses"
    ADD CONSTRAINT "user_email_import_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_family_members"
    ADD CONSTRAINT "user_family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_finance_settings"
    ADD CONSTRAINT "user_finance_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_finance_settings"
    ADD CONSTRAINT "user_finance_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_friendships"
    ADD CONSTRAINT "user_friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id", "notification_type");



ALTER TABLE ONLY "public"."user_onboarding_progress"
    ADD CONSTRAINT "user_onboarding_progress_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_passport_stamp_shares"
    ADD CONSTRAINT "user_passport_stamp_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_passport_stamps"
    ADD CONSTRAINT "user_passport_stamps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_point_events"
    ADD CONSTRAINT "user_point_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_scratch_map_countries"
    ADD CONSTRAINT "user_scratch_map_countries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_scratch_map_countries"
    ADD CONSTRAINT "user_scratch_map_countries_user_country_unique" UNIQUE ("user_id", "country_code");



ALTER TABLE ONLY "public"."user_terms_acceptances"
    ADD CONSTRAINT "user_terms_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_terms_acceptances"
    ADD CONSTRAINT "user_terms_acceptances_unique" UNIQUE ("user_id", "terms_version_id");



ALTER TABLE ONLY "public"."user_travel_bucket_list"
    ADD CONSTRAINT "user_travel_bucket_list_pkey" PRIMARY KEY ("id");



CREATE INDEX "airports_iata_code_idx" ON "public"."airports" USING "btree" ("iata_code");



CREATE INDEX "airports_iso_country_idx" ON "public"."airports" USING "btree" ("iso_country");



CREATE INDEX "airports_municipality_idx" ON "public"."airports" USING "btree" ("municipality");



CREATE INDEX "countries_common_name_idx" ON "public"."countries" USING "btree" ("common_name");



CREATE INDEX "countries_primary_language_code_idx" ON "public"."countries" USING "btree" ("primary_language_code");



CREATE INDEX "countries_region_idx" ON "public"."countries" USING "btree" ("region", "subregion");



CREATE INDEX "countries_welcome_label_source_idx" ON "public"."countries" USING "btree" ("welcome_label_source");



CREATE INDEX "currency_exchange_rates_lookup_idx" ON "public"."currency_exchange_rates" USING "btree" ("rate_date", "base_currency", "target_currency");



CREATE INDEX "external_email_invite_outbox_recipient_idx" ON "public"."external_email_invite_outbox" USING "btree" ("lower"("recipient_email"), "created_at" DESC);



CREATE INDEX "external_email_invite_outbox_status_next_attempt_idx" ON "public"."external_email_invite_outbox" USING "btree" ("status", "next_attempt_at", "created_at");



CREATE INDEX "feature_suggestions_status_created_idx" ON "public"."feature_suggestions" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "feature_suggestions_user_created_idx" ON "public"."feature_suggestions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_itinerary_items_audience" ON "public"."itinerary_items" USING "btree" ("trip_id", "audience_mode", "is_private");



CREATE INDEX "idx_itinerary_items_leg" ON "public"."itinerary_items" USING "btree" ("trip_id", "trip_leg_id");



CREATE INDEX "idx_itinerary_items_trip_leg_id" ON "public"."itinerary_items" USING "btree" ("trip_leg_id");



CREATE INDEX "idx_transportation_items_audience" ON "public"."transportation_items" USING "btree" ("trip_id", "audience_mode", "is_private");



CREATE INDEX "idx_transportation_items_leg" ON "public"."transportation_items" USING "btree" ("trip_id", "trip_leg_id");



CREATE INDEX "idx_transportation_items_trip_leg_id" ON "public"."transportation_items" USING "btree" ("trip_leg_id");



CREATE INDEX "idx_trip_accommodations_audience" ON "public"."trip_accommodations" USING "btree" ("trip_id", "audience_mode", "is_private");



CREATE INDEX "idx_trip_accommodations_leg" ON "public"."trip_accommodations" USING "btree" ("trip_id", "trip_leg_id");



CREATE INDEX "idx_trip_accommodations_trip_leg_id" ON "public"."trip_accommodations" USING "btree" ("trip_leg_id");



CREATE INDEX "idx_trip_invitation_legs_invitation" ON "public"."trip_invitation_legs" USING "btree" ("invitation_id");



CREATE INDEX "idx_trip_invitation_legs_trip" ON "public"."trip_invitation_legs" USING "btree" ("trip_id", "trip_leg_id");



CREATE INDEX "idx_trip_invitation_legs_trip_leg_id" ON "public"."trip_invitation_legs" USING "btree" ("trip_leg_id");



CREATE INDEX "idx_trip_item_participants_family_member_id" ON "public"."trip_item_participants" USING "btree" ("family_member_id");



CREATE INDEX "idx_trip_item_participants_invitation" ON "public"."trip_item_participants" USING "btree" ("invitation_id");



CREATE INDEX "idx_trip_item_participants_item" ON "public"."trip_item_participants" USING "btree" ("item_type", "item_id");



CREATE INDEX "idx_trip_item_participants_member" ON "public"."trip_item_participants" USING "btree" ("trip_member_id");



CREATE INDEX "idx_trip_item_participants_trip" ON "public"."trip_item_participants" USING "btree" ("trip_id", "participant_kind");



CREATE INDEX "idx_trip_item_participants_user" ON "public"."trip_item_participants" USING "btree" ("user_id");



CREATE INDEX "idx_trip_legs_parent" ON "public"."trip_legs" USING "btree" ("parent_leg_id");



CREATE INDEX "idx_trip_legs_trip_dates" ON "public"."trip_legs" USING "btree" ("trip_id", "start_date", "end_date", "sort_order");



CREATE INDEX "idx_trip_member_legs_member" ON "public"."trip_member_legs" USING "btree" ("trip_member_id");



CREATE INDEX "idx_trip_member_legs_trip_leg" ON "public"."trip_member_legs" USING "btree" ("trip_id", "trip_leg_id", "is_joining");



CREATE INDEX "idx_trip_member_legs_trip_leg_id" ON "public"."trip_member_legs" USING "btree" ("trip_leg_id");



CREATE INDEX "idx_trip_members_invitation_id" ON "public"."trip_members" USING "btree" ("invitation_id");



CREATE INDEX "idx_trip_members_window" ON "public"."trip_members" USING "btree" ("trip_id", "user_id", "confirmed_start_date", "confirmed_end_date");



CREATE INDEX "itinerary_items_category_id_idx" ON "public"."itinerary_items" USING "btree" ("category_id");



CREATE INDEX "itinerary_items_source_idea_id_idx" ON "public"."itinerary_items" USING "btree" ("source_idea_id");



CREATE INDEX "news_feed_posts_audience_created_idx" ON "public"."news_feed_posts" USING "btree" ("audience_user_id", "archived_at", "created_at" DESC);



CREATE INDEX "news_feed_reactions_post_idx" ON "public"."news_feed_reactions" USING "btree" ("post_key");



CREATE INDEX "notification_email_outbox_notification_idx" ON "public"."notification_email_outbox" USING "btree" ("notification_id");



CREATE INDEX "notification_email_outbox_status_next_attempt_idx" ON "public"."notification_email_outbox" USING "btree" ("status", "next_attempt_at", "created_at");



CREATE INDEX "notification_email_outbox_user_idx" ON "public"."notification_email_outbox" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notification_push_outbox_event_idx" ON "public"."notification_push_outbox" USING "btree" ("user_id", "notification_type", "event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "notification_push_outbox_status_created_idx" ON "public"."notification_push_outbox" USING "btree" ("status", "created_at");



CREATE INDEX "notification_push_outbox_status_next_attempt_idx" ON "public"."notification_push_outbox" USING "btree" ("status", "next_attempt_at", "created_at");



CREATE INDEX "notification_push_outbox_user_idx" ON "public"."notification_push_outbox" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_unread_idx" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE INDEX "notifications_user_active_created_idx" ON "public"."notifications" USING "btree" ("user_id", "archived_at", "created_at" DESC);



CREATE INDEX "notifications_user_id_created_at_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_read_created_idx" ON "public"."notifications" USING "btree" ("user_id", "read_at", "created_at" DESC);



CREATE INDEX "terms_versions_published_idx" ON "public"."terms_versions" USING "btree" ("published_at" DESC);



CREATE INDEX "transportation_item_travelers_family_member_id_idx" ON "public"."transportation_item_travelers" USING "btree" ("family_member_id");



CREATE INDEX "transportation_item_travelers_item_id_idx" ON "public"."transportation_item_travelers" USING "btree" ("transportation_item_id");



CREATE INDEX "transportation_item_travelers_trip_id_idx" ON "public"."transportation_item_travelers" USING "btree" ("trip_id");



CREATE UNIQUE INDEX "transportation_item_travelers_unique_family_member" ON "public"."transportation_item_travelers" USING "btree" ("transportation_item_id", "family_member_id") WHERE ("family_member_id" IS NOT NULL);



CREATE UNIQUE INDEX "transportation_item_travelers_unique_guest_name" ON "public"."transportation_item_travelers" USING "btree" ("transportation_item_id", "lower"("btrim"("guest_name"))) WHERE (("guest_name" IS NOT NULL) AND ("btrim"("guest_name") <> ''::"text"));



CREATE UNIQUE INDEX "transportation_item_travelers_unique_user" ON "public"."transportation_item_travelers" USING "btree" ("transportation_item_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "transportation_item_travelers_user_id_idx" ON "public"."transportation_item_travelers" USING "btree" ("user_id");



CREATE INDEX "transportation_items_departure_date_time_idx" ON "public"."transportation_items" USING "btree" ("departure_date", "departure_time");



CREATE INDEX "transportation_items_itinerary_item_id_idx" ON "public"."transportation_items" USING "btree" ("itinerary_item_id");



CREATE INDEX "transportation_items_route_stops_gin_idx" ON "public"."transportation_items" USING "gin" ("route_stops");



CREATE INDEX "transportation_items_trip_id_idx" ON "public"."transportation_items" USING "btree" ("trip_id");



CREATE INDEX "travel_email_imports_created_at_idx" ON "public"."travel_email_imports" USING "btree" ("created_at" DESC);



CREATE INDEX "travel_email_imports_provider_email_id_idx" ON "public"."travel_email_imports" USING "btree" ("provider_email_id");



CREATE INDEX "travel_email_imports_status_idx" ON "public"."travel_email_imports" USING "btree" ("status");



CREATE INDEX "travel_email_imports_user_id_idx" ON "public"."travel_email_imports" USING "btree" ("user_id");



CREATE INDEX "trip_accommodations_created_by_idx" ON "public"."trip_accommodations" USING "btree" ("created_by");



CREATE INDEX "trip_accommodations_google_place_id_idx" ON "public"."trip_accommodations" USING "btree" ("google_place_id");



CREATE INDEX "trip_accommodations_trip_check_in_idx" ON "public"."trip_accommodations" USING "btree" ("trip_id", "check_in_date");



CREATE INDEX "trip_accommodations_trip_id_idx" ON "public"."trip_accommodations" USING "btree" ("trip_id");



CREATE INDEX "trip_budget_categories_trip_id_idx" ON "public"."trip_budget_categories" USING "btree" ("trip_id");



CREATE INDEX "trip_budget_line_items_budget_id_idx" ON "public"."trip_budget_line_items" USING "btree" ("budget_id");



CREATE INDEX "trip_budget_line_items_trip_id_idx" ON "public"."trip_budget_line_items" USING "btree" ("trip_id");



CREATE UNIQUE INDEX "trip_budgets_one_active_per_trip_idx" ON "public"."trip_budgets" USING "btree" ("trip_id") WHERE "is_active";



CREATE INDEX "trip_budgets_trip_id_idx" ON "public"."trip_budgets" USING "btree" ("trip_id");



CREATE INDEX "trip_expense_receipts_expense_id_idx" ON "public"."trip_expense_receipts" USING "btree" ("expense_id");



CREATE INDEX "trip_expense_splits_expense_id_idx" ON "public"."trip_expense_splits" USING "btree" ("expense_id");



CREATE INDEX "trip_expense_splits_trip_id_idx" ON "public"."trip_expense_splits" USING "btree" ("trip_id");



CREATE INDEX "trip_expense_splits_trip_member_idx" ON "public"."trip_expense_splits" USING "btree" ("trip_id", "trip_member_id");



CREATE INDEX "trip_expenses_accommodation_id_idx" ON "public"."trip_expenses" USING "btree" ("accommodation_id");



CREATE INDEX "trip_expenses_budget_category_id_idx" ON "public"."trip_expenses" USING "btree" ("budget_category_id");



CREATE INDEX "trip_expenses_itinerary_event_id_idx" ON "public"."trip_expenses" USING "btree" ("itinerary_event_id") WHERE ("itinerary_event_id" IS NOT NULL);



CREATE INDEX "trip_expenses_transportation_item_id_idx" ON "public"."trip_expenses" USING "btree" ("transportation_item_id") WHERE ("transportation_item_id" IS NOT NULL);



CREATE INDEX "trip_expenses_trip_category_idx" ON "public"."trip_expenses" USING "btree" ("trip_id", "category");



CREATE INDEX "trip_expenses_trip_date_idx" ON "public"."trip_expenses" USING "btree" ("trip_id", "expense_date");



CREATE INDEX "trip_expenses_trip_paid_by_member_idx" ON "public"."trip_expenses" USING "btree" ("trip_id", "paid_by_trip_member_id");



CREATE INDEX "trip_expenses_trip_transaction_date_idx" ON "public"."trip_expenses" USING "btree" ("trip_id", "transaction_date");



CREATE INDEX "trip_family_members_family_member_id_idx" ON "public"."trip_family_members" USING "btree" ("family_member_id");



CREATE INDEX "trip_family_members_trip_id_idx" ON "public"."trip_family_members" USING "btree" ("trip_id");



CREATE INDEX "trip_food_items_created_by_idx" ON "public"."trip_food_items" USING "btree" ("created_by");



CREATE INDEX "trip_food_items_google_place_idx" ON "public"."trip_food_items" USING "btree" ("trip_id", "google_place_id") WHERE ("google_place_id" IS NOT NULL);



CREATE INDEX "trip_food_items_trip_type_idx" ON "public"."trip_food_items" USING "btree" ("trip_id", "item_type");



CREATE INDEX "trip_food_reactions_trip_idx" ON "public"."trip_food_reactions" USING "btree" ("trip_id");



CREATE INDEX "trip_food_tried_trip_idx" ON "public"."trip_food_tried" USING "btree" ("trip_id");



CREATE INDEX "trip_idea_reactions_idea_id_idx" ON "public"."trip_idea_reactions" USING "btree" ("idea_id");



CREATE INDEX "trip_idea_reactions_score_idx" ON "public"."trip_idea_reactions" USING "btree" ("idea_id", "score");



CREATE INDEX "trip_idea_reactions_trip_id_idx" ON "public"."trip_idea_reactions" USING "btree" ("trip_id");



CREATE INDEX "trip_idea_reactions_user_id_idx" ON "public"."trip_idea_reactions" USING "btree" ("user_id");



CREATE INDEX "trip_ideas_category_idx" ON "public"."trip_ideas" USING "btree" ("category");



CREATE INDEX "trip_ideas_days_gin_idx" ON "public"."trip_ideas" USING "gin" ("days_of_week");



CREATE INDEX "trip_ideas_google_place_id_idx" ON "public"."trip_ideas" USING "btree" ("google_place_id") WHERE ("google_place_id" IS NOT NULL);



CREATE INDEX "trip_ideas_tags_gin_idx" ON "public"."trip_ideas" USING "gin" ("tags");



CREATE INDEX "trip_ideas_time_of_day_gin_idx" ON "public"."trip_ideas" USING "gin" ("time_of_day");



CREATE INDEX "trip_ideas_trip_archived_idx" ON "public"."trip_ideas" USING "btree" ("trip_id", "is_archived");



CREATE INDEX "trip_ideas_trip_attended_created_idx" ON "public"."trip_ideas" USING "btree" ("trip_id", "attended", "created_at" DESC);



CREATE INDEX "trip_ideas_trip_id_idx" ON "public"."trip_ideas" USING "btree" ("trip_id");



CREATE INDEX "trip_ideas_trip_id_is_archived_idx" ON "public"."trip_ideas" USING "btree" ("trip_id", "is_archived");



CREATE INDEX "trip_ideas_trip_leg_id_idx" ON "public"."trip_ideas" USING "btree" ("trip_id", "trip_leg_id");



CREATE INDEX "trip_invitations_invited_email_idx" ON "public"."trip_invitations" USING "btree" ("lower"("invited_email"));



CREATE INDEX "trip_invitations_invited_user_id_idx" ON "public"."trip_invitations" USING "btree" ("invited_user_id");



CREATE UNIQUE INDEX "trip_invitations_pending_email_unique" ON "public"."trip_invitations" USING "btree" ("trip_id", "lower"("invited_email")) WHERE (("status" = 'pending'::"text") AND ("invited_email" IS NOT NULL));



CREATE UNIQUE INDEX "trip_invitations_pending_user_unique" ON "public"."trip_invitations" USING "btree" ("trip_id", "invited_user_id") WHERE (("status" = 'pending'::"text") AND ("invited_user_id" IS NOT NULL));



CREATE UNIQUE INDEX "trip_invitations_pending_username_unique" ON "public"."trip_invitations" USING "btree" ("trip_id", "lower"("invited_username")) WHERE (("status" = 'pending'::"text") AND ("invited_username" IS NOT NULL));



CREATE INDEX "trip_invitations_status_idx" ON "public"."trip_invitations" USING "btree" ("status");



CREATE INDEX "trip_invitations_trip_id_idx" ON "public"."trip_invitations" USING "btree" ("trip_id");



CREATE INDEX "trip_legs_trip_dates_idx" ON "public"."trip_legs" USING "btree" ("trip_id", "start_date", "end_date");



CREATE INDEX "trip_member_legs_member_leg_idx" ON "public"."trip_member_legs" USING "btree" ("trip_id", "trip_member_id", "trip_leg_id");



CREATE INDEX "trip_members_active_idx" ON "public"."trip_members" USING "btree" ("trip_id", "user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "trip_members_trip_id_idx" ON "public"."trip_members" USING "btree" ("trip_id");



CREATE INDEX "trip_members_user_id_idx" ON "public"."trip_members" USING "btree" ("user_id");



CREATE INDEX "trips_countdown_target_idx" ON "public"."trips" USING "btree" ("countdown_target_type", "countdown_target_id");



CREATE INDEX "trips_countdown_target_itinerary_item_id_idx" ON "public"."trips" USING "btree" ("countdown_target_itinerary_item_id");



CREATE UNIQUE INDEX "trips_owner_active_slug_unique_idx" ON "public"."trips" USING "btree" ("user_id", "slug") WHERE ("archived_at" IS NULL);



CREATE INDEX "trips_slug_idx" ON "public"."trips" USING "btree" ("slug") WHERE ("archived_at" IS NULL);



CREATE INDEX "user_activity_daily_activity_date_idx" ON "public"."user_activity_daily" USING "btree" ("activity_date" DESC);



CREATE UNIQUE INDEX "user_categories_user_lower_name_idx" ON "public"."user_categories" USING "btree" ("user_id", "lower"("btrim"("name")));



CREATE INDEX "user_categories_user_name_idx" ON "public"."user_categories" USING "btree" ("user_id", "lower"("name"));



CREATE INDEX "user_data_exports_user_requested_idx" ON "public"."user_data_exports" USING "btree" ("user_id", "requested_at" DESC);



CREATE UNIQUE INDEX "user_email_import_addresses_one_active_per_user" ON "public"."user_email_import_addresses" USING "btree" ("user_id") WHERE ("is_active" = true);



CREATE INDEX "user_family_members_user_id_idx" ON "public"."user_family_members" USING "btree" ("user_id");



CREATE INDEX "user_friendships_addressee_idx" ON "public"."user_friendships" USING "btree" ("addressee_user_id", "status");



CREATE INDEX "user_friendships_blocked_by_idx" ON "public"."user_friendships" USING "btree" ("blocked_by_user_id") WHERE ("status" = 'blocked'::"text");



CREATE UNIQUE INDEX "user_friendships_pending_identifier_idx" ON "public"."user_friendships" USING "btree" ("requester_user_id", "lower"("addressee_identifier")) WHERE ("status" = 'pending'::"text");



CREATE INDEX "user_friendships_requester_idx" ON "public"."user_friendships" USING "btree" ("requester_user_id", "status");



CREATE UNIQUE INDEX "user_passport_stamp_shares_pending_unique_idx" ON "public"."user_passport_stamp_shares" USING "btree" ("sender_user_id", "recipient_user_id", "source_stamp_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "user_passport_stamp_shares_recipient_idx" ON "public"."user_passport_stamp_shares" USING "btree" ("recipient_user_id", "status", "created_at" DESC);



CREATE INDEX "user_passport_stamps_language_idx" ON "public"."user_passport_stamps" USING "btree" ("user_id", "stamp_language_code") WHERE ("stamp_language_code" IS NOT NULL);



CREATE INDEX "user_passport_stamps_user_country_idx" ON "public"."user_passport_stamps" USING "btree" ("user_id", "country_code");



CREATE INDEX "user_passport_stamps_user_country_visit_idx" ON "public"."user_passport_stamps" USING "btree" ("user_id", "country_code", "first_visited_on");



CREATE INDEX "user_passport_stamps_user_source_trip_idx" ON "public"."user_passport_stamps" USING "btree" ("user_id", "source_trip_id");



CREATE UNIQUE INDEX "user_point_events_unique_key_idx" ON "public"."user_point_events" USING "btree" ("unique_key") WHERE ("unique_key" IS NOT NULL);



CREATE INDEX "user_point_events_user_occurred_idx" ON "public"."user_point_events" USING "btree" ("user_id", "occurred_at" DESC);



CREATE INDEX "user_profiles_role_idx" ON "public"."user_profiles" USING "btree" ("role");



CREATE UNIQUE INDEX "user_profiles_username_unique_ci_idx" ON "public"."user_profiles" USING "btree" ("lower"("btrim"("username"))) WHERE (("username" IS NOT NULL) AND ("btrim"("username") <> ''::"text"));



COMMENT ON INDEX "public"."user_profiles_username_unique_ci_idx" IS 'Ensures filled VAIVIA usernames are unique case-insensitively while existing users without usernames can be prompted in-app.';



CREATE UNIQUE INDEX "user_profiles_username_unique_lower" ON "public"."user_profiles" USING "btree" ("lower"("username")) WHERE ("username" IS NOT NULL);



CREATE INDEX "user_push_subscriptions_user_active_idx" ON "public"."user_push_subscriptions" USING "btree" ("user_id", "revoked_at", "updated_at" DESC);



CREATE INDEX "user_scratch_map_countries_user_country_idx" ON "public"."user_scratch_map_countries" USING "btree" ("user_id", "country_code");



CREATE INDEX "user_terms_acceptances_user_idx" ON "public"."user_terms_acceptances" USING "btree" ("user_id");



CREATE INDEX "user_travel_bucket_list_passport_stamp_idx" ON "public"."user_travel_bucket_list" USING "btree" ("passport_stamp_id") WHERE ("passport_stamp_id" IS NOT NULL);



CREATE INDEX "user_travel_bucket_list_user_country_idx" ON "public"."user_travel_bucket_list" USING "btree" ("user_id", "country_code");



CREATE INDEX "user_travel_bucket_list_user_status_idx" ON "public"."user_travel_bucket_list" USING "btree" ("user_id", "status", "created_at");



CREATE OR REPLACE TRIGGER "enforce_user_category_limit_before_insert" BEFORE INSERT ON "public"."user_categories" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_category_limit"();



CREATE OR REPLACE TRIGGER "enforce_user_family_member_limit_trigger" BEFORE INSERT OR UPDATE OF "user_id" ON "public"."user_family_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_family_member_limit"();



CREATE OR REPLACE TRIGGER "enforce_user_profile_role_permissions_before_write" BEFORE INSERT OR UPDATE OF "role" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_profile_role_permissions"();



CREATE OR REPLACE TRIGGER "ensure_user_preferences_for_profile_trigger" AFTER INSERT ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_user_preferences_for_profile"();



CREATE OR REPLACE TRIGGER "feature_suggestions_points_after_insert" AFTER INSERT ON "public"."feature_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('feature_suggestion_created', '5');



CREATE OR REPLACE TRIGGER "notify_feature_suggestion_implemented_trigger" AFTER UPDATE OF "status" ON "public"."feature_suggestions" FOR EACH ROW WHEN ((("new"."status" = 'implemented'::"text") AND ("old"."status" IS DISTINCT FROM 'implemented'::"text"))) EXECUTE FUNCTION "public"."notify_feature_suggestion_implemented"();



CREATE OR REPLACE TRIGGER "notify_trip_slug_changed_trigger" AFTER UPDATE OF "slug" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."notify_trip_slug_changed"();



CREATE OR REPLACE TRIGGER "queue_notification_email_trigger" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."queue_notification_email"();



CREATE OR REPLACE TRIGGER "queue_notification_push_trigger" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."queue_notification_push"();



CREATE OR REPLACE TRIGGER "resolve_trip_member_slug_conflicts_trigger" AFTER INSERT OR UPDATE OF "status", "user_id", "trip_id" ON "public"."trip_members" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_trip_member_slug_conflicts"();



CREATE OR REPLACE TRIGGER "resolve_trip_slug_update_conflicts_trigger" AFTER INSERT OR UPDATE OF "slug" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_trip_slug_conflicts_for_trip_members"();



CREATE OR REPLACE TRIGGER "set_and_validate_trip_slug_trigger" BEFORE INSERT OR UPDATE OF "title", "slug", "user_id", "archived_at" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."set_and_validate_trip_slug"();



CREATE OR REPLACE TRIGGER "set_transportation_item_created_by_before_insert" BEFORE INSERT ON "public"."transportation_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_transportation_item_created_by"();



CREATE OR REPLACE TRIGGER "set_trip_accommodations_updated_at" BEFORE UPDATE ON "public"."trip_accommodations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_food_items_updated_at" BEFORE UPDATE ON "public"."trip_food_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_food_reactions_updated_at" BEFORE UPDATE ON "public"."trip_food_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_idea_reactions_updated_at" BEFORE UPDATE ON "public"."trip_idea_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_ideas_updated_at" BEFORE UPDATE ON "public"."trip_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_legs_updated_at" BEFORE UPDATE ON "public"."trip_legs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_trip_member_legs_updated_at" BEFORE UPDATE ON "public"."trip_member_legs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_categories_updated_at" BEFORE UPDATE ON "public"."user_categories" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_onboarding_progress_updated_at" BEFORE UPDATE ON "public"."user_onboarding_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trip_family_members_set_updated_at" BEFORE UPDATE ON "public"."trip_family_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_family_members_set_updated_at" BEFORE UPDATE ON "public"."user_family_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vaivia_points_accommodation_delete" AFTER DELETE ON "public"."trip_accommodations" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('accommodation_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_accommodation_insert" AFTER INSERT ON "public"."trip_accommodations" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('accommodation_added', '4');



CREATE OR REPLACE TRIGGER "vaivia_points_budget_delete" AFTER DELETE ON "public"."trip_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('budget_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_budget_insert" AFTER INSERT ON "public"."trip_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('budget_added', '10');



CREATE OR REPLACE TRIGGER "vaivia_points_expense_delete" AFTER DELETE ON "public"."trip_expenses" FOR EACH ROW WHEN (("old"."deleted_at" IS NULL)) EXECUTE FUNCTION "public"."vaivia_points_after_delete"('expense_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_expense_insert" AFTER INSERT ON "public"."trip_expenses" FOR EACH ROW WHEN (("new"."deleted_at" IS NULL)) EXECUTE FUNCTION "public"."vaivia_points_after_insert"('expense_added', '1');



CREATE OR REPLACE TRIGGER "vaivia_points_expense_soft_delete" AFTER UPDATE OF "deleted_at" ON "public"."trip_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_trip_expense_soft_delete"();



CREATE OR REPLACE TRIGGER "vaivia_points_food_delete" AFTER DELETE ON "public"."trip_food_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('food_item_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_food_insert" AFTER INSERT ON "public"."trip_food_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('food_item_added', '2');



CREATE OR REPLACE TRIGGER "vaivia_points_friendship_delete" AFTER DELETE ON "public"."user_friendships" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_friendship_delete"();



CREATE OR REPLACE TRIGGER "vaivia_points_friendship_insert" AFTER INSERT ON "public"."user_friendships" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_friendship_status"();



CREATE OR REPLACE TRIGGER "vaivia_points_friendship_update" AFTER UPDATE OF "status" ON "public"."user_friendships" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_friendship_status"();



CREATE OR REPLACE TRIGGER "vaivia_points_idea_reaction_delete" AFTER DELETE ON "public"."trip_idea_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('idea_reaction_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_idea_reaction_insert" AFTER INSERT ON "public"."trip_idea_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('idea_reaction_added', '1');



CREATE OR REPLACE TRIGGER "vaivia_points_ideas_delete" AFTER DELETE ON "public"."trip_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('idea_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_ideas_insert" AFTER INSERT ON "public"."trip_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('idea_added', '2');



CREATE OR REPLACE TRIGGER "vaivia_points_itinerary_delete" AFTER DELETE ON "public"."itinerary_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('itinerary_event_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_itinerary_insert" AFTER INSERT ON "public"."itinerary_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('itinerary_event_added', '3');



CREATE OR REPLACE TRIGGER "vaivia_points_news_reaction_delete" AFTER DELETE ON "public"."news_feed_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('news_feed_reaction_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_news_reaction_insert" AFTER INSERT ON "public"."news_feed_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('news_feed_reaction_added', '1');



CREATE OR REPLACE TRIGGER "vaivia_points_passport_delete" AFTER DELETE ON "public"."user_passport_stamps" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('passport_stamp_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_passport_insert" AFTER INSERT ON "public"."user_passport_stamps" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('passport_stamp_added', '5');



CREATE OR REPLACE TRIGGER "vaivia_points_transportation_delete" AFTER DELETE ON "public"."transportation_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('transportation_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_transportation_insert" AFTER INSERT ON "public"."transportation_items" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('transportation_added', '4');



CREATE OR REPLACE TRIGGER "vaivia_points_trips_delete" AFTER DELETE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_delete"('trip_deleted', '-1');



CREATE OR REPLACE TRIGGER "vaivia_points_trips_insert" AFTER INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."vaivia_points_after_insert"('trip_created', '5');



CREATE OR REPLACE TRIGGER "validate_transportation_item_traveler_trigger" BEFORE INSERT OR UPDATE ON "public"."transportation_item_travelers" FOR EACH ROW EXECUTE FUNCTION "public"."validate_transportation_item_traveler"();



CREATE OR REPLACE TRIGGER "validate_trip_countdown_target_before_write" BEFORE INSERT OR UPDATE OF "countdown_target_itinerary_item_id", "id" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."validate_trip_countdown_target"();



CREATE OR REPLACE TRIGGER "validate_trip_countdown_target_v2_before_write" BEFORE INSERT OR UPDATE OF "countdown_target_type", "countdown_target_id" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."validate_trip_countdown_target_v2"();



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_default_entry_airport_id_fkey" FOREIGN KEY ("default_entry_airport_id") REFERENCES "public"."airports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_email_invite_outbox"
    ADD CONSTRAINT "external_email_invite_outbox_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_email_invite_outbox"
    ADD CONSTRAINT "external_email_invite_outbox_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feature_suggestions"
    ADD CONSTRAINT "feature_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."user_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_source_idea_id_fkey" FOREIGN KEY ("source_idea_id") REFERENCES "public"."trip_ideas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_feed_posts"
    ADD CONSTRAINT "news_feed_posts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_feed_posts"
    ADD CONSTRAINT "news_feed_posts_audience_user_id_fkey" FOREIGN KEY ("audience_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_feed_posts"
    ADD CONSTRAINT "news_feed_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_feed_reactions"
    ADD CONSTRAINT "news_feed_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_email_outbox"
    ADD CONSTRAINT "notification_email_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_email_outbox"
    ADD CONSTRAINT "notification_email_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_push_outbox"
    ADD CONSTRAINT "notification_push_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_push_outbox"
    ADD CONSTRAINT "notification_push_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."terms_versions"
    ADD CONSTRAINT "terms_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_family_member_id_fkey" FOREIGN KEY ("family_member_id") REFERENCES "public"."user_family_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_transportation_item_id_fkey" FOREIGN KEY ("transportation_item_id") REFERENCES "public"."transportation_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_item_travelers"
    ADD CONSTRAINT "transportation_item_travelers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_items"
    ADD CONSTRAINT "transportation_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transportation_items"
    ADD CONSTRAINT "transportation_items_itinerary_item_id_fkey" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transportation_items"
    ADD CONSTRAINT "transportation_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transportation_items"
    ADD CONSTRAINT "transportation_items_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."travel_email_imports"
    ADD CONSTRAINT "travel_email_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_accommodations"
    ADD CONSTRAINT "trip_accommodations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_accommodations"
    ADD CONSTRAINT "trip_accommodations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_accommodations"
    ADD CONSTRAINT "trip_accommodations_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_budget_categories"
    ADD CONSTRAINT "trip_budget_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trip_budget_categories"
    ADD CONSTRAINT "trip_budget_categories_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_budget_line_items"
    ADD CONSTRAINT "trip_budget_line_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."trip_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_budget_line_items"
    ADD CONSTRAINT "trip_budget_line_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."trip_budget_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_budget_line_items"
    ADD CONSTRAINT "trip_budget_line_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_receipts"
    ADD CONSTRAINT "trip_expense_receipts_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."trip_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_receipts"
    ADD CONSTRAINT "trip_expense_receipts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_receipts"
    ADD CONSTRAINT "trip_expense_receipts_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."trip_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_family_member_id_fkey" FOREIGN KEY ("family_member_id") REFERENCES "public"."user_family_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_trip_member_id_fkey" FOREIGN KEY ("trip_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_expense_splits"
    ADD CONSTRAINT "trip_expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "public"."trip_accommodations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "public"."trip_budget_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_itinerary_event_id_fkey" FOREIGN KEY ("itinerary_event_id") REFERENCES "public"."itinerary_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_paid_by_family_member_id_fkey" FOREIGN KEY ("paid_by_family_member_id") REFERENCES "public"."user_family_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_paid_by_invitation_id_fkey" FOREIGN KEY ("paid_by_invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_paid_by_trip_member_id_fkey" FOREIGN KEY ("paid_by_trip_member_id") REFERENCES "public"."trip_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_transportation_item_id_fkey" FOREIGN KEY ("transportation_item_id") REFERENCES "public"."transportation_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_expenses"
    ADD CONSTRAINT "trip_expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_family_members"
    ADD CONSTRAINT "trip_family_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_family_members"
    ADD CONSTRAINT "trip_family_members_family_member_id_fkey" FOREIGN KEY ("family_member_id") REFERENCES "public"."user_family_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_family_members"
    ADD CONSTRAINT "trip_family_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_items"
    ADD CONSTRAINT "trip_food_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trip_food_items"
    ADD CONSTRAINT "trip_food_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_reactions"
    ADD CONSTRAINT "trip_food_reactions_item_match" FOREIGN KEY ("trip_id", "food_item_id") REFERENCES "public"."trip_food_items"("trip_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_reactions"
    ADD CONSTRAINT "trip_food_reactions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_reactions"
    ADD CONSTRAINT "trip_food_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_tried"
    ADD CONSTRAINT "trip_food_tried_item_match" FOREIGN KEY ("trip_id", "food_item_id") REFERENCES "public"."trip_food_items"("trip_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_tried"
    ADD CONSTRAINT "trip_food_tried_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_food_tried"
    ADD CONSTRAINT "trip_food_tried_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."trip_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_trip_idea_match" FOREIGN KEY ("trip_id", "idea_id") REFERENCES "public"."trip_ideas"("trip_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_idea_reactions"
    ADD CONSTRAINT "trip_idea_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_ideas"
    ADD CONSTRAINT "trip_ideas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_ideas"
    ADD CONSTRAINT "trip_ideas_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_ideas"
    ADD CONSTRAINT "trip_ideas_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_invitation_legs"
    ADD CONSTRAINT "trip_invitation_legs_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitation_legs"
    ADD CONSTRAINT "trip_invitation_legs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitation_legs"
    ADD CONSTRAINT "trip_invitation_legs_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invitations"
    ADD CONSTRAINT "trip_invitations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_family_member_id_fkey" FOREIGN KEY ("family_member_id") REFERENCES "public"."user_family_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_item_participants"
    ADD CONSTRAINT "trip_item_participants_trip_member_id_fkey" FOREIGN KEY ("trip_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_journey_planning_states"
    ADD CONSTRAINT "trip_journey_planning_states_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_journey_planning_states"
    ADD CONSTRAINT "trip_journey_planning_states_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_legs"
    ADD CONSTRAINT "trip_legs_parent_leg_id_fkey" FOREIGN KEY ("parent_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_legs"
    ADD CONSTRAINT "trip_legs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_member_legs"
    ADD CONSTRAINT "trip_member_legs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_member_legs"
    ADD CONSTRAINT "trip_member_legs_trip_leg_id_fkey" FOREIGN KEY ("trip_leg_id") REFERENCES "public"."trip_legs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_member_legs"
    ADD CONSTRAINT "trip_member_legs_trip_member_id_fkey" FOREIGN KEY ("trip_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."trip_invitations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_countdown_target_itinerary_item_id_fkey" FOREIGN KEY ("countdown_target_itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_activity_daily"
    ADD CONSTRAINT "user_activity_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_categories"
    ADD CONSTRAINT "user_categories_color_key_fkey" FOREIGN KEY ("color_key") REFERENCES "public"."category_color_options"("key");



ALTER TABLE ONLY "public"."user_categories"
    ADD CONSTRAINT "user_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_data_exports"
    ADD CONSTRAINT "user_data_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_email_import_addresses"
    ADD CONSTRAINT "user_email_import_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_family_members"
    ADD CONSTRAINT "user_family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_finance_settings"
    ADD CONSTRAINT "user_finance_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_friendships"
    ADD CONSTRAINT "user_friendships_addressee_user_id_fkey" FOREIGN KEY ("addressee_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_friendships"
    ADD CONSTRAINT "user_friendships_blocked_by_user_id_fkey" FOREIGN KEY ("blocked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_friendships"
    ADD CONSTRAINT "user_friendships_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_onboarding_progress"
    ADD CONSTRAINT "user_onboarding_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_passport_stamp_shares"
    ADD CONSTRAINT "user_passport_stamp_shares_accepted_stamp_id_fkey" FOREIGN KEY ("accepted_stamp_id") REFERENCES "public"."user_passport_stamps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_passport_stamp_shares"
    ADD CONSTRAINT "user_passport_stamp_shares_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_passport_stamp_shares"
    ADD CONSTRAINT "user_passport_stamp_shares_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_passport_stamp_shares"
    ADD CONSTRAINT "user_passport_stamp_shares_source_stamp_id_fkey" FOREIGN KEY ("source_stamp_id") REFERENCES "public"."user_passport_stamps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_passport_stamps"
    ADD CONSTRAINT "user_passport_stamps_first_entry_airport_id_fkey" FOREIGN KEY ("first_entry_airport_id") REFERENCES "public"."airports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_passport_stamps"
    ADD CONSTRAINT "user_passport_stamps_source_trip_id_fkey" FOREIGN KEY ("source_trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_passport_stamps"
    ADD CONSTRAINT "user_passport_stamps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_point_events"
    ADD CONSTRAINT "user_point_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_scratch_map_countries"
    ADD CONSTRAINT "user_scratch_map_countries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_terms_acceptances"
    ADD CONSTRAINT "user_terms_acceptances_terms_version_id_fkey" FOREIGN KEY ("terms_version_id") REFERENCES "public"."terms_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_terms_acceptances"
    ADD CONSTRAINT "user_terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_travel_bucket_list"
    ADD CONSTRAINT "user_travel_bucket_list_completed_transportation_item_id_fkey" FOREIGN KEY ("completed_transportation_item_id") REFERENCES "public"."transportation_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_travel_bucket_list"
    ADD CONSTRAINT "user_travel_bucket_list_completed_trip_id_fkey" FOREIGN KEY ("completed_trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_travel_bucket_list"
    ADD CONSTRAINT "user_travel_bucket_list_passport_stamp_id_fkey" FOREIGN KEY ("passport_stamp_id") REFERENCES "public"."user_passport_stamps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_travel_bucket_list"
    ADD CONSTRAINT "user_travel_bucket_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Active trip members can update trips" ON "public"."trips" FOR UPDATE USING (("public"."is_trip_active_member"("id") AND ("archived_at" IS NULL))) WITH CHECK ("public"."is_trip_active_member"("id"));



CREATE POLICY "Active trip members can view trips" ON "public"."trips" FOR SELECT USING (("public"."is_trip_active_member"("id") AND ("archived_at" IS NULL)));



CREATE POLICY "Airports are readable by everyone" ON "public"."airports" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view category colour options" ON "public"."category_color_options" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can cache exchange rates" ON "public"."currency_exchange_rates" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can view exchange rates" ON "public"."currency_exchange_rates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view welcome labels" ON "public"."language_welcome_labels" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Countries are readable by everyone" ON "public"."countries" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Creators and trip owners can delete food items" ON "public"."trip_food_items" FOR DELETE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_food_items"."trip_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Creators and trip owners can update food items" ON "public"."trip_food_items" FOR UPDATE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_food_items"."trip_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_food_items"."trip_id") AND ("t"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Idea board member change v3" ON "public"."trip_ideas" FOR UPDATE USING (("public"."is_trip_active_member"("trip_id") AND ((NOT "is_private") OR ("created_by" = "auth"."uid"())))) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ((NOT "is_private") OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Idea board member remove v3" ON "public"."trip_ideas" FOR DELETE USING (("public"."is_trip_active_member"("trip_id") AND ((NOT "is_private") OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Idea board member select v2" ON "public"."trip_ideas" FOR SELECT USING (("public"."is_trip_active_member"("trip_id") AND ((NOT "is_private") OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Language welcome labels are readable" ON "public"."language_welcome_labels" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Member can add idea board rows" ON "public"."trip_ideas" FOR INSERT WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Owners can remove solo trips" ON "public"."trips" FOR DELETE USING (("public"."is_trip_owner"("id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "trips"."id") AND ("tm"."user_id" <> "auth"."uid"()) AND ("tm"."status" = 'active'::"text")))))));



CREATE POLICY "Published terms are visible to everyone" ON "public"."terms_versions" FOR SELECT USING (("published_at" IS NOT NULL));



CREATE POLICY "Recipients can update passport stamp shares" ON "public"."user_passport_stamp_shares" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "recipient_user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "recipient_user_id"));



CREATE POLICY "Super admins can manage terms" ON "public"."terms_versions" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can read all feature suggestions" ON "public"."feature_suggestions" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can update feature suggestions" ON "public"."feature_suggestions" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Trip members can add food items" ON "public"."trip_food_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Trip members can add transportation travelers" ON "public"."transportation_item_travelers" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("ti"."id" = "transportation_item_travelers"."transportation_item_id") AND ("ti"."trip_id" = "transportation_item_travelers"."trip_id") AND (("ti"."is_private" = false) OR ("ti"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Trip members can create accommodations" ON "public"."trip_accommodations" FOR INSERT WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can create budget categories" ON "public"."trip_budget_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create budget items" ON "public"."budget_items" FOR INSERT WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can create budget line items" ON "public"."trip_budget_line_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create budgets" ON "public"."trip_budgets" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create expense receipts" ON "public"."trip_expense_receipts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create expense splits" ON "public"."trip_expense_splits" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create expenses" ON "public"."trip_expenses" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create item participants" ON "public"."trip_item_participants" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can create itinerary items" ON "public"."itinerary_items" FOR INSERT WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can create journey planning state" ON "public"."trip_journey_planning_states" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Trip members can create leg-scoped itinerary items" ON "public"."itinerary_items" FOR INSERT TO "authenticated" WITH CHECK (((COALESCE("created_by", "auth"."uid"()) = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can create leg-scoped transportation items" ON "public"."transportation_items" FOR INSERT TO "authenticated" WITH CHECK (((COALESCE("created_by", "auth"."uid"()) = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can create leg-scoped trip ideas" ON "public"."trip_ideas" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can create transportation items" ON "public"."transportation_items" FOR INSERT WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can create trip accommodations" ON "public"."trip_accommodations" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_trip_leg"("trip_id", "trip_leg_id"));



CREATE POLICY "Trip members can create trip legs" ON "public"."trip_legs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can create trip member legs" ON "public"."trip_member_legs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete budget categories" ON "public"."trip_budget_categories" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete budget line items" ON "public"."trip_budget_line_items" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete budgets" ON "public"."trip_budgets" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete expense receipts" ON "public"."trip_expense_receipts" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete expense splits" ON "public"."trip_expense_splits" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete expenses" ON "public"."trip_expenses" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete invitation legs" ON "public"."trip_invitation_legs" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete item participants" ON "public"."trip_item_participants" FOR DELETE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can delete leg-scoped itinerary items" ON "public"."itinerary_items" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can delete leg-scoped transportation items" ON "public"."transportation_items" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can delete leg-scoped trip ideas" ON "public"."trip_ideas" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can delete member legs" ON "public"."trip_member_legs" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete transportation travelers" ON "public"."transportation_item_travelers" FOR DELETE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("ti"."id" = "transportation_item_travelers"."transportation_item_id") AND ("ti"."trip_id" = "transportation_item_travelers"."trip_id") AND (("ti"."is_private" = false) OR ("ti"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Trip members can delete trip accommodations" ON "public"."trip_accommodations" FOR DELETE TO "authenticated" USING ("public"."can_access_trip_leg"("trip_id", "trip_leg_id"));



CREATE POLICY "Trip members can delete trip legs" ON "public"."trip_legs" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete trip member legs" ON "public"."trip_member_legs" FOR DELETE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can delete visible accommodations" ON "public"."trip_accommodations" FOR DELETE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'accommodation'::"text", "id"));



CREATE POLICY "Trip members can delete visible budget items" ON "public"."budget_items" FOR DELETE USING (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can delete visible itinerary items" ON "public"."itinerary_items" FOR DELETE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'itinerary'::"text", "id"));



CREATE POLICY "Trip members can delete visible transportation items" ON "public"."transportation_items" FOR DELETE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'transportation'::"text", "id"));



CREATE POLICY "Trip members can insert invitation legs" ON "public"."trip_invitation_legs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can insert member legs" ON "public"."trip_member_legs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update budget categories" ON "public"."trip_budget_categories" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update budget line items" ON "public"."trip_budget_line_items" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update budgets" ON "public"."trip_budgets" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update expense splits" ON "public"."trip_expense_splits" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update expenses" ON "public"."trip_expenses" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update invitation legs" ON "public"."trip_invitation_legs" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update item participants" ON "public"."trip_item_participants" FOR UPDATE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND ("created_by" = "auth"."uid"()))) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update journey planning state" ON "public"."trip_journey_planning_states" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Trip members can update leg-scoped itinerary items" ON "public"."itinerary_items" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can update leg-scoped transportation items" ON "public"."transportation_items" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can update leg-scoped trip ideas" ON "public"."trip_ideas" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")));



CREATE POLICY "Trip members can update member legs" ON "public"."trip_member_legs" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update transportation travelers" ON "public"."transportation_item_travelers" FOR UPDATE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("ti"."id" = "transportation_item_travelers"."transportation_item_id") AND ("ti"."trip_id" = "transportation_item_travelers"."trip_id") AND (("ti"."is_private" = false) OR ("ti"."created_by" = "auth"."uid"()))))))) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("ti"."id" = "transportation_item_travelers"."transportation_item_id") AND ("ti"."trip_id" = "transportation_item_travelers"."trip_id") AND (("ti"."is_private" = false) OR ("ti"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Trip members can update trip accommodations" ON "public"."trip_accommodations" FOR UPDATE TO "authenticated" USING ("public"."can_access_trip_leg"("trip_id", "trip_leg_id")) WITH CHECK ("public"."can_access_trip_leg"("trip_id", "trip_leg_id"));



CREATE POLICY "Trip members can update trip legs" ON "public"."trip_legs" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update trip member legs" ON "public"."trip_member_legs" FOR UPDATE TO "authenticated" USING ("public"."is_trip_active_member"("trip_id")) WITH CHECK ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can update visible accommodations" ON "public"."trip_accommodations" FOR UPDATE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'accommodation'::"text", "id")) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can update visible budget items" ON "public"."budget_items" FOR UPDATE USING (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"())))) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can update visible itinerary items" ON "public"."itinerary_items" FOR UPDATE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'itinerary'::"text", "id")) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can update visible transportation items" ON "public"."transportation_items" FOR UPDATE TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'transportation'::"text", "id")) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can view basic profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."user_id" = "user_profiles"."id") AND "public"."is_trip_active_member"("tm"."trip_id")))));



CREATE POLICY "Trip members can view budget categories" ON "public"."trip_budget_categories" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view budget line items" ON "public"."trip_budget_line_items" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view budgets" ON "public"."trip_budgets" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view expense receipts" ON "public"."trip_expense_receipts" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view expense splits" ON "public"."trip_expense_splits" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view expenses" ON "public"."trip_expenses" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view food items" ON "public"."trip_food_items" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view food reactions" ON "public"."trip_food_reactions" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view journey planning state" ON "public"."trip_journey_planning_states" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view leg-scoped itinerary items" ON "public"."itinerary_items" FOR SELECT TO "authenticated" USING ((((COALESCE("is_private", false) = false) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can view leg-scoped transportation items" ON "public"."transportation_items" FOR SELECT TO "authenticated" USING ((((COALESCE("is_private", false) = false) AND "public"."can_access_trip_leg"("trip_id", "trip_leg_id")) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "Trip members can view leg-scoped trip ideas" ON "public"."trip_ideas" FOR SELECT TO "authenticated" USING ("public"."can_access_trip_leg"("trip_id", "trip_leg_id"));



CREATE POLICY "Trip members can view member legs" ON "public"."trip_member_legs" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view transportation travelers" ON "public"."transportation_item_travelers" FOR SELECT TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("ti"."id" = "transportation_item_travelers"."transportation_item_id") AND ("ti"."trip_id" = "transportation_item_travelers"."trip_id") AND (("ti"."is_private" = false) OR ("ti"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Trip members can view tried statuses" ON "public"."trip_food_tried" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view trip accommodations" ON "public"."trip_accommodations" FOR SELECT TO "authenticated" USING ("public"."can_access_trip_leg"("trip_id", "trip_leg_id"));



CREATE POLICY "Trip members can view trip family member links" ON "public"."trip_family_members" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view trip family members" ON "public"."user_family_members" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."trip_family_members" "tfm"
  WHERE (("tfm"."family_member_id" = "user_family_members"."id") AND ("tfm"."status" = 'going'::"text") AND "public"."is_trip_active_member"("tfm"."trip_id")))));



CREATE POLICY "Trip members can view trip legs" ON "public"."trip_legs" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view trip member legs" ON "public"."trip_member_legs" FOR SELECT TO "authenticated" USING ("public"."is_trip_active_member"("trip_id"));



CREATE POLICY "Trip members can view visible accommodations" ON "public"."trip_accommodations" FOR SELECT TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'accommodation'::"text", "id"));



CREATE POLICY "Trip members can view visible budget items" ON "public"."budget_items" FOR SELECT USING (("public"."is_trip_active_member"("trip_id") AND (("is_private" = false) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Trip members can view visible item participants" ON "public"."trip_item_participants" FOR SELECT TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (("created_by" = "auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."id" = "trip_item_participants"."trip_member_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."status" = 'active'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."itinerary_items" "i"
  WHERE (("trip_item_participants"."item_type" = 'itinerary'::"text") AND ("i"."id" = "trip_item_participants"."item_id") AND ("i"."trip_id" = "trip_item_participants"."trip_id") AND ("i"."is_private" = false) AND ("i"."audience_mode" = 'everyone'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."transportation_items" "ti"
  WHERE (("trip_item_participants"."item_type" = 'transportation'::"text") AND ("ti"."id" = "trip_item_participants"."item_id") AND ("ti"."trip_id" = "trip_item_participants"."trip_id") AND ("ti"."is_private" = false) AND ("ti"."audience_mode" = 'everyone'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."trip_accommodations" "ta"
  WHERE (("trip_item_participants"."item_type" = 'accommodation'::"text") AND ("ta"."id" = "trip_item_participants"."item_id") AND ("ta"."trip_id" = "trip_item_participants"."trip_id") AND ("ta"."is_private" = false) AND ("ta"."audience_mode" = 'everyone'::"text")))))));



CREATE POLICY "Trip members can view visible itinerary items" ON "public"."itinerary_items" FOR SELECT TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'itinerary'::"text", "id"));



CREATE POLICY "Trip members can view visible transportation items" ON "public"."transportation_items" FOR SELECT TO "authenticated" USING ("public"."is_trip_item_visible"("trip_id", "created_by", "is_private", "audience_mode", 'transportation'::"text", "id"));



CREATE POLICY "Trip participants can view trip legs" ON "public"."trip_legs" FOR SELECT TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") OR (EXISTS ( SELECT 1
   FROM "public"."trip_invitations" "ti"
  WHERE (("ti"."trip_id" = "trip_legs"."trip_id") AND ("ti"."invited_user_id" = "auth"."uid"()) AND ("ti"."status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))))));



CREATE POLICY "Users can accept terms for themselves" ON "public"."user_terms_acceptances" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can add own family members to active trips" ON "public"."trip_family_members" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_trip_active_member"("trip_id") AND ("added_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_family_members" "ufm"
  WHERE (("ufm"."id" = "trip_family_members"."family_member_id") AND ("ufm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can add their own food reactions" ON "public"."trip_food_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."trip_food_items" "f"
  WHERE (("f"."id" = "trip_food_reactions"."food_item_id") AND ("f"."trip_id" = "f"."trip_id"))))));



CREATE POLICY "Users can add their own news feed reactions" ON "public"."news_feed_reactions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create own categories" ON "public"."user_categories" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create own onboarding progress" ON "public"."user_onboarding_progress" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create passport stamp shares they send" ON "public"."user_passport_stamp_shares" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "sender_user_id"));



CREATE POLICY "Users can create their notification preferences" ON "public"."user_notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can create their own email import addresses" ON "public"."user_email_import_addresses" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create their own feature suggestions" ON "public"."feature_suggestions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create their own friendship requests" ON "public"."user_friendships" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "requester_user_id"));



CREATE POLICY "Users can create their own passport stamps" ON "public"."user_passport_stamps" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can create their own scratch map countries" ON "public"."user_scratch_map_countries" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create their own travel bucket list" ON "public"."user_travel_bucket_list" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create their own trips" ON "public"."trips" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their push subscriptions" ON "public"."user_push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete own categories" ON "public"."user_categories" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own food reactions" ON "public"."trip_food_reactions" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id")));



CREATE POLICY "Users can delete their own idea reactions" ON "public"."trip_idea_reactions" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_idea_reactions"."trip_id") AND ("t"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete their own news feed reactions" ON "public"."news_feed_reactions" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own passport stamps" ON "public"."user_passport_stamps" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete their own scratch map countries" ON "public"."user_scratch_map_countries" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own travel bucket list" ON "public"."user_travel_bucket_list" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own travel email imports" ON "public"."travel_email_imports" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own onboarding progress" ON "public"."user_onboarding_progress" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own idea reactions" ON "public"."trip_idea_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_idea_reactions"."trip_id") AND ("t"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."trip_ideas" "i"
  WHERE (("i"."id" = "trip_idea_reactions"."idea_id") AND ("i"."trip_id" = "trip_idea_reactions"."trip_id"))))));



CREATE POLICY "Users can manage own family members" ON "public"."user_family_members" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own finance settings" ON "public"."user_finance_settings" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can mark their own food tried" ON "public"."trip_food_tried" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."trip_food_items" "f"
  WHERE (("f"."id" = "trip_food_tried"."food_item_id") AND ("f"."trip_id" = "f"."trip_id"))))));



CREATE POLICY "Users can read own onboarding progress" ON "public"."user_onboarding_progress" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own preferences" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read their own email import addresses" ON "public"."user_email_import_addresses" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own feature suggestions" ON "public"."feature_suggestions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can record their own daily activity" ON "public"."user_activity_daily" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can refresh their own daily activity" ON "public"."user_activity_daily" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can remove own trip family member links" ON "public"."trip_family_members" FOR DELETE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_family_members" "ufm"
  WHERE (("ufm"."id" = "trip_family_members"."family_member_id") AND ("ufm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can remove their own tried status" ON "public"."trip_food_tried" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id")));



CREATE POLICY "Users can respond to their pending invitations" ON "public"."trip_invitations" FOR UPDATE USING ((("invited_user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK ((("invited_user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))));



CREATE POLICY "Users can update own categories" ON "public"."user_categories" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own onboarding progress" ON "public"."user_onboarding_progress" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own trip family member links" ON "public"."trip_family_members" FOR UPDATE TO "authenticated" USING (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_family_members" "ufm"
  WHERE (("ufm"."id" = "trip_family_members"."family_member_id") AND ("ufm"."user_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_family_members" "ufm"
  WHERE (("ufm"."id" = "trip_family_members"."family_member_id") AND ("ufm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update their notification preferences" ON "public"."user_notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own email import addresses" ON "public"."user_email_import_addresses" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own food reactions" ON "public"."trip_food_reactions" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_trip_active_member"("trip_id") AND (EXISTS ( SELECT 1
   FROM "public"."trip_food_items" "f"
  WHERE (("f"."id" = "trip_food_reactions"."food_item_id") AND ("f"."trip_id" = "f"."trip_id"))))));



CREATE POLICY "Users can update their own friendship requests" ON "public"."user_friendships" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "requester_user_id") OR (( SELECT "auth"."uid"() AS "uid") = "addressee_user_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "requester_user_id") OR (( SELECT "auth"."uid"() AS "uid") = "addressee_user_id")));



CREATE POLICY "Users can update their own idea reactions" ON "public"."trip_idea_reactions" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_idea_reactions"."trip_id") AND ("t"."user_id" = "auth"."uid"())))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_idea_reactions"."trip_id") AND ("t"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."trip_ideas" "i"
  WHERE (("i"."id" = "trip_idea_reactions"."idea_id") AND ("i"."trip_id" = "trip_idea_reactions"."trip_id"))))));



CREATE POLICY "Users can update their own passport stamps" ON "public"."user_passport_stamps" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own scratch map countries" ON "public"."user_scratch_map_countries" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own travel bucket list" ON "public"."user_travel_bucket_list" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own trips" ON "public"."trips" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their push subscriptions" ON "public"."user_push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view accessible news feed posts" ON "public"."news_feed_posts" FOR SELECT TO "authenticated" USING ((("audience_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_friendships" "friendships"
  WHERE (("friendships"."status" = 'accepted'::"text") AND ((("friendships"."requester_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."addressee_user_id" = COALESCE("news_feed_posts"."actor_user_id", "news_feed_posts"."user_id"))) OR (("friendships"."addressee_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."requester_user_id" = COALESCE("news_feed_posts"."actor_user_id", "news_feed_posts"."user_id")))))))));



CREATE POLICY "Users can view invitation legs they sent or received" ON "public"."trip_invitation_legs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."trip_invitations" "ti"
  WHERE (("ti"."id" = "trip_invitation_legs"."invitation_id") AND (("ti"."invited_by" = "auth"."uid"()) OR ("ti"."invited_user_id" = "auth"."uid"()))))) OR "public"."is_trip_active_member"("trip_id")));



CREATE POLICY "Users can view invitations they sent or received" ON "public"."trip_invitations" FOR SELECT USING ((("invited_by" = "auth"."uid"()) OR ("invited_user_id" = "auth"."uid"())));



CREATE POLICY "Users can view own and trip-visible categories" ON "public"."user_categories" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."itinerary_items" "ii"
  WHERE (("ii"."category_id" = "user_categories"."id") AND "public"."is_trip_active_member"("ii"."trip_id") AND (("ii"."is_private" = false) OR ("ii"."created_by" = "auth"."uid"())))))));



CREATE POLICY "Users can view own app alerts" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view reactions for their trips" ON "public"."trip_idea_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_idea_reactions"."trip_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view reactions on accessible news feed posts" ON "public"."news_feed_reactions" FOR SELECT TO "authenticated" USING ((("post_key" = ANY (ARRAY['weather-environment-next-trips'::"text", 'travel-advisories-home-country'::"text", 'local-news-trip-cities'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."news_feed_posts" "posts"
  WHERE (("posts"."post_key" = "news_feed_reactions"."post_key") AND ("posts"."archived_at" IS NULL) AND (("posts"."audience_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("posts"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("posts"."actor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."user_friendships" "friendships"
          WHERE (("friendships"."status" = 'accepted'::"text") AND ((("friendships"."requester_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."addressee_user_id" = COALESCE("posts"."actor_user_id", "posts"."user_id"))) OR (("friendships"."addressee_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("friendships"."requester_user_id" = COALESCE("posts"."actor_user_id", "posts"."user_id")))))))))))));



CREATE POLICY "Users can view relevant trip members" ON "public"."trip_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_trip_active_member"("trip_id")));



CREATE POLICY "Users can view their notification preferences" ON "public"."user_notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own data export records" ON "public"."user_data_exports" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own friendships" ON "public"."user_friendships" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "requester_user_id") OR (( SELECT "auth"."uid"() AS "uid") = "addressee_user_id")));



CREATE POLICY "Users can view their own passport stamp shares" ON "public"."user_passport_stamp_shares" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "sender_user_id") OR (( SELECT "auth"."uid"() AS "uid") = "recipient_user_id")));



CREATE POLICY "Users can view their own passport stamps" ON "public"."user_passport_stamps" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own point events" ON "public"."user_point_events" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their own points" ON "public"."user_points" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their own scratch map countries" ON "public"."user_scratch_map_countries" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own terms acceptances" ON "public"."user_terms_acceptances" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their own travel bucket list" ON "public"."user_travel_bucket_list" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own travel email imports" ON "public"."travel_email_imports" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own trips" ON "public"."trips" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their push subscriptions" ON "public"."user_push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."airports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budget_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_color_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."currency_exchange_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_email_invite_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itinerary_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."language_welcome_labels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_feed_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_feed_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_push_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terms_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transportation_item_travelers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transportation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."travel_email_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_accommodations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_budget_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_budget_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_expense_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_expense_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_family_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_food_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_food_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_food_tried" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_idea_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_ideas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_invitation_legs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_item_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_journey_planning_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_legs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_member_legs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_data_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_email_import_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_family_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_finance_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_onboarding_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_passport_stamp_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_passport_stamps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_point_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_scratch_map_countries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_terms_acceptances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_travel_bucket_list" ENABLE ROW LEVEL SECURITY;










ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































REVOKE ALL ON FUNCTION "public"."accept_current_terms"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_current_terms"() TO "anon";
GRANT ALL ON FUNCTION "public"."accept_current_terms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_current_terms"() TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_trip_invitation"("invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_trip_invitation"("invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_trip_invitation"("invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_trip_invitation_with_scope"("target_invitation_id" "uuid", "target_confirmed_start_date" "date", "target_confirmed_end_date" "date", "target_personal_start_date" "date", "target_personal_end_date" "date", "target_joining_leg_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_trip_invitation_with_scope"("target_invitation_id" "uuid", "target_confirmed_start_date" "date", "target_confirmed_end_date" "date", "target_personal_start_date" "date", "target_personal_end_date" "date", "target_joining_leg_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_trip_invitation_with_scope"("target_invitation_id" "uuid", "target_confirmed_start_date" "date", "target_confirmed_end_date" "date", "target_personal_start_date" "date", "target_personal_end_date" "date", "target_joining_leg_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_place_stats"("range_start" "date", "range_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_place_stats"("range_start" "date", "range_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_place_stats"("range_start" "date", "range_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_place_stats"("range_start" "date", "range_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user_profile"("target_user_id" "uuid", "target_first_name" "text", "target_last_name" "text", "target_username" "text", "target_email" "text", "target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user_profile"("target_user_id" "uuid", "target_first_name" "text", "target_last_name" "text", "target_username" "text", "target_email" "text", "target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_user_profile"("target_user_id" "uuid", "target_first_name" "text", "target_last_name" "text", "target_username" "text", "target_email" "text", "target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_profile"("target_user_id" "uuid", "target_first_name" "text", "target_last_name" "text", "target_username" "text", "target_email" "text", "target_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approximate_latin_slug_input"("input_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approximate_latin_slug_input"("input_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approximate_latin_slug_input"("input_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_friend"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_friend"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."block_friend"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_friend"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_trip_leg"("target_trip_id" "uuid", "target_trip_leg_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_trip_leg"("target_trip_id" "uuid", "target_trip_leg_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_trip_leg"("target_trip_id" "uuid", "target_trip_leg_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_trip_invitation"("invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_trip_invitation"("invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_trip_invitation"("invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_trip_invitation"("invitation_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."external_email_invite_outbox" TO "anon";
GRANT ALL ON TABLE "public"."external_email_invite_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."external_email_invite_outbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_external_email_invite_outbox"("batch_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_external_email_invite_outbox"("batch_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_external_email_invite_outbox"("batch_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_external_email_invite_outbox"("batch_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."notification_email_outbox" TO "anon";
GRANT ALL ON TABLE "public"."notification_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_email_outbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_notification_email_outbox"("batch_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_notification_email_outbox"("batch_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_notification_email_outbox"("batch_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_notification_email_outbox"("batch_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."notification_push_outbox" TO "anon";
GRANT ALL ON TABLE "public"."notification_push_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_push_outbox" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_notification_push_outbox"("batch_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_notification_push_outbox"("batch_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_notification_push_outbox"("batch_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_notification_push_outbox"("batch_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_pending_trip_invitations_for_current_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_pending_trip_invitations_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_trip_invitations_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_trip_invitations_for_current_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_friend_invitation"("invitee_identifier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_friend_invitation"("invitee_identifier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_friend_invitation"("invitee_identifier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_friend_invitation"("invitee_identifier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_trip_invitation"("target_trip_id" "uuid", "invitee_identifier" "text", "consent_confirmed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip_invitation"("target_trip_id" "uuid", "invitee_identifier" "text", "consent_confirmed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_invitation"("target_trip_id" "uuid", "invitee_identifier" "text", "consent_confirmed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_invitation"("target_trip_id" "uuid", "invitee_identifier" "text", "consent_confirmed" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_current_terms"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_current_terms"() TO "anon";
GRANT ALL ON FUNCTION "public"."decline_current_terms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_current_terms"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_trip_invitation"("invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_trip_invitation"("invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_trip_invitation"("invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_trip_invitation"("invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_user_category_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_user_category_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_user_category_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_user_family_member_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_user_family_member_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_user_family_member_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_user_profile_role_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_user_profile_role_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_user_profile_role_permissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_preferences_for_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_preferences_for_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_preferences_for_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_preferences_for_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."friendship_block_exists"("blocker_user_id" "uuid", "blocked_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."friendship_block_exists"("blocker_user_id" "uuid", "blocked_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."friendship_block_exists"("blocker_user_id" "uuid", "blocked_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_feature_suggestions"("limit_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_feature_suggestions"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_feature_suggestions"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_feature_suggestions"("limit_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_site_stats"("range_start" "date", "range_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_site_stats"("range_start" "date", "range_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_site_stats"("range_start" "date", "range_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_trip_slug"("base_slug" "text", "excluded_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_trip_slug"("base_slug" "text", "excluded_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_trip_slug"("base_slug" "text", "excluded_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_trip_slug_for_user"("target_user_id" "uuid", "base_slug" "text", "excluded_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_trip_slug_for_user"("target_user_id" "uuid", "base_slug" "text", "excluded_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_trip_slug_for_user"("target_user_id" "uuid", "base_slug" "text", "excluded_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_friend_profile_snapshot"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_friend_profile_snapshot"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_friend_profile_snapshot"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_profile_snapshot"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_passport_stamp_share_review"("share_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_passport_stamp_share_review"("share_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_passport_stamp_share_review"("share_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_passport_stamp_share_review"("share_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trip_slug_fallback_for_user"("target_user_id" "uuid", "excluded_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_trip_slug_fallback_for_user"("target_user_id" "uuid", "excluded_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_slug_fallback_for_user"("target_user_id" "uuid", "excluded_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_display_name"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_categories"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_active_member"("target_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_active_member"("target_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_active_member"("target_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_item_visible"("target_trip_id" "uuid", "target_created_by" "uuid", "target_is_private" boolean, "target_audience_mode" "text", "target_item_type" "text", "target_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_item_visible"("target_trip_id" "uuid", "target_created_by" "uuid", "target_is_private" boolean, "target_audience_mode" "text", "target_item_type" "text", "target_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trip_owner"("target_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_owner"("target_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_owner"("target_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_trip"("target_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_trip"("target_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_trip"("target_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_app_alert_read"("alert_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_app_alert_read"("alert_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_app_alert_read"("alert_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_trip_slug"("input_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_trip_slug"("input_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_trip_slug"("input_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_feature_suggestion_implemented"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_feature_suggestion_implemented"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_feature_suggestion_implemented"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_feature_suggestion_implemented"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_trip_members"("target_trip_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_trip_members"("target_trip_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_trip_members"("target_trip_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_trip_slug_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_trip_slug_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_trip_slug_changed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_external_invite_email"("invite_event_key" "text", "invite_type" "text", "recipient_email" "text", "inviter_user_id" "uuid", "trip_id" "uuid", "related_id" "uuid", "subject" "text", "payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_external_invite_email"("invite_event_key" "text", "invite_type" "text", "recipient_email" "text", "inviter_user_id" "uuid", "trip_id" "uuid", "related_id" "uuid", "subject" "text", "payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."queue_external_invite_email"("invite_event_key" "text", "invite_type" "text", "recipient_email" "text", "inviter_user_id" "uuid", "trip_id" "uuid", "related_id" "uuid", "subject" "text", "payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_external_invite_email"("invite_event_key" "text", "invite_type" "text", "recipient_email" "text", "inviter_user_id" "uuid", "trip_id" "uuid", "related_id" "uuid", "subject" "text", "payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_notification_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_notification_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_notification_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_notification_push"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_notification_push"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_notification_push"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_all_user_points"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_all_user_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_all_user_points"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_user_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_user_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_user_activity"() TO "service_role";



GRANT ALL ON TABLE "public"."user_point_events" TO "anon";
GRANT ALL ON TABLE "public"."user_point_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_point_events" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_user_point_event"("target_user_id" "uuid", "event_type" "text", "point_delta" integer, "source_table" "text", "source_id" "uuid", "metadata" "jsonb", "occurred_at" timestamp with time zone, "unique_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_user_point_event"("target_user_id" "uuid", "event_type" "text", "point_delta" integer, "source_table" "text", "source_id" "uuid", "metadata" "jsonb", "occurred_at" timestamp with time zone, "unique_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_user_point_event"("target_user_id" "uuid", "event_type" "text", "point_delta" integer, "source_table" "text", "source_id" "uuid", "metadata" "jsonb", "occurred_at" timestamp with time zone, "unique_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_user_point_event"("target_user_id" "uuid", "event_type" "text", "point_delta" integer, "source_table" "text", "source_id" "uuid", "metadata" "jsonb", "occurred_at" timestamp with time zone, "unique_key" "text") TO "service_role";



GRANT ALL ON TABLE "public"."user_points" TO "anon";
GRANT ALL ON TABLE "public"."user_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_points" TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_user_points"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_user_points"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_points"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_points"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_account_deletion_after_terms_decline"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_account_deletion_after_terms_decline"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_account_deletion_after_terms_decline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_account_deletion_after_terms_decline"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_current_user_account_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_current_user_account_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_current_user_account_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_current_user_account_deletion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_trip_member_slug_conflicts"() TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_trip_member_slug_conflicts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_trip_member_slug_conflicts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_trip_slug_conflicts_for_trip_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_trip_slug_conflicts_for_trip_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_trip_slug_conflicts_for_trip_members"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_friend_invitation"("friendship_id" "uuid", "next_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_friend_invitation"("friendship_id" "uuid", "next_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_friend_invitation"("friendship_id" "uuid", "next_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_friend_invitation"("friendship_id" "uuid", "next_status" "text") TO "service_role";



GRANT ALL ON TABLE "public"."user_passport_stamp_shares" TO "anon";
GRANT ALL ON TABLE "public"."user_passport_stamp_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."user_passport_stamp_shares" TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_passport_stamp_share"("share_id" "uuid", "next_status" "text", "stamp_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_passport_stamp_share"("share_id" "uuid", "next_status" "text", "stamp_patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."respond_to_passport_stamp_share"("share_id" "uuid", "next_status" "text", "stamp_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_passport_stamp_share"("share_id" "uuid", "next_status" "text", "stamp_patch" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."user_email_import_addresses" TO "anon";
GRANT ALL ON TABLE "public"."user_email_import_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_email_import_addresses" TO "service_role";



REVOKE ALL ON FUNCTION "public"."rotate_user_email_import_address"("target_user_id" "uuid", "new_inbound_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rotate_user_email_import_address"("target_user_id" "uuid", "new_inbound_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_user_categories"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_user_categories"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_user_categories"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_passport_stamp_share"("source_stamp_id" "uuid", "recipient_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_passport_stamp_share"("source_stamp_id" "uuid", "recipient_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."send_passport_stamp_share"("source_stamp_id" "uuid", "recipient_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_passport_stamp_share"("source_stamp_id" "uuid", "recipient_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_and_validate_trip_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_and_validate_trip_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_and_validate_trip_slug"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_marketing_email_consent"("consent" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_marketing_email_consent"("consent" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_marketing_email_consent"("consent" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_marketing_email_consent"("consent" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_transportation_item_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_transportation_item_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_transportation_item_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_slug_conflicts_for_user"("target_user_id" "uuid", "target_slug" "text", "excluded_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trip_slug_conflicts_for_user"("target_user_id" "uuid", "target_slug" "text", "excluded_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_slug_conflicts_for_user"("target_user_id" "uuid", "target_slug" "text", "excluded_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unfriend_user"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unfriend_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unfriend_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unfriend_user"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vaivia_level_for_points"("raw_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vaivia_level_for_points"("raw_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_level_for_points"("raw_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_level_for_points"("raw_points" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_points_after_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_points_after_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_points_after_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_points_after_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_points_after_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_points_after_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_points_friendship_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_points_trip_expense_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_points_trip_expense_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_points_trip_expense_soft_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vaivia_trip_owner"("trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."vaivia_trip_owner"("trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vaivia_trip_owner"("trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_transportation_item_traveler"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_transportation_item_traveler"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_transportation_item_traveler"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_trip_countdown_target_v2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."visible_trip_member_ids"("target_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."visible_trip_member_ids"("target_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."visible_trip_member_ids"("target_trip_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."airports" TO "anon";
GRANT ALL ON TABLE "public"."airports" TO "authenticated";
GRANT ALL ON TABLE "public"."airports" TO "service_role";



GRANT ALL ON TABLE "public"."budget_items" TO "anon";
GRANT ALL ON TABLE "public"."budget_items" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_items" TO "service_role";



GRANT ALL ON TABLE "public"."category_color_options" TO "anon";
GRANT ALL ON TABLE "public"."category_color_options" TO "authenticated";
GRANT ALL ON TABLE "public"."category_color_options" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."user_friendships" TO "anon";
GRANT ALL ON TABLE "public"."user_friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."user_friendships" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."connected_public_user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."connected_public_user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."connected_public_user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."countries" TO "anon";
GRANT ALL ON TABLE "public"."countries" TO "authenticated";
GRANT ALL ON TABLE "public"."countries" TO "service_role";



GRANT ALL ON TABLE "public"."currency_exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."currency_exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."currency_exchange_rates" TO "service_role";



GRANT ALL ON TABLE "public"."feature_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."feature_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."itinerary_items" TO "anon";
GRANT ALL ON TABLE "public"."itinerary_items" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerary_items" TO "service_role";



GRANT ALL ON TABLE "public"."language_welcome_labels" TO "anon";
GRANT ALL ON TABLE "public"."language_welcome_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."language_welcome_labels" TO "service_role";



GRANT ALL ON TABLE "public"."news_feed_posts" TO "anon";
GRANT ALL ON TABLE "public"."news_feed_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."news_feed_posts" TO "service_role";



GRANT ALL ON TABLE "public"."news_feed_reactions" TO "anon";
GRANT ALL ON TABLE "public"."news_feed_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."news_feed_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."terms_versions" TO "anon";
GRANT ALL ON TABLE "public"."terms_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."terms_versions" TO "service_role";



GRANT ALL ON TABLE "public"."transportation_item_travelers" TO "anon";
GRANT ALL ON TABLE "public"."transportation_item_travelers" TO "authenticated";
GRANT ALL ON TABLE "public"."transportation_item_travelers" TO "service_role";



GRANT ALL ON TABLE "public"."transportation_items" TO "anon";
GRANT ALL ON TABLE "public"."transportation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."transportation_items" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."travel_email_imports" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."travel_email_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."travel_email_imports" TO "service_role";



GRANT ALL ON TABLE "public"."trip_accommodations" TO "anon";
GRANT ALL ON TABLE "public"."trip_accommodations" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_accommodations" TO "service_role";



GRANT ALL ON TABLE "public"."trip_budget_categories" TO "anon";
GRANT ALL ON TABLE "public"."trip_budget_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_budget_categories" TO "service_role";



GRANT ALL ON TABLE "public"."trip_budget_line_items" TO "anon";
GRANT ALL ON TABLE "public"."trip_budget_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_budget_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."trip_budgets" TO "anon";
GRANT ALL ON TABLE "public"."trip_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."trip_expense_receipts" TO "anon";
GRANT ALL ON TABLE "public"."trip_expense_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_expense_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."trip_expense_splits" TO "anon";
GRANT ALL ON TABLE "public"."trip_expense_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_expense_splits" TO "service_role";



GRANT ALL ON TABLE "public"."trip_expenses" TO "anon";
GRANT ALL ON TABLE "public"."trip_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."trip_family_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_family_members" TO "service_role";



GRANT ALL ON TABLE "public"."trip_food_items" TO "anon";
GRANT ALL ON TABLE "public"."trip_food_items" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_food_items" TO "service_role";



GRANT ALL ON TABLE "public"."trip_food_reactions" TO "anon";
GRANT ALL ON TABLE "public"."trip_food_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_food_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."trip_food_tried" TO "anon";
GRANT ALL ON TABLE "public"."trip_food_tried" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_food_tried" TO "service_role";



GRANT ALL ON TABLE "public"."trip_idea_reactions" TO "anon";
GRANT ALL ON TABLE "public"."trip_idea_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_idea_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."trip_ideas" TO "anon";
GRANT ALL ON TABLE "public"."trip_ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_ideas" TO "service_role";



GRANT ALL ON TABLE "public"."trip_invitation_legs" TO "anon";
GRANT ALL ON TABLE "public"."trip_invitation_legs" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_invitation_legs" TO "service_role";



GRANT ALL ON TABLE "public"."trip_invitations" TO "anon";
GRANT ALL ON TABLE "public"."trip_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."trip_item_participants" TO "anon";
GRANT ALL ON TABLE "public"."trip_item_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_item_participants" TO "service_role";



GRANT ALL ON TABLE "public"."user_family_members" TO "anon";
GRANT ALL ON TABLE "public"."user_family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."user_family_members" TO "service_role";



GRANT ALL ON TABLE "public"."trip_item_participants_display" TO "anon";
GRANT ALL ON TABLE "public"."trip_item_participants_display" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_item_participants_display" TO "service_role";



GRANT ALL ON TABLE "public"."trip_journey_planning_states" TO "anon";
GRANT ALL ON TABLE "public"."trip_journey_planning_states" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_journey_planning_states" TO "service_role";



GRANT ALL ON TABLE "public"."trip_legs" TO "anon";
GRANT ALL ON TABLE "public"."trip_legs" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_legs" TO "service_role";



GRANT ALL ON TABLE "public"."trip_member_legs" TO "anon";
GRANT ALL ON TABLE "public"."trip_member_legs" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_member_legs" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity_daily" TO "service_role";
GRANT INSERT,UPDATE ON TABLE "public"."user_activity_daily" TO "authenticated";



GRANT ALL ON TABLE "public"."user_categories" TO "anon";
GRANT ALL ON TABLE "public"."user_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."user_categories" TO "service_role";



GRANT ALL ON TABLE "public"."user_data_exports" TO "anon";
GRANT ALL ON TABLE "public"."user_data_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_data_exports" TO "service_role";



GRANT ALL ON TABLE "public"."user_finance_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_finance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_finance_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_passport_stamps" TO "anon";
GRANT ALL ON TABLE "public"."user_passport_stamps" TO "authenticated";
GRANT ALL ON TABLE "public"."user_passport_stamps" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."user_scratch_map_countries" TO "anon";
GRANT ALL ON TABLE "public"."user_scratch_map_countries" TO "authenticated";
GRANT ALL ON TABLE "public"."user_scratch_map_countries" TO "service_role";



GRANT ALL ON TABLE "public"."user_terms_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."user_terms_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."user_terms_acceptances" TO "service_role";



GRANT ALL ON TABLE "public"."user_travel_bucket_list" TO "anon";
GRANT ALL ON TABLE "public"."user_travel_bucket_list" TO "authenticated";
GRANT ALL ON TABLE "public"."user_travel_bucket_list" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






-- Reviewed Storage bucket metadata required by the production schema baseline.
-- This recreates bucket configuration only; it does not copy storage.objects rows
-- or any uploaded files.
INSERT INTO "storage"."buckets" (
    "id",
    "name",
    "owner",
    "owner_id",
    "public",
    "file_size_limit",
    "allowed_mime_types",
    "avif_autodetection"
)
VALUES
    (
        'avatars',
        'avatars',
        NULL,
        NULL,
        TRUE,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        FALSE
    ),
    (
        'expense-receipts',
        'expense-receipts',
        NULL,
        NULL,
        FALSE,
        10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        FALSE
    ),
    (
        'trip-covers',
        'trip-covers',
        NULL,
        NULL,
        FALSE,
        10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp'],
        FALSE
    ),
    (
        'user-data-exports',
        'user-data-exports',
        NULL,
        NULL,
        FALSE,
        524288000,
        ARRAY['application/zip'],
        FALSE
    )
ON CONFLICT ("id") DO UPDATE
SET "name" = EXCLUDED."name",
    "owner" = EXCLUDED."owner",
    "owner_id" = EXCLUDED."owner_id",
    "public" = EXCLUDED."public",
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types",
    "avif_autodetection" = EXCLUDED."avif_autodetection";


























