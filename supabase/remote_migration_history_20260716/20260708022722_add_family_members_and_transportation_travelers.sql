create table if not exists public.user_family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  avatar_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_family_members_name_not_blank check (btrim(name) <> '')
);

create index if not exists user_family_members_user_id_idx
  on public.user_family_members(user_id);

create trigger user_family_members_set_updated_at
before update on public.user_family_members
for each row execute function public.set_updated_at();

create or replace function public.enforce_user_family_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.user_family_members ufm
    where ufm.user_id = new.user_id
      and ufm.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 10 then
    raise exception 'You can add up to 10 family members.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_family_member_limit_trigger on public.user_family_members;
create trigger enforce_user_family_member_limit_trigger
before insert or update of user_id on public.user_family_members
for each row execute function public.enforce_user_family_member_limit();

create table if not exists public.trip_family_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  family_member_id uuid not null references public.user_family_members(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status text not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_family_members_status_check check (status in ('going', 'not_going', 'removed')),
  constraint trip_family_members_unique unique (trip_id, family_member_id)
);

create index if not exists trip_family_members_trip_id_idx
  on public.trip_family_members(trip_id);
create index if not exists trip_family_members_family_member_id_idx
  on public.trip_family_members(family_member_id);

create trigger trip_family_members_set_updated_at
before update on public.trip_family_members
for each row execute function public.set_updated_at();

create table if not exists public.transportation_item_travelers (
  id uuid primary key default gen_random_uuid(),
  transportation_item_id uuid not null references public.transportation_items(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  family_member_id uuid references public.user_family_members(id) on delete cascade,
  guest_name text,
  traveler_note text,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint transportation_item_travelers_one_traveler_check check (
    ((user_id is not null)::int + (family_member_id is not null)::int + (guest_name is not null and btrim(guest_name) <> '')::int) = 1
  )
);

create index if not exists transportation_item_travelers_item_id_idx
  on public.transportation_item_travelers(transportation_item_id);
create index if not exists transportation_item_travelers_trip_id_idx
  on public.transportation_item_travelers(trip_id);
create index if not exists transportation_item_travelers_user_id_idx
  on public.transportation_item_travelers(user_id);
create index if not exists transportation_item_travelers_family_member_id_idx
  on public.transportation_item_travelers(family_member_id);

create unique index if not exists transportation_item_travelers_unique_user
  on public.transportation_item_travelers(transportation_item_id, user_id)
  where user_id is not null;

create unique index if not exists transportation_item_travelers_unique_family_member
  on public.transportation_item_travelers(transportation_item_id, family_member_id)
  where family_member_id is not null;

create unique index if not exists transportation_item_travelers_unique_guest_name
  on public.transportation_item_travelers(transportation_item_id, lower(btrim(guest_name)))
  where guest_name is not null and btrim(guest_name) <> '';

create or replace function public.validate_transportation_item_traveler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_trip_id uuid;
begin
  select ti.trip_id
    into item_trip_id
  from public.transportation_items ti
  where ti.id = new.transportation_item_id;

  if item_trip_id is null then
    raise exception 'Transportation item not found.';
  end if;

  if new.trip_id <> item_trip_id then
    raise exception 'Traveler trip_id must match transportation item trip_id.';
  end if;

  if new.user_id is not null and not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = item_trip_id
      and tm.user_id = new.user_id
      and tm.status = 'active'
  ) then
    raise exception 'Selected user must be an active member of this trip.';
  end if;

  if new.family_member_id is not null and not exists (
    select 1
    from public.trip_family_members tfm
    join public.user_family_members ufm on ufm.id = tfm.family_member_id
    where tfm.trip_id = item_trip_id
      and tfm.family_member_id = new.family_member_id
      and tfm.status = 'going'
      and ufm.user_id = new.created_by
  ) then
    raise exception 'Selected family member must be marked as going on this trip by the current user.';
  end if;

  if new.guest_name is not null then
    new.guest_name = nullif(btrim(new.guest_name), '');
  end if;

  return new;
end;
$$;

