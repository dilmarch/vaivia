import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  updateNotification: vi.fn(),
  reviewNotification: vi.fn(),
  loadInbox: vi.fn(),
  loadImport: vi.fn(),
  retryImport: vi.fn(),
  ignoreImport: vi.fn(),
  addFlights: vi.fn(),
  loadSocial: vi.fn(),
  mutateFriend: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mobileApi/server")>("@/lib/mobileApi/server");
  return { ...actual, authenticateMobileRequest: mocks.authenticate };
});
vi.mock("@/lib/notifications/actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications/actions")>("@/lib/notifications/actions");
  return { ...actual, updateNotificationState: mocks.updateNotification, reviewNotification: mocks.reviewNotification };
});
vi.mock("@/lib/travel-imports/domain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/travel-imports/domain")>("@/lib/travel-imports/domain");
  return { ...actual, loadTravelImportInbox: mocks.loadInbox, loadTravelImportReview: mocks.loadImport, retryTravelImport: mocks.retryImport, ignoreTravelImport: mocks.ignoreImport, addImportedFlights: mocks.addFlights };
});
vi.mock("@/lib/social/profileDomain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/social/profileDomain")>("@/lib/social/profileDomain");
  return { ...actual, loadSocialProfile: mocks.loadSocial, mutateFriendship: mocks.mutateFriend };
});

import { PATCH as patchNotification, POST as reviewNotificationRoute } from "@/app/api/mobile/v1/notifications/[notificationId]/route";
import { GET as getImports } from "@/app/api/mobile/v1/travel-imports/route";
import { POST as mutateImport } from "@/app/api/mobile/v1/travel-imports/[importId]/route";
import { GET as getSocial } from "@/app/api/mobile/v1/me/social/route";
import { POST as mutateFriend } from "@/app/api/mobile/v1/friends/route";

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://vaivia.app${path}`, {
    method,
    headers: { Origin: "capacitor://localhost", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Phase 7 mobile route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ user: { id: "user-1" }, supabase: { scoped: true }, accessToken: "never-return" });
  });

  it("stops notification mutations before the domain when bearer auth fails", async () => {
    mocks.authenticate.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await patchNotification(request("/api/mobile/v1/notifications/n-1", "PATCH", { action: "read" }), { params: Promise.resolve({ notificationId: "n-1" }) });
    expect(response.status).toBe(401);
    expect(mocks.updateNotification).not.toHaveBeenCalled();
  });

  it("passes the authenticated user scope into notification reviews", async () => {
    mocks.reviewNotification.mockResolvedValue({ handled: true, destination: null });
    const response = await reviewNotificationRoute(request("/api/mobile/v1/notifications/n-1", "POST", { action: "accept" }), { params: Promise.resolve({ notificationId: "n-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.reviewNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", notificationId: "n-1", action: "accept", supabase: { scoped: true } }));
    expect(JSON.stringify(await response.json())).not.toContain("never-return");
  });

  it("loads only the authenticated user's Travel Import inbox", async () => {
    mocks.loadInbox.mockResolvedValue({ imports: [] });
    expect((await getImports(request("/api/mobile/v1/travel-imports"))).status).toBe(200);
    expect(mocks.loadInbox).toHaveBeenCalledWith({ scoped: true }, "user-1");
  });

  it("routes retry and add-flight actions through the owned import domain", async () => {
    mocks.retryImport.mockResolvedValue({ retried: true });
    const retry = await mutateImport(request("/api/mobile/v1/travel-imports/i-1", "POST", { action: "retry" }), { params: Promise.resolve({ importId: "i-1" }) });
    expect(retry.status).toBe(200);
    expect(mocks.retryImport).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", importId: "i-1" }));
    mocks.addFlights.mockResolvedValue({ status: "imported", tripId: "t-1" });
    const add = await mutateImport(request("/api/mobile/v1/travel-imports/i-1", "POST", { action: "add-flights", tripId: "t-1", items: [{ item_id: "f-1" }], travelers: { userIds: ["user-1"] } }), { params: Promise.resolve({ importId: "i-1" }) });
    expect(add.status).toBe(200);
    expect(mocks.addFlights).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", importId: "i-1", tripId: "t-1" }));
  });

  it("keeps social profile and friend mutations user-scoped", async () => {
    mocks.loadSocial.mockResolvedValue({ stats: {}, friends: [] });
    expect((await getSocial(request("/api/mobile/v1/me/social"))).status).toBe(200);
    expect(mocks.loadSocial).toHaveBeenCalledWith({ scoped: true }, "user-1");
    mocks.mutateFriend.mockResolvedValue({ friendshipId: "friendship-1" });
    expect((await mutateFriend(request("/api/mobile/v1/friends", "POST", { operation: "invite", identifier: "friend@example.com" }))).status).toBe(200);
    expect(mocks.mutateFriend).toHaveBeenCalledWith({ scoped: true }, "user-1", expect.objectContaining({ operation: "invite" }));
  });
});
