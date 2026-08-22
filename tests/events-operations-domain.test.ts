import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: vi.fn(),
}));

import {
  EventOperationsError,
  requireEventOperationsAccess,
} from "@/lib/events/operations";

function authorizedClient(role: string | null, canManage: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: role ? { role } : null,
    error: null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const rpc = vi.fn().mockResolvedValue({ data: canManage, error: null });
  return {
    client: { from: vi.fn(() => ({ select })), rpc },
    rpc,
  };
}

describe("event operations domain authorization", () => {
  it("rejects a normal user without consulting an event identifier", async () => {
    const { client, rpc } = authorizedClient("basic_user", false);
    await expect(
      requireEventOperationsAccess(
        client as never,
        "normal-user",
        "event-1",
      ),
    ).rejects.toMatchObject<EventOperationsError>({
      code: "forbidden",
      status: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an organizer who is not the owner or assigned team member", async () => {
    const { client, rpc } = authorizedClient("event_organizer", false);
    await expect(
      requireEventOperationsAccess(
        client as never,
        "wrong-organizer",
        "event-1",
      ),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(rpc).toHaveBeenCalledWith("event_user_can_manage", {
      target_event_id: "event-1",
    });
  });

  it.each(["event_organizer", "super_admin"])(
    "accepts database-authorized %s access",
    async (role) => {
      const { client, rpc } = authorizedClient(role, true);
      await expect(
        requireEventOperationsAccess(client as never, "operator", "event-1"),
      ).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledWith("event_user_can_manage", {
        target_event_id: "event-1",
      });
    },
  );
});
