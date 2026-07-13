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
  if $1 is null or $2 is null or $3 is null then
    return null;
  end if;

  if $8 is not null then
    select *
      into event_row
      from public.user_point_events
     where user_point_events.unique_key = $8
     limit 1;

    if event_row.id is not null then
      perform public.refresh_user_points($1);
      return event_row;
    end if;
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
    $1,
    $2,
    $3,
    $4,
    $5,
    coalesce($6, '{}'::jsonb),
    coalesce($7, now()),
    $8
  )
  returning * into event_row;

  perform public.refresh_user_points($1);

  return event_row;
end;
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
  if TG_TABLE_NAME = 'trips' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'user_passport_stamps' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'trip_ideas' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'transportation_items' then
    owner_id := coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id));
  elsif TG_TABLE_NAME = 'itinerary_items' then
    owner_id := coalesce(new.created_by, public.vaivia_trip_owner(new.trip_id));
  elsif TG_TABLE_NAME = 'trip_food_items' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_accommodations' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_budgets' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_expenses' then
    owner_id := new.created_by;
  elsif TG_TABLE_NAME = 'trip_idea_reactions' then
    owner_id := new.user_id;
  elsif TG_TABLE_NAME = 'news_feed_reactions' then
    owner_id := new.user_id;
  else
    owner_id := null;
  end if;

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
  if TG_TABLE_NAME = 'trips' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'user_passport_stamps' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'trip_ideas' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'transportation_items' then
    owner_id := coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id));
  elsif TG_TABLE_NAME = 'itinerary_items' then
    owner_id := coalesce(old.created_by, public.vaivia_trip_owner(old.trip_id));
  elsif TG_TABLE_NAME = 'trip_food_items' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_accommodations' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_budgets' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_expenses' then
    owner_id := old.created_by;
  elsif TG_TABLE_NAME = 'trip_idea_reactions' then
    owner_id := old.user_id;
  elsif TG_TABLE_NAME = 'news_feed_reactions' then
    owner_id := old.user_id;
  else
    owner_id := null;
  end if;

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
