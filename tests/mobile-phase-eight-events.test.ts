import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  list: vi.fn(),
  load: vi.fn(),
  register: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
  myEvents: vi.fn(),
  checkout: vi.fn(),
  ticket: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mobileApi/server")>("@/lib/mobileApi/server");
  return { ...actual, authenticateMobileRequest: mocks.authenticate };
});
vi.mock("@/lib/events/attendee", () => ({
  EventAttendeeError: class EventAttendeeError extends Error {
    constructor(message: string, readonly code: string, readonly status = 400) { super(message); }
  },
  listAttendeeEvents: mocks.list,
  loadAttendeeEvent: mocks.load,
  registerAttendeeForEvent: mocks.register,
  setEventSaved: mocks.save,
  cancelAttendeeRsvp: mocks.cancel,
  loadMyEvents: mocks.myEvents,
  loadCheckoutStatus: mocks.checkout,
  loadAttendeeTicket: mocks.ticket,
}));

import { GET as listEvents } from "@/app/api/mobile/v1/events/route";
import { DELETE as cancelRsvp, GET as getEvent, PATCH as saveEvent, POST as registerEvent } from "@/app/api/mobile/v1/events/[eventId]/route";
import { GET as getMyEvents } from "@/app/api/mobile/v1/my-events/route";
import { GET as getCheckout } from "@/app/api/mobile/v1/event-orders/[orderId]/route";
import { GET as getTicket } from "@/app/api/mobile/v1/event-tickets/[ticketId]/route";
import { EventAttendeeError } from "@/lib/events/attendee";

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://vaivia.app${path}`, {
    method,
    headers: { Origin: "capacitor://localhost", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const eventContext = { params: Promise.resolve({ eventId: "event-1" }) };

describe("Phase 8 attendee mobile boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ user: { id: "user-1", email: "person@example.com" }, supabase: { scoped: true }, accessToken: "not-returned" });
  });

  it("requires bearer authentication before browsing events", async () => {
    mocks.authenticate.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await listEvents(request("/api/mobile/v1/events"))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("passes filters and authenticated scope into event reads", async () => {
    mocks.list.mockResolvedValue({ events: [], count: 0, page: 2, pageSize: 12 });
    expect((await listEvents(request("/api/mobile/v1/events?q=night&page=2"))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ query: "night", page: 2 }));
    mocks.load.mockResolvedValue({ event: { id: "event-1" }, ticketTypes: [], saved: false });
    expect((await getEvent(request("/api/mobile/v1/events/event-1"), eventContext)).status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith({ scoped: true }, "user-1", "event-1");
  });

  it("uses the shared domain for save, RSVP, ticket registration and cancellation", async () => {
    mocks.save.mockResolvedValue({ eventId: "event-1", saved: true });
    expect((await saveEvent(request("/api/mobile/v1/events/event-1", "PATCH", { saved: true }), eventContext)).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith({ scoped: true }, "user-1", "event-1", true);
    mocks.register.mockResolvedValue({ mode: "rsvp", rsvp: { id: "rsvp-1" } });
    expect((await registerEvent(request("/api/mobile/v1/events/event-1", "POST", { mode: "rsvp" }), eventContext)).status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event-1", input: expect.objectContaining({ mobile: true }) }));
    mocks.cancel.mockResolvedValue({ eventId: "event-1", cancelled: true });
    expect((await cancelRsvp(request("/api/mobile/v1/events/event-1", "DELETE"), eventContext)).status).toBe(200);
  });

  it("returns capacity conflicts without weakening registration rules", async () => {
    mocks.register.mockRejectedValue(
      new EventAttendeeError(
        "This event is at capacity.",
        "capacity_or_conflict",
        409,
      ),
    );
    const response = await registerEvent(
      request("/api/mobile/v1/events/event-1", "POST", { mode: "rsvp" }),
      eventContext,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "capacity_or_conflict",
      message: "This event is at capacity.",
    });
  });

  it("keeps My Events and checkout verification user-scoped", async () => {
    mocks.myEvents.mockResolvedValue({ tickets: [], rsvps: [], saved: [] });
    expect((await getMyEvents(request("/api/mobile/v1/my-events"))).status).toBe(200);
    expect(mocks.myEvents).toHaveBeenCalledWith({ scoped: true }, "user-1");
    mocks.checkout.mockResolvedValue({ orderId: "order-1", status: "pending", ready: false, ticketIds: [] });
    const response = await getCheckout(request("/api/mobile/v1/event-orders/order-1"), { params: Promise.resolve({ orderId: "order-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith({ scoped: true }, "user-1", "order-1");
    expect(JSON.stringify(await response.json())).not.toContain("not-returned");
    mocks.ticket.mockResolvedValue({
      ticket: { id: "ticket-1", status: "active" },
      privateDetails: null,
      qrDataUrl: null,
      appleWalletAvailable: false,
    });
    const ticket = await getTicket(
      request("/api/mobile/v1/event-tickets/ticket-1"),
      { params: Promise.resolve({ ticketId: "ticket-1" }) },
    );
    expect(ticket.status).toBe(200);
    expect(mocks.ticket).toHaveBeenCalledWith("ticket-1", "user-1");
  });
});
