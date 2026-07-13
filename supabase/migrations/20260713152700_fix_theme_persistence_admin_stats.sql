alter table public.user_preferences
  alter column theme_mode set default 'dark',
  alter column theme_mode set not null;

update public.user_preferences
   set theme_mode = 'dark',
       updated_at = now()
 where theme_mode is null
    or theme_mode not in ('dark', 'pink', 'greyscale', 'brat', 'pride', 'light');

insert into public.user_preferences (user_id, theme_mode)
select user_profiles.id, 'dark'
  from public.user_profiles
 where not exists (
    select 1
      from public.user_preferences
     where user_preferences.user_id = user_profiles.id
 );

create or replace function public.ensure_user_preferences_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id, theme_mode)
  values (new.id, 'dark')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_user_preferences_for_profile_trigger
on public.user_profiles;

create trigger ensure_user_preferences_for_profile_trigger
after insert on public.user_profiles
for each row
execute function public.ensure_user_preferences_for_profile();

revoke all on function public.ensure_user_preferences_for_profile() from public;

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
        )
    )
    into result;

    return result;
end;
$$;

revoke all on function public.get_admin_site_stats(date, date) from public;
grant execute on function public.get_admin_site_stats(date, date) to authenticated;
