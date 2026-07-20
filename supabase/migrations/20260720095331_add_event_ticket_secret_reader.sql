create or replace function public.get_event_ticket_secret(target_ticket_id uuid)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
    select redemption_secret
    from private.event_ticket_secrets
    where ticket_id = target_ticket_id;
$$;

revoke all on function public.get_event_ticket_secret(uuid) from public;
grant execute on function public.get_event_ticket_secret(uuid) to service_role;
