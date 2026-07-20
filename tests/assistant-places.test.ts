import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    turn: vi.fn(),
    loadPlaceContext: vi.fn(),
    resolveAnchor: vi.fn(),
    alreadySaved: vi.fn(() => false),
    search: vi.fn(),
    details: vi.fn(),
    findByText: vi.fn(),
}));

vi.mock("@/lib/ai/gemini-assistant", () => ({
    generateGeminiAssistantTurn: mocks.turn,
    getGeminiAssistantGenerationConfig: () => ({ maxOutputTokens: 4_096 }),
}));
vi.mock("@/lib/ai/place-anchors", () => ({
    ASSISTANT_ANCHOR_KINDS: [
        "auto",
        "accommodation",
        "itinerary_activity",
        "destination",
        "transportation_arrival",
    ],
    loadTripPlaceContext: mocks.loadPlaceContext,
    resolveTripPlaceAnchor: mocks.resolveAnchor,
    isAlreadySavedPlace: mocks.alreadySaved,
}));
vi.mock("@/lib/ai/google-places", () => ({
    searchGooglePlaces: mocks.search,
    getGooglePlaceDetails: mocks.details,
    findGooglePlaceByText: mocks.findByText,
}));

import {
    ASSISTANT_MAX_FUNCTION_CALLS,
    VAIVIA_PLACES_TOOLS,
    generateTripAssistantResponse,
} from "@/lib/ai/places-orchestrator";

const tripContext = {
    anchors: [],
    savedPlaces: [],
};
const anchor = {
    kind: "accommodation" as const,
    label: "Harbour Hotel",
    dateStart: "2026-09-02",
    dateEnd: "2026-09-05",
    location: { latitude: 43.6532, longitude: -79.3832 },
    placeId: "ChIJHotelAnchor123",
    address: "10 King St",
};
const place = {
    placeId: "ChIJCafeCandidate123",
    name: "Green Room Café",
    address: "12 King St",
    category: "cafe",
    types: ["cafe", "restaurant"],
    location: { latitude: 43.654, longitude: -79.382 },
    distanceMeters: 130,
    rating: 4.7,
    userRatingCount: 420,
    priceLevel: "PRICE_LEVEL_MODERATE",
    businessStatus: "OPERATIONAL",
    hoursSummary: "Monday: 8:00 AM–6:00 PM (verify for your visit)",
    mapsUrl: "https://maps.google.com/?cid=123",
};

function diagnostics() {
    return {
        apiVersion: "v1beta",
        model: "gemini-3.5-flash",
        providerStatus: null,
        providerCode: null,
        providerMessage: null,
        finishReason: "STOP",
        promptBlockReason: null,
        elapsedMs: 20,
        tokenUsage: {
            promptTokenCount: 10,
            candidateTokenCount: 5,
            thoughtsTokenCount: 2,
            totalTokenCount: 17,
        },
    };
}

function successfulTurn(overrides: Record<string, unknown> = {}) {
    return {
        status: "success",
        message: "Here are a few good options.",
        responseContent: { role: "model", parts: [{ text: "answer" }] },
        functionCalls: [],
        model: "gemini-3.5-flash-001",
        tokenUsage: diagnostics().tokenUsage,
        diagnostics: diagnostics(),
        ...overrides,
    };
}

