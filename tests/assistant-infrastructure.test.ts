import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGeminiAssistantModel } from "@/lib/ai/gemini-assistant";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("assistant credential and dependency isolation", () => {
    it("uses only the dedicated assistant credential with no email-import fallback", () => {
        const assistant = read("lib/ai/gemini-assistant.ts");
        const emailImport = read("lib/travelEmailImportProcessor.ts");

        expect(assistant).toContain("process.env.GEMINI_ASSISTANT_API_KEY");
        expect(assistant).toContain("process.env.GEMINI_ASSISTANT_MODEL");
        expect(assistant).not.toMatch(/process\.env\.GEMINI_API_KEY\b/);
        expect(emailImport).toContain("process.env.GEMINI_API_KEY");
        expect(emailImport).not.toContain("GEMINI_ASSISTANT_API_KEY");
    });

    it("defaults to Gemini 3.5 Flash while preserving the model override", () => {
        vi.stubEnv("GEMINI_ASSISTANT_MODEL", "");
        expect(getGeminiAssistantModel()).toBe("gemini-3.5-flash");

        vi.stubEnv("GEMINI_ASSISTANT_MODEL", "gemini-custom-model");
        expect(getGeminiAssistantModel()).toBe("gemini-custom-model");
    });

    it("uses the current SDK and documents empty server-only placeholders", () => {
        const packageJson = JSON.parse(read("package.json")) as {
            dependencies: Record<string, string>;
        };
        const example = read(".env.example");

        expect(packageJson.dependencies["@google/genai"]).toBeTruthy();
        expect(packageJson.dependencies["@google/generative-ai"]).toBeUndefined();
        expect(example).toContain("GEMINI_ASSISTANT_API_KEY=\n");
        expect(example).toContain(
            "# Optional; defaults to gemini-3.5-flash when empty"
        );
        expect(example).toContain("GEMINI_ASSISTANT_MODEL=\n");
        expect(example).toContain("AI_DAILY_MESSAGE_LIMIT=\n");
        expect(example).toContain("GOOGLE_PLACES_API_KEY=\n");
        expect(example).not.toContain("NEXT_PUBLIC_GEMINI");
        expect(example).not.toContain("NEXT_PUBLIC_GOOGLE_PLACES");
    });

    it("isolates live discovery to its dedicated server-only Places credential", () => {
        const places = read("lib/ai/google-places.ts");
        const clientFiles = [
            read("components/assistant/TripAssistant.tsx"),
            read("components/assistant/PlaceRecommendationCards.tsx"),
        ].join("\n");

        expect(places).toContain("process.env.GOOGLE_PLACES_API_KEY");
        expect(places).not.toContain("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
        expect(places).not.toContain("GOOGLE_MAPS_SERVER_API_KEY");
        expect(clientFiles).not.toMatch(/GOOGLE_PLACES_API_KEY|google_place_id/i);
    });
});

describe("assistant database and read-only safeguards", () => {
    it("uses a service-only security-invoker quota function with an advisory lock", () => {
        const migration = read(
            "supabase/migrations/20260719204124_fix_ai_assistant_generation_and_quota.sql"
        );

        expect(migration).toContain("security invoker");
        expect(migration).toContain("set search_path = ''");
        expect(migration).toContain("pg_advisory_xact_lock");
        expect(migration).toContain("'rate_limited'");
        expect(migration).toContain("usage_event.outcome = 'succeeded'");
        expect(migration).toContain("usage_event.outcome = 'in_progress'");
        expect(migration).toContain("interval '5 minutes'");
        expect(migration).toContain("thoughts_token_count");
        expect(migration).not.toMatch(
            /usage_event\.outcome\s+in\s*\([^)]*'failed'/
        );
        expect(migration).not.toMatch(/delete\s+from\s+public\.ai_usage_events/i);
        expect(migration).toMatch(
            /revoke all on function public\.consume_ai_daily_usage[\s\S]*from public, anon, authenticated/
        );
        expect(migration).toMatch(
            /grant execute on function public\.consume_ai_daily_usage[\s\S]*to service_role/
        );

        const lockPosition = migration.indexOf("pg_advisory_xact_lock");
        const countPosition = migration.indexOf("select count(*)::integer");
        const insertPosition = migration.lastIndexOf(
            "insert into public.ai_usage_events"
        );
        expect(lockPosition).toBeGreaterThan(-1);
        expect(lockPosition).toBeLessThan(countPosition);
        expect(countPosition).toBeLessThan(insertPosition);
    });

    it("uses only successful and active reservations in user-visible usage", () => {
        const route = read("app/api/trips/[tripId]/assistant/route.ts");

        expect(route).toContain('.eq("outcome", "succeeded")');
        expect(route).toContain('.eq("outcome", "in_progress")');
        expect(route).toContain('.gte("occurred_at", activeReservationCutoff)');
        expect(route).not.toContain(
            '.in("outcome", ["in_progress", "succeeded", "failed"])'
        );
    });

    it("keeps server diagnostics development-only and metadata-only", () => {
        const diagnostics = read("lib/ai/assistant-diagnostics.ts");

        expect(diagnostics).toContain('process.env.NODE_ENV !== "development"');
        expect(diagnostics).not.toMatch(
            /\b(?:rawPrompt|rawMessage|tripContext|cookie|authorizationHeader|userId|tripId)\b/
        );
    });

    it("prevents ownership reassignment and requires the owning conversation for message reads", () => {
        const migration = read(
            "supabase/migrations/20260719000122_complete_ai_assistant_phase_one_audit.sql"
        );
        expect(migration).toContain(
            "grant update (title, updated_at, last_message_at)"
        );
        expect(migration).toContain(
            "conversation.id = ai_messages.conversation_id"
        );
        expect(migration).toContain(
            "conversation.user_id = (select auth.uid())"
        );

        const statusMigration = read(
            "supabase/migrations/20260719000716_add_ai_message_delivery_status.sql"
        );
        expect(statusMigration).toContain(
            "check (status in ('pending', 'complete', 'failed'))"
        );
        expect(statusMigration).toContain("grant update (status)");

        const grantMigration = read(
            "supabase/migrations/20260719004631_tighten_ai_authenticated_grants.sql"
        );
        expect(grantMigration).toContain(
            "revoke all on table public.ai_messages from authenticated"
        );
        expect(grantMigration).toContain("grant update (status)");
    });

    it("keeps the API route read-only for all existing trip-domain tables", () => {
        const route = read("app/api/trips/[tripId]/assistant/route.ts");
        const writeTargets = Array.from(
            route.matchAll(/\.from\("([^"]+)"\)\s*\n\s*\.(?:insert|update|delete)/g),
            (match) => match[1]
        );
        expect(writeTargets.length).toBeGreaterThan(0);
        expect(
            writeTargets.every((table) =>
                ["ai_conversations", "ai_messages", "ai_usage_events"].includes(table)
            )
        ).toBe(true);
        expect(route).not.toMatch(/console\.(?:log|info|warn|error)/);
    });

    it("adds bounded JSONB metadata and metadata-only external usage counters without weakening RLS", () => {
        const migration = read(
            "supabase/migrations/20260719220015_add_assistant_places_phase_two_a.sql"
        );
        expect(migration).toContain("metadata jsonb not null default '{}'::jsonb");
        expect(migration).toContain("jsonb_typeof(metadata) = 'object'");
        expect(migration).toContain("octet_length(metadata::text) <= 16384");
        expect(migration).toContain("external_tool_calls between 0 and 4");
        expect(migration).toContain("external_place_results between 0 and 20");
        expect(migration).toContain(
            "revoke all on table public.ai_messages from authenticated"
        );
        expect(migration).toContain("grant update (status)");
        expect(migration).not.toMatch(/rating|opening_hours|formatted_address/i);

        const scopeIndexMigration = read(
            "supabase/migrations/20260719220719_replace_assistant_message_scope_index.sql"
        );
        expect(scopeIndexMigration).toContain(
            "(conversation_id, trip_id, user_id)"
        );

        const metadataGrantMigration = read(
            "supabase/migrations/20260719221123_restrict_assistant_message_metadata_writes.sql"
        );
        expect(metadataGrantMigration).toContain(
            "revoke insert on table public.ai_messages from authenticated"
        );
        expect(metadataGrantMigration).not.toMatch(/grant insert \([^)]*metadata/i);
    });
});
