-- Phase 2C follow-up: protect immutable Places linkage without blocking later
-- edits to the user's own title, notes, availability, or itinerary fields.
create or replace function public.validate_ai_place_action_target_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.ai_place_action_proposals%rowtype;
  expected_action text;
begin
  if tg_op = 'UPDATE' and not (
    old.assistant_action_proposal_id is not null
    and new.assistant_action_proposal_id is null
    and new.place_source is not distinct from old.place_source
    and new.google_place_id_saved_at is not distinct from old.google_place_id_saved_at
    and pg_catalog.pg_trigger_depth() > 1
  ) and (
    new.assistant_action_proposal_id is distinct from old.assistant_action_proposal_id
    or new.place_source is distinct from old.place_source
    or new.google_place_id_saved_at is distinct from old.google_place_id_saved_at
  ) then
    raise exception 'Assistant place linkage is immutable' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.trip_id is not distinct from old.trip_id
    and new.created_by is not distinct from old.created_by
    and new.assistant_action_proposal_id is not distinct from old.assistant_action_proposal_id
    and new.place_source is not distinct from old.place_source
    and new.google_place_id_saved_at is not distinct from old.google_place_id_saved_at
    and new.google_place_id is not distinct from old.google_place_id
  then
    return new;
  end if;

  if new.assistant_action_proposal_id is null then
    return new;
  end if;

  expected_action := case tg_table_name
    when 'trip_ideas' then 'save_thing_to_do'
    when 'trip_food_items' then 'save_food'
    when 'itinerary_items' then 'add_itinerary'
    else null
  end;

  select *
  into proposal
  from public.ai_place_action_proposals action_proposal
  where action_proposal.id = new.assistant_action_proposal_id
    and action_proposal.user_id = (select auth.uid())
    and action_proposal.trip_id = new.trip_id
    and action_proposal.action_type = expected_action
    and action_proposal.source_type = 'google_place'
    and action_proposal.status = 'confirmed';

  if proposal.id is null
    or new.created_by is distinct from proposal.user_id
    or new.place_source <> 'google_place_assistant'
    or new.google_place_id <> proposal.google_place_id
  then
    raise exception 'Invalid assistant place action link' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_ai_place_action_target_link()
  from public, anon, authenticated;
