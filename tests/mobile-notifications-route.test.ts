import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateMobileRequest: vi.fn(),
  loadActiveDropdownNotifications: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticateMobileRequest,
  mobileJson: (_request: Request, body: unknown, init?: ResponseInit) =>
    Response.json(body, init),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/notifications/dropdown", () => ({
  loadActiveDropdownNotifications: mocks.loadActiveDropdownNotifications,
}));

import { GET, OPTIONS } from "@/app/api/mobile/v1/notifications/route";

describe("mobile notifications route", () => {
  beforeEach(() => {
    const from = vi.fn((table: string) => {
      if (table === "user_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { role: "event_organizer", avatar_url: null },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ data: null, count: 2, error: null }),
          }),
        }),
      };
    });
    mocks.authenticateMobileRequest.mockResolvedValue({
      user: { id: "user-123" },
      supabase: { from },
    });
    mocks.loadActiveDropdownNotifications.mockResolvedValue({
      data: [
        {
          id: "notification-1",
          type: "weather_alert",
          title: "Weather update",
          body: "Rain expected.",
          read_at: null,
          created_at: "2026-08-20T12:00:00.000Z",
          trip_id: "trip-1",
          invitation_id: null,
          metadata: { deepLink: "/trips/trip-1" },
        },
      ],
      error: null,
    });
  });

  it("returns only the authenticated user's active notification payload", async () => {
    const request = new Request(
      "https://vaivia.app/api/mobile/v1/notifications",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.loadActiveDropdownNotifications).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
    );
    await expect(response.json()).resolves.toEqual({
      notifications: [
        expect.objectContaining({
          id: "notification-1",
          title: "Weather update",
          metadata: { deepLink: "/trips/trip-1" },
        }),
      ],
      navigationProfile: { role: "event_organizer", avatar_url: null },
      pendingImportCount: 2,
    });
  });

  it("preserves bearer-auth failures and CORS preflight handling", async () => {
    mocks.authenticateMobileRequest.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const request = new Request(
      "https://vaivia.app/api/mobile/v1/notifications",
    );

    expect((await GET(request)).status).toBe(401);
    expect(OPTIONS(request).status).toBe(204);
    expect(mocks.loadActiveDropdownNotifications).not.toHaveBeenCalled();
  });
});
