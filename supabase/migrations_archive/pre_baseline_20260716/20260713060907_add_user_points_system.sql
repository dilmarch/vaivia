create table if not exists public.user_point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  points integer not null,
  source_table text,
  source_id uuid,
  unique_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_point_events_unique_key_idx
on public.user_point_events(unique_key)
where unique_key is not null;

create index if not exists user_point_events_user_occurred_idx
on public.user_point_events(user_id, occurred_at desc);

create table if not exists public.user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0,
  level integer not null default 1,
  level_name text not null default 'Still Packing',
  updated_at timestamptz not null default now()
);

alter table public.user_point_events enable row level security;
alter table public.user_points enable row level security;

drop policy if exists "Users can view their own point events" on public.user_point_events;
create policy "Users can view their own point events"
on public.user_point_events
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_admin()
);

drop policy if exists "Users can view their own points" on public.user_points;
create policy "Users can view their own points"
on public.user_points
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_admin()
);

grant select on public.user_point_events to authenticated;
grant select on public.user_points to authenticated;

create or replace function public.vaivia_level_for_points(raw_points integer)
returns jsonb
language sql
immutable
as $$
  with normalized as (
    select greatest(coalesce(raw_points, 0), 0) as points
  ),
  level_row as (
    select
      case
        when points between 0 and 9 then 1
        when points between 10 and 24 then 2
        when points between 25 and 59 then 3
        when points between 60 and 99 then 4
        when points between 100 and 149 then 5
        when points between 150 and 224 then 6
        when points between 225 and 299 then 7
        when points between 300 and 399 then 8
        when points between 400 and 499 then 9
        when points between 500 and 599 then 10
        when points between 600 and 699 then 11
        when points between 700 and 799 then 12
        when points between 800 and 899 then 13
        when points between 900 and 999 then 14
        when points between 1000 and 1099 then 15
        when points between 1100 and 1199 then 16
        when points between 1200 and 1299 then 17
        when points between 1300 and 1399 then 18
        when points between 1400 and 1499 then 19
        else 20
      end as level,
      points
    from normalized
  )
  select jsonb_build_object(
    'level', level,
    'name',
      case level
        when 1 then 'Still Packing'
        when 2 then 'Gate Daydreamer'
        when 3 then 'Weekend Wanderer'
        when 4 then 'Carry-On Cadet'
        when 5 then 'Boarding Pass Boss'
        when 6 then 'Itinerary Instigator'
        when 7 then 'Window Seat Warrior'
        when 8 then 'Passport Paparazzi'
        when 9 then 'Layover Legend'
        when 10 then 'Jet Lag Juggler'
        when 11 then 'Terminal Celebrity'
        when 12 then 'Frequent Flyer Flirt'
        when 13 then 'Timezone Tactician'
        when 14 then 'Border-Hopping Icon'
        when 15 then 'Global Gallivanter'
        when 16 then 'Customs Connoisseur'
        when 17 then 'World Tour Royalty'
        when 18 then 'International Mystery'
        when 19 then 'Citizen of Everywhere'
        else 'Main Character Abroad'
      end,
    'minPoints',
      case level
        when 1 then 0
        when 2 then 10
        when 3 then 25
        when 4 then 60
        when 5 then 100
        when 6 then 150
        when 7 then 225
        when 8 then 300
        when 9 then 400
        else (level - 5) * 100
      end,
    'maxPoints',
      case level
        when 1 then 9
        when 2 then 24
        when 3 then 59
        when 4 then 99
        when 5 then 149
        when 6 then 224
        when 7 then 299
        when 8 then 399
        when 9 then 499
        when 20 then null
        else ((level - 5) * 100) + 99
      end
  )
  from level_row;
$$;

create or replace function public.refresh_user_points(target_user_id uuid)
returns public.user_points
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  total_points integer;
  level_info jsonb;
  points_row public.user_points;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  select coalesce(sum(user_point_events.points), 0)::integer
    into total_points
    from public.user_point_events
   where user_point_events.user_id = target_user_id;

  level_info := public.vaivia_level_for_points(total_points);

  insert into public.user_points (
    user_id,
    points,
    level,
    level_name,
    updated_at
  )
  values (
    target_user_id,
    total_points,
    (level_info->>'level')::integer,
    level_info->>'name',
    now()
  )
  on conflict (user_id) do update
    set points = excluded.points,
        level = excluded.level,
        level_name = excluded.level_name,
        updated_at = now()
  returning * into points_row;

  return points_row;
