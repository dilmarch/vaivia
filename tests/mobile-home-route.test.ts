import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  loadHomeDashboard: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticate,
  mobileSuccess: (_request: Request, data: unknown) => Response.json({ data }),
  mobileError: (_request: Request, options: { status: number; code: string; message: string; retryable?: boolean }) => Response.json({ error: options.message, code: options.code, retryable: options.retryable }, { status: options.status }),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/dashboard/loadHomeDashboard", () => ({
  loadHomeDashboard: mocks.loadHomeDashboard,
}));

import { GET } from "@/app/api/mobile/v1/home/route";

const request = new Request("https://vaivia.app/api/mobile/v1/home", {
  headers: { Origin: "capacitor://localhost", Authorization: "Bearer safe-test-token" },
});
const context = { user: { id: "user-1" }, supabase: { marker: "bearer-scoped-client" } };

describe("mobile home route", () => {
  beforeEach(() => {
    mocks.authenticate.mockReset().mockResolvedValue(context);
    mocks.loadHomeDashboard.mockReset().mockResolvedValue({
      data: { name: "Alex", trips: [], events: [] },
      tripLoadError: null,
    });
  });

  it("loads the dashboard with the authenticated bearer-scoped client", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mocks.loadHomeDashboard).toHaveBeenCalledWith(context.supabase, context.user);
    await expect(response.json()).resolves.toEqual({
      data: { name: "Alex", trips: [], events: [] },
    });
  });

  it("stops before loading data when bearer authentication fails", async () => {
    mocks.authenticate.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mocks.loadHomeDashboard).not.toHaveBeenCalled();
  });

  it("returns a safe retryable error when the trip visibility query fails", async () => {
    mocks.loadHomeDashboard.mockResolvedValueOnce({
      data: { name: "Alex", trips: [], events: [] },
      tripLoadError: { code: "PGRST000", message: "database detail" },
    });
    const response = await GET(request);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "home_unavailable",
      error: "Could not load your dashboard.",
      retryable: true,
    });
  });
});
