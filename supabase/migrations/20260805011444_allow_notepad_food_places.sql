alter table public.trip_food_items
  drop constraint if exists trip_food_items_place_source_check;

alter table public.trip_food_items
  add constraint trip_food_items_place_source_check
  check (
    place_source is null
    or place_source in ('google_place_assistant', 'trip_notepad')
  );

alter table public.trip_food_items
  drop constraint if exists trip_food_items_assistant_place_link_check;

alter table public.trip_food_items
  add constraint trip_food_items_assistant_place_link_check
  check (
    (place_source = 'trip_notepad'
      and assistant_action_proposal_id is null
      and google_place_id_saved_at is null)
    or
    (assistant_action_proposal_id is null and (
      (place_source is null and google_place_id_saved_at is null)
      or (place_source = 'google_place_assistant'
        and google_place_id_saved_at is not null
        and google_place_id is not null)
    ))
    or
    (assistant_action_proposal_id is not null
      and place_source = 'google_place_assistant'
      and google_place_id_saved_at is not null
      and google_place_id is not null)
  );

alter table public.trip_food_items
  drop constraint if exists trip_food_items_place_required;

alter table public.trip_food_items
  add constraint trip_food_items_place_required check (
    item_type <> 'place'
    or place_source = 'trip_notepad'
    or (
      google_place_id is not null
      and length(btrim(google_place_id)) > 0
      and (
        (formatted_address is not null and length(btrim(formatted_address)) > 0)
        or (
          assistant_action_proposal_id is not null
          and place_source = 'google_place_assistant'
        )
      )
    )
  );

comment on column public.trip_food_items.place_source is
  'Origin of place metadata. trip_notepad rows are intentionally unvalidated ideas that can be refined later.';
