import { describe, expect, it, vi } from "vitest";
import { NotificationActionError, updateNotificationState } from "@/lib/notifications/actions";
import { TravelImportError, retryTravelImport } from "@/lib/travel-imports/domain";
import { loadFriendProfile, SocialProfileError } from "@/lib/social/profileDomain";

vi.mock("@/lib/travelEmailImportProcessor", () => ({ processTravelEmailImport: vi.fn() }));

function maybeSingleQuery(data: unknown, error: unknown = null) {
  // Recursive query-builder mock used only to prove ownership guards.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return query;
}

describe("Phase 7 mutation ownership", () => {
  it("does not update a notification that is not owned by the authenticated user", async () => {
    const query = maybeSingleQuery(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: vi.fn(() => query) } as any;
    await expect(updateNotificationState({ supabase, userId: "user-1", notificationId: "other-notice", action: "archive" })).rejects.toEqual(expect.objectContaining<Partial<NotificationActionError>>({ code: "not_found", status: 404 }));
    expect(query.update).toBeUndefined();
  });

  it("does not retry a Travel Import without an owned import row", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: vi.fn(() => maybeSingleQuery(null)) } as any;
    await expect(retryTravelImport({ supabase, userId: "user-1", importId: "other-import" })).rejects.toEqual(expect.objectContaining<Partial<TravelImportError>>({ code: "not_found", status: 404 }));
  });

  it("does not expose a shared profile without an accepted friendship", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: vi.fn(() => maybeSingleQuery(null)), rpc } as any;
    await expect(loadFriendProfile(supabase, "user-1", "user-2")).rejects.toEqual(expect.objectContaining<Partial<SocialProfileError>>({ code: "not_found", status: 404 }));
    expect(rpc).not.toHaveBeenCalled();
  });
});
