import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    formatEmailImportAddress,
    generateEmailImportLocalPart,
    generateUniqueEmailImportLocalPart,
    serializeEmailImportAddress,
} from "@/lib/emailImportAddresses";
import {
    getUsernameValidationError,
    normalizeUsername,
} from "@/lib/usernames";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migrationPath =
    "supabase/migrations/20260720061944_add_recognizable_email_import_aliases.sql";
const backfillMigrationPath =
    "supabase/migrations/20260720142501_backfill_recognizable_email_import_aliases.sql";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("recognizable email-import aliases", () => {
    it("normalizes and validates globally safe usernames", () => {
        expect(normalizeUsername("  @Dill-Travels_2 ")).toBe("dill-travels_2");
        expect(getUsernameValidationError("dill-travels_2")).toBeNull();
        expect(getUsernameValidationError("Dill")).toBeNull();
        expect(getUsernameValidationError("admin")).toMatch(/reserved/i);
        expect(getUsernameValidationError("support")).toMatch(/reserved/i);
        expect(getUsernameValidationError("-dill")).toMatch(/single underscores/i);
        expect(getUsernameValidationError("dill__travels")).toMatch(
            /single underscores/i
        );
        expect(getUsernameValidationError("dill.travel")).toMatch(
            /single underscores/i
        );
    });

    it("creates a normalized alias with a 48-bit lowercase suffix", () => {
        const alias = generateEmailImportLocalPart("Dill-Travels");
        expect(alias).toMatch(/^dill-travels\.[a-f0-9]{12}$/);
        expect(alias).not.toContain("@");
    });

    it("retries the preflight check after an alias collision", async () => {
        const maybeSingle = vi
            .fn()
            .mockResolvedValueOnce({ data: { id: "collision" }, error: null })
            .mockResolvedValueOnce({ data: null, error: null });
        const builder = {
            eq: vi.fn(() => builder),
            maybeSingle,
        };
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => builder),
            })),
        };

        const alias = await generateUniqueEmailImportLocalPart(
            supabase,
            "dill-travels"
        );

        expect(alias).toMatch(/^dill-travels\.[a-f0-9]{12}$/);
        expect(maybeSingle).toHaveBeenCalledTimes(2);
    });

    it("formats both legacy and username aliases on the existing domain", () => {
        vi.stubEnv("EMAIL_IMPORT_DOMAIN", "inbound.example.com");
        expect(formatEmailImportAddress("a".repeat(48))).toBe(
            `trips+${"a".repeat(48)}@inbound.example.com`
        );
        expect(formatEmailImportAddress("dill.abc123def456")).toBe(
            "dill.abc123def456@inbound.example.com"
        );
    });

    it("serializes lifecycle state without exposing UUID ownership", () => {
        vi.stubEnv("EMAIL_IMPORT_DOMAIN", "inbound.example.com");
        const serialized = serializeEmailImportAddress({
            id: "alias-id",
            user_id: "private-user-id",
            inbound_token: "dill.abc123def456",
            is_active: true,
            is_primary: true,
            address_format: "username",
            request_key: null,
            created_at: "2026-07-20T00:00:00.000Z",
            rotated_at: null,
            retired_at: null,
        });

        expect(serialized).toMatchObject({
            address: "dill.abc123def456@inbound.example.com",
            isActive: true,
            isPrimary: true,
        });
        expect(serialized).not.toHaveProperty("user_id");
        expect(serialized).not.toHaveProperty("inbound_token");
        expect(serialized).not.toHaveProperty("request_key");
    });
});

