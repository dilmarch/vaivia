-- Persist only VAIVIA-owned recommendation references. Google Places content is
-- refreshed for display and is not cached in assistant message metadata.
alter table public.ai_messages
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint ai_messages_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  add constraint ai_messages_metadata_size_check
    check (octet_length(metadata::text) <= 16384);

-- Metadata-only tool diagnostics: no search text, coordinates, place names or
-- provider payloads are recorded here.
alter table public.ai_usage_events
  add column external_tool_calls smallint not null default 0,
  add column external_place_results smallint not null default 0,
  add constraint ai_usage_events_external_tool_calls_check
    check (external_tool_calls between 0 and 4),
  add constraint ai_usage_events_external_place_results_check
    check (external_place_results between 0 and 20);

comment on column public.ai_messages.metadata is
  'Typed assistant display metadata. Phase 2A stores Google place IDs and VAIVIA-authored annotations only; provider content is refreshed before display.';

comment on column public.ai_usage_events.external_tool_calls is
  'Number of bounded server-side external assistant tool calls attempted for the request.';

comment on column public.ai_usage_events.external_place_results is
  'Number of sanitized unique place candidates returned to the assistant, capped at twenty.';

-- Existing row-level policies remain authoritative: messages are still scoped
-- to the authenticated user, selected trip and owned conversation. Keep the
-- narrow authenticated grants explicit after adding the metadata column.
revoke all on table public.ai_messages from authenticated;
grant select, insert on table public.ai_messages to authenticated;
grant update (status) on table public.ai_messages to authenticated;
