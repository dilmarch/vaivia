create table if not exists public.user_activity_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default ((now() at time zone 'utc'))::date,
  first_active_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.user_activity_daily enable row level security;

drop policy if exists "Users can record their own daily activity"
on public.user_activity_daily;

drop policy if exists "Users can refresh their own daily activity"
on public.user_activity_daily;

create policy "Users can record their own daily activity"
on public.user_activity_daily
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can refresh their own daily activity"
on public.user_activity_daily
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant insert, update on table public.user_activity_daily to authenticated;

create or replace function public.record_user_activity()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_activity_date date := ((now() at time zone 'utc'))::date;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.user_activity_daily (
    user_id,
    activity_date,
    first_active_at,
    last_active_at
  )
  values (
    current_user_id,
    current_activity_date,
    now(),
    now()
  )
  on conflict (user_id, activity_date) do update
    set last_active_at = greatest(
      public.user_activity_daily.last_active_at,
      excluded.last_active_at
    );
end;
$$;

revoke all on function public.record_user_activity() from public;
grant execute on function public.record_user_activity() to authenticated;
