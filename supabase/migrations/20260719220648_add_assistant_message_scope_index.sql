-- Cover the composite conversation/trip foreign key used by assistant message
-- authorization and cascade checks. The existing conversation history index
-- optimizes ordering but does not include trip_id.
create index ai_messages_conversation_trip_idx
  on public.ai_messages (conversation_id, trip_id);
