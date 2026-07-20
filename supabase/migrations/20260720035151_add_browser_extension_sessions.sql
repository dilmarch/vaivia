create table public.browser_extension_auth_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  extension_id text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint browser_extension_auth_codes_hash_check
    check (code_hash ~ '^[a-f0-9]{64}$'),
  constraint browser_extension_auth_codes_extension_id_check
    check (extension_id ~ '^[a-p]{32}$'),
  constraint browser_extension_auth_codes_redirect_uri_check
    check (redirect_uri ~ '^https://[a-p]{32}\.chromiumapp\.org/vaivia/?$'),
  constraint browser_extension_auth_codes_expiry_check
    check (expires_at > created_at)
);

create table public.browser_extension_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  extension_id text not null,
  device_name text not null default 'Chrome',
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint browser_extension_sessions_hash_check
    check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint browser_extension_sessions_extension_id_check
    check (extension_id ~ '^[a-p]{32}$'),
  constraint browser_extension_sessions_expiry_check
    check (expires_at > created_at)
);

create index browser_extension_auth_codes_expiry_idx
  on public.browser_extension_auth_codes (expires_at)
  where used_at is null;

create index browser_extension_sessions_user_id_idx
  on public.browser_extension_sessions (user_id);

create index browser_extension_sessions_active_expiry_idx
  on public.browser_extension_sessions (expires_at)
  where revoked_at is null;

alter table public.browser_extension_auth_codes enable row level security;
alter table public.browser_extension_sessions enable row level security;

revoke all on table public.browser_extension_auth_codes from anon, authenticated;
revoke all on table public.browser_extension_sessions from anon, authenticated;
grant all on table public.browser_extension_auth_codes to service_role;
grant all on table public.browser_extension_sessions to service_role;

comment on table public.browser_extension_auth_codes is
  'Short-lived, single-use authorization codes for connecting a Chrome extension to a VAIVIA account.';

comment on table public.browser_extension_sessions is
  'Revocable hashed bearer tokens used only by the VAIVIA browser extension API.';
