import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  list: vi.fn(),
  load: vi.fn(),
  checkIn: vi.fn(),
  undo: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/mobileApi/server")
  >("@/lib/mobileApi/server");
  return { ...actual, authenticateMobileRequest: mocks.authenticate };
});

vi.mock("@/lib/events/operations", () => ({
  EventOperationsError: class EventOperationsError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 400,
    ) {
      super(message);
    }
  },
  listManagedEvents: mocks.list,
  loadManagedEvent: mocks.load,
  checkInEventTicket: mocks.checkIn,
  undoEventTicketCheckIn: mocks.undo,
}));

import { GET as listEvents } from "@/app/api/mobile/v1/organizer/events/route";
import { GET as getEvent } from "@/app/api/mobile/v1/organizer/events/[eventId]/route";
import {
  DELETE as undoCheckIn,
  POST as checkIn,
} from "@/app/api/mobile/v1/organizer/events/[eventId]/check-in/route";
import { EventOperationsError } from "@/lib/events/operations";

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://vaivia.app${path}`, {
    method,
    headers: {
      Origin: "capacitor://localhost",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const context = { params: Promise.resolve({ eventId: "event-1" }) };

describe("Phase 9 mobile event operations boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({
      user: { id: "operator-1" },
      supabase: { scoped: true },
      accessToken: "must-not-be-returned",
    });
  });

  it("rejects unauthenticated operations before loading private data", async () => {
    mocks.authenticate.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await listEvents(
      request("/api/mobile/v1/organizer/events"),
    );
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([
    ["normal user", "Event operations are unavailable for this account."],
    ["wrong organizer", "The event was not found or you cannot manage it."],
  ])("returns forbidden for a %s", async (_role, message) => {
    mocks.load.mockRejectedValueOnce(
      new EventOperationsError(message, "forbidden", 403),
    );
    const response = await getEvent(
      request("/api/mobile/v1/organizer/events/event-1"),
      context,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden", message });
  });

  it.each(["correct organizer", "super-admin"])(
    "allows a %s through the same authorized domain boundary",
    async () => {
      mocks.list.mockResolvedValueOnce({
        role: "event_organizer",
        events: [{ id: "event-1", title: "Night Market" }],
      });
      const response = await listEvents(
        request("/api/mobile/v1/organizer/events"),
      );
      expect(response.status).toBe(200);
      expect(mocks.list).toHaveBeenCalledWith({ scoped: true }, "operator-1");
      expect(JSON.stringify(await response.json())).not.toContain(
        "must-not-be-returned",
      );
    },
  );

  it("uses the shared atomic check-in and undo operations", async () => {
    mocks.checkIn.mockResolvedValue({
      result: "checked_in",
      ticket_id: "ticket-1",
    });
    const checkedIn = await checkIn(
      request("/api/mobile/v1/organizer/events/event-1/check-in", "POST", {
        value: "VAE-123",
      }),
      context,
    );
    expect(checkedIn.status).toBe(200);
    expect(mocks.checkIn).toHaveBeenCalledWith(
      { scoped: true },
      "operator-1",
      "event-1",
      "VAE-123",
    );

    mocks.undo.mockResolvedValue({ ticketId: "ticket-1", status: "active" });
    const undone = await undoCheckIn(
      request("/api/mobile/v1/organizer/events/event-1/check-in", "DELETE", {
        ticketId: "ticket-1",
      }),
      context,
    );
    expect(undone.status).toBe(200);
    expect(mocks.undo).toHaveBeenCalledWith(
      { scoped: true },
      "operator-1",
      "event-1",
      "ticket-1",
    );
  });

  it("rejects malformed check-in input before invoking the domain", async () => {
    const response = await checkIn(
      request("/api/mobile/v1/organizer/events/event-1/check-in", "POST", {}),
      context,
    );
    expect(response.status).toBe(422);
    expect(mocks.checkIn).not.toHaveBeenCalled();
  });
});
