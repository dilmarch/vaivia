alter table public.notifications
  add column if not exists archived_at timestamptz;

create index if not exists notifications_user_active_created_idx
  on public.notifications(user_id, archived_at, created_at desc);

create index if not exists notifications_user_read_created_idx
  on public.notifications(user_id, read_at, created_at desc);
