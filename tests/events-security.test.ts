import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("events authorization and privacy boundaries", () => {
  it("requires organizer authorization at every organizer route family", () => {
    const auth = read("lib/events/auth.ts");
    expect(auth).toContain("event_organizer");
    expect(auth).toContain('rpc("event_user_can_manage"');
    for (const path of [
      "app/organizer/events/page.tsx",
      "app/organizer/events/new/page.tsx",
      "app/organizer/events/[eventId]/edit/page.tsx",
      "app/organizer/events/[eventId]/tickets/page.tsx",
      "app/organizer/events/[eventId]/attendees/page.tsx",
      "app/organizer/events/[eventId]/check-in/page.tsx",
      "app/organizer/events/[eventId]/invitations/page.tsx",
    ])
      expect(read(path)).toMatch(/requireEvent(Organizer|Manager)/);
  });

  it("does not reveal private event details before email-matched invitation validation", () => {
    const invite = read("app/events/invite/[token]/page.tsx");
    expect(invite).toContain('createHash("sha256")');
    expect(invite).toContain("invitation.email_normalized");
    expect(invite).toContain('"claim_event_invitation"');
    expect(invite.indexOf('select("*")')).toBeGreaterThan(
      invite.indexOf('"claim_event_invitation"'),
    );
  });

  it("keeps attendee CSV and cover objects private", () => {
    const csv = read("app/api/events/[eventId]/attendees.csv/route.ts");
    const migration = read(
      "supabase/migrations/20260720092831_create_events_marketplace.sql",
    );
    expect(csv).toContain("requireEventManager");
    expect(csv).toContain('"Cache-Control": "private, no-store"');
    expect(migration).toContain("'event-covers', 'event-covers', false");
  });

  it("preserves the full same-origin return destination through authentication", () => {
    expect(read("components/login-form.tsx")).toContain(
      "window.location.assign(safeNext)",
    );
    expect(read("components/social-login-button.tsx")).toContain(
      "auth/callback?next=",
    );
    expect(read("app/auth/callback/route.ts")).toContain(
      "normalizeAuthConfirmNext",
    );
  });

  it("keeps the marketplace and private invite entry point public at the session proxy", () => {
    const proxy = read("lib/supabase/proxy.ts");
    expect(proxy).toContain('pathname === "/events"');
    expect(proxy).toContain('pathname.startsWith("/events/")');
    expect(proxy).toContain("!isPublicEventPath");
  });
});
