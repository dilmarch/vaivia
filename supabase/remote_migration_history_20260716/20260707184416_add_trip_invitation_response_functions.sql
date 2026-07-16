create or replace function public.accept_trip_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.trip_invitations;
  actor_name text;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  update public.trip_invitations
  set status = 'accepted', responded_at = now()
  where id = invitation_id;

  insert into public.trip_members (trip_id, user_id, role, status, invited_by, joined_at)
  values (invite_record.trip_id, auth.uid(), 'member', 'active', invite_record.invited_by, now())
  on conflict (trip_id, user_id)
  do update set status = 'active', left_at = null, joined_at = now();

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

  select title into trip_title from public.trips where id = invite_record.trip_id;

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    invitation_id,
    'trip_invite_accepted',
    'Trip invite accepted',
    coalesce(actor_name, 'Someone') || ' accepted your invite to ' || coalesce(trip_title, 'your trip') || '.'
  );
end;
$$;

create or replace function public.decline_trip_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.trip_invitations;
  actor_name text;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into invite_record
  from public.trip_invitations
  where id = invitation_id
    and invited_user_id = auth.uid()
    and status = 'pending';

  if invite_record.id is null then
    raise exception 'Invitation not found or already handled';
  end if;

  update public.trip_invitations
  set status = 'declined', responded_at = now()
  where id = invitation_id;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), username, email, 'Someone')
  into actor_name
  from public.user_profiles
  where id = auth.uid();

  select title into trip_title from public.trips where id = invite_record.trip_id;

  insert into public.notifications (user_id, actor_user_id, trip_id, invitation_id, type, title, body)
  values (
    invite_record.invited_by,
    auth.uid(),
    invite_record.trip_id,
    invitation_id,
    'trip_invite_declined',
    'Trip invite declined',
    coalesce(actor_name, 'Someone') || ' declined your invite to ' || coalesce(trip_title, 'your trip') || '.'
  );
end;
$$;

grant execute on function public.accept_trip_invitation(uuid) to authenticated;
grant execute on function public.decline_trip_invitation(uuid) to authenticated;;
