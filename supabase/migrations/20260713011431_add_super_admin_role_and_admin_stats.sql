alter table public.user_profiles
add column if not exists role text not null default 'basic_user';

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'user_profiles_role_check'
    ) then
        alter table public.user_profiles
        drop constraint user_profiles_role_check;
    end if;

    alter table public.user_profiles
    add constraint user_profiles_role_check
    check (role in ('basic_user', 'super_admin'));
end $$;

create index if not exists user_profiles_role_idx
on public.user_profiles(role);

create or replace function public.enforce_user_profile_role_permissions()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
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

drop trigger if exists enforce_user_profile_role_permissions_before_write
on public.user_profiles;

create trigger enforce_user_profile_role_permissions_before_write
before insert or update of role on public.user_profiles
for each row
execute function public.enforce_user_profile_role_permissions();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (
        select 1
        from public.user_profiles
        where user_profiles.id = auth.uid()
          and user_profiles.role = 'super_admin'
    );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

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
                from public.user_preferences
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

drop policy if exists "Super admins can read all feature suggestions"
  on public.feature_suggestions;

create policy "Super admins can read all feature suggestions"
on public.feature_suggestions
for select
to authenticated
using (public.is_super_admin());

drop policy if exists "Super admins can update feature suggestions"
  on public.feature_suggestions;

create policy "Super admins can update feature suggestions"
on public.feature_suggestions
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

grant update on table public.feature_suggestions to authenticated;
