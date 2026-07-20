create or replace function public.event_user_can_manage(
    target_event_id uuid,
    target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select (
        target_user_id = auth.uid()
        or auth.role() = 'service_role'
    ) and (
        exists (
            select 1
            from public.user_profiles profile
            where profile.id = target_user_id
              and profile.role = 'super_admin'
        )
        or exists (
            select 1
            from public.events event_row
            join public.user_profiles profile on profile.id = target_user_id
            where event_row.id = target_event_id
              and event_row.owner_user_id = target_user_id
              and profile.role = 'event_organizer'
        )
        or exists (
            select 1
            from public.event_team_members member
            join public.user_profiles profile on profile.id = target_user_id
            where member.event_id = target_event_id
              and member.user_id = target_user_id
              and profile.role in ('event_organizer', 'super_admin')
        )
    );
$$;

create or replace function public.event_user_can_view(
    target_event_id uuid,
    target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select (
        target_user_id = auth.uid()
        or auth.role() = 'service_role'
    ) and exists (
        select 1 from public.events event_row
        where event_row.id = target_event_id
          and event_row.deleted_at is null
          and (
            (
              event_row.status = 'published'
              and event_row.visibility = 'public'
              and coalesce(event_row.publish_at, event_row.published_at, '-infinity'::timestamptz) <= now()
            )
            or public.event_user_can_manage(event_row.id, target_user_id)
            or exists (
                select 1 from public.event_tickets ticket
                where ticket.event_id = event_row.id and ticket.owner_user_id = target_user_id
            )
            or exists (
                select 1 from public.event_rsvps rsvp
                where rsvp.event_id = event_row.id
                  and rsvp.user_id = target_user_id and rsvp.status = 'confirmed'
            )
            or exists (
                select 1 from public.event_invitations invitation
                where invitation.event_id = event_row.id
                  and invitation.status in ('pending', 'accepted')
                  and invitation.email_normalized = lower(coalesce(auth.jwt() ->> 'email', ''))
                  and (invitation.expires_at is null or invitation.expires_at > now())
            )
          )
    );
$$;

drop policy if exists event_ticket_types_visible_read on public.event_ticket_types;

create policy event_ticket_types_public_read
on public.event_ticket_types for select to anon
using (exists (
    select 1 from public.events event_row
    where event_row.id = event_ticket_types.event_id
      and event_row.status = 'published'
      and event_row.visibility = 'public'
      and event_row.deleted_at is null
      and coalesce(event_row.publish_at, event_row.published_at, '-infinity'::timestamptz) <= now()
));

create policy event_ticket_types_authenticated_read
on public.event_ticket_types for select to authenticated
using (public.event_user_can_view(event_id, auth.uid()));

revoke all on function public.event_user_can_manage(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.event_user_can_view(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.event_user_can_manage(uuid, uuid)
to authenticated, service_role;
grant execute on function public.event_user_can_view(uuid, uuid)
to authenticated, service_role;