end;
$$;

create or replace function public.record_user_point_event(
  target_user_id uuid,
  event_type text,
  point_delta integer,
  source_table text default null,
  source_id uuid default null,
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamptz default now(),
  unique_key text default null
)
returns public.user_point_events
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_row public.user_point_events;
begin
  if target_user_id is null or event_type is null or point_delta is null then
    return null;
  end if;

  insert into public.user_point_events (
    user_id,
    event_type,
    points,
    source_table,
    source_id,
    metadata,
    occurred_at,
    unique_key
  )
  values (
    target_user_id,
    event_type,
    point_delta,
    source_table,
    source_id,
    coalesce(metadata, '{}'::jsonb),
    coalesce(occurred_at, now()),
    unique_key
  )
  on conflict (unique_key) where unique_key is not null do nothing
  returning * into event_row;

  perform public.refresh_user_points(target_user_id);

  return event_row;
end;
$$;

create or replace function public.vaivia_trip_owner(trip_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select trips.user_id
    from public.trips
   where trips.id = trip_id
   limit 1;
$$;

create or replace function public.vaivia_points_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid;
begin
  owner_id := case TG_TABLE_NAME
    when 'trips' then new.user_id
    when 'user_passport_stamps' then new.user_id
    when 'trip_ideas' then new.created_by
    when 'transportation_items' then coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id))
    when 'itinerary_items' then coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id))
    when 'trip_food_items' then new.created_by
    when 'trip_accommodations' then new.created_by
    when 'trip_budgets' then new.created_by
    when 'trip_expenses' then new.created_by
    when 'trip_idea_reactions' then new.user_id
    when 'news_feed_reactions' then new.user_id
    else null
  end;

  if TG_TABLE_NAME = 'itinerary_items'
     and exists (
       select 1 from public.transportation_items
        where transportation_items.itinerary_item_id = new.id
     ) then
    return new;
  end if;

  perform public.record_user_point_event(
    owner_id,
    TG_ARGV[0],
    TG_ARGV[1]::integer,
    TG_TABLE_NAME,
    new.id,
    jsonb_build_object('action', 'created'),
    coalesce(new.created_at, now()),
    TG_TABLE_NAME || ':' || new.id::text || ':create'
  );

  return new;
end;
$$;

create or replace function public.vaivia_points_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid;
begin
  owner_id := case TG_TABLE_NAME
    when 'trips' then old.user_id
    when 'user_passport_stamps' then old.user_id
    when 'trip_ideas' then old.created_by
    when 'transportation_items' then coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id))
    when 'itinerary_items' then coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id))
    when 'trip_food_items' then old.created_by
    when 'trip_accommodations' then old.created_by
    when 'trip_budgets' then old.created_by
    when 'trip_expenses' then old.created_by
    when 'trip_idea_reactions' then old.user_id
    when 'news_feed_reactions' then old.user_id
    else null
  end;

  if TG_TABLE_NAME = 'itinerary_items'
     and exists (
       select 1 from public.transportation_items
        where transportation_items.itinerary_item_id = old.id
     ) then
    return old;
  end if;

  perform public.record_user_point_event(
    owner_id,
    TG_ARGV[0],
    -1,
    TG_TABLE_NAME,
    old.id,
    jsonb_build_object('action', 'deleted'),
    now(),
    TG_TABLE_NAME || ':' || old.id::text || ':delete'
  );

  return old;
end;
$$;

create or replace function public.vaivia_points_trip_expense_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.record_user_point_event(
      old.created_by,
      'expense_deleted',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('action', 'soft_deleted'),
      coalesce(new.deleted_at, now()),
      TG_TABLE_NAME || ':' || old.id::text || ':delete'
    );
  end if;

  return new;
end;
$$;

