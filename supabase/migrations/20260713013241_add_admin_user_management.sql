create or replace function public.get_admin_users()
returns table (
    id uuid,
    email text,
    first_name text,
    last_name text,
    username text,
    role text,
    join_date timestamptz,
    created_at timestamptz,
    auth_method text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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

revoke all on function public.get_admin_users() from public;
grant execute on function public.get_admin_users() to authenticated;

create or replace function public.admin_update_user_profile(
    target_user_id uuid,
    target_first_name text,
    target_last_name text,
    target_username text,
    target_email text,
    target_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
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

revoke all on function public.admin_update_user_profile(
    uuid,
    text,
    text,
    text,
    text,
    text
) from public;
grant execute on function public.admin_update_user_profile(
    uuid,
    text,
    text,
    text,
    text,
    text
) to authenticated;
