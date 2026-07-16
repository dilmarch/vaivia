create or replace function public.get_admin_site_stats(
    range_start date default (current_date - interval '30 days')::date,
    range_end date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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
            select coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'themeMode',
                        theme_mode,
                        'count',
                        theme_count
                    )
                    order by theme_mode
                ),
                '[]'::jsonb
            )
            from (
                select
                    coalesce(user_preferences.theme_mode, 'dark') as theme_mode,
                    count(*) as theme_count
                from public.user_profiles
                left join public.user_preferences
                  on user_preferences.user_id = user_profiles.id
                group by coalesce(user_preferences.theme_mode, 'dark')
            ) theme_counts
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
        )
    )
    into result;

    return result;
end;
$$;
revoke all on function public.get_admin_site_stats(date, date) from public;
grant execute on function public.get_admin_site_stats(date, date) to authenticated;