create or replace function public.vaivia_points_friendship_status()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if TG_OP = 'INSERT' and new.status = 'accepted' then
    perform public.record_user_point_event(
      new.requester_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.addressee_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, new.created_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':requester:accepted'
    );
    perform public.record_user_point_event(
      new.addressee_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.requester_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, new.created_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':addressee:accepted'
    );
    return new;
  end if;

  if TG_OP = 'UPDATE'
     and old.status is distinct from 'accepted'
     and new.status = 'accepted' then
    perform public.record_user_point_event(
      new.requester_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.addressee_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':requester:accepted'
    );
    perform public.record_user_point_event(
      new.addressee_user_id,
      'friend_added',
      5,
      TG_TABLE_NAME,
      new.id,
      jsonb_build_object('friendUserId', new.requester_user_id, 'action', 'accepted'),
      coalesce(new.responded_at, now()),
      TG_TABLE_NAME || ':' || new.id::text || ':addressee:accepted'
    );
  elsif TG_OP = 'UPDATE'
     and old.status = 'accepted'
     and new.status is distinct from 'accepted' then
    perform public.record_user_point_event(
      old.requester_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.addressee_user_id, 'action', 'removed'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':requester:removed'
    );
    perform public.record_user_point_event(
      old.addressee_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.requester_user_id, 'action', 'removed'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':addressee:removed'
    );
  end if;

  return new;
end;
$$;

create or replace function public.vaivia_points_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.status = 'accepted' then
    perform public.record_user_point_event(
      old.requester_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.addressee_user_id, 'action', 'deleted'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':requester:delete'
    );
    perform public.record_user_point_event(
      old.addressee_user_id,
      'friend_removed',
      -1,
      TG_TABLE_NAME,
      old.id,
      jsonb_build_object('friendUserId', old.requester_user_id, 'action', 'deleted'),
      now(),
      TG_TABLE_NAME || ':' || old.id::text || ':addressee:delete'
    );
  end if;

  return old;
end;
$$;

drop trigger if exists vaivia_points_trips_insert on public.trips;
create trigger vaivia_points_trips_insert
after insert on public.trips
for each row execute function public.vaivia_points_after_insert('trip_created', '5');

drop trigger if exists vaivia_points_trips_delete on public.trips;
create trigger vaivia_points_trips_delete
after delete on public.trips
for each row execute function public.vaivia_points_after_delete('trip_deleted', '-1');

drop trigger if exists vaivia_points_passport_insert on public.user_passport_stamps;
create trigger vaivia_points_passport_insert
after insert on public.user_passport_stamps
for each row execute function public.vaivia_points_after_insert('passport_stamp_added', '5');

drop trigger if exists vaivia_points_passport_delete on public.user_passport_stamps;
create trigger vaivia_points_passport_delete
after delete on public.user_passport_stamps
for each row execute function public.vaivia_points_after_delete('passport_stamp_deleted', '-1');

drop trigger if exists vaivia_points_friendship_insert on public.user_friendships;
create trigger vaivia_points_friendship_insert
after insert on public.user_friendships
for each row execute function public.vaivia_points_friendship_status();

drop trigger if exists vaivia_points_friendship_update on public.user_friendships;
create trigger vaivia_points_friendship_update
after update of status on public.user_friendships
for each row execute function public.vaivia_points_friendship_status();

drop trigger if exists vaivia_points_friendship_delete on public.user_friendships;
create trigger vaivia_points_friendship_delete
after delete on public.user_friendships
for each row execute function public.vaivia_points_friendship_delete();

drop trigger if exists vaivia_points_ideas_insert on public.trip_ideas;
create trigger vaivia_points_ideas_insert
after insert on public.trip_ideas
for each row execute function public.vaivia_points_after_insert('idea_added', '2');

drop trigger if exists vaivia_points_ideas_delete on public.trip_ideas;
create trigger vaivia_points_ideas_delete
after delete on public.trip_ideas
for each row execute function public.vaivia_points_after_delete('idea_deleted', '-1');

drop trigger if exists vaivia_points_transportation_insert on public.transportation_items;
create trigger vaivia_points_transportation_insert
after insert on public.transportation_items
for each row execute function public.vaivia_points_after_insert('transportation_added', '4');

drop trigger if exists vaivia_points_transportation_delete on public.transportation_items;
create trigger vaivia_points_transportation_delete
after delete on public.transportation_items
for each row execute function public.vaivia_points_after_delete('transportation_deleted', '-1');

drop trigger if exists vaivia_points_itinerary_insert on public.itinerary_items;
create trigger vaivia_points_itinerary_insert
after insert on public.itinerary_items
for each row execute function public.vaivia_points_after_insert('itinerary_event_added', '3');

drop trigger if exists vaivia_points_itinerary_delete on public.itinerary_items;
create trigger vaivia_points_itinerary_delete
after delete on public.itinerary_items
for each row execute function public.vaivia_points_after_delete('itinerary_event_deleted', '-1');

