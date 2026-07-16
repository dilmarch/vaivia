-- Trip participation scopes, legs, and per-item audiences for VAIVIA

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Editable trip geography/leg/date blocks: country, state/region, city, custom, etc.
create table if not exists public.trip_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  parent_leg_id uuid references public.trip_legs(id) on delete set null,
  created_by uuid not null default auth.uid(),
  leg_type text not null default 'country' check (leg_type in ('country','state','province','region','city','area','custom')),
  name text not null,
  country_code text,
  region_code text,
  city_name text,
  google_place_id text,
  icon_emoji text,
  icon_url text,
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists idx_trip_legs_trip_dates on public.trip_legs(trip_id, start_date, end_date, sort_order);
create index if not exists idx_trip_legs_parent on public.trip_legs(parent_leg_id);

drop trigger if exists set_trip_legs_updated_at on public.trip_legs;
create trigger set_trip_legs_updated_at
before update on public.trip_legs
for each row execute function public.set_updated_at();

alter table public.trip_legs enable row level security;

drop policy if exists "Trip participants can view trip legs" on public.trip_legs;
create policy "Trip participants can view trip legs"
on public.trip_legs for select
to authenticated
using (
  public.is_trip_active_member(trip_id)
  or exists (
    select 1 from public.trip_invitations ti
    where ti.trip_id = trip_legs.trip_id
      and ti.invited_user_id = auth.uid()
      and ti.status in ('pending','accepted')
  )
);

drop policy if exists "Trip members can create trip legs" on public.trip_legs;
create policy "Trip members can create trip legs"
on public.trip_legs for insert
to authenticated
with check (public.is_trip_active_member(trip_id) and created_by = auth.uid());

drop policy if exists "Trip members can update trip legs" on public.trip_legs;
create policy "Trip members can update trip legs"
on public.trip_legs for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can delete trip legs" on public.trip_legs;
create policy "Trip members can delete trip legs"
on public.trip_legs for delete
to authenticated
using (public.is_trip_active_member(trip_id));

-- Invitation/date scope metadata.
alter table public.trip_invitations
  add column if not exists invitation_scope text not null default 'whole_trip' check (invitation_scope in ('whole_trip','custom_dates','selected_legs')),
  add column if not exists invited_start_date date,
  add column if not exists invited_end_date date,
  add column if not exists accepted_start_date date,
  add column if not exists accepted_end_date date,
  add column if not exists accepted_personal_start_date date,
  add column if not exists accepted_personal_end_date date;

alter table public.trip_invitations
  drop constraint if exists trip_invitations_invited_dates_check,
  add constraint trip_invitations_invited_dates_check check (invited_end_date is null or invited_start_date is null or invited_end_date >= invited_start_date),
  drop constraint if exists trip_invitations_accepted_dates_check,
  add constraint trip_invitations_accepted_dates_check check (accepted_end_date is null or accepted_start_date is null or accepted_end_date >= accepted_start_date),
  drop constraint if exists trip_invitations_personal_dates_check,
  add constraint trip_invitations_personal_dates_check check (accepted_personal_end_date is null or accepted_personal_start_date is null or accepted_personal_end_date >= accepted_personal_start_date);

