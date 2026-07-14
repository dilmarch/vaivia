alter table public.user_profiles
  add column if not exists marketing_emails_consent_decided_at timestamptz,
  add column if not exists terms_declined_at timestamptz,
  add column if not exists terms_declined_version_id uuid,
  add column if not exists terms_decline_delete_after timestamptz,
  add column if not exists account_deletion_requested_at timestamptz;

comment on column public.user_profiles.marketing_emails_consent_decided_at
  is 'Timestamp when the user explicitly chose yes or no for marketing email consent.';

comment on column public.user_profiles.terms_declined_at
  is 'Timestamp when the user declined the current required terms version.';

comment on column public.user_profiles.terms_decline_delete_after
  is 'Date after which an account that declined required terms may be eligible for deletion.';

create table if not exists public.terms_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null,
  title text not null default 'VAIVIA Terms and Privacy Notice',
  content text not null,
  change_type text not null default 'major',
  requires_acceptance boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_versions_change_type_check
    check (change_type in ('major', 'minor')),
  constraint terms_versions_version_number_key unique (version_number)
);

create index if not exists terms_versions_published_idx
  on public.terms_versions (published_at desc);

alter table public.terms_versions enable row level security;

drop policy if exists "Published terms are visible to everyone" on public.terms_versions;
create policy "Published terms are visible to everyone"
  on public.terms_versions
  for select
  using (published_at is not null);

drop policy if exists "Super admins can manage terms" on public.terms_versions;
create policy "Super admins can manage terms"
  on public.terms_versions
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.terms_versions to anon, authenticated;
grant insert, update, delete on public.terms_versions to authenticated;

create table if not exists public.user_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version_id uuid not null references public.terms_versions(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_terms_acceptances_unique unique (user_id, terms_version_id)
);

create index if not exists user_terms_acceptances_user_idx
  on public.user_terms_acceptances (user_id);

alter table public.user_terms_acceptances enable row level security;

drop policy if exists "Users can view their own terms acceptances" on public.user_terms_acceptances;
create policy "Users can view their own terms acceptances"
  on public.user_terms_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_super_admin());

drop policy if exists "Users can accept terms for themselves" on public.user_terms_acceptances;
create policy "Users can accept terms for themselves"
  on public.user_terms_acceptances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.user_terms_acceptances to authenticated;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required'
      ]::text[]
    )
  );

alter table public.user_notification_preferences
  drop constraint if exists user_notification_preferences_type_check;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_type_check
  check (
    notification_type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required'
      ]::text[]
    )
  );

insert into public.terms_versions (
  version_number,
  title,
  content,
  change_type,
  requires_acceptance,
  published_at
)
select
  1,
  'VAIVIA Terms and Privacy Notice',
  '# VAIVIA Terms and Privacy Notice

Last updated: July 2026

These starter terms explain how VAIVIA works, what information the app may process, and the choices available to you. They are provided as a practical product baseline and should be reviewed with qualified legal counsel before being treated as legal advice.

## Using VAIVIA

VAIVIA helps you plan trips, organize itineraries, save passport-style travel records, manage friends and trip mates, track budgets, and receive account notifications. You agree to use VAIVIA lawfully, respectfully, and only for information you are allowed to provide.

## Your account

You are responsible for keeping your login credentials secure and for activity that happens through your account. If you use single sign-on, the identity provider may also process authentication information under its own terms.

## Information VAIVIA stores

Depending on the features you use, VAIVIA may store account details, profile information, trips, destinations, itinerary items, transportation plans, accommodations, budgets, expenses, passport stamp records, bucket list items, friend connections, feature suggestions, notification settings, theme preferences, and consent choices.

## Privacy rights

People in Canada, the United States, the United Kingdom, the European Economic Area, Switzerland, Australia, and New Zealand may have privacy rights depending on where they live and which laws apply. These rights may include access, correction, deletion, portability, objection, restriction, withdrawal of consent, and the right to complain to a regulator. VAIVIA will provide reasonable ways to exercise applicable rights.

## Legal bases and consent

VAIVIA may process information to provide the app, secure accounts, remember preferences, support shared trips, send requested notifications, comply with law, and improve the service. Marketing emails are optional and can be turned on or off from Communications settings.

