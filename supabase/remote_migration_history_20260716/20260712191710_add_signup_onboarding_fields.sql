alter table public.user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists marketing_emails_consent boolean not null default false,
  add column if not exists marketing_emails_consented_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.user_profiles.terms_accepted_at
  is 'Timestamp when the user accepted VAIVIA terms during signup/onboarding.';

comment on column public.user_profiles.marketing_emails_consent
  is 'Whether the user opted in to marketing emails about promotions and app updates.';

comment on column public.user_profiles.marketing_emails_consented_at
  is 'Timestamp when the user opted in to marketing emails, if applicable.';

comment on column public.user_profiles.onboarding_completed_at
  is 'Timestamp when the user completed the first VAIVIA onboarding flow.';;