create table if not exists public.trip_invitation_legs (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.trip_invitations(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_leg_id uuid not null references public.trip_legs(id) on delete cascade,
  is_included boolean not null default true,
  created_at timestamptz not null default now(),
  unique(invitation_id, trip_leg_id)
);

create index if not exists idx_trip_invitation_legs_invitation on public.trip_invitation_legs(invitation_id);
create index if not exists idx_trip_invitation_legs_trip on public.trip_invitation_legs(trip_id, trip_leg_id);

alter table public.trip_invitation_legs enable row level security;

drop policy if exists "Users can view invitation legs they sent or received" on public.trip_invitation_legs;
create policy "Users can view invitation legs they sent or received"
on public.trip_invitation_legs for select
to authenticated
using (
  exists (
    select 1 from public.trip_invitations ti
    where ti.id = trip_invitation_legs.invitation_id
      and (ti.invited_by = auth.uid() or ti.invited_user_id = auth.uid())
  )
  or public.is_trip_active_member(trip_id)
);

drop policy if exists "Trip members can manage invitation legs" on public.trip_invitation_legs;
create policy "Trip members can manage invitation legs"
on public.trip_invitation_legs for all
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

-- Accepted member trip window and selected/deselected legs.
alter table public.trip_members
  add column if not exists invitation_id uuid references public.trip_invitations(id) on delete set null,
  add column if not exists invited_start_date date,
  add column if not exists invited_end_date date,
  add column if not exists confirmed_start_date date,
  add column if not exists confirmed_end_date date,
  add column if not exists personal_start_date date,
  add column if not exists personal_end_date date;

alter table public.trip_members
  drop constraint if exists trip_members_invited_dates_check,
  add constraint trip_members_invited_dates_check check (invited_end_date is null or invited_start_date is null or invited_end_date >= invited_start_date),
  drop constraint if exists trip_members_confirmed_dates_check,
  add constraint trip_members_confirmed_dates_check check (confirmed_end_date is null or confirmed_start_date is null or confirmed_end_date >= confirmed_start_date),
  drop constraint if exists trip_members_personal_dates_check,
  add constraint trip_members_personal_dates_check check (personal_end_date is null or personal_start_date is null or personal_end_date >= personal_start_date);

create index if not exists idx_trip_members_window on public.trip_members(trip_id, user_id, confirmed_start_date, confirmed_end_date);

create table if not exists public.trip_member_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  trip_leg_id uuid not null references public.trip_legs(id) on delete cascade,
  is_joining boolean not null default true,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trip_member_id, trip_leg_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists idx_trip_member_legs_member on public.trip_member_legs(trip_member_id);
create index if not exists idx_trip_member_legs_trip_leg on public.trip_member_legs(trip_id, trip_leg_id, is_joining);

drop trigger if exists set_trip_member_legs_updated_at on public.trip_member_legs;
create trigger set_trip_member_legs_updated_at
before update on public.trip_member_legs
for each row execute function public.set_updated_at();

alter table public.trip_member_legs enable row level security;

drop policy if exists "Trip members can view member legs" on public.trip_member_legs;
create policy "Trip members can view member legs"
on public.trip_member_legs for select
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can manage member legs" on public.trip_member_legs;
create policy "Trip members can manage member legs"
on public.trip_member_legs for all
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

-- Attach itinerary/transport/accommodation records to a leg and set audience behaviour.
alter table public.itinerary_items
  add column if not exists trip_leg_id uuid references public.trip_legs(id) on delete set null,
  add column if not exists audience_mode text not null default 'everyone' check (audience_mode in ('everyone','custom','just_me'));

alter table public.transportation_items
  add column if not exists trip_leg_id uuid references public.trip_legs(id) on delete set null,
  add column if not exists audience_mode text not null default 'everyone' check (audience_mode in ('everyone','custom','just_me'));

alter table public.trip_accommodations
  add column if not exists trip_leg_id uuid references public.trip_legs(id) on delete set null,
  add column if not exists audience_mode text not null default 'everyone' check (audience_mode in ('everyone','custom','just_me'));

create index if not exists idx_itinerary_items_leg on public.itinerary_items(trip_id, trip_leg_id);
create index if not exists idx_transportation_items_leg on public.transportation_items(trip_id, trip_leg_id);
create index if not exists idx_trip_accommodations_leg on public.trip_accommodations(trip_id, trip_leg_id);
create index if not exists idx_itinerary_items_audience on public.itinerary_items(trip_id, audience_mode, is_private);
create index if not exists idx_transportation_items_audience on public.transportation_items(trip_id, audience_mode, is_private);
create index if not exists idx_trip_accommodations_audience on public.trip_accommodations(trip_id, audience_mode, is_private);

-- Shared audience table for itinerary, transportation, and accommodation cards.
create table if not exists public.trip_item_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_type text not null check (item_type in ('itinerary','transportation','accommodation')),
  item_id uuid not null,
  participant_kind text not null default 'member' check (participant_kind in ('member','invitation','family_member','guest','user')),
  trip_member_id uuid references public.trip_members(id) on delete cascade,
  user_id uuid,
  invitation_id uuid references public.trip_invitations(id) on delete cascade,
  family_member_id uuid references public.user_family_members(id) on delete cascade,
  guest_name text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(trip_member_id, user_id, invitation_id, family_member_id, guest_name) = 1),
  unique(item_type, item_id, trip_member_id),
  unique(item_type, item_id, user_id),
  unique(item_type, item_id, invitation_id),
  unique(item_type, item_id, family_member_id),
  unique(item_type, item_id, guest_name)
);

