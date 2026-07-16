do $$
begin
    if not exists (
        select 1
          from pg_type
         where typname = 'travel_email_import_status'
    ) then
        create type public.travel_email_import_status as enum (
            'received',
            'processing',
            'needs_review',
            'ready',
            'imported',
            'rejected',
            'failed'
        );
    end if;
end
$$;
create table if not exists public.travel_email_imports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null default 'resend',
    provider_email_id text not null unique,
    message_id text,
    sender_email text,
    recipient_email text,
    subject text,
    status public.travel_email_import_status not null default 'received',
    raw_text text,
    raw_html text,
    attachment_count integer not null default 0,
    extraction_error text,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);
create index if not exists travel_email_imports_user_id_idx
on public.travel_email_imports(user_id);
create index if not exists travel_email_imports_status_idx
on public.travel_email_imports(status);
create index if not exists travel_email_imports_created_at_idx
on public.travel_email_imports(created_at desc);
create index if not exists travel_email_imports_provider_email_id_idx
on public.travel_email_imports(provider_email_id);
alter table public.travel_email_imports enable row level security;
drop policy if exists "Users can view their own travel email imports"
on public.travel_email_imports;
create policy "Users can view their own travel email imports"
on public.travel_email_imports
for select
to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own travel email imports"
on public.travel_email_imports;
create policy "Users can delete their own travel email imports"
on public.travel_email_imports
for delete
to authenticated
using ((select auth.uid()) = user_id);
