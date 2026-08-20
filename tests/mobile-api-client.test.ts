import { describe, expect, it, vi } from "vitest";
import { MobileApiClient, MobileApiError } from "@/mobile/src/lib/apiClient";

describe("MobileApiClient", () => {
  it("uses the configured absolute base URL and Supabase bearer token", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({ trips: [] }, { status: 200 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app/",
      getAccessToken: async () => "test-access-token",
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
  });

  it("does not make an unauthenticated API request", async () => {
    const fetchImplementation = vi.fn();
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAccessToken: async () => null,
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject<MobileApiError>({
      status: 401,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("encodes trip identifiers and surfaces API errors", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({ error: "Trip not found" }, { status: 404 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAccessToken: async () => "test-access-token",
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrip("trip/id")).rejects.toMatchObject({
      message: "Trip not found",
      status: 404,
    });
    expect(fetchImplementation.mock.calls[0][0]).toBe(
      "https://vaivia.app/api/mobile/v1/trips/trip%2Fid",
    );
  });
});