## Sharing and visibility

Trip information may be visible to trip mates you invite or accept. Friends can see profile information that VAIVIA makes available in friend profile views. VAIVIA does not intentionally reveal private account controls to other users.

## Location and third-party services

Some location entry fields may use Google Places or similar validation tools. External travel services, airline links, maps, or websites may have separate terms and privacy notices.

## Notifications

VAIVIA may send in-app, email, browser, or push notifications based on your settings and the notification types available in the app. Some account or safety messages may still be shown when needed to operate the service.

## Data retention

VAIVIA keeps information while your account is active or as needed for the service, security, legal obligations, disputes, backups, and legitimate business records. You may request export or deletion where available and legally required.

## User content

You keep ownership of your content. You give VAIVIA permission to host, process, display, and transmit it as needed to provide the app and shared trip features.

## Changes to these terms

VAIVIA may make minor updates that do not require acceptance, or major updates that require you to accept the current terms before continuing to use interactive account features.

## Contact

For privacy, account, unsubscribe, or data requests, contact the VAIVIA operator through the support or feedback channels available in the app.',
  'major',
  true,
  now()
where not exists (select 1 from public.terms_versions);

insert into public.user_terms_acceptances (user_id, terms_version_id, accepted_at)
select profiles.id, terms.id, profiles.terms_accepted_at
from public.user_profiles profiles
cross join lateral (
  select id
  from public.terms_versions
  order by published_at desc
  limit 1
) terms
where profiles.terms_accepted_at is not null
on conflict (user_id, terms_version_id) do nothing;

update public.user_profiles
set marketing_emails_consent_decided_at = marketing_emails_consented_at
where marketing_emails_consented_at is not null
  and marketing_emails_consent_decided_at is null;

create or replace function public.accept_current_terms()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_terms_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id
    into current_terms_id
  from public.terms_versions
  order by published_at desc
  limit 1;

  if current_terms_id is null then
    raise exception 'No terms version is published';
  end if;

  insert into public.user_terms_acceptances (
    user_id,
    terms_version_id,
    accepted_at
  )
  values (auth.uid(), current_terms_id, now())
  on conflict (user_id, terms_version_id)
  do update set accepted_at = excluded.accepted_at;

  update public.user_profiles
     set terms_accepted_at = now(),
         terms_declined_at = null,
         terms_declined_version_id = null,
         terms_decline_delete_after = null,
         account_deletion_requested_at = null,
         updated_at = now()
   where id = auth.uid();

  return current_terms_id;
end;
$$;

create or replace function public.decline_current_terms()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_terms_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id
    into current_terms_id
  from public.terms_versions
  order by published_at desc
  limit 1;

  if current_terms_id is null then
    raise exception 'No terms version is published';
  end if;

  update public.user_profiles
     set terms_declined_at = now(),
         terms_declined_version_id = current_terms_id,
         terms_decline_delete_after = now() + interval '30 days',
         updated_at = now()
   where id = auth.uid();

  return current_terms_id;
end;
$$;

create or replace function public.set_marketing_email_consent(consent boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_profiles
     set marketing_emails_consent = consent,
         marketing_emails_consented_at = case when consent then now() else null end,
         marketing_emails_consent_decided_at = now(),
         updated_at = now()
   where id = auth.uid();
end;
$$;

create or replace function public.request_account_deletion_after_terms_decline()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_profiles
     set account_deletion_requested_at = now(),
         terms_decline_delete_after = coalesce(terms_decline_delete_after, now() + interval '30 days'),
         updated_at = now()
   where id = auth.uid();
end;
$$;

revoke all on function public.accept_current_terms() from public;
revoke all on function public.decline_current_terms() from public;
revoke all on function public.set_marketing_email_consent(boolean) from public;
revoke all on function public.request_account_deletion_after_terms_decline() from public;

grant execute on function public.accept_current_terms() to authenticated;
grant execute on function public.decline_current_terms() to authenticated;
grant execute on function public.set_marketing_email_consent(boolean) to authenticated;
grant execute on function public.request_account_deletion_after_terms_decline() to authenticated;