create index if not exists idx_trip_item_participants_item on public.trip_item_participants(item_type, item_id);
create index if not exists idx_trip_item_participants_trip on public.trip_item_participants(trip_id, participant_kind);
create index if not exists idx_trip_item_participants_member on public.trip_item_participants(trip_member_id);
create index if not exists idx_trip_item_participants_user on public.trip_item_participants(user_id);
create index if not exists idx_trip_item_participants_invitation on public.trip_item_participants(invitation_id);

alter table public.trip_item_participants enable row level security;

create or replace function public.is_trip_item_visible(
  target_trip_id uuid,
  target_created_by uuid,
  target_is_private boolean,
  target_audience_mode text,
  target_item_type text,
  target_item_id uuid
)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select public.is_trip_active_member(target_trip_id)
    and (
      (coalesce(target_is_private, false) = true and target_created_by = auth.uid())
      or
      (coalesce(target_is_private, false) = false and (
        coalesce(target_audience_mode, 'everyone') = 'everyone'
        or target_created_by = auth.uid()
        or exists (
          select 1
          from public.trip_item_participants tip
          where tip.trip_id = target_trip_id
            and tip.item_type = target_item_type
            and tip.item_id = target_item_id
            and (
              tip.user_id = auth.uid()
              or exists (
                select 1 from public.trip_members tm
                where tm.id = tip.trip_member_id
                  and tm.user_id = auth.uid()
                  and tm.status = 'active'
              )
            )
        )
      ))
    );
$$;

-- Replace item policies so custom audiences actually control visibility.
drop policy if exists "Trip members can view visible itinerary items" on public.itinerary_items;
create policy "Trip members can view visible itinerary items"
on public.itinerary_items for select
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'itinerary', id));

drop policy if exists "Trip members can update visible itinerary items" on public.itinerary_items;
create policy "Trip members can update visible itinerary items"
on public.itinerary_items for update
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'itinerary', id))
with check (public.is_trip_active_member(trip_id) and (is_private = false or created_by = auth.uid()));

drop policy if exists "Trip members can delete visible itinerary items" on public.itinerary_items;
create policy "Trip members can delete visible itinerary items"
on public.itinerary_items for delete
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'itinerary', id));

drop policy if exists "Trip members can view visible transportation items" on public.transportation_items;
create policy "Trip members can view visible transportation items"
on public.transportation_items for select
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'transportation', id));

drop policy if exists "Trip members can update visible transportation items" on public.transportation_items;
create policy "Trip members can update visible transportation items"
on public.transportation_items for update
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'transportation', id))
with check (public.is_trip_active_member(trip_id) and (is_private = false or created_by = auth.uid()));

drop policy if exists "Trip members can delete visible transportation items" on public.transportation_items;
create policy "Trip members can delete visible transportation items"
on public.transportation_items for delete
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'transportation', id));

drop policy if exists "Trip members can view visible accommodations" on public.trip_accommodations;
create policy "Trip members can view visible accommodations"
on public.trip_accommodations for select
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'accommodation', id));

drop policy if exists "Trip members can update visible accommodations" on public.trip_accommodations;
create policy "Trip members can update visible accommodations"
on public.trip_accommodations for update
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'accommodation', id))
with check (public.is_trip_active_member(trip_id) and (is_private = false or created_by = auth.uid()));

