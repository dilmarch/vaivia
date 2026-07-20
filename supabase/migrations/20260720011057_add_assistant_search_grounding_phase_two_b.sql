-- Phase 2B persists only numeric usage telemetry. Grounded answer text,
-- provider queries, citations, source titles/URLs, supports, chunks, Search
-- Suggestions and provider payloads remain ephemeral application responses.
alter table public.ai_usage_events
  add column google_search_operations smallint not null default 0,
  add column google_search_queries smallint not null default 0,
  add constraint ai_usage_events_google_search_operations_check
    check (google_search_operations between 0 and 1),
  add constraint ai_usage_events_google_search_queries_check
    check (google_search_queries between 0 and 20),
  add constraint ai_usage_events_google_search_query_relationship_check
    check (
      (google_search_operations = 0 and google_search_queries = 0)
      or
      (google_search_operations = 1 and google_search_queries between 1 and 20)
    );

comment on column public.ai_usage_events.google_search_operations is
  'Number of Gemini Google Search-grounded generation operations for the request, capped at one; no query contents are stored.';

comment on column public.ai_usage_events.google_search_queries is
  'Numeric count of Google web-search queries reported by grounding metadata; query contents are never stored.';

-- Preserve the existing RLS model and make protected telemetry service-only.
-- Authenticated users retain read access to their own rows through RLS but
-- cannot manufacture or modify any usage metadata.
revoke all on table public.ai_usage_events from authenticated;
grant select on table public.ai_usage_events to authenticated;
grant all on table public.ai_usage_events to service_role;
