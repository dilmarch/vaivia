import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApiClient, MobileApiError } from "@/mobile/src/lib/apiClient";

describe("MobileApiClient", () => {
  afterEach(() => {
    vi.useRealTimers();
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
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer test-access-token");

    const diagnostics = JSON.stringify(log.mock.calls);
    expect(diagnostics).toContain("https://vaivia.app/api/mobile/v1/trips");
    expect(diagnostics).toContain("user-123");
    expect(diagnostics).not.toContain("test-access-token");
  });

  it("sends typed trip lifecycle mutations with bearer auth and idempotency", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ data: { trip: { id: "trip-1", title: "Portugal" } } }, { status: 201 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(
      client.createTrip(
        {
          title: "Portugal",
          destination: "Lisbon, Porto",
          legs: [
            { name: "Lisbon", startDate: "2026-10-01", endDate: "2026-10-04" },
            { name: "Porto", startDate: "2026-10-04", endDate: "2026-10-07" },
          ],
        },
        { idempotencyKey: "create-trip-1" },
      ),
    ).resolves.toEqual({ trip: { id: "trip-1", title: "Portugal" } });

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://vaivia.app/api/mobile/v1/trips");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(headers.get("Idempotency-Key")).toBe("create-trip-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      title: "Portugal",
      legs: [{ name: "Lisbon" }, { name: "Porto" }],
    });
  });

  it("sends itinerary mutations through the authenticated mobile API", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ data: { item: { id: "item-1", title: "Museum" } } }, { status: 201 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({ sessionExists: true, accessToken: "token", authenticatedUserId: "user-1" }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await client.createItineraryItem(
      "trip/one",
      { title: "Museum", itemDate: "2026-09-12", audienceMode: "everyone" },
      { idempotencyKey: "itinerary-create-1" },
    );

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://vaivia.app/api/mobile/v1/trips/trip%2Fone/itinerary");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("itinerary-create-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({ title: "Museum", itemDate: "2026-09-12" });
  });

  it("deduplicates an in-flight itinerary deletion", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let resolveResponse!: (response: Response) => void;
    const fetchImplementation = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({ sessionExists: true, accessToken: "token", authenticatedUserId: "user-1" }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const first = client.deleteItineraryItem("trip-1", "item-1", { idempotencyKey: "delete-item-1" });
    const second = client.deleteItineraryItem("trip-1", "item-1", { idempotencyKey: "delete-item-1" });
    await Promise.resolve();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json({ data: { deleted: true, itemId: "item-1" } }));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("does not duplicate the same in-flight destructive trip request", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let resolveResponse!: (response: Response) => void;
    const fetchImplementation = vi.fn(
      () => new Promise<Response>((resolve) => { resolveResponse = resolve; }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({ sessionExists: true, accessToken: "token", authenticatedUserId: "user-1" }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const first = client.deleteTrip("trip-1", "DELETE", { idempotencyKey: "delete-trip-1" });
    const second = client.deleteTrip("trip-1", "DELETE", { idempotencyKey: "delete-trip-1" });
    await Promise.resolve();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json({ data: { deleted: true, tripId: "trip-1" } }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { deleted: true, tripId: "trip-1" },
      { deleted: true, tripId: "trip-1" },
    ]);
  });

  it("does not make a request when a rendered session has no propagated token", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn();
    const onUnauthorized = vi.fn();
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: async () => ({
        sessionExists: true,
        accessToken: null,
        authenticatedUserId: "user-123",
      }),
      onUnauthorized,
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject<MobileApiError>({
      status: 401,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
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
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("Trip not found");
  });

  it("does not log successful authenticated API response bodies", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const sensitiveBody = {
      trips: [{ id: "trip-private", notes: "private itinerary notes" }],
    };
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: vi.fn(async () =>
        Response.json(sensitiveBody, { status: 200 }),
      ) as typeof fetch,
    });

    await expect(client.getTrips()).resolves.toEqual(sensitiveBody);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private itinerary notes",
    );
  });

  it("preserves Concierge streaming headers and injects bearer auth", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      new Response('{"type":"delta","delta":"Hello"}\n', {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    const response = await client.requestAuthenticated(
      "/api/trips/trip-1/assistant",
      {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "message", message: "Hello" }),
      },
    );

    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    const [url, init] = fetchImplementation.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://vaivia.app/api/trips/trip-1/assistant");
    expect(headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(headers.get("Accept")).toBe("application/x-ndjson");
  });

  it("serializes mutation bodies and preserves idempotency metadata", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ created: true }, { status: 201 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(
      client.postJson(
        "/api/mobile/v1/example",
        { title: "Read only foundation" },
        { idempotencyKey: "request-123" },
      ),
    ).resolves.toEqual({ created: true });

    const [, init] = fetchImplementation.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ title: "Read only foundation" }));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("request-123");
  });

  it("times out stalled requests without logging credentials", async () => {
    vi.useFakeTimers();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    try {
      const request = client.getJson("/api/mobile/v1/slow", { timeoutMs: 50 });
      const rejection = expect(request).rejects.toMatchObject({
        status: 408,
        code: "timeout",
      });
      await vi.advanceTimersByTimeAsync(50);

      await rejection;
      expect(errorLog).toHaveBeenCalledWith(
        "[VAIVIA mobile API] response",
        expect.objectContaining({ failureKind: "timeout" }),
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        "test-access-token",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates caller cancellation to the in-flight request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const controller = new AbortController();

    const request = client.getTrips(controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns to authentication after a validated 401 response", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const onUnauthorized = vi.fn();
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "expired-access-token",
        authenticatedUserId: "user-123",
      }),
      onUnauthorized,
      fetchImplementation: vi.fn(async () =>
        Response.json({ error: "Unauthorized" }, { status: 401 }),
      ) as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("normalizes malformed successful JSON into a safe API error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: vi.fn(async () =>
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject({
      status: 502,
      code: "invalid_json",
    });
  });

  it.each([
    [403, "forbidden"],
    [409, "conflict"],
  ])("normalizes %s responses as %s errors", async (status, code) => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: vi.fn(async () =>
        Response.json(
          { error: { code, message: `Safe ${code} message` } },
          { status },
        ),
      ) as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject({
      status,
      code,
      message: `Safe ${code} message`,
      retryable: false,
    });
  });

  it("preserves safe validation field errors", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "validation_error",
              message: "Please correct the form.",
              fieldErrors: { title: ["Title is required."], unsafe: [12] },
            },
          },
          { status: 422 },
        ),
      ) as typeof fetch,
    });

    await expect(
      client.postJson("/api/mobile/v1/example", { title: "" }),
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
      fieldErrors: { title: ["Title is required."] },
    });
  });

  it("supports PUT and unwraps the standard success envelope", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchImplementation = vi.fn(async () =>
      Response.json({ data: { updated: true } }, { status: 200 }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });

    await expect(
      client.putJson("/api/mobile/v1/example", { version: 2 }),
    ).resolves.toEqual({ updated: true });
    expect(fetchImplementation.mock.calls[0][1]?.method).toBe("PUT");
  });

  it("deduplicates concurrent idempotent mutations without retrying", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let resolveRequest!: (response: Response) => void;
    const fetchImplementation = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const options = { idempotencyKey: "same-submit" };

    const first = client.postJson("/api/mobile/v1/example", { value: 1 }, options);
    const duplicate = client.postJson(
      "/api/mobile/v1/example",
      { value: 1 },
      options,
    );
    await Promise.resolve();
    resolveRequest(Response.json({ data: { created: true } }));

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { created: true },
      { created: true },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("converts network failures into retryable safe errors", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({
        sessionExists: true,
        accessToken: "test-access-token",
        authenticatedUserId: "user-123",
      }),
      fetchImplementation: vi.fn(async () => {
        throw new TypeError("network internals must not escape");
      }) as typeof fetch,
    });

    await expect(client.getTrips()).rejects.toMatchObject({
      status: 0,
      code: "network_error",
      retryable: true,
      message: "VAIVIA could not connect. Check your connection and try again.",
    });
  });
});
