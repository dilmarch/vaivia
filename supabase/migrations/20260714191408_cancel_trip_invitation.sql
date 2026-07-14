create or replace function public.cancel_trip_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  invite_record public.trip_invitations;
  trip_owner_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into invite_record
    from public.trip_invitations
   where id = invitation_id
     and status = 'pending'
   limit 1
   for update;

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  select trips.user_id
    into trip_owner_id
    from public.trips
   where trips.id = invite_record.trip_id
   limit 1;

  if invite_record.invited_by <> current_user_id
     and coalesce(trip_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> current_user_id then
    raise exception 'You cannot cancel this invitation';
  end if;

  update public.trip_invitations
     set status = 'cancelled',
         responded_at = now()
   where id = invite_record.id;

  update public.notifications
     set archived_at = now(),
         read_at = coalesce(read_at, now())
   where invitation_id = invite_record.id
     and type = 'trip_invite_received'
     and archived_at is null;

  update public.notification_email_outbox outbox
     set status = 'cancelled',
         last_error = 'trip_invite_cancelled',
         next_attempt_at = null,
         updated_at = now()
   where outbox.notification_id in (
       select notifications.id
         from public.notifications
        where notifications.invitation_id = invite_record.id
          and notifications.type = 'trip_invite_received'
   )
     and outbox.status in ('queued', 'processing', 'failed');

  update public.external_email_invite_outbox
     set status = 'cancelled',
         last_error = 'trip_invite_cancelled',
         next_attempt_at = null,
         updated_at = now()
   where invite_type = 'trip_invite'
     and related_id = invite_record.id
     and status in ('queued', 'processing', 'failed');
end;
$$;

revoke all on function public.cancel_trip_invitation(uuid) from public;
grant execute on function public.cancel_trip_invitation(uuid) to authenticated;