drop trigger if exists vaivia_points_food_insert on public.trip_food_items;
create trigger vaivia_points_food_insert
after insert on public.trip_food_items
for each row execute function public.vaivia_points_after_insert('food_item_added', '2');

drop trigger if exists vaivia_points_food_delete on public.trip_food_items;
create trigger vaivia_points_food_delete
after delete on public.trip_food_items
for each row execute function public.vaivia_points_after_delete('food_item_deleted', '-1');

drop trigger if exists vaivia_points_accommodation_insert on public.trip_accommodations;
create trigger vaivia_points_accommodation_insert
after insert on public.trip_accommodations
for each row execute function public.vaivia_points_after_insert('accommodation_added', '4');

drop trigger if exists vaivia_points_accommodation_delete on public.trip_accommodations;
create trigger vaivia_points_accommodation_delete
after delete on public.trip_accommodations
for each row execute function public.vaivia_points_after_delete('accommodation_deleted', '-1');

drop trigger if exists vaivia_points_budget_insert on public.trip_budgets;
create trigger vaivia_points_budget_insert
after insert on public.trip_budgets
for each row execute function public.vaivia_points_after_insert('budget_added', '10');

drop trigger if exists vaivia_points_budget_delete on public.trip_budgets;
create trigger vaivia_points_budget_delete
after delete on public.trip_budgets
for each row execute function public.vaivia_points_after_delete('budget_deleted', '-1');

drop trigger if exists vaivia_points_expense_insert on public.trip_expenses;
create trigger vaivia_points_expense_insert
after insert on public.trip_expenses
for each row
when (new.deleted_at is null)
execute function public.vaivia_points_after_insert('expense_added', '1');

drop trigger if exists vaivia_points_expense_soft_delete on public.trip_expenses;
create trigger vaivia_points_expense_soft_delete
after update of deleted_at on public.trip_expenses
for each row execute function public.vaivia_points_trip_expense_soft_delete();

drop trigger if exists vaivia_points_expense_delete on public.trip_expenses;
create trigger vaivia_points_expense_delete
after delete on public.trip_expenses
for each row
when (old.deleted_at is null)
execute function public.vaivia_points_after_delete('expense_deleted', '-1');

drop trigger if exists vaivia_points_idea_reaction_insert on public.trip_idea_reactions;
create trigger vaivia_points_idea_reaction_insert
after insert on public.trip_idea_reactions
for each row execute function public.vaivia_points_after_insert('idea_reaction_added', '1');

drop trigger if exists vaivia_points_idea_reaction_delete on public.trip_idea_reactions;
create trigger vaivia_points_idea_reaction_delete
after delete on public.trip_idea_reactions
for each row execute function public.vaivia_points_after_delete('idea_reaction_deleted', '-1');

drop trigger if exists vaivia_points_news_reaction_insert on public.news_feed_reactions;
create trigger vaivia_points_news_reaction_insert
after insert on public.news_feed_reactions
for each row execute function public.vaivia_points_after_insert('news_feed_reaction_added', '1');

drop trigger if exists vaivia_points_news_reaction_delete on public.news_feed_reactions;
create trigger vaivia_points_news_reaction_delete
after delete on public.news_feed_reactions
for each row execute function public.vaivia_points_after_delete('news_feed_reaction_deleted', '-1');

create or replace function public.recalculate_all_user_points()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  refreshed_count integer := 0;
  profile_row record;
