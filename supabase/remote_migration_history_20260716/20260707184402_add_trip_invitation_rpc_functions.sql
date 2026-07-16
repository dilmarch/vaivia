create or replace function public.create_trip_invitation(
  target_trip_id uuid,
  invitee_identifier text,
  consent_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_identifier text;
  target_user_id uuid;
  target_email text;
  target_username text;
  new_invitation_id uuid;
  trip_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if consent_confirmed is not true then
    raise exception 'Consent is required to share this trip';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'You do not have access to this trip';
  end if;

  normalized_identifier := lower(trim(invitee_identifier));

  if normalized_identifier is null or normalized_identifier = '' then
    raise exception 'Invitee email or username is required';
  end if;

  if normalized_identifier like '%@%' then
    target_email := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.email) = target_email
    limit 1;
  else
    target_username := normalized_identifier;
    select up.id into target_user_id
    from public.user_profiles up
    where lower(up.username) = target_username
    limit 1;
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot invite yourself to your own trip';
  end if;

  select title into trip_title
  from public.trips
  where id = target_trip_id;

  insert into public.trip_invitations (
    trip_id,
    invited_by,
    invited_user_id,
    invited_email,
    invited_username,
    status,
    consent_confirmed
  )
  values (
    target_trip_id,
    auth.uid(),
    target_user_id,
    target_email,
    target_username,
    'pending',
    true
  )
  returning id into new_invitation_id;

  if target_user_id is not null then
    insert into public.notifications (
      user_id,
      actor_user_id,
      trip_id,
      invitation_id,
      type,
      title,
      body,
      metadata
    )
    values (
      target_user_id,
      auth.uid(),
      target_trip_id,
      new_invitation_id,
      'trip_invite_received',
      'Trip invite received',
      'You have been invited to join ' || coalesce(trip_title, 'a trip') || '.',
      jsonb_build_object('action', 'review_trip_invite')
    );
  end if;

  return new_invitation_id;
end;
$$;

grant execute on function public.create_trip_invitation(uuid, text, boolean) to authenticated;;
