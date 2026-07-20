import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlaceRecommendationCards from "@/components/assistant/PlaceRecommendationCards";
import type { AssistantPlaceRecommendation } from "@/lib/ai/places-contract";

const conversationId = "20000000-0000-4000-8000-000000000001";
const messageId = "30000000-0000-4000-8000-000000000001";
const proposalId = "40000000-0000-4000-8000-000000000001";

const recommendation: AssistantPlaceRecommendation = {
    recommendationId: "recommendation-1",
    placeId: "ChIJValidPlace123",
    name: "Live provider place",
    category: "Restaurant",
    address: "Live provider address",
    matchReason: "Near the trusted trip anchor.",
    distance: "200 m straight-line",
    rating: 4.5,
    userRatingCount: 50,
    priceLevel: "$$",
    hoursSummary: "Verify current hours.",
    mapsUrl: "https://maps.google.com/example",
    alreadySaved: false,
    liveDetailsAvailable: true,
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    );
}

function proposalResponse() {
    return {
        proposal: {
            id: proposalId,
            actionType: "save_food",
            expiresAt: "2026-08-01T00:15:00Z",
        },
        preview: {
            name: "Live provider place",
            address: "Live provider address",
            category: "Restaurant",
            rating: 4.5,
            userRatingCount: 50,
            mapsUrl: "https://maps.google.com/example",
        },
        previewUnavailable: false,
        alreadySaved: null,
        options: {
            tripLegs: [],
            itineraryCategories: [],
            timezoneHints: {},
        },
    };
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function renderActionCard() {
    return render(
        <PlaceRecommendationCards
            recommendations={[recommendation]}
            tripId="trip-a"
            conversationId={conversationId}
            messageId={messageId}
        />
    );
}

async function openReview() {
    const trigger = screen.getByRole("button", { name: "Save" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Save to Eat & Drink" }));
    await screen.findByText("Review before saving");
    return trigger;
}

describe("assistant place action review UI", () => {
    it("shows action controls only on a validated Places card with persisted references", () => {
        const { rerender } = render(
            <PlaceRecommendationCards recommendations={[recommendation]} />
        );
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

        rerender(
            <PlaceRecommendationCards
                recommendations={[recommendation]}
                tripId="trip-a"
                conversationId={conversationId}
                messageId={messageId}
            />
        );
        expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("requires a separate review and explicit final confirmation", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === "PATCH") {
                return jsonResponse({
                    status: "succeeded",
                    savedTarget: {
                        type: "trip_food_item",
                        label: "My dinner choice",
                        href: "/trips/trip-a/food?tab=places",
                    },
                });
            }
            return jsonResponse(proposalResponse());
        });
        vi.stubGlobal("fetch", fetchMock);
        render(
            <PlaceRecommendationCards
                recommendations={[recommendation]}
                tripId="trip-a"
                conversationId={conversationId}
                messageId={messageId}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Save to Eat & Drink" }));

        expect(await screen.findByText("Review before saving")).toBeInTheDocument();
        expect(screen.getAllByText("Live provider place")).toHaveLength(2);
        const label = screen.getByLabelText(/Your label/i);
        expect(label).toHaveValue("");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });

        const confirm = screen.getByRole("button", { name: "Save to Eat & Drink" });
        expect(confirm).toBeDisabled();
        fireEvent.change(label, { target: { value: "My dinner choice" } });
        expect(confirm).not.toBeDisabled();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fireEvent.click(confirm);
        expect(await screen.findByText("Saved successfully")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open saved item" })).toHaveAttribute(
            "href",
            "/trips/trip-a/food?tab=places"
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const confirmationBody = JSON.parse(
            String(fetchMock.mock.calls[1]?.[1]?.body)
        );
        expect(confirmationBody).toMatchObject({
            proposalId,
            fields: { label: "My dinner choice" },
        });
        expect(confirmationBody.fields).not.toMatchObject({
            name: "Live provider place",
            address: "Live provider address",
        });
    });

    it("awaits confirmed cancellation, blocks duplicates, then closes and restores trigger focus", async () => {
        let resolveCancellation: ((response: Response) => void) | undefined;
        const pendingCancellation = new Promise<Response>((resolve) => {
            resolveCancellation = resolve;
        });
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === "DELETE") {
                return pendingCancellation;
            }
            return jsonResponse(proposalResponse());
        });
        vi.stubGlobal("fetch", fetchMock);
        renderActionCard();
        const trigger = await openReview();
        const cancel = screen.getByRole("button", { name: "Cancel" });

        fireEvent.click(cancel);
        expect(cancel).toBeDisabled();
        fireEvent.click(cancel);

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")
            ).toHaveLength(1)
        );
        expect(screen.getByText("Review before saving")).toBeInTheDocument();
        expect(
            fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")
        ).toBe(false);

        resolveCancellation?.(
            new Response(
                JSON.stringify({ cancelled: true, status: "cancelled" }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        );
        await waitFor(() =>
            expect(screen.queryByText("Review before saving")).toBeNull()
        );
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("accepts an already-cancelled response as an idempotent success", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === "DELETE"
                ? jsonResponse({ cancelled: true, status: "already_cancelled" })
                : jsonResponse(proposalResponse())
        );
        vi.stubGlobal("fetch", fetchMock);
        renderActionCard();
        const trigger = await openReview();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() =>
            expect(screen.queryByText("Review before saving")).toBeNull()
        );
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(
            fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")
        ).toHaveLength(1);
        expect(
            fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")
        ).toBe(false);
    });

    it.each([
        {
            name: "network failure",
            cancellation: () => Promise.reject(new Error("private network detail")),
        },
        {
            name: "non-2xx response",
            cancellation: () =>
                jsonResponse({ error: "private server detail" }, 503),
        },
        {
            name: "malformed 2xx response",
            cancellation: () =>
                Promise.resolve(
                    new Response("not-json", {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    })
                ),
        },
        {
            name: "unexpected proposal status",
            cancellation: () =>
                jsonResponse({ cancelled: true, status: "succeeded" }),
        },
    ])("keeps the modal usable after $name", async ({ cancellation }) => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === "DELETE"
                ? cancellation()
                : jsonResponse(proposalResponse())
        );
        vi.stubGlobal("fetch", fetchMock);
        renderActionCard();
        await openReview();
        fireEvent.change(screen.getByLabelText(/Your label/i), {
            target: { value: "My own label" },
        });
        const cancel = screen.getByRole("button", { name: "Cancel" });
        cancel.focus();

        fireEvent.click(cancel);

        expect(
            await screen.findByText("We couldn't cancel this review. Please try again.")
        ).toBeInTheDocument();
        expect(screen.getByText("Review before saving")).toBeInTheDocument();
        await waitFor(() => expect(cancel).toBeEnabled());
        expect(screen.getByRole("button", { name: "Save to Eat & Drink" })).toBeEnabled();
        await waitFor(() => expect(cancel).toHaveFocus());
        expect(screen.queryByText(/private (?:network|server) detail/i)).toBeNull();
        expect(
            fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")
        ).toBe(false);
    });

    it("does not imply an already-saved target was removed", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === "DELETE"
                ? jsonResponse(
                      {
                          error: "internal target detail",
                          code: "action_already_succeeded",
                      },
                      409
                  )
                : jsonResponse(proposalResponse())
        );
        vi.stubGlobal("fetch", fetchMock);
        renderActionCard();
        await openReview();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(
            await screen.findByText(
                "This item was already saved. Cancelling the review will not remove it."
            )
        ).toBeInTheDocument();
        expect(screen.getByText("Review before saving")).toBeInTheDocument();
        expect(screen.queryByText("internal target detail")).toBeNull();
    });

    it("times out a stalled cancellation without closing the modal", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method !== "DELETE") return jsonResponse(proposalResponse());
            return new Promise<Response>((_resolve, reject) => {
                init.signal?.addEventListener(
                    "abort",
                    () => reject(new DOMException("private timeout detail", "AbortError")),
                    { once: true }
                );
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        renderActionCard();
        await openReview();
        const cancel = screen.getByRole("button", { name: "Cancel" });
        cancel.focus();
        vi.useFakeTimers();

        fireEvent.click(cancel);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
            await vi.advanceTimersByTimeAsync(16);
        });

        expect(
            screen.getByText("We couldn't cancel this review. Please try again.")
        ).toBeInTheDocument();
        expect(screen.getByText("Review before saving")).toBeInTheDocument();
        expect(cancel).toBeEnabled();
        expect(cancel).toHaveFocus();
        expect(screen.queryByText("private timeout detail")).toBeNull();
    });

    it("shows a safe saved-label fallback and suppresses mutation controls when live details fail", () => {
        render(
            <PlaceRecommendationCards
                recommendations={[
                    {
                        ...recommendation,
                        name: "My saved label",
                        address: null,
                        liveDetailsAvailable: false,
                        savedTargets: [
                            {
                                type: "trip_idea",
                                label: "My saved label",
                                href: "/trips/trip-a?tab=ideas",
                            },
                        ],
                    },
                ]}
                tripId="trip-a"
                conversationId={conversationId}
                messageId={messageId}
            />
        );

        expect(screen.getByText(/Live Google Maps details are unavailable/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Saved to Things to Do" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
});
