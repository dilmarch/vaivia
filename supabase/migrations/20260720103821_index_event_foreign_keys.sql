create index if not exists event_audit_log_actor_idx
on public.event_audit_log(actor_user_id);

create index if not exists event_check_ins_checked_in_by_idx
on public.event_check_ins(checked_in_by);

create index if not exists event_check_ins_undone_by_idx
on public.event_check_ins(undone_by)
where undone_by is not null;

create index if not exists event_invitations_accepted_by_idx
on public.event_invitations(accepted_by)
where accepted_by is not null;

create index if not exists event_invitations_invited_by_idx
on public.event_invitations(invited_by);

create index if not exists event_order_items_event_idx
on public.event_order_items(event_id);

create index if not exists event_order_items_ticket_type_idx
on public.event_order_items(ticket_type_id);

create index if not exists event_team_members_created_by_idx
on public.event_team_members(created_by);

create index if not exists event_tickets_checked_in_by_idx
on public.event_tickets(checked_in_by)
where checked_in_by is not null;

create index if not exists event_tickets_order_idx
on public.event_tickets(order_id);

create index if not exists event_tickets_ticket_type_idx
on public.event_tickets(ticket_type_id);

create index if not exists event_webhook_events_order_idx
on public.event_webhook_events(order_id)
where order_id is not null;
