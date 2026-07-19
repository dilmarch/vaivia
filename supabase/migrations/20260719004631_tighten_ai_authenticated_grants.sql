-- Supabase projects can define broad default privileges for new public tables.
-- Reset the authenticated role explicitly, then grant only the assistant API's
-- intended Data API surface.
revoke all on table public.ai_conversations from authenticated;
revoke all on table public.ai_messages from authenticated;
revoke all on table public.ai_usage_events from authenticated;

grant select, insert, delete on table public.ai_conversations to authenticated;
grant update (title, updated_at, last_message_at)
  on table public.ai_conversations to authenticated;

grant select, insert on table public.ai_messages to authenticated;
grant update (status) on table public.ai_messages to authenticated;

grant select on table public.ai_usage_events to authenticated;
