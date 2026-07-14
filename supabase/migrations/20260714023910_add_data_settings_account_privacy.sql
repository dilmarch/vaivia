alter table public.user_profiles
  add column if not exists data_center_preference text not null default 'supabase-current';

comment on column public.user_profiles.data_center_preference
  is 'User-facing data centre preference. Currently limited to the active Supabase project region.';

create or replace function public.request_current_user_account_deletion()
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
         updated_at = now()
   where id = auth.uid();
end;
$$;

revoke all on function public.request_current_user_account_deletion() from public;
grant execute on function public.request_current_user_account_deletion() to authenticated;
