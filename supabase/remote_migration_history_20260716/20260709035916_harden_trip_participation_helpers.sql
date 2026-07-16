-- Harden helper function/view created by add_trip_participation_scopes

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Supabase linter flags views as SECURITY DEFINER unless explicitly set as invoker on newer Postgres.
alter view public.trip_item_participants_display set (security_invoker = true);

-- The item visibility helper is used by RLS policies. Prevent anonymous RPC access while keeping signed-in policy use working.
revoke execute on function public.is_trip_item_visible(uuid, uuid, boolean, text, text, uuid) from anon;
;
