create table if not exists public.user_data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  storage_path text,
  export_schema_version text not null default '2026-07-14.1',
  failure_code text,
  downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_data_exports_status_check
    check (status in ('requested', 'preparing', 'ready', 'expired', 'failed')),
  constraint user_data_exports_ready_requires_archive_check
    check (
      status <> 'ready'
      or (
        completed_at is not null
        and expires_at is not null
        and storage_path is not null
      )
    )
);

create index if not exists user_data_exports_user_requested_idx
  on public.user_data_exports(user_id, requested_at desc);

alter table public.user_data_exports enable row level security;

drop policy if exists "Users can view their own data export records"
  on public.user_data_exports;
create policy "Users can view their own data export records"
  on public.user_data_exports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.user_data_exports to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'user-data-exports',
  'user-data-exports',
  false,
  524288000,
  array['application/zip']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own data export archives"
  on storage.objects;
create policy "Users can read their own data export archives"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-data-exports'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
