alter table public.user_profiles
  add column if not exists biometric_login_enabled boolean not null default false,
  add column if not exists biometric_login_enabled_at timestamptz;

comment on column public.user_profiles.biometric_login_enabled
  is 'Whether the user enabled biometric/passkey-style login preferences for supported PWA devices.';

comment on column public.user_profiles.biometric_login_enabled_at
  is 'Timestamp when biometric/passkey-style login preferences were enabled, if applicable.';;
