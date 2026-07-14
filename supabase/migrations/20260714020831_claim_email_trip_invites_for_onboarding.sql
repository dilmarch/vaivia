create or replace function public.claim_pending_trip_invitations_for_current_user()
returns table (
  id uuid,
  trip_id uuid,
  trip_title text,
  trip_slug text,
  trip_start_date date,
  trip_end_date date,
  invited_by uuid,
  inviter_name text,
  invitation_scope text,
  invited_start_date date,
  invited_end_date date
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select lower(nullif(btrim(user_profiles.email), ''))
    into current_email
    from public.user_profiles
   where user_profiles.id = current_user_id;

  if current_email is not null then
    with claimed as (
      update public.trip_invitations
         set invited_user_id = current_user_id
       where trip_invitations.status = 'pending'
         and trip_invitations.invited_user_id is null
         and lower(nullif(btrim(trip_invitations.invited_email), '')) = current_email
      returning
        trip_invitations.id,
        trip_invitations.trip_id,
        trip_invitations.invited_by
    )
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
    select
      current_user_id,
      claimed.invited_by,
      claimed.trip_id,
      claimed.id,
      'trip_invite_received',
      'Trip invite received',
      'You have been invited to join ' || coalesce(trips.title, 'a trip') || '.',
      jsonb_build_object('action', 'review_trip_invite')
    from claimed
    left join public.trips on trips.id = claimed.trip_id;
  end if;

  return query
  select
    trip_invitations.id,
    trips.id as trip_id,
    trips.title as trip_title,
    trips.slug as trip_slug,
    trips.start_date as trip_start_date,
    trips.end_date as trip_end_date,
    trip_invitations.invited_by,
    coalesce(
      nullif(btrim(coalesce(inviter.first_name, '') || ' ' || coalesce(inviter.last_name, '')), ''),
      inviter.username,
      inviter.email,
      'Someone'
    ) as inviter_name,
    trip_invitations.invitation_scope,
    trip_invitations.invited_start_date,
    trip_invitations.invited_end_date
  from public.trip_invitations
  join public.trips on trips.id = trip_invitations.trip_id
  left join public.user_profiles inviter on inviter.id = trip_invitations.invited_by
  where trip_invitations.status = 'pending'
    and trip_invitations.invited_user_id = current_user_id
  order by trip_invitations.created_at asc;
end;
$$;

revoke all on function public.claim_pending_trip_invitations_for_current_user() from public;
grant execute on function public.claim_pending_trip_invitations_for_current_user() to authenticated;
