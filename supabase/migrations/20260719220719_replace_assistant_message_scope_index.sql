drop index if exists public.ai_messages_conversation_trip_idx;

create index ai_messages_conversation_trip_user_idx
  on public.ai_messages (conversation_id, trip_id, user_id);