drop policy if exists "Trip members can delete visible accommodations" on public.trip_accommodations;
create policy "Trip members can delete visible accommodations"
on public.trip_accommodations for delete
to authenticated
using (public.is_trip_item_visible(trip_id, created_by, is_private, audience_mode, 'accommodation', id));

-- Participants policy. This allows members to see avatars for items visible to them, without exposing private/custom rows broadly.
drop policy if exists "Trip members can view visible item participants" on public.trip_item_participants;
create policy "Trip members can view visible item participants"
on public.trip_item_participants for select
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and (
    created_by = auth.uid()
    or user_id = auth.uid()
    or exists (
      select 1 from public.trip_members tm
      where tm.id = trip_item_participants.trip_member_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
    or exists (
      select 1 from public.itinerary_items i
      where trip_item_participants.item_type = 'itinerary'
        and i.id = trip_item_participants.item_id
        and i.trip_id = trip_item_participants.trip_id
        and i.is_private = false
        and i.audience_mode = 'everyone'
    )
    or exists (
      select 1 from public.transportation_items ti
      where trip_item_participants.item_type = 'transportation'
        and ti.id = trip_item_participants.item_id
        and ti.trip_id = trip_item_participants.trip_id
        and ti.is_private = false
        and ti.audience_mode = 'everyone'
    )
    or exists (
      select 1 from public.trip_accommodations ta
      where trip_item_participants.item_type = 'accommodation'
        and ta.id = trip_item_participants.item_id
        and ta.trip_id = trip_item_participants.trip_id
        and ta.is_private = false
        and ta.audience_mode = 'everyone'
    )
  )
);

drop policy if exists "Trip members can create item participants" on public.trip_item_participants;
create policy "Trip members can create item participants"
on public.trip_item_participants for insert
to authenticated
with check (public.is_trip_active_member(trip_id) and created_by = auth.uid());

drop policy if exists "Trip members can update item participants" on public.trip_item_participants;
create policy "Trip members can update item participants"
on public.trip_item_participants for update
to authenticated
using (public.is_trip_active_member(trip_id) and created_by = auth.uid())
with check (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can delete item participants" on public.trip_item_participants;
create policy "Trip members can delete item participants"
on public.trip_item_participants for delete
to authenticated
using (public.is_trip_active_member(trip_id) and created_by = auth.uid());

-- View to hydrate people chips/avatars from members, invitations, and family/guest participants.
create or replace view public.trip_item_participants_display as
select
  tip.id,
  tip.trip_id,
  tip.item_type,
  tip.item_id,
  tip.participant_kind,
  tip.trip_member_id,
  tip.user_id,
  tip.invitation_id,
  tip.family_member_id,
  tip.guest_name,
  coalesce(up.first_name || case when up.last_name is not null then ' ' || up.last_name else '' end, up.username, up.email, ti.invited_username, ti.invited_email, ufm.name, tip.guest_name) as display_name,
  coalesce(up.avatar_url, ufm.avatar_url) as avatar_url,
  case
    when tip.trip_member_id is not null then 'accepted'
    when tip.user_id is not null then 'accepted'
    when tip.invitation_id is not null then coalesce(ti.status, 'invited')
    when tip.family_member_id is not null then 'family_member'
    else 'guest'
  end as participant_status,
  tip.created_at
from public.trip_item_participants tip
left join public.trip_members tm on tm.id = tip.trip_member_id
left join public.user_profiles up on up.id = coalesce(tip.user_id, tm.user_id)
left join public.trip_invitations ti on ti.id = tip.invitation_id
left join public.user_family_members ufm on ufm.id = tip.family_member_id;

grant select on public.trip_item_participants_display to authenticated;

comment on table public.trip_legs is 'Editable geography/date legs for a trip, e.g. country, region/state, city, or custom segment.';
comment on table public.trip_invitation_legs is 'Legs included in a specific trip invitation.';
comment on table public.trip_member_legs is 'Legs an accepted member is joining or not joining, with optional member-specific dates.';
comment on table public.trip_item_participants is 'Shared audience/participant rows for itinerary, transportation, and accommodation items.';
;
