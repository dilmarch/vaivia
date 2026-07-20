-- Phase 2C follow-up: ordinary user-field edits are allowed, but a linked
-- target cannot change trip or creator while retaining its proposal linkage.
do $phase_two_c_target_scope$
declare
  function_sql text;
  patched_sql text;
begin
  function_sql := pg_catalog.pg_get_functiondef(
    'public.validate_ai_place_action_target_link()'::regprocedure
  );
  patched_sql := function_sql;

  if patched_sql not like '%new.trip_id is not distinct from old.trip_id%' then
    patched_sql := replace(
      patched_sql,
      E'  if tg_op = \'UPDATE\'\n    and new.assistant_action_proposal_id is not distinct from old.assistant_action_proposal_id',
      E'  if tg_op = \'UPDATE\'\n    and new.trip_id is not distinct from old.trip_id\n    and new.created_by is not distinct from old.created_by\n    and new.assistant_action_proposal_id is not distinct from old.assistant_action_proposal_id'
    );
  end if;

  if patched_sql not like '%new.created_by is distinct from proposal.user_id%' then
    patched_sql := replace(
      patched_sql,
      E'  if proposal.id is null\n    or new.place_source',
      E'  if proposal.id is null\n    or new.created_by is distinct from proposal.user_id\n    or new.place_source'
    );
  end if;

  if patched_sql = function_sql
    and function_sql not like '%new.trip_id is not distinct from old.trip_id%'
  then
    raise exception 'Could not lock assistant target ownership scope';
  end if;

  if patched_sql <> function_sql then
    execute patched_sql;
  end if;
end
$phase_two_c_target_scope$;
