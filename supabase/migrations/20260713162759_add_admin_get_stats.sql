create or replace function public.admin_get_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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

revoke all on function public.admin_get_stats() from public;
grant execute on function public.admin_get_stats() to authenticated;
