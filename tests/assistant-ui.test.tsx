import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SafeMarkdown from "@/components/assistant/SafeMarkdown";
import TripAssistant from "@/components/assistant/TripAssistant";

const CONVERSATION_A = "30000000-0000-4000-8000-000000000001";

function response(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    );
}

function bootstrap(overrides: Record<string, unknown> = {}) {
    return {
        configured: true,
        placesConfigured: true,
        trip: { id: "trip-a", title: "Japan" },
        conversations: [],
        activeConversationId: null,
        messages: [],
        usage: { limit: 50, used: 0, remaining: 50 },
        ...overrides,
    };
}

function desktopMediaQuery() {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    );
}

beforeEach(() => desktopMediaQuery());

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("trip assistant interface", () => {
    it("shows the exact starter prompts, selected trip, and linked privacy disclosure", async () => {
        vi.stubGlobal("fetch", vi.fn(() => response(bootstrap())));
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(await screen.findByText("Ask about Japan")).toBeInTheDocument();
        for (const prompt of [
            "Summarize this trip",
            "Review my itinerary",
            "What still needs planning?",
            "Find gaps or conflicts",
        ]) {
            expect(screen.getByRole("button", { name: prompt })).toBeInTheDocument();
        }
        expect(
            screen.getByText(/trip details and questions are sent to Google Gemini/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/stored for 30 days/i)).toBeInTheDocument();
        expect(screen.getByText(/Saved-trip-only questions do not invoke Google Search/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /VAIVIA privacy notice/i })).toHaveAttribute(
            "href",
            "/terms"
        );
    });

    it("renders the dedicated missing-key state without disabling email import messaging", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => response(bootstrap({ configured: false })))
        );
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(
            await screen.findByText("The VAIVIA assistant is temporarily unavailable")
        ).toBeInTheDocument();
        expect(screen.getByText(/email importing are unaffected/i)).toBeInTheDocument();
        expect(screen.getByLabelText("Ask the VAIVIA assistant")).toBeDisabled();
    });

    it("keeps saved-trip questions available when only the Places key is missing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => response(bootstrap({ placesConfigured: false })))
        );
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(
            await screen.findByText(/live nearby place discovery is temporarily unavailable/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/saved-trip questions still work/i)).toBeInTheDocument();
        expect(screen.getByLabelText("Ask the VAIVIA assistant")).not.toBeDisabled();
    });

    it("shows the quota state", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                response(
                    bootstrap({ usage: { limit: 50, used: 50, remaining: 0 } })
                )
            )
        );
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(await screen.findByText(/reached today’s limit/i)).toBeInTheDocument();
        expect(screen.getByLabelText("Ask the VAIVIA assistant")).toBeDisabled();
    });

    it("creates a new persisted conversation", async () => {
        const conversation = {
            id: CONVERSATION_A,
            title: "New conversation",
            created_at: "2026-07-18T00:00:00Z",
            updated_at: "2026-07-18T00:00:00Z",
            last_message_at: null,
        };
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => response(bootstrap()))
            .mockImplementationOnce(() => response({ conversation }, 201));
        vi.stubGlobal("fetch", fetchMock);
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        fireEvent.click(await screen.findByRole("button", { name: /new conversation/i }));
        await waitFor(() => expect(screen.getByText("New conversation")).toBeInTheDocument());
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/trips/trip-a/assistant",
            expect.objectContaining({ method: "POST" })
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Ask the VAIVIA assistant")).toHaveFocus()
        );
    });

    it("sends a starter prompt and renders the persisted answer", async () => {
        const conversation = {
            id: CONVERSATION_A,
            title: "Summarize this trip",
            created_at: "2026-07-18T00:00:00Z",
            updated_at: "2026-07-18T00:01:00Z",
            last_message_at: "2026-07-18T00:01:00Z",
        };
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => response(bootstrap()))
            .mockImplementationOnce(() =>
                response({
                    conversation,
                    userMessage: {
                        id: "user-message",
                        role: "user",
                        content: "Summarize this trip",
                        created_at: "2026-07-18T00:01:00Z",
                    },
                    assistantMessage: {
                        id: "assistant-message",
                        role: "assistant",
                        content: "**Day 1:** Arrival",
                        created_at: "2026-07-18T00:01:01Z",
                    },
                    usage: { limit: 50, used: 1, remaining: 49 },
                })
            );
        vi.stubGlobal("fetch", fetchMock);
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        fireEvent.click(
            await screen.findByRole("button", { name: "Summarize this trip" })
        );
        expect(await screen.findByText("Day 1:")).toBeInTheDocument();
        const [, request] = fetchMock.mock.calls[1];
        expect(JSON.parse(String(request.body))).toMatchObject({
            action: "message",
            conversationId: null,
        });
    });

    it("renders persisted live place cards with attribution, caveats and no write actions", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                response(
                    bootstrap({
                        activeConversationId: CONVERSATION_A,
                        messages: [
                            {
                                id: "assistant-place-message",
                                role: "assistant",
                                status: "complete",
                                content:
                                    "Here is [an ordinary model link](https://example.org/place).",
                                created_at: "2026-07-18T00:01:00Z",
                                recommendations: [
                                    {
                                        recommendationId: "assistant-place-message:0",
                                        name: "Green Room Café",
                                        category: "Cafe",
                                        address: "12 King St",
                                        matchReason: "A well-rated café near your hotel.",
                                        distance: "130 m straight-line",
                                        rating: 4.7,
                                        userRatingCount: 420,
                                        priceLevel: "$$",
                                        hoursSummary:
                                            "Monday: 8:00 AM–6:00 PM (verify for your visit)",
                                        mapsUrl: "https://maps.google.com/?cid=123",
                                        alreadySaved: false,
                                    },
                                ],
                            },
                        ],
                    })
                )
            )
        );
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(await screen.findByText("Green Room Café")).toBeInTheDocument();
        expect(screen.getByText("Google Maps")).toBeInTheDocument();
        expect(screen.getByText("130 m straight-line")).toBeInTheDocument();
        expect(screen.getByText(/verify for your visit/i)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open Green Room Café in Google Maps" })
        ).toHaveAttribute("href", "https://maps.google.com/?cid=123");
        expect(screen.queryByRole("button", { name: /save|book|add/i })).toBeNull();
        expect(screen.getByRole("link", { name: "an ordinary model link" })).toHaveAttribute(
            "href",
            "https://example.org/place"
        );
        expect(screen.queryByText("Current web sources")).not.toBeInTheDocument();
    });

    it("renders ephemeral grounded citations and sandboxed Google Search Suggestions accessibly", async () => {
        const content = "Pride programming runs June 25–28.";
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                response(
                    bootstrap({
                        activeConversationId: CONVERSATION_A,
                        messages: [
                            {
                                id: "grounded-message",
                                role: "assistant",
                                status: "complete",
                                content,
                                created_at: "2026-07-18T00:01:00Z",
                                webGrounding: {
                                    sources: [
                                        {
                                            id: "source-1",
                                            title: "Official Pride programme",
                                            url: "https://example.org/pride",
                                        },
                                    ],
                                    supports: [
                                        {
                                            startIndex: 0,
                                            endIndex: new TextEncoder().encode(content).length,
                                            sourceIds: ["source-1"],
                                        },
                                    ],
                                    searchEntryPointHtml:
                                        "<div>Google Search Suggestions</div>",
                                    queryCount: 1,
                                },
                            },
                        ],
                    })
                )
            )
        );
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        expect(
            await screen.findByLabelText(
                "Current web answer with Google Search citations"
            )
        ).toBeInTheDocument();
        expect(screen.getByText("Current web sources")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Source 1: Official Pride programme/i })).toHaveAttribute(
            "href",
            "https://example.org/pride"
        );
        expect(screen.getByRole("link", { name: "Official Pride programme" })).toHaveAttribute(
            "rel",
            "noopener noreferrer"
        );
        expect(screen.getByTitle("Google Search Suggestions")).toHaveAttribute(
            "sandbox",
            "allow-popups allow-popups-to-escape-sandbox"
        );
        expect(
            screen.getByText(/Verify important dates, availability, closures/i)
        ).toBeInTheDocument();
    });

    it("reopens a conversation and confirms before deleting it", async () => {
        const conversation = {
            id: CONVERSATION_A,
            title: "Planning notes",
            created_at: "2026-07-18T00:00:00Z",
            updated_at: "2026-07-18T00:00:00Z",
            last_message_at: "2026-07-18T00:01:00Z",
        };
        const savedPayload = bootstrap({
            conversations: [conversation],
            activeConversationId: CONVERSATION_A,
            messages: [
                {
                    id: "message-a",
                    role: "assistant",
                    content: "Your saved answer",
                    created_at: "2026-07-18T00:01:00Z",
                },
            ],
        });
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => response(savedPayload))
            .mockImplementationOnce(() => response(savedPayload))
            .mockImplementationOnce(() => response({ deleted: true }));
        vi.stubGlobal("fetch", fetchMock);
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        fireEvent.click(await screen.findByRole("button", { name: "Open Planning notes" }));
        expect(await screen.findByText("Your saved answer")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `/api/trips/trip-a/assistant?conversationId=${CONVERSATION_A}`,
            expect.objectContaining({ cache: "no-store" })
        );

        fireEvent.click(screen.getByRole("button", { name: "Delete Planning notes" }));
        expect(screen.getByRole("dialog", { name: "Delete conversation?" })).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: /^Delete conversation$/ }));
        await waitFor(() =>
            expect(fetchMock).toHaveBeenLastCalledWith(
                `/api/trips/trip-a/assistant?conversationId=${CONVERSATION_A}`,
                { method: "DELETE" }
            )
        );
    });

    it("offers a retry after a provider failure", async () => {
        const conversation = {
            id: CONVERSATION_A,
            title: "Trip question",
            created_at: "2026-07-18T00:00:00Z",
            updated_at: "2026-07-18T00:01:00Z",
            last_message_at: "2026-07-18T00:01:00Z",
        };
        const failure = {
            error: "The assistant took too long to respond. Please try again.",
            code: "gemini_timeout",
            conversation,
            userMessage: {
                id: "failed-user-message",
                role: "user",
                content: "Summarize this trip",
                created_at: "2026-07-18T00:01:00Z",
            },
            usage: { limit: 50, used: 1, remaining: 49 },
        };
        const success = {
            conversation,
            userMessage: {
                id: "retry-user-message",
                role: "user",
                content: "Summarize this trip",
                created_at: "2026-07-18T00:02:00Z",
            },
            assistantMessage: {
                id: "retry-assistant-message",
                role: "assistant",
                content: "Saved-trip summary",
                created_at: "2026-07-18T00:02:01Z",
            },
            usage: { limit: 50, used: 2, remaining: 48 },
        };
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => response(bootstrap()))
            .mockImplementationOnce(() => response(failure, 504))
            .mockImplementationOnce(() => response(success));
        vi.stubGlobal("fetch", fetchMock);
        render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);

        fireEvent.click(await screen.findByRole("button", { name: "Summarize this trip" }));
        fireEvent.click(await screen.findByRole("button", { name: "Retry request" }));
        expect(await screen.findByText("Saved-trip summary")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("clears the previous trip before loading a switched trip", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() =>
                response(
                    bootstrap({
                        trip: { id: "trip-a", title: "Japan" },
                        messages: [
                            {
                                id: "a-message",
                                role: "assistant",
                                content: "Japan-only private answer",
                                created_at: "2026-07-18T00:00:00Z",
                            },
                        ],
                    })
                )
            )
            .mockImplementationOnce(() =>
                response(
                    bootstrap({
                        trip: { id: "trip-b", title: "Iceland" },
                    })
                )
            );
        vi.stubGlobal("fetch", fetchMock);
        const view = render(<TripAssistant tripId="trip-a" tripTitle="Japan" />);
        expect(await screen.findByText("Japan-only private answer")).toBeInTheDocument();

        view.rerender(<TripAssistant tripId="trip-b" tripTitle="Iceland" />);
        expect(await screen.findByText("Ask about Iceland")).toBeInTheDocument();
        expect(screen.queryByText("Japan-only private answer")).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/trips/trip-b/assistant",
            expect.objectContaining({ cache: "no-store" })
        );
    });
});

describe("safe Markdown", () => {
    it("drops raw HTML and does not create unsafe links", () => {
        const { container } = render(
            <SafeMarkdown
                content={
                    '<script>alert("x")</script>\n\n[bad](javascript:alert(1))\n\n[data](data:text/html,x)\n\n**safe**'
                }
            />
        );
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("a")).toBeNull();
        expect(screen.getByText("safe")).toBeInTheDocument();
    });
});