function searchCall(id = "call-1") {
    return {
        id,
        name: "search_nearby_places",
        args: {
            query: "cafés",
            anchor_kind: "accommodation",
            anchor_reference: "Harbour Hotel",
            target_date: "2026-09-03",
            radius_meters: 1500,
            max_results: 8,
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPlaceContext.mockResolvedValue(tripContext);
    mocks.resolveAnchor.mockReturnValue({ status: "resolved", anchor });
    mocks.search.mockResolvedValue({ status: "success", data: [place] });
    mocks.details.mockResolvedValue({ status: "success", data: place });
});

describe("VAIVIA controlled Places tool loop", () => {
    it("does not expose coordinates or unrestricted provider IDs in tool declarations", () => {
        const schema = JSON.stringify(VAIVIA_PLACES_TOOLS);
        expect(schema).toContain("anchor_reference");
        expect(schema).toContain("result_id");
        expect(schema).not.toMatch(/latitude|longitude|place_id/i);
    });

    it("does not call Google Places for an ordinary saved-trip question", async () => {
        mocks.turn.mockResolvedValue(successfulTurn({ message: "Your trip starts Monday." }));
        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [{ role: "user", parts: [{ text: "When does my trip start?" }] }],
            systemInstruction: "system",
        });
        expect(result).toMatchObject({
            status: "success",
            toolUsage: { functionCalls: 0, externalToolCalls: 0, placeResults: 0 },
        });
        expect(mocks.loadPlaceContext).not.toHaveBeenCalled();
        expect(mocks.search).not.toHaveBeenCalled();
    });

    it("resolves a trusted saved anchor, sanitizes tool output, ranks results and creates Place-ID-only metadata", async () => {
        mocks.turn
            .mockResolvedValueOnce(
                successfulTurn({
                    message: null,
                    responseContent: {
                        role: "model",
                        parts: [
                            {
                                functionCall: searchCall(),
                                thoughtSignature: "opaque-signature",
                            },
                        ],
                    },
                    functionCalls: [searchCall()],
                })
            )
            .mockResolvedValueOnce(successfulTurn());

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [{ role: "user", parts: [{ text: "Find cafés near my hotel" }] }],
            systemInstruction: "system",
        });

        expect(mocks.resolveAnchor).toHaveBeenCalledWith(tripContext, {
            kind: "accommodation",
            reference: "Harbour Hotel",
            targetDate: "2026-09-03",
        });
        expect(mocks.search).toHaveBeenCalledWith(
            expect.objectContaining({
                query: "cafés",
                origin: anchor.location,
                radiusMeters: 1500,
                maxResults: 8,
            })
        );
        expect(result).toMatchObject({
            status: "success",
            metadata: {
                version: 1,
                type: "google_places_recommendations",
                recommendations: [
                    {
                        placeId: "ChIJCafeCandidate123",
                        alreadySaved: false,
                    },
                ],
            },
            recommendations: [
                {
                    name: "Green Room Café",
                    distance: "130 m straight-line",
                    rating: 4.7,
                },
            ],
            toolUsage: { functionCalls: 1, externalToolCalls: 1, placeResults: 1 },
        });
        const secondTurnContents = mocks.turn.mock.calls[1]?.[0]?.contents;
        const browserSafeToolJson = JSON.stringify(secondTurnContents);
        expect(browserSafeToolJson).toContain("Green Room Café");
        expect(browserSafeToolJson).toContain("place_1");
        expect(browserSafeToolJson).toContain("opaque-signature");
        expect(browserSafeToolJson).not.toContain("43.654");
        expect(browserSafeToolJson).not.toContain("ChIJCafeCandidate123");
    });

    it("asks a focused clarification without calling Google when a saved anchor is ambiguous", async () => {
        mocks.resolveAnchor.mockReturnValue({
            status: "ambiguous",
            options: ["Harbour Hotel", "Airport Hotel"],
        });
        mocks.turn
            .mockResolvedValueOnce(
                successfulTurn({
                    message: null,
                    responseContent: { role: "model", parts: [{ functionCall: searchCall() }] },
                    functionCalls: [searchCall()],
                })
            )
            .mockResolvedValueOnce(
                successfulTurn({ message: "Which hotel: Harbour Hotel or Airport Hotel?" })
            );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [],
            systemInstruction: "system",
        });
        expect(result).toMatchObject({ status: "success", recommendations: [] });
        expect(mocks.search).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.turn.mock.calls[1]?.[0]?.contents)).toContain(
            "Harbour Hotel"
        );
    });

    it("rejects arbitrary detail lookups that were not discovered in the same request", async () => {
        const forgedCall = {
            id: "call-forged",
            name: "get_place_details",
            args: { result_id: "ChIJArbitraryProviderId" },
        };
        mocks.turn
            .mockResolvedValueOnce(
                successfulTurn({
                    message: null,
                    responseContent: {
                        role: "model",
                        parts: [{ functionCall: forgedCall }],
                    },
                    functionCalls: [forgedCall],
                })
            )
            .mockResolvedValueOnce(successfulTurn({ message: "I need a search first." }));
        await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [],
            systemInstruction: "system",
        });
        expect(mocks.details).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.turn.mock.calls[1]?.[0]?.contents)).toContain(
            "Unknown result ID"
        );
    });

    it("enforces the four-call ceiling and returns a safe missing-key tool state", async () => {
        const calls = Array.from(
            { length: ASSISTANT_MAX_FUNCTION_CALLS + 1 },
            (_, index) => searchCall(`call-${index}`)
        );
        mocks.search.mockResolvedValue({
            status: "failure",
            code: "missing_configuration",
        });
        mocks.turn
            .mockResolvedValueOnce(
                successfulTurn({
                    message: null,
                    responseContent: {
                        role: "model",
                        parts: calls.map((call) => ({ functionCall: call })),
                    },
                    functionCalls: calls,
                })
            )
            .mockResolvedValueOnce(
                successfulTurn({
                    message: "Live place discovery is temporarily unavailable.",
                })
            );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [],
            systemInstruction: "system",
        });
        expect(result).toMatchObject({
            status: "success",
            message: "Live place discovery is temporarily unavailable.",
            toolUsage: { externalToolCalls: ASSISTANT_MAX_FUNCTION_CALLS },
        });
        expect(mocks.search).toHaveBeenCalledTimes(ASSISTANT_MAX_FUNCTION_CALLS);
        expect(JSON.stringify(mocks.turn.mock.calls[1]?.[0]?.contents)).not.toContain(
            "GOOGLE_PLACES_API_KEY"
        );
    });
});
