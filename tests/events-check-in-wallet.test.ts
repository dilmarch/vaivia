import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hashEventSecret } from "@/lib/events/tickets";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("event tickets, check-in, and wallet safety", () => {
  it("hashes strong redemption values before database validation", () => {
    expect(hashEventSecret("secret-a")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashEventSecret("secret-a")).toBe(hashEventSecret("secret-a"));
    expect(hashEventSecret("secret-a")).not.toBe(hashEventSecret("secret-b"));
  });

  it("returns explicit atomic check-in outcomes", () => {
    const migration = read(
      "supabase/migrations/20260720092831_create_events_marketplace.sql",
    );
    for (const result of [
      "invalid",
      "wrong_event",
      "already_used",
      "checked_in",
    ])
      expect(migration).toContain(`'${result}'`);
    expect(migration).toContain(
      "where redemption_hash = target_redemption_hash for update",
    );
    expect(migration).toContain("event_check_ins_active_ticket_idx");
  });

  it("rejects missing wallet configuration and inactive tickets", () => {
    const ticketPage = read("app/my-events/tickets/[ticketId]/page.tsx");
    const apple = read(
      "app/api/events/tickets/[ticketId]/apple-wallet/route.ts",
    );
    const google = read(
      "app/api/events/tickets/[ticketId]/google-wallet/route.ts",
    );
    expect(ticketPage).toContain("Apple Wallet isn’t configured yet");
    expect(ticketPage).toContain("Google Wallet isn’t configured yet");
    expect(apple).toContain('["active", "checked_in"]');
    expect(google).toContain('["active", "checked_in"]');
    expect(apple).toContain("application/vnd.apple.pkpass");
  });
});
