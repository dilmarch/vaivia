import { describe, expect, it, vi } from "vitest";
import { MobileApiClient } from "@/mobile/src/lib/apiClient";

describe("mobile notifications API client", () => {
  it("uses the production bearer-authenticated notifications endpoint", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        {
          notifications: [],
          navigationProfile: null,
          pendingImportCount: 0,
        },
        { status: 200 },
      ),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app/",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getNotifications()).resolves.toEqual({
      notifications: [],
      navigationProfile: null,
      pendingImportCount: 0,
    });
    expect(fetchImplementation.mock.calls[0][0]).toBe(
      "https://vaivia.app/api/mobile/v1/notifications",
    );
    expect(fetchImplementation.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer test-access-token",
    });
  });
});
