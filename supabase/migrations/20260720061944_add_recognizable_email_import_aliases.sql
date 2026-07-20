-- Recognizable, difficult-to-guess inbound travel-email aliases.
--
-- Compatibility and security notes:
--   * Existing 48-character tokens remain unchanged and resolvable forever unless
--     their owner explicitly deactivates them.
--   * The immutable user UUID remains the ownership/routing boundary. Usernames
--     are only a recognizable part of the alias.
--   * Username validation remains nullable so existing/social-auth accounts are
--     not locked out before choosing a username.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.normalize_vaivia_username(input_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(input_value), '^@+', '')), '');
$$;

comment on function public.normalize_vaivia_username(text) is
'Canonical lowercase normalization used before VAIVIA username validation and comparison.';

revoke all on function public.normalize_vaivia_username(text) from public, anon;
grant execute on function public.normalize_vaivia_username(text) to authenticated, service_role;

create or replace function private.normalize_user_profile_username()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.username := public.normalize_vaivia_username(new.username);
  return new;
end;
$$;

revoke all on function private.normalize_user_profile_username()
from public, anon, authenticated;

drop trigger if exists normalize_user_profile_username on public.user_profiles;
create trigger normalize_user_profile_username
before insert or update of username on public.user_profiles
for each row
execute function private.normalize_user_profile_username();

alter table public.user_profiles
  drop constraint if exists user_profiles_username_length,
  drop constraint if exists user_profiles_username_format;

alter table public.user_profiles
  add constraint user_profiles_username_valid
  check (
    username is null
    or (
      char_length(username) between 3 and 30
      and username = public.normalize_vaivia_username(username)
      and username ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
      and username <> all (array[
        'admin', 'administrator', 'support', 'security', 'billing', 'help',
        'contact', 'info', 'postmaster', 'abuse', 'privacy', 'legal',
        'system', 'vaivia'
      ])
    )
  ) not valid;

-- The pre-migration audit found no invalid/reserved/duplicate usernames. Using
-- NOT VALID first keeps the operation safe if a future environment has drifted;
-- validation fails without rewriting any profile values.
alter table public.user_profiles
  validate constraint user_profiles_username_valid;

comment on constraint user_profiles_username_valid on public.user_profiles is
'Allows nullable usernames for account recovery while enforcing normalized, email-safe, non-reserved values when present.';

-- The existing case-insensitive unique index is the final race-safe uniqueness
-- boundary. Recreate it idempotently in case an older environment lacks it.
create unique index if not exists user_profiles_username_unique_ci_idx
on public.user_profiles (lower(btrim(username)))
where username is not null and btrim(username) <> '';

alter table public.user_email_import_addresses
  add column if not exists is_primary boolean not null default false,
  add column if not exists address_format text not null default 'legacy',
  add column if not exists request_key uuid,
  add column if not exists retired_at timestamptz;

-- Preserve historical semantics: the newest active address becomes primary,
-- while every legacy row and its active/inactive state remains unchanged.
with ranked_active as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc, id desc
    ) as position
  from public.user_email_import_addresses
  where is_active
)
update public.user_email_import_addresses addresses
set is_primary = ranked_active.position = 1
from ranked_active
where addresses.id = ranked_active.id;

update public.user_email_import_addresses
set retired_at = coalesce(retired_at, rotated_at, now())
where not is_active and retired_at is null;

drop index if exists public.user_email_import_addresses_one_active_per_user;

create unique index if not exists user_email_import_addresses_one_primary_per_user
on public.user_email_import_addresses (user_id)
where is_primary;

create index if not exists user_email_import_addresses_active_lookup_idx
on public.user_email_import_addresses (inbound_token)
where is_active;

create unique index if not exists user_email_import_addresses_request_key_idx
on public.user_email_import_addresses (user_id, request_key)
where request_key is not null;

