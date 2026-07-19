alter table public.ai_messages
  add column status text not null default 'complete',
  add constraint ai_messages_status_check
    check (status in ('pending', 'complete', 'failed'));

grant update (status) on table public.ai_messages to authenticated;

create policy "Users can update own assistant message status"
on public.ai_messages
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.trip_id = ai_messages.trip_id
      and conversation.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and public.is_trip_active_member(trip_id)
  and exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.trip_id = ai_messages.trip_id
      and conversation.user_id = (select auth.uid())
  )
);

comment on column public.ai_messages.status is
  'Request delivery state. Failed user messages remain visible and retryable without entering Gemini history.';
