create or replace function public.create_trip_invitation_with_assignments(
  target_trip_id uuid,
  invitee_identifier text,
  consent_confirmed boolean,
  target_leg_ids uuid[] default '{}'::uuid[],
  target_transportation_item_ids uuid[] default '{}'::uuid[],
  target_accommodation_item_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_invitation_id uuid;
  normalized_leg_ids uuid[] := coalesce(target_leg_ids, '{}'::uuid[]);
  normalized_transportation_ids uuid[] := coalesce(target_transportation_item_ids, '{}'::uuid[]);
  normalized_accommodation_ids uuid[] := coalesce(target_accommodation_item_ids, '{}'::uuid[]);
  invited_start date;
  invited_end date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_trip_active_member(target_trip_id) then
    raise exception 'You do not have access to this trip';
  end if;

  if exists (
    select 1
    from unnest(normalized_leg_ids) as requested_leg_id
    where not exists (
      select 1
      from public.trip_legs
      where trip_legs.id = requested_leg_id
        and trip_legs.trip_id = target_trip_id
    )
  ) then
    raise exception 'One or more selected trip legs are not part of this trip';
  end if;

  if exists (
    select 1
    from unnest(normalized_transportation_ids) as requested_transportation_id
    where not exists (
      select 1
      from public.transportation_items
      where transportation_items.id = requested_transportation_id
        and transportation_items.trip_id = target_trip_id
    )
  ) then
    raise exception 'One or more selected journey items are not part of this trip';
  end if;

  if exists (
    select 1
    from unnest(normalized_accommodation_ids) as requested_accommodation_id
    where not exists (
      select 1
      from public.trip_accommodations
      where trip_accommodations.id = requested_accommodation_id
        and trip_accommodations.trip_id = target_trip_id
    )
  ) then
    raise exception 'One or more selected accommodations are not part of this trip';
  end if;

  select min(trip_legs.start_date), max(coalesce(trip_legs.end_date, trip_legs.start_date))
    into invited_start, invited_end
  from public.trip_legs
  where trip_legs.trip_id = target_trip_id
    and trip_legs.id = any(normalized_leg_ids)
    and trip_legs.start_date is not null;

  new_invitation_id := public.create_trip_invitation(
    target_trip_id,
    invitee_identifier,
    consent_confirmed
  );

  update public.trip_invitations
     set invitation_scope = 'selected_legs',
         invited_start_date = invited_start,
         invited_end_date = invited_end
   where id = new_invitation_id;

  insert into public.trip_invitation_legs (
    invitation_id,
    trip_id,
    trip_leg_id,
    is_included
  )
  select
    new_invitation_id,
    target_trip_id,
    selected_leg_id,
    true
  from unnest(normalized_leg_ids) as selected_leg_id
  on conflict (invitation_id, trip_leg_id)
  do update set is_included = excluded.is_included;

  insert into public.trip_item_participants (
    trip_id,
    item_type,
    item_id,
    participant_kind,
    invitation_id,
    created_by
  )
  select
    target_trip_id,
    'transportation',
    selected_transportation_id,
    'invitation',
    new_invitation_id,
    auth.uid()
  from unnest(normalized_transportation_ids) as selected_transportation_id
  on conflict (item_type, item_id, invitation_id)
  do nothing;

  insert into public.trip_item_participants (
    trip_id,
    item_type,
    item_id,
    participant_kind,
    invitation_id,
    created_by
  )
  select
    target_trip_id,
    'accommodation',
    selected_accommodation_id,
    'invitation',
    new_invitation_id,
    auth.uid()
  from unnest(normalized_accommodation_ids) as selected_accommodation_id
  on conflict (item_type, item_id, invitation_id)
  do nothing;

  return new_invitation_id;
end;
$$;

revoke all on function public.create_trip_invitation_with_assignments(
  uuid,
  text,
  boolean,
  uuid[],
  uuid[],
  uuid[]
) from public;
grant execute on function public.create_trip_invitation_with_assignments(
  uuid,
  text,
  boolean,
  uuid[],
  uuid[],
  uuid[]
) to authenticated;
grant execute on function public.create_trip_invitation_with_assignments(
  uuid,
  text,
  boolean,
  uuid[],
  uuid[],
  uuid[]
) to service_role;

create or replace function public.copy_trip_invitation_item_participants_to_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invitation_id is null or new.status <> 'active' then
    return new;
  end if;

  insert into public.trip_item_participants (
    trip_id,
    item_type,
    item_id,
    participant_kind,
    trip_member_id,
    created_by
  )
  select
    source_participants.trip_id,
    source_participants.item_type,
    source_participants.item_id,
    'member',
    new.id,
    source_participants.created_by
  from public.trip_item_participants source_participants
  where source_participants.invitation_id = new.invitation_id
    and source_participants.participant_kind = 'invitation'
  on conflict (item_type, item_id, trip_member_id)
  do nothing;

  return new;
end;
$$;

revoke all on function public.copy_trip_invitation_item_participants_to_member()
from public;

drop trigger if exists copy_trip_invitation_item_participants_to_member on public.trip_members;

create trigger copy_trip_invitation_item_participants_to_member
after insert or update of invitation_id, status
on public.trip_members
for each row
execute function public.copy_trip_invitation_item_participants_to_member();
