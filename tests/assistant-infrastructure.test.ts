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
        expect(example).not.toContain("NEXT_PUBLIC_GEMINI");
    });
});

describe("assistant database and read-only safeguards", () => {
    it("uses a service-only security-invoker quota function with an advisory lock", () => {
        const migration = read(
            "supabase/migrations/20260719000122_complete_ai_assistant_phase_one_audit.sql"
        );

        expect(migration).toContain("security invoker");
        expect(migration).toContain("set search_path = ''");
        expect(migration).toContain("pg_advisory_xact_lock");
        expect(migration).toContain("'rate_limited'");
        expect(migration).toMatch(
            /revoke all on function public\.consume_ai_daily_usage[\s\S]*from public, anon, authenticated/
        );
        expect(migration).toMatch(
            /grant execute on function public\.consume_ai_daily_usage[\s\S]*to service_role/
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
});
