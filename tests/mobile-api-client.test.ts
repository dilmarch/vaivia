import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApiClient, MobileApiError } from "@/mobile/src/lib/apiClient";

describe("MobileApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves the Window receiver for the default fetch implementation", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const receiverSensitiveFetch = vi.fn(function (this: unknown) {
      if (this !== window) {
        throw new TypeError("Can only call Window.fetch on instances of Window");
      }
      return Promise.resolve(Response.json({ trips: [] }, { status: 200 }));
    });
    vi.stubGlobal("fetch", receiverSensitiveFetch);

    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
    });

    await expect(client.getTrips()).resolves.toEqual({ trips: [] });
    expect(receiverSensitiveFetch.mock.contexts[0]).toBe(window);
  });

  it("uses the configured absolute base URL and Supabase bearer token", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ trips: [] }, { status: 200 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app/",
      getAuthState: async () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrips()).resolves.toEqual({ trips: [] });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://vaivia.app/api/mobile/v1/trips");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer test-access-token",
    });

    const diagnostics = JSON.stringify(log.mock.calls);
    expect(diagnostics).toContain("https://vaivia.app/api/mobile/v1/trips");
    expect(diagnostics).toContain("user-123");
    expect(diagnostics).not.toContain("test-access-token");
  });

  it("does not make a request when a rendered session has no propagated token", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn();
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: async () => ({
        sessionExists: true,
        accessToken: null,
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject<MobileApiError>({
      status: 401,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("encodes trip identifiers and surfaces API errors", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ error: "Trip not found" }, { status: 404 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: async () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrip("trip/id")).rejects.toMatchObject({
      message: "Trip not found",
      status: 404,
    });
    expect(fetchImplementation.mock.calls[0][0]).toBe(
      "https://vaivia.app/api/mobile/v1/trips/trip%2Fid",
    );
    expect(log).toHaveBeenCalledWith(
      "[VAIVIA mobile API] response",
      expect.objectContaining({
        httpResponseStatus: 404,
        apiResponseBody: { error: "Trip not found" },
      }),
    );
  });
});