describe("email-import database and route safeguards", () => {
    it("enforces normalized case-insensitive unique and reserved usernames", () => {
        const migration = read(migrationPath);
        expect(migration).toContain("user_profiles_username_unique_ci_idx");
        expect(migration).toContain("lower(btrim(username))");
        expect(migration).toContain("normalize_user_profile_username");
        expect(migration).toContain("user_profiles_username_valid");
        expect(migration).toContain("'admin', 'administrator', 'support'");
        expect(migration).toContain("validate constraint user_profiles_username_valid");
        expect(migration).not.toMatch(/update public\.user_profiles\s+set username/i);
    });

    it("preserves aliases, UUID routing, and one primary while allowing history", () => {
        const migration = read(migrationPath);
        expect(migration).toContain("drop index if exists public.user_email_import_addresses_one_active_per_user");
        expect(migration).toContain("user_email_import_addresses_one_primary_per_user");
        expect(migration).toContain("where is_primary");
        expect(migration).toContain("target_user_id");
        expect(migration).toContain("is_active = case when deactivate_previous");
        expect(migration).toContain("address_format = 'username'");
        expect(migration).not.toMatch(/delete from public\.user_email_import_addresses/i);
        expect(migration).not.toMatch(/set\s+inbound_token\s*=/i);
    });

    it("creates a new alias once per username change and keeps the old alias active", () => {
        const migration = read(migrationPath);
        expect(migration).toContain("issue_email_import_alias_for_username_change");
        expect(migration).toContain("new.username is not distinct from old.username");
        expect(migration).toContain("private.set_primary_email_import_alias(new.id");
        expect(migration).toContain("false, null");
        expect(migration).toContain("request_key");
    });

    it("backfills recognizable primary aliases for existing usernames", () => {
        const migration = read(backfillMigrationPath);

        expect(migration).toContain("from public.user_profiles profile");
        expect(migration).toContain("address.address_format = 'username'");
        expect(migration).toContain("private.set_primary_email_import_alias(");
        expect(migration).toContain("false,");
        expect(migration).toContain("for attempt in 1..8 loop");
        expect(migration).not.toMatch(/delete from public\.user_email_import_addresses/i);
        expect(migration).not.toMatch(/deactivate_previous\s*=>\s*true/i);
    });

    it("lazily upgrades a legacy-only primary when settings loads", () => {
        const route = read("app/api/settings/email-import-address/route.ts");

        expect(route).toContain("hasCurrentRecognizablePrimary");
        expect(route).toContain('address.address_format === "username"');
        expect(route).toContain('address.inbound_token.startsWith(`${username}.`)');
        expect(route).toContain("if (!hasCurrentRecognizablePrimary && username)");
    });

    it("keeps alias mutations service-only and owner reads behind RLS", () => {
        const migration = read(migrationPath);
        expect(migration).toContain('drop policy if exists "Users can create their own email import addresses"');
        expect(migration).toContain('drop policy if exists "Users can update their own email import addresses"');
        expect(migration).toContain("grant select on table public.user_email_import_addresses to authenticated");
        expect(migration).toContain("grant all on table public.user_email_import_addresses to service_role");
        expect(migration).toContain("revoke all on function public.rotate_user_email_import_address");
        expect(migration).toContain("grant execute on function public.rotate_user_email_import_address");

        const route = read("app/api/settings/email-import-address/route.ts");
        expect(route).toContain("supabase.auth.getUser()");
        expect(route).toContain('{ error: "Unauthorized" }, { status: 401 }');
        expect(route).toContain("target_user_id: userId");
        expect(route).toContain("requestKey");
        expect(route).not.toMatch(/userId:\s*body/i);
    });

    it("uses exact active-alias lookup, idempotency, safe errors, and bounded inbound processing", () => {
        const route = read("app/api/email-import/resend/route.ts");
        expect(route).toContain('.eq("inbound_token", match.token)');
        expect(route).toContain('.eq("is_active", true)');
        expect(route).toContain('.eq("provider_email_id", providerEmailId)');
        expect(route).toContain("MAX_INBOUND_WEBHOOK_BYTES");
        expect(route).toContain("MAX_INBOUND_EMAIL_BODY_BYTES");
        expect(route).toContain("MAX_INBOUND_ATTACHMENTS");
        expect(route).toContain("MAX_IMPORTS_PER_ALIAS_PER_HOUR");
        expect(route).toContain("webhooks.verify");
        expect(route).not.toContain('reason: "no_active_recipient"');
        expect(route).not.toContain("providerEmailId: event.data.email_id");
        expect(route).not.toMatch(
            /jsonResponse\(\{[\s\S]{0,200}error:\s*sanitizeServerError\(error\)/
        );
    });
});