drop trigger if exists validate_transportation_item_traveler_trigger on public.transportation_item_travelers;
create trigger validate_transportation_item_traveler_trigger
before insert or update on public.transportation_item_travelers
for each row execute function public.validate_transportation_item_traveler();

alter table public.user_family_members enable row level security;
alter table public.trip_family_members enable row level security;
alter table public.transportation_item_travelers enable row level security;

drop policy if exists "Users can manage own family members" on public.user_family_members;
create policy "Users can manage own family members"
on public.user_family_members
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Trip members can view trip family members" on public.user_family_members;
create policy "Trip members can view trip family members"
on public.user_family_members
for select
to authenticated
using (
  exists (
    select 1
    from public.trip_family_members tfm
    where tfm.family_member_id = user_family_members.id
      and tfm.status = 'going'
      and public.is_trip_active_member(tfm.trip_id)
  )
);

drop policy if exists "Trip members can view trip family member links" on public.trip_family_members;
create policy "Trip members can view trip family member links"
on public.trip_family_members
for select
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Users can add own family members to active trips" on public.trip_family_members;
create policy "Users can add own family members to active trips"
on public.trip_family_members
for insert
to authenticated
with check (
  public.is_trip_active_member(trip_id)
  and added_by = auth.uid()
  and exists (
    select 1
    from public.user_family_members ufm
    where ufm.id = family_member_id
      and ufm.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own trip family member links" on public.trip_family_members;
create policy "Users can update own trip family member links"
on public.trip_family_members
for update
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.user_family_members ufm
    where ufm.id = family_member_id
      and ufm.user_id = auth.uid()
  )
)
with check (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.user_family_members ufm
    where ufm.id = family_member_id
      and ufm.user_id = auth.uid()
  )
);

drop policy if exists "Users can remove own trip family member links" on public.trip_family_members;
create policy "Users can remove own trip family member links"
on public.trip_family_members
for delete
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.user_family_members ufm
    where ufm.id = family_member_id
      and ufm.user_id = auth.uid()
  )
);

drop policy if exists "Trip members can view transportation travelers" on public.transportation_item_travelers;
create policy "Trip members can view transportation travelers"
on public.transportation_item_travelers
for select
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.transportation_items ti
    where ti.id = transportation_item_id
      and ti.trip_id = transportation_item_travelers.trip_id
      and (ti.is_private = false or ti.created_by = auth.uid())
  )
);

drop policy if exists "Trip members can add transportation travelers" on public.transportation_item_travelers;
create policy "Trip members can add transportation travelers"
on public.transportation_item_travelers
for insert
to authenticated
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
  and exists (
    select 1
    from public.transportation_items ti
    where ti.id = transportation_item_id
      and ti.trip_id = transportation_item_travelers.trip_id
      and (ti.is_private = false or ti.created_by = auth.uid())
  )
);

drop policy if exists "Trip members can update transportation travelers" on public.transportation_item_travelers;
create policy "Trip members can update transportation travelers"
on public.transportation_item_travelers
for update
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.transportation_items ti
    where ti.id = transportation_item_id
      and ti.trip_id = transportation_item_travelers.trip_id
      and (ti.is_private = false or ti.created_by = auth.uid())
  )
)
with check (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.transportation_items ti
    where ti.id = transportation_item_id
      and ti.trip_id = transportation_item_travelers.trip_id
      and (ti.is_private = false or ti.created_by = auth.uid())
  )
);

drop policy if exists "Trip members can delete transportation travelers" on public.transportation_item_travelers;
create policy "Trip members can delete transportation travelers"
on public.transportation_item_travelers
for delete
to authenticated
using (
  public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.transportation_items ti
    where ti.id = transportation_item_id
      and ti.trip_id = transportation_item_travelers.trip_id
      and (ti.is_private = false or ti.created_by = auth.uid())
  )
);

comment on table public.user_family_members is 'Non-user family members or managed travellers saved to a user account.';
comment on table public.trip_family_members is 'Links saved non-user family members to trips as going/not going.';
comment on table public.transportation_item_travelers is 'People that a transportation item applies to: active trip users, saved family members, or one-off guest names.';;
