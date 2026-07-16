update public.itinerary_items ii
set created_by = t.user_id
from public.trips t
where ii.trip_id = t.id
  and ii.created_by is null;

update public.transportation_items ti
set created_by = t.user_id
from public.trips t
where ti.trip_id = t.id
  and ti.created_by is null;

update public.budget_items bi
set created_by = t.user_id
from public.trips t
where bi.trip_id = t.id
  and bi.created_by is null;

update public.trip_ideas ti
set created_by = t.user_id
from public.trips t
where ti.trip_id = t.id
  and ti.created_by is null;

insert into public.trip_members (trip_id, user_id, role, status)
select id, user_id, 'owner', 'active'
from public.trips
on conflict (trip_id, user_id) do update
set role = case when public.trip_members.role = 'owner' then 'owner' else excluded.role end,
    status = 'active',
    left_at = null;

create index if not exists trip_members_trip_id_idx on public.trip_members(trip_id);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);
create index if not exists trip_members_active_idx on public.trip_members(trip_id, user_id) where status = 'active';

create index if not exists trip_invitations_trip_id_idx on public.trip_invitations(trip_id);
create index if not exists trip_invitations_invited_user_id_idx on public.trip_invitations(invited_user_id);
create index if not exists trip_invitations_status_idx on public.trip_invitations(status);
create index if not exists trip_invitations_invited_email_idx on public.trip_invitations(lower(invited_email));

create unique index if not exists trip_invitations_pending_user_unique
on public.trip_invitations(trip_id, invited_user_id)
where status = 'pending' and invited_user_id is not null;

create unique index if not exists trip_invitations_pending_email_unique
on public.trip_invitations(trip_id, lower(invited_email))
where status = 'pending' and invited_email is not null;

create unique index if not exists trip_invitations_pending_username_unique
on public.trip_invitations(trip_id, lower(invited_username))
where status = 'pending' and invited_username is not null;

create index if not exists notifications_user_id_created_at_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null;;
