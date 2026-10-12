-- INSERT ... RETURNING is subject to the SELECT policy. The access helper
-- re-queries events by id, but that query cannot see the row being inserted
-- until the statement finishes. Let organizers read their own row directly
-- so PostgREST can return its id after creation.
drop policy if exists events_authenticated_read on public.events;

create policy events_authenticated_read
on public.events
for select
to authenticated
using (
  (
    owner_user_id = (select auth.uid())
    and (select public.is_event_organizer())
  )
  or public.event_user_can_view(id, (select auth.uid()))
);
