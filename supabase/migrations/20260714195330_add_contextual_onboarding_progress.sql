create table if not exists public.user_onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  flow_version integer not null default 1,
  status text not null default 'not_started',
  current_step text,
  completed_steps text[] not null default array[]::text[],
  started_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_progress
  add column if not exists flow_version integer not null default 1,
  add column if not exists status text not null default 'not_started',
  add column if not exists current_step text,
  add column if not exists completed_steps text[] not null default array[]::text[],
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.user_onboarding_progress
    add constraint user_onboarding_progress_status_check
    check (status in ('not_started', 'in_progress', 'completed', 'dismissed'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_onboarding_progress
    add constraint user_onboarding_progress_current_step_check
    check (
      current_step is null
      or current_step in ('welcome', 'create_trip', 'add_first_item', 'complete')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_onboarding_progress
    add constraint user_onboarding_progress_flow_version_check
    check (flow_version >= 1);
exception
  when duplicate_object then null;
end $$;

alter table public.user_onboarding_progress enable row level security;

drop policy if exists "Users can read own onboarding progress"
  on public.user_onboarding_progress;
create policy "Users can read own onboarding progress"
  on public.user_onboarding_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own onboarding progress"
  on public.user_onboarding_progress;
create policy "Users can insert own onboarding progress"
  on public.user_onboarding_progress
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own onboarding progress"
  on public.user_onboarding_progress;
create policy "Users can update own onboarding progress"
  on public.user_onboarding_progress
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.user_onboarding_progress to authenticated;
revoke all on table public.user_onboarding_progress from anon;

comment on table public.user_onboarding_progress is
  'Tracks each authenticated user contextual VAIVIA onboarding flow progress.';

insert into public.user_onboarding_progress (
  user_id,
  flow_version,
  status,
  current_step,
  completed_steps,
  started_at,
  completed_at,
  dismissed_at,
  updated_at
)
select
  users.id,
  1,
  'in_progress',
  'welcome',
  array[]::text[],
  now(),
  null,
  null,
  now()
from auth.users
on conflict (user_id) do update
set
  flow_version = excluded.flow_version,
  status = 'in_progress',
  current_step = 'welcome',
  completed_steps = array[]::text[],
  started_at = coalesce(
    public.user_onboarding_progress.started_at,
    excluded.started_at
  ),
  completed_at = null,
  dismissed_at = null,
  updated_at = now();