begin
  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trips.user_id, 'trip_created', 5, 'trips', trips.id, jsonb_build_object('backfilled', true), trips.created_at, 'trips:' || trips.id::text || ':create'
  from public.trips
  where trips.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_passport_stamps.user_id, 'passport_stamp_added', 5, 'user_passport_stamps', user_passport_stamps.id, jsonb_build_object('backfilled', true), user_passport_stamps.created_at, 'user_passport_stamps:' || user_passport_stamps.id::text || ':create'
  from public.user_passport_stamps
  where user_passport_stamps.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_friendships.requester_user_id, 'friend_added', 5, 'user_friendships', user_friendships.id, jsonb_build_object('backfilled', true, 'friendUserId', user_friendships.addressee_user_id), coalesce(user_friendships.responded_at, user_friendships.created_at), 'user_friendships:' || user_friendships.id::text || ':requester:accepted'
  from public.user_friendships
  where user_friendships.status = 'accepted'
    and user_friendships.requester_user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select user_friendships.addressee_user_id, 'friend_added', 5, 'user_friendships', user_friendships.id, jsonb_build_object('backfilled', true, 'friendUserId', user_friendships.requester_user_id), coalesce(user_friendships.responded_at, user_friendships.created_at), 'user_friendships:' || user_friendships.id::text || ':addressee:accepted'
  from public.user_friendships
  where user_friendships.status = 'accepted'
    and user_friendships.addressee_user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_ideas.created_by, 'idea_added', 2, 'trip_ideas', trip_ideas.id, jsonb_build_object('backfilled', true), trip_ideas.created_at, 'trip_ideas:' || trip_ideas.id::text || ':create'
  from public.trip_ideas
  where trip_ideas.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select coalesce(transportation_items.created_by, public.vaivia_trip_owner(transportation_items.trip_id)), 'transportation_added', 4, 'transportation_items', transportation_items.id, jsonb_build_object('backfilled', true), transportation_items.created_at, 'transportation_items:' || transportation_items.id::text || ':create'
  from public.transportation_items
  where coalesce(transportation_items.created_by, public.vaivia_trip_owner(transportation_items.trip_id)) is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select coalesce(itinerary_items.created_by, public.vaivia_trip_owner(itinerary_items.trip_id)), 'itinerary_event_added', 3, 'itinerary_items', itinerary_items.id, jsonb_build_object('backfilled', true), itinerary_items.created_at, 'itinerary_items:' || itinerary_items.id::text || ':create'
  from public.itinerary_items
  where coalesce(itinerary_items.created_by, public.vaivia_trip_owner(itinerary_items.trip_id)) is not null
    and not exists (
      select 1 from public.transportation_items
      where transportation_items.itinerary_item_id = itinerary_items.id
    )
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_food_items.created_by, 'food_item_added', 2, 'trip_food_items', trip_food_items.id, jsonb_build_object('backfilled', true), trip_food_items.created_at, 'trip_food_items:' || trip_food_items.id::text || ':create'
  from public.trip_food_items
  where trip_food_items.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_accommodations.created_by, 'accommodation_added', 4, 'trip_accommodations', trip_accommodations.id, jsonb_build_object('backfilled', true), trip_accommodations.created_at, 'trip_accommodations:' || trip_accommodations.id::text || ':create'
  from public.trip_accommodations
  where trip_accommodations.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_budgets.created_by, 'budget_added', 10, 'trip_budgets', trip_budgets.id, jsonb_build_object('backfilled', true), trip_budgets.created_at, 'trip_budgets:' || trip_budgets.id::text || ':create'
  from public.trip_budgets
  where trip_budgets.created_by is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_expenses.created_by, 'expense_added', 1, 'trip_expenses', trip_expenses.id, jsonb_build_object('backfilled', true), trip_expenses.created_at, 'trip_expenses:' || trip_expenses.id::text || ':create'
  from public.trip_expenses
  where trip_expenses.created_by is not null
    and trip_expenses.deleted_at is null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select trip_idea_reactions.user_id, 'idea_reaction_added', 1, 'trip_idea_reactions', trip_idea_reactions.id, jsonb_build_object('backfilled', true), trip_idea_reactions.created_at, 'trip_idea_reactions:' || trip_idea_reactions.id::text || ':create'
  from public.trip_idea_reactions
  where trip_idea_reactions.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  insert into public.user_point_events (
    user_id, event_type, points, source_table, source_id, metadata, occurred_at, unique_key
  )
  select news_feed_reactions.user_id, 'news_feed_reaction_added', 1, 'news_feed_reactions', news_feed_reactions.id, jsonb_build_object('backfilled', true), news_feed_reactions.created_at, 'news_feed_reactions:' || news_feed_reactions.id::text || ':create'
  from public.news_feed_reactions
  where news_feed_reactions.user_id is not null
  on conflict (unique_key) where unique_key is not null do nothing;

  for profile_row in
    select user_profiles.id
      from public.user_profiles
  loop
    perform public.refresh_user_points(profile_row.id);
    refreshed_count := refreshed_count + 1;
  end loop;

  return refreshed_count;
end;
$$;

select public.recalculate_all_user_points();

