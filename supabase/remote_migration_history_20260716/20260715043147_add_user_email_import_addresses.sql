create table if not exists public.user_email_import_addresses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    inbound_token text not null unique,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    rotated_at timestamptz
);
create unique index if not exists user_email_import_addresses_one_active_per_user
on public.user_email_import_addresses(user_id)
where is_active = true;
alter table public.user_email_import_addresses enable row level security;
drop policy if exists "Users can read their own email import addresses"
on public.user_email_import_addresses;
create policy "Users can read their own email import addresses"
on public.user_email_import_addresses
for select
to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own email import addresses"
on public.user_email_import_addresses;
create policy "Users can create their own email import addresses"
on public.user_email_import_addresses
for insert
to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own email import addresses"
on public.user_email_import_addresses;
create policy "Users can update their own email import addresses"
on public.user_email_import_addresses
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
grant select on table public.user_email_import_addresses
to authenticated;
create or replace function public.rotate_user_email_import_address(
    target_user_id uuid,
    new_inbound_token text
)
returns public.user_email_import_addresses
language plpgsql
security definer
set search_path = public
as $$
declare
    new_address public.user_email_import_addresses;
begin
    if target_user_id is null then
        raise exception 'target_user_id is required';
    end if;

    if new_inbound_token is null or length(trim(new_inbound_token)) < 32 then
        raise exception 'new_inbound_token is invalid';
    end if;

    update public.user_email_import_addresses
    set
        is_active = false,
        rotated_at = now()
    where
        user_id = target_user_id
        and is_active = true;

    insert into public.user_email_import_addresses (
        user_id,
        inbound_token,
        is_active
    )
    values (
        target_user_id,
        lower(trim(new_inbound_token)),
        true
    )
    returning * into new_address;

    return new_address;
end;
$$;
revoke all on function public.rotate_user_email_import_address(uuid, text)
from public, anon, authenticated;
grant execute on function public.rotate_user_email_import_address(uuid, text)
to service_role;
