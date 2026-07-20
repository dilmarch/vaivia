-- Phase 2C follow-up: cover proposal ownership foreign keys used for
-- conversation and trip deletion checks.
create index ai_place_action_proposals_conversation_idx
  on public.ai_place_action_proposals (conversation_id);

create index ai_place_action_proposals_trip_idx
  on public.ai_place_action_proposals (trip_id);
