import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createTransport: vi.fn(),
  createStay: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mobileApi/server")>("@/lib/mobileApi/server");
  return { ...actual, authenticateMobileRequest: mocks.authenticate };
});
vi.mock("@/lib/transport/mutations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/transport/mutations")>("@/lib/transport/mutations");
  return { ...actual, createTransportationForUser: mocks.createTransport };
});
vi.mock("@/lib/accommodations/mutations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accommodations/mutations")>("@/lib/accommodations/mutations");
  return { ...actual, createStayForUser: mocks.createStay };
});

import { POST as createTransport } from "@/app/api/mobile/v1/trips/[tripId]/transport/route";
import { POST as createStay } from "@/app/api/mobile/v1/trips/[tripId]/stays/route";

function request(path: string, body: unknown) {
  return new Request(`https://vaivia.app${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
    body: JSON.stringify(body),
  });
}

describe("mobile travel mutation routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not call the transport domain when bearer authentication fails", async () => {
    mocks.authenticate.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    const response = await createTransport(
      request("/api/mobile/v1/trips/trip-1/transport", {}),
      { params: Promise.resolve({ tripId: "trip-1" }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("passes the authenticated user client and trip scope to transport creation", async () => {
    const supabase = { scoped: true };
    mocks.authenticate.mockResolvedValue({ user: { id: "user-1" }, supabase, accessToken: "not-forwarded" });
    mocks.createTransport.mockResolvedValue({ id: "transport-1" });
    const response = await createTransport(
      request("/api/mobile/v1/trips/trip-1/transport", { transportType: "train", departureDate: "2026-09-01", departureLocation: "A", arrivalLocation: "B" }),
      { params: Promise.resolve({ tripId: "trip-1" }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", tripId: "trip-1", supabase }));
    expect(JSON.stringify(await response.json())).not.toContain("not-forwarded");
  });

  it("passes stay creation through the same authenticated domain boundary", async () => {
    const supabase = { scoped: true };
    mocks.authenticate.mockResolvedValue({ user: { id: "user-2" }, supabase, accessToken: "secret-token" });
    mocks.createStay.mockResolvedValue({ id: "stay-1" });
    const response = await createStay(
      request("/api/mobile/v1/trips/trip-2/stays", { hotelName: "Hotel", checkInDate: "2026-09-01", checkOutDate: "2026-09-02" }),
      { params: Promise.resolve({ tripId: "trip-2" }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.createStay).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-2", tripId: "trip-2", supabase }));
    expect(JSON.stringify(await response.json())).not.toContain("secret-token");
  });
});
