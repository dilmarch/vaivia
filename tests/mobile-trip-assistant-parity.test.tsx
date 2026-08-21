import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripAssistantScreen } from "@/mobile/src/screens/TripAssistantScreen";

const conversationId = "30000000-0000-4000-8000-000000000001";

function bootstrap(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    placesConfigured: true,
    trip: { id: "trip-1", title: "Lisbon summer" },
    conversations: [],
    activeConversationId: null,
    messages: [],
    usage: { limit: 50, used: 0, remaining: 50 },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    Response.json(body, {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function streamResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return Promise.resolve(
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const event of events) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
          controller.close();
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      },
    ),
  );
}

function createApiClient(
  requestAuthenticated: ReturnType<typeof vi.fn> = vi.fn(() =>
    jsonResponse(bootstrap()),
  ),
) {
  return { requestAuthenticated } as unknown as MobileApiClient;
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("mobile Ask Concierge strict visual and functional parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive conversation shell at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      render(
        <TripAssistantScreen
          apiClient={createApiClient()}
          tripId="trip-1"
          tripTitle="Lisbon summer"
        />,
      );

      expect(await screen.findByText("Ask about Lisbon summer")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Ask Concierge" })).toHaveClass(
        "font-black",
      );
      expect(screen.getByLabelText("Ask Concierge")).toHaveClass(
        "min-h-11",
        "text-sm",
      );
      expect(document.querySelector("main")).toHaveClass(
        "vaivia-page-bg",
        "overflow-hidden",
      );
      expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /VAIVIA privacy notice/i })).toHaveAttribute(
        "href",
        "https://vaivia.app/terms",
      );
    },
  );

  it("sends with the shared NDJSON protocol and renders streaming plus the final response", async () => {
    const requestAuthenticated = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(bootstrap()))
      .mockImplementationOnce(() =>
        streamResponse([
          { type: "status", stage: "trip_context_database" },
          { type: "delta", delta: "Your Lisbon " },
          { type: "delta", delta: "plan is ready." },
          {
            type: "result",
            status: 200,
            payload: {
              conversation: {
                id: conversationId,
                title: "Summarize this trip",
                created_at: "2026-08-20T12:00:00.000Z",
                updated_at: "2026-08-20T12:00:01.000Z",
                last_message_at: "2026-08-20T12:00:01.000Z",
              },
              userMessage: {
                id: "user-message",
                role: "user",
                status: "complete",
                content: "Summarize this trip",
                created_at: "2026-08-20T12:00:00.000Z",
              },
              assistantMessage: {
                id: "assistant-message",
                role: "assistant",
                status: "complete",
                content: "Your Lisbon plan is ready.",
                created_at: "2026-08-20T12:00:01.000Z",
              },
              usage: { limit: 50, used: 1, remaining: 49 },
            },
          },
        ]),
      );

    render(
      <TripAssistantScreen
        apiClient={createApiClient(requestAuthenticated)}
        tripId="trip-1"
        tripTitle="Lisbon summer"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Summarize this trip" }),
    );

    expect(await screen.findByText("Your Lisbon plan is ready.")).toBeInTheDocument();
    expect(requestAuthenticated).toHaveBeenLastCalledWith(
      "/api/trips/trip-1/assistant",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/x-ndjson",
        }),
      }),
      { timeoutMs: null },
    );
  });

  it("preserves a long conversation across background/resume without reloading", async () => {
    const longResponse = Array.from(
      { length: 24 },
      (_, index) => `Planning detail ${index + 1}`,
    ).join("\n");
    const requestAuthenticated = vi.fn(() =>
      jsonResponse(
        bootstrap({
          conversations: [
            {
              id: conversationId,
              title: "Long planning answer",
              created_at: "2026-08-20T12:00:00.000Z",
              updated_at: "2026-08-20T12:00:01.000Z",
              last_message_at: "2026-08-20T12:00:01.000Z",
            },
          ],
          activeConversationId: conversationId,
          messages: [
            {
              id: "assistant-long",
              role: "assistant",
              status: "complete",
              content: longResponse,
              created_at: "2026-08-20T12:00:01.000Z",
            },
          ],
        }),
      ),
    );
    render(
      <TripAssistantScreen
        apiClient={createApiClient(requestAuthenticated)}
        tripId="trip-1"
        tripTitle="Lisbon summer"
      />,
    );

    await waitFor(() =>
      expect(document.body).toHaveTextContent("Planning detail 24"),
    );
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(document.body).toHaveTextContent("Planning detail 24");
    expect(requestAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("surfaces API and expired-session errors without exposing a broken composer state", async () => {
    const requestAuthenticated = vi.fn(() =>
      jsonResponse({ error: "Your session has expired. Please sign in again." }, 401),
    );
    render(
      <TripAssistantScreen
        apiClient={createApiClient(requestAuthenticated)}
        tripId="trip-1"
        tripTitle="Lisbon summer"
      />,
    );

    expect(
      await screen.findByText("Your session has expired. Please sign in again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ask Concierge")).toBeDisabled();
  });

  it("shows existing place results but disables every trip-changing proposal action", async () => {
    render(
      <TripAssistantScreen
        apiClient={createApiClient(
          vi.fn(() =>
            jsonResponse(
              bootstrap({
                activeConversationId: conversationId,
                messages: [
                  {
                    id: "assistant-place-message",
                    role: "assistant",
                    status: "complete",
                    content: "A nearby option:",
                    created_at: "2026-08-20T12:00:01.000Z",
                    recommendations: [
                      {
                        recommendationId: "assistant-place-message:0",
                        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
                        name: "Green Room Café",
                        category: "Cafe",
                        address: "12 King St",
                        matchReason: "Near your stay.",
                        distance: "130 m straight-line",
                        rating: 4.7,
                        userRatingCount: 420,
                        priceLevel: "$$",
                        hoursSummary: null,
                        mapsUrl: "https://maps.google.com/?cid=123",
                        alreadySaved: false,
                        liveDetailsAvailable: true,
                      },
                    ],
                  },
                ],
              }),
            ),
          ),
        )}
        tripId="trip-1"
        tripTitle="Lisbon summer"
      />,
    );

    expect(await screen.findByText("Green Room Café")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Green Room Café/i })).toBeEnabled();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute(
      "title",
      "Trip-changing Concierge actions are unavailable in the iOS app",
    );
  });
});