alter table public.user_email_import_addresses
  add constraint user_email_import_addresses_format_check
  check (address_format in ('legacy', 'username')) not valid,
  add constraint user_email_import_addresses_token_check
  check (
    inbound_token = lower(btrim(inbound_token))
    and (
      (address_format = 'legacy' and inbound_token ~ '^[a-f0-9]{48}$')
      or
      (address_format = 'username' and inbound_token ~ '^[a-z0-9]+([_-][a-z0-9]+)*\.[a-f0-9]{12}$')
    )
  ) not valid,
  add constraint user_email_import_addresses_primary_active_check
  check (not is_primary or is_active) not valid,
  add constraint user_email_import_addresses_retired_check
  check (is_active or retired_at is not null) not valid;

alter table public.user_email_import_addresses
  validate constraint user_email_import_addresses_format_check;
alter table public.user_email_import_addresses
  validate constraint user_email_import_addresses_token_check;
alter table public.user_email_import_addresses
  validate constraint user_email_import_addresses_primary_active_check;
alter table public.user_email_import_addresses
  validate constraint user_email_import_addresses_retired_check;

comment on column public.user_email_import_addresses.inbound_token is
'Immutable local routing key. Legacy rows format as trips+<token>; username rows format as <username>.<secure-suffix>.';
comment on column public.user_email_import_addresses.is_primary is
'The one preferred address displayed most prominently for a user; other active rows remain valid aliases.';
comment on column public.user_email_import_addresses.address_format is
'Compatibility discriminator for legacy and username-based local parts.';
comment on column public.user_email_import_addresses.request_key is
'Optional client-generated idempotency key for an authenticated rotation request.';
comment on column public.user_email_import_addresses.retired_at is
'Timestamp when an alias was explicitly deactivated; rows are retained permanently for non-reassignment.';

create or replace function private.prevent_email_import_alias_reassignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.inbound_token is distinct from old.inbound_token
     or new.address_format is distinct from old.address_format
     or new.request_key is distinct from old.request_key then
    raise exception 'Email import alias routing fields are immutable'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_email_import_alias_reassignment()
from public, anon, authenticated;

drop trigger if exists prevent_email_import_alias_reassignment
on public.user_email_import_addresses;
create trigger prevent_email_import_alias_reassignment
before update on public.user_email_import_addresses
for each row
execute function private.prevent_email_import_alias_reassignment();

create or replace function private.set_primary_email_import_alias(
  target_user_id uuid,
  requested_local_part text,
  deactivate_previous boolean default false,
  requested_key uuid default null
)
returns public.user_email_import_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text;
  normalized_local_part text := lower(btrim(requested_local_part));
  new_address public.user_email_import_addresses;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required' using errcode = '22023';
  end if;

  select public.normalize_vaivia_username(profile.username)
  into normalized_username
  from public.user_profiles profile
  where profile.id = target_user_id;

  if normalized_username is null then
    raise exception 'A valid username is required before creating an email import alias'
      using errcode = '22023';
  end if;

  if normalized_local_part !~ (
    '^' || normalized_username || '\.[a-f0-9]{12}$'
  ) then
    raise exception 'Email import alias format is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text, 0)
  );

  if requested_key is not null then
    select *
    into new_address
    from public.user_email_import_addresses
    where user_id = target_user_id
      and request_key = requested_key;

    if new_address.id is not null then
      return new_address;
    end if;
  else
    -- Initial creation and username-change triggers are idempotent for the
    -- current normalized username. Explicit rotations always provide a key.
    select *
    into new_address
    from public.user_email_import_addresses
    where user_id = target_user_id
      and is_primary
      and address_format = 'username'
      and split_part(inbound_token, '.', 1) = normalized_username;

    if new_address.id is not null then
      return new_address;
    end if;
  end if;

  select *
  into new_address
  from public.user_email_import_addresses
  where inbound_token = normalized_local_part
    and user_id = target_user_id;

  update public.user_email_import_addresses
  set
    is_primary = false,
    is_active = case when deactivate_previous then false else is_active end,
    rotated_at = coalesce(rotated_at, now()),
    retired_at = case
      when deactivate_previous then coalesce(retired_at, now())
      else retired_at
    end
  where user_id = target_user_id
    and is_primary
    and (new_address.id is null or id <> new_address.id);

  if new_address.id is not null then
    update public.user_email_import_addresses
    set is_primary = true, is_active = true, retired_at = null
    where id = new_address.id
    returning * into new_address;
    return new_address;
  end if;

  insert into public.user_email_import_addresses (
    user_id,
    inbound_token,
    is_active,
    is_primary,
    address_format,
    request_key
  ) values (
    target_user_id,
    normalized_local_part,
    true,
    true,
    'username',
    requested_key
  )
  returning * into new_address;

  return new_address;
