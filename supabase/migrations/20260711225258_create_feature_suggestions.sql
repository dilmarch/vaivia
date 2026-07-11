create table if not exists public.feature_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  suggestion_type text not null default 'feature',
  title text,
  message text not null,
  current_path text,
  contact_email text,
  user_agent text,
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_suggestions_type_check
    check (suggestion_type in ('feature', 'bug', 'feedback')),
  constraint feature_suggestions_status_check
    check (status in ('new', 'reviewing', 'planned', 'closed')),
  constraint feature_suggestions_message_not_blank_check
    check (btrim(message) <> ''),
  constraint feature_suggestions_title_not_blank_check
    check (title is null or btrim(title) <> '')
);

create index if not exists feature_suggestions_user_created_idx
  on public.feature_suggestions(user_id, created_at desc);

create index if not exists feature_suggestions_status_created_idx
  on public.feature_suggestions(status, created_at desc);

alter table public.feature_suggestions enable row level security;

drop policy if exists "Users can create their own feature suggestions"
  on public.feature_suggestions;

create policy "Users can create their own feature suggestions"
on public.feature_suggestions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own feature suggestions"
  on public.feature_suggestions;

create policy "Users can read their own feature suggestions"
on public.feature_suggestions
for select
to authenticated
using ((select auth.uid()) = user_id);

grant insert, select on table public.feature_suggestions to authenticated;
