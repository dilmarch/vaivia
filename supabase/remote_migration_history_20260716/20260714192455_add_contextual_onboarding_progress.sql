create table if not exists public.user_onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  flow_version integer not null default 1 check (flow_version > 0),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'dismissed')),
  current_step text,
  completed_steps text[] not null default '{}'::text[],
  started_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.user_onboarding_progress is
  'Cross-device state for the short VAIVIA contextual onboarding flow. Stores progress only, not behavioural analytics.';

comment on column public.user_onboarding_progress.current_step is
  'Stable onboarding step key such as welcome, create_trip, add_first_item, or explore_trip.';

alter table public.user_onboarding_progress enable row level security;

grant select, insert, update on public.user_onboarding_progress to authenticated;
revoke all on public.user_onboarding_progress from anon;

drop policy if exists "Users can read own onboarding progress" on public.user_onboarding_progress;
create policy "Users can read own onboarding progress"
  on public.user_onboarding_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own onboarding progress" on public.user_onboarding_progress;
create policy "Users can create own onboarding progress"
  on public.user_onboarding_progress
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own onboarding progress" on public.user_onboarding_progress;
create policy "Users can update own onboarding progress"
  on public.user_onboarding_progress
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_user_onboarding_progress_updated_at on public.user_onboarding_progress;
create trigger set_user_onboarding_progress_updated_at
  before update on public.user_onboarding_progress
  for each row execute function public.set_updated_at();;
