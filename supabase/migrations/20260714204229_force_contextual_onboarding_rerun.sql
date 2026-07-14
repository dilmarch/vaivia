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
  started_at = now(),
  completed_at = null,
  dismissed_at = null,
  updated_at = now();
