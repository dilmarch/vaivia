-- Browser clients may persist ordinary message fields but cannot manufacture
-- recommendation metadata that would trigger server-side Places refresh calls.
revoke insert on table public.ai_messages from authenticated;

grant insert (
  conversation_id,
  trip_id,
  user_id,
  role,
  status,
  content,
  model
) on table public.ai_messages to authenticated;

comment on column public.ai_messages.metadata is
  'Server-written typed assistant display metadata. Authenticated browser clients cannot set this column.';