create or replace function public.get_admin_site_stats(
    range_start date default (current_date - interval '30 days')::date,
    range_end date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
    safe_start date := least(range_start, range_end);
    safe_end date := greatest(range_start, range_end);
    result jsonb;
begin
    if not public.is_super_admin() then
        raise exception 'Only super admins can view site stats'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'userCount',
        (select count(*) from public.user_profiles),
        'tripCount',
        (select count(*) from public.trips),
        'themeUsage',
        (
            with theme_modes(theme_mode, sort_order) as (
                values
                    ('dark', 1),
                    ('pink', 2),
                    ('greyscale', 3),
                    ('brat', 4),
                    ('pride', 5),
                    ('light', 6)
            ),
            theme_counts as (
                select
                    user_preferences.theme_mode,
                    count(*) as theme_count
                from public.user_preferences
                where user_preferences.theme_mode in (
                    'dark',
                    'pink',
                    'greyscale',
                    'brat',
                    'pride',
                    'light'
                )
                group by user_preferences.theme_mode
            )
            select jsonb_agg(
                jsonb_build_object(
                    'themeMode',
                    theme_modes.theme_mode,
                    'count',
                    coalesce(theme_counts.theme_count, 0)
                )
                order by theme_modes.sort_order
            )
            from theme_modes
            left join theme_counts
              on theme_counts.theme_mode = theme_modes.theme_mode
        ),
        'levelDistribution',
        (
            with levels(level, level_name, min_points, max_points) as (
                values
                    (1, 'Still Packing', 0, 9),
                    (2, 'Gate Daydreamer', 10, 24),
                    (3, 'Weekend Wanderer', 25, 59),
                    (4, 'Carry-On Cadet', 60, 99),
                    (5, 'Boarding Pass Boss', 100, 149),
                    (6, 'Itinerary Instigator', 150, 224),
                    (7, 'Window Seat Warrior', 225, 299),
                    (8, 'Passport Paparazzi', 300, 399),
                    (9, 'Layover Legend', 400, 499),
                    (10, 'Jet Lag Juggler', 500, 599),
                    (11, 'Terminal Celebrity', 600, 699),
                    (12, 'Frequent Flyer Flirt', 700, 799),
                    (13, 'Timezone Tactician', 800, 899),
                    (14, 'Border-Hopping Icon', 900, 999),
                    (15, 'Global Gallivanter', 1000, 1099),
                    (16, 'Customs Connoisseur', 1100, 1199),
                    (17, 'World Tour Royalty', 1200, 1299),
                    (18, 'International Mystery', 1300, 1399),
                    (19, 'Citizen of Everywhere', 1400, 1499),
                    (20, 'Main Character Abroad', 1500, null)
            ),
            level_counts as (
                select user_points.level, count(*) as user_count
                from public.user_points
                group by user_points.level
            )
            select jsonb_agg(
                jsonb_build_object(
                    'level', levels.level,
                    'levelName', levels.level_name,
                    'minPoints', levels.min_points,
                    'maxPoints', levels.max_points,
                    'count', coalesce(level_counts.user_count, 0)
                )
                order by levels.level
            )
            from levels
            left join level_counts
              on level_counts.level = levels.level
        ),
        'newUsersByDay',
        (
            select coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'date',
                        day_series.day::text,
                        'count',
                        coalesce(join_counts.user_count, 0)
                    )
                    order by day_series.day
                ),
                '[]'::jsonb
            )
            from generate_series(safe_start, safe_end, interval '1 day') as day_series(day)
            left join (
                select
                    user_profiles.join_date::date as joined_on,
                    count(*) as user_count
                from public.user_profiles
                where user_profiles.join_date::date between safe_start and safe_end
                group by user_profiles.join_date::date
            ) join_counts
              on join_counts.joined_on = day_series.day::date
        )
    )
    into result;

    return result;
end;
$$;

revoke all on function public.vaivia_level_for_points(integer) from public;
grant execute on function public.vaivia_level_for_points(integer) to authenticated;

revoke all on function public.refresh_user_points(uuid) from public;

revoke all on function public.record_user_point_event(uuid, text, integer, text, uuid, jsonb, timestamptz, text) from public;

revoke all on function public.recalculate_all_user_points() from public;

revoke all on function public.get_admin_site_stats(date, date) from public;
grant execute on function public.get_admin_site_stats(date, date) to authenticated;
