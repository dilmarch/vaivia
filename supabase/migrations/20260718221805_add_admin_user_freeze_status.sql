drop function if exists public.get_admin_users();

create function public.get_admin_users()
returns table(
    id uuid,
    email text,
    first_name text,
    last_name text,
    username text,
    role text,
    join_date timestamp with time zone,
    created_at timestamp with time zone,
    auth_method text,
    is_frozen boolean,
    banned_until timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = 'public', 'auth'
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
        end::text as auth_method,
        coalesce(auth_users.banned_until > now(), false) as is_frozen,
        auth_users.banned_until
    from public.user_profiles
    left join auth.users auth_users
      on auth_users.id = user_profiles.id
    order by user_profiles.join_date desc, user_profiles.created_at desc;
end;
$$;

revoke all on function public.get_admin_users() from public;
revoke all on function public.get_admin_users() from anon;
grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.get_admin_users() to service_role;