end;
$$;

revoke all on function private.set_primary_email_import_alias(uuid, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function private.set_primary_email_import_alias(uuid, text, boolean, uuid)
to service_role;

drop function if exists public.rotate_user_email_import_address(uuid, text);

create or replace function public.rotate_user_email_import_address(
  target_user_id uuid,
  new_inbound_token text,
  deactivate_previous boolean default false,
  request_key uuid default null
)
returns public.user_email_import_addresses
language sql
security definer
set search_path = ''
as $$
  select private.set_primary_email_import_alias(
    target_user_id,
    new_inbound_token,
    deactivate_previous,
    request_key
  );
$$;

revoke all on function public.rotate_user_email_import_address(uuid, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function public.rotate_user_email_import_address(uuid, text, boolean, uuid)
to service_role;

comment on function public.rotate_user_email_import_address(uuid, text, boolean, uuid) is
'Service-role-only atomic alias rotation. Previous aliases stay active unless the authenticated owner explicitly requests deactivation.';

create or replace function private.issue_email_import_alias_for_username_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt integer;
  local_part text;
begin
  if new.username is null
     or (tg_op = 'UPDATE' and new.username is not distinct from old.username) then
    return new;
  end if;

  for attempt in 1..8 loop
    local_part := new.username || '.' ||
      pg_catalog.encode(extensions.gen_random_bytes(6), 'hex');
    begin
      perform private.set_primary_email_import_alias(new.id, local_part, false, null);
      return new;
    exception when unique_violation then
      -- Complete local-part uniqueness is global. Retry the cryptographically
      -- random suffix without changing or reassigning any prior alias.
    end;
  end loop;

  raise exception 'Could not create a unique email import alias'
    using errcode = '23505';
end;
$$;

revoke all on function private.issue_email_import_alias_for_username_change()
from public, anon, authenticated;

drop trigger if exists issue_email_import_alias_for_username_change
on public.user_profiles;
create trigger issue_email_import_alias_for_username_change
after insert or update of username on public.user_profiles
for each row
execute function private.issue_email_import_alias_for_username_change();

-- Alias lifecycle mutations are server-only. Users may read their own history,
-- but cannot manufacture, reassign, or reactivate aliases through the API.
drop policy if exists "Users can create their own email import addresses"
on public.user_email_import_addresses;
drop policy if exists "Users can update their own email import addresses"
on public.user_email_import_addresses;

revoke all on table public.user_email_import_addresses from anon;
revoke insert, update, delete, truncate, references, trigger
on table public.user_email_import_addresses from authenticated;
grant select on table public.user_email_import_addresses to authenticated;
grant all on table public.user_email_import_addresses to service_role;

-- Rate-limit lookups use these bounded metadata columns only; raw bodies and
-- provider payloads are never part of the rate-limit key.
create index if not exists travel_email_imports_recipient_created_idx
on public.travel_email_imports (recipient_email, created_at desc);
create index if not exists travel_email_imports_sender_created_idx
on public.travel_email_imports (sender_email, created_at desc);
