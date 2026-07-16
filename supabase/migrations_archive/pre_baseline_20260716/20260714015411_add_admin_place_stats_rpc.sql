create or replace function public.admin_get_place_stats(
    range_start date default null,
    range_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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

revoke all on function public.admin_get_place_stats(date, date) from public;
grant execute on function public.admin_get_place_stats(date, date) to authenticated;
