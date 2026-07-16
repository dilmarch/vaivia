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
  elsif TG_TABLE_NAME = 'feature_suggestions' then
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

drop trigger if exists feature_suggestions_points_after_insert
  on public.feature_suggestions;

create trigger feature_suggestions_points_after_insert
after insert on public.feature_suggestions
for each row
execute function public.vaivia_points_after_insert('feature_suggestion_created', '5');

create or replace function public.notify_feature_suggestion_implemented()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  notify_when_implemented boolean := true;
  suggestion_title text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'implemented' or coalesce(old.status, '') = 'implemented' then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  perform public.record_user_point_event(
    new.user_id,
    'feature_suggestion_implemented',
    5,
    'feature_suggestions',
    new.id,
    jsonb_build_object('action', 'implemented'),
    now(),
    'feature_suggestions:' || new.id::text || ':implemented'
  );

  if jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'notify_when_implemented') = 'boolean' then
    notify_when_implemented :=
      (coalesce(new.metadata, '{}'::jsonb)->>'notify_when_implemented')::boolean;
  end if;

  if not notify_when_implemented then
    return new;
  end if;

  suggestion_title := coalesce(nullif(btrim(new.title), ''), 'Your VAIVIA request');

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    metadata
  )
  values (
    new.user_id,
    (select auth.uid()),
    'feature_suggestion_implemented',
    'Feature request implemented',
    suggestion_title || ' is now available in VAIVIA. You earned 5 VAIVIA points.',
    jsonb_build_object(
      'featureSuggestionId', new.id,
      'suggestionType', new.suggestion_type,
      'pointsAwarded', 5
    )
  );

  return new;
end;
$$;

revoke all on function public.notify_feature_suggestion_implemented() from public;

do $$
declare
  suggestion record;
begin
  for suggestion in
    select id, user_id, created_at, status
    from public.feature_suggestions
    where user_id is not null
  loop
    perform public.record_user_point_event(
      suggestion.user_id,
      'feature_suggestion_created',
      5,
      'feature_suggestions',
      suggestion.id,
      jsonb_build_object('action', 'created', 'backfilled', true),
      coalesce(suggestion.created_at, now()),
      'feature_suggestions:' || suggestion.id::text || ':create'
    );

    if suggestion.status = 'implemented' then
      perform public.record_user_point_event(
        suggestion.user_id,
        'feature_suggestion_implemented',
        5,
        'feature_suggestions',
        suggestion.id,
        jsonb_build_object('action', 'implemented', 'backfilled', true),
        now(),
        'feature_suggestions:' || suggestion.id::text || ':implemented'
      );
    end if;
  end loop;
end;
$$;
