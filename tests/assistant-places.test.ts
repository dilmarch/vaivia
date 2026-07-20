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
    ASSISTANT_PLACE_LOCATION_NEEDED_MESSAGE,
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

function webCall(topic = "events") {
    return {
        id: "web-call-1",
        name: "search_current_web",
        args: {
            question: "What current events are happening during our Toronto trip?",
            topic,
            location: "Toronto",
            start_date: "2026-09-02",
            end_date: "2026-09-05",
        },
    };
}

function groundedMetadata(message: string) {
    return {
        webSearchQueries: ["ephemeral provider query"],
        searchEntryPoint: { renderedContent: "<div>Google Search suggestions</div>" },
        groundingChunks: [
            {
                web: {
                    uri: "https://example.org/event",
                    title: "Official event",
                },
            },
        ],
        groundingSupports: [
            {
                segment: {
                    startIndex: 0,
                    endIndex: new TextEncoder().encode(message).length,
                    partIndex: 0,
                },
                groundingChunkIndices: [0],
            },
        ],
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
        expect(schema).toContain("search_current_web");
    });

    it("server-routes the exact operational prompt through exactly one grounded operation", async () => {
        const prompt =
            "Use current web sources to find LGBTQ+ events, food festivals or tours, and beer, wine, or spirits experiences happening during my saved trip dates. Cite each time-sensitive claim.";
        const groundedAnswer = "Current trip-date events are listed here.";
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: groundedAnswer,
                groundingMetadata: groundedMetadata(groundedAnswer),
            })
        );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: "system",
        });

        expect(result).toMatchObject({
            status: "success",
            persistedMessage:
                "This current-information answer is not stored. Ask again to refresh it with Google Search.",
            metadata: { version: 1, type: "current_web_refresh" },
            webGrounding: { queryCount: 1 },
            toolUsage: {
                functionCalls: 0,
                externalToolCalls: 1,
                placeResults: 0,
                webSearchOperations: 1,
                webSearchQueries: 1,
            },
        });
        expect(mocks.turn).toHaveBeenCalledTimes(1);
        expect(mocks.turn.mock.calls[0]?.[0]?.config).toMatchObject({
            tools: [{ googleSearch: {} }],
        });
        expect(mocks.search).not.toHaveBeenCalled();
    });

    it("routes the grounded placeholder follow-up through a fresh single operation", async () => {
        const original =
            "Use current web sources to find LGBTQ+ events during my saved trip dates.";
        const followUp = "Which of these are on Friday or Saturday night?";
        const groundedAnswer = "The Friday and Saturday options are listed here.";
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: groundedAnswer,
                groundingMetadata: groundedMetadata(groundedAnswer),
            })
        );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [
                { role: "user", parts: [{ text: original }] },
                {
                    role: "model",
                    parts: [
                        {
                            text: "This current-information answer is not stored. Ask again to refresh it with Google Search.",
                        },
                    ],
                },
                { role: "user", parts: [{ text: followUp }] },
            ],
            systemInstruction: "system",
        });

        expect(result).toMatchObject({
            status: "success",
            toolUsage: { webSearchOperations: 1, webSearchQueries: 1 },
        });
        expect(mocks.turn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mocks.turn.mock.calls[0]?.[0]?.contents)).toContain(
            `Follow-up: ${followUp}`
        );
    });

    it.each([
        ["events", "What events are happening during the trip?"],
        ["lgbtq_events", "What LGBTQ+ events are happening during the trip?"],
        ["culinary_experiences", "What food festivals or tours are happening during the trip?"],
        [
            "culinary_experiences",
            "Use current web sources to find restaurant events during my trip.",
        ],
        ["drinks_experiences", "What wine or spirits experiences are happening during the trip?"],
        [
            "drinks_experiences",
            "Find beer festivals happening during my trip dates.",
        ],
        ["temporary_attractions", "What temporary exhibitions are on during the trip?"],
    ])("routes %s through one terminal Google Search-grounded generation", async (topic, prompt) => {
        const answer = `Current ${topic.replaceAll("_", " ")} are listed here.`;
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: answer,
                groundingMetadata: groundedMetadata(answer),
            })
        );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: "system",
        });

        expect(result).toMatchObject({
            status: "success",
            message: answer,
            persistedMessage:
                "This current-information answer is not stored. Ask again to refresh it with Google Search.",
            metadata: { version: 1, type: "current_web_refresh" },
            recommendations: [],
            webGrounding: { queryCount: 1 },
            toolUsage: {
                externalToolCalls: 1,
                placeResults: 0,
                webSearchOperations: 1,
                webSearchQueries: 1,
            },
        });
        expect(mocks.turn).toHaveBeenCalledTimes(1);
        expect(mocks.turn.mock.calls[0]?.[0]?.config).toMatchObject({
            tools: [{ googleSearch: {} }],
        });
        expect(mocks.search).not.toHaveBeenCalled();
    });

    it("rejects missing grounding metadata as retryable and does not continue ungrounded", async () => {
        const call = webCall();
        mocks.turn
            .mockResolvedValueOnce(
                successfulTurn({
                    message: null,
                    responseContent: { role: "model", parts: [{ functionCall: call }] },
                    functionCalls: [call],
                })
            )
            .mockResolvedValueOnce(
                successfulTurn({ message: "Unverified answer", groundingMetadata: null })
            );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [],
            systemInstruction: "system",
        });
        expect(result).toMatchObject({
            status: "empty_output",
            message: "Current web information is temporarily unavailable. Please try again.",
            toolUsage: { webSearchOperations: 0, webSearchQueries: 0 },
        });
        expect(mocks.turn).toHaveBeenCalledTimes(2);
    });

    it("refuses mixed Search and Places calls without invoking either provider", async () => {
        const currentCall = webCall();
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: null,
                responseContent: {
                    role: "model",
                    parts: [
                        { functionCall: currentCall },
                        { functionCall: searchCall() },
                    ],
                },
                functionCalls: [currentCall, searchCall()],
            })
        );
        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [],
            systemInstruction: "system",
        });
        expect(result.status).toBe("empty_output");
        expect(mocks.turn).toHaveBeenCalledTimes(1);
        expect(mocks.search).not.toHaveBeenCalled();
    });

    it("uses neither external service for the exact saved-trip summary request", async () => {
        mocks.turn.mockResolvedValue(
            successfulTurn({ message: "Here is your saved trip summary." })
        );
        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [{ role: "user", parts: [{ text: "Summarize this trip." }] }],
            systemInstruction: "system",
        });
        expect(result).toMatchObject({
            status: "success",
            toolUsage: { functionCalls: 0, externalToolCalls: 0, placeResults: 0 },
        });
        expect(mocks.loadPlaceContext).not.toHaveBeenCalled();
        expect(mocks.search).not.toHaveBeenCalled();
        expect(result).not.toHaveProperty("webGrounding");
        expect(mocks.turn.mock.calls[0]?.[0]?.config?.tools).toBeUndefined();
    });

    it("forces the exact nearby-restaurant request through Places and returns structured cards only", async () => {
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
            contents: [
                {
                    role: "user",
                    parts: [{ text: "Find restaurants near my hotel." }],
                },
            ],
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
        expect(JSON.stringify(mocks.turn.mock.calls[0]?.[0]?.config?.tools)).not.toContain(
            "search_current_web"
        );
        expect(mocks.turn.mock.calls[0]?.[0]?.config?.toolConfig).toEqual({
            functionCallingConfig: {
                mode: "ANY",
                allowedFunctionNames: ["search_nearby_places"],
            },
        });
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
        expect(result).not.toHaveProperty("webGrounding");
        const secondTurnContents = mocks.turn.mock.calls[1]?.[0]?.contents;
        const browserSafeToolJson = JSON.stringify(secondTurnContents);
        expect(browserSafeToolJson).toContain("Green Room Café");
        expect(browserSafeToolJson).toContain("place_1");
        expect(browserSafeToolJson).toContain("opaque-signature");
        expect(browserSafeToolJson).not.toContain("43.654");
        expect(browserSafeToolJson).not.toContain("ChIJCafeCandidate123");
    });

    it("rejects model prose when a required Places call is skipped", async () => {
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: "Here are some restaurants I already know about.",
            })
        );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [
                {
                    role: "user",
                    parts: [{ text: "Find restaurants near my hotel." }],
                },
            ],
            systemInstruction: "system",
        });

        expect(result).toMatchObject({
            status: "empty_output",
            message: "Live place discovery is temporarily unavailable. Please try again.",
            toolUsage: {
                functionCalls: 0,
                externalToolCalls: 0,
                placeResults: 0,
            },
        });
        expect(result).not.toHaveProperty("recommendations");
        expect(mocks.search).not.toHaveBeenCalled();
    });

    it("returns a deterministic location-needed response when no trusted anchor exists", async () => {
        mocks.resolveAnchor.mockReturnValue({ status: "missing" });
        mocks.turn.mockResolvedValueOnce(
            successfulTurn({
                message: null,
                responseContent: {
                    role: "model",
                    parts: [{ functionCall: searchCall() }],
                },
                functionCalls: [searchCall()],
            })
        );

        const result = await generateTripAssistantResponse({
            supabase: {} as never,
            tripId: "trip-a",
            contents: [
                {
                    role: "user",
                    parts: [{ text: "Find restaurants near my hotel." }],
                },
            ],
            systemInstruction: "system",
        });

        expect(result).toMatchObject({
            status: "success",
            message: ASSISTANT_PLACE_LOCATION_NEEDED_MESSAGE,
            metadata: {},
            recommendations: [],
            toolUsage: {
                functionCalls: 1,
                externalToolCalls: 0,
                placeResults: 0,
            },
        });
        expect(mocks.turn).toHaveBeenCalledTimes(1);
        expect(mocks.search).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain(
            "Here are some restaurants I already know about."
        );
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
