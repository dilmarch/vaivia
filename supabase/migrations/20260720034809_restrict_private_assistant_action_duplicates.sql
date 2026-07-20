-- Phase 2C follow-up: duplicate detection must mirror Things to Do visibility.
-- The previous functions are rewritten in-place so an inaccessible private idea
-- cannot reveal either its existence or record ID through a definer RPC.
do $phase_two_c_private_duplicates$
declare
  function_sql text;
  patched_sql text;
begin
  function_sql := pg_catalog.pg_get_functiondef(
    'public.create_ai_place_action_proposal(uuid,uuid,uuid,text,text)'::regprocedure
  );
  if function_sql not like '%not idea.is_private or idea.created_by = current_user_id%' then
    patched_sql := replace(
      function_sql,
      E'    where idea.trip_id = target_trip_id\n      and idea.google_place_id = normalized_place_id\n      and public.is_trip_active_member(idea.trip_id)',
      E'    where idea.trip_id = target_trip_id\n      and idea.google_place_id = normalized_place_id\n      and (not idea.is_private or idea.created_by = current_user_id)\n      and public.is_trip_active_member(idea.trip_id)'
    );
    if patched_sql = function_sql then
      raise exception 'Could not harden create_ai_place_action_proposal duplicate visibility';
    end if;
    execute patched_sql;
  end if;

  function_sql := pg_catalog.pg_get_functiondef(
    'public.confirm_ai_place_action_proposal(uuid,jsonb)'::regprocedure
  );
  if function_sql not like '%not idea.is_private or idea.created_by = current_user_id%' then
    patched_sql := replace(
      function_sql,
      E'    where idea.trip_id = proposal.trip_id\n      and idea.google_place_id = proposal.google_place_id\n    order by idea.created_at',
      E'    where idea.trip_id = proposal.trip_id\n      and idea.google_place_id = proposal.google_place_id\n      and (not idea.is_private or idea.created_by = current_user_id)\n    order by idea.created_at'
    );
    if patched_sql = function_sql then
      raise exception 'Could not harden confirm_ai_place_action_proposal duplicate visibility';
    end if;
    execute patched_sql;
  end if;
end
$phase_two_c_private_duplicates$;
