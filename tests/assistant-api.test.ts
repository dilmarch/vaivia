import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    createServiceClient: vi.fn(),
    configured: vi.fn(() => true),
    generate: vi.fn(),
    loadContext: vi.fn(),
    hydrate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({
    createServiceRoleClient: mocks.createServiceClient,
}));
vi.mock("@/lib/ai/gemini-assistant", () => ({
    isGeminiAssistantConfigured: mocks.configured,
    getGeminiAssistantModel: () => "gemini-3.5-flash",
    getAiDailyMessageLimit: () => 50,
    VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE:
        "The VAIVIA assistant is temporarily unavailable",
}));
vi.mock("@/lib/ai/google-places", () => ({
    isGooglePlacesConfigured: () => true,
}));
vi.mock("@/lib/ai/places-orchestrator", () => ({
    generateTripAssistantResponse: mocks.generate,
    hydratePersistedPlaceRecommendations: mocks.hydrate,
}));
vi.mock("@/lib/ai/trip-context", () => ({
    loadTripAssistantContext: mocks.loadContext,
}));
vi.mock("@/lib/ai/system-instruction", () => ({
    buildVaiviaAssistantSystemInstruction: () => "system",
}));

import { GET, POST } from "@/app/api/trips/[tripId]/assistant/route";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
const TRIP_A = "20000000-0000-4000-8000-000000000001";
const TRIP_B = "20000000-0000-4000-8000-000000000002";
const CONVERSATION_A = "30000000-0000-4000-8000-000000000001";
const CONVERSATION_B = "30000000-0000-4000-8000-000000000002";
const USAGE_EVENT = "40000000-0000-4000-8000-000000000001";

type FakeOptions = {
    user?: { id: string } | null;
    trip?: { id: string; slug: string; title: string } | null;
    conversation?: Record<string, unknown> | null;
    usage?: { allowed: boolean; used: number; remaining: number };
    messages?: Record<string, unknown>[];
};

function fakeSupabase(options: FakeOptions = {}) {
    const user = options.user === undefined ? { id: USER_A } : options.user;
    const trip = options.trip === undefined
        ? { id: TRIP_A, slug: "trip-a", title: "Trip A" }
        : options.trip;
    const writes: Array<{ table: string; operation: string; payload?: unknown }> = [];

    function from(table: string) {
        const state = { operation: "select", payload: null as unknown };
        const builder = {
            select() {
                return builder;
            },
            insert(payload: unknown) {
                state.operation = "insert";
                state.payload = payload;
                writes.push({ table, operation: "insert", payload });
                return builder;
            },
            update(payload: unknown) {
                state.operation = "update";
                state.payload = payload;
                writes.push({ table, operation: "update", payload });
                return builder;
            },
            delete() {
                state.operation = "delete";
                writes.push({ table, operation: "delete" });
                return builder;
            },
            eq() {
                return builder;
            },
            in() {
                return builder;
            },
            gte() {
                return builder;
            },
            order() {
                return builder;
            },
            limit() {
                return builder;
            },
            single: async () => {
                if (table === "ai_messages" && state.operation === "insert") {
                    const payload = state.payload as Record<string, unknown>;
                    return {
                        data: {
                            id:
                                payload.role === "assistant"
                                    ? "50000000-0000-4000-8000-000000000002"
                                    : "50000000-0000-4000-8000-000000000001",
                            role: payload.role,
                            status: payload.status,
                            content: payload.content,
                            created_at: "2026-07-18T00:01:00Z",
                        },
                        error: null,
                    };
                }
                if (table === "ai_conversations" && state.operation === "insert") {
                    const payload = state.payload as Record<string, unknown>;
                    return {
                        data: {
                            id: CONVERSATION_A,
                            trip_id: payload.trip_id,
                            user_id: payload.user_id,
                            title: payload.title,
                            created_at: "2026-07-18T00:00:00Z",
                            updated_at: "2026-07-18T00:00:00Z",
                            last_message_at: null,
                        },
                        error: null,
                    };
                }
                if (table === "ai_conversations" && state.operation === "update") {
                    const payload = state.payload as Record<string, unknown>;
                    return {
                        data: {
                            id: CONVERSATION_A,
                            title: payload.title,
                            created_at: "2026-07-18T00:00:00Z",
                            updated_at: payload.updated_at,
                            last_message_at: payload.last_message_at,
                        },
                        error: null,
                    };
                }
                return { data: null, error: null };
            },
            maybeSingle: async () => {
                if (table === "trips") return { data: trip, error: null };
                if (table === "ai_conversations") {
                    return { data: options.conversation || null, error: null };
                }
                return { data: null, error: null };
            },
            then(resolve: (value: unknown) => void) {
                const value =
                    table === "ai_conversations" && state.operation === "select"
                        ? {
                              data: options.conversation
                                  ? [options.conversation]
                                  : [],
                              error: null,
                          }
                        : table === "ai_usage_events" && state.operation === "select"
                          ? { count: 0, error: null }
                          : table === "ai_messages" && state.operation === "select"
                            ? { data: options.messages || [], error: null }
                            : { data: null, error: null };
                return Promise.resolve(value).then(resolve);
            },
        };
        return builder;
    }

    return {
        auth: { getUser: vi.fn(async () => ({ data: { user } })) },
        from,
        writes,
        rpc: vi.fn(async () => ({
            data: [
                {
                    ...(options.usage || { allowed: true, used: 1, remaining: 49 }),
                    usage_event_id: USAGE_EVENT,
                },
            ],
            error: null,
        })),
    };
}

function routeContext(tripId = "trip-a") {
    return { params: Promise.resolve({ tripId }) };
}

function conversation(overrides: Record<string, unknown> = {}) {
    return {
        id: CONVERSATION_A,
        trip_id: TRIP_A,
        user_id: USER_A,
        title: "My trip",
        created_at: "2026-07-18T00:00:00Z",
        updated_at: "2026-07-18T00:00:00Z",
        last_message_at: null,
        ...overrides,
    };
}

function messageRequest(
    conversationId: string | null = CONVERSATION_A,
    message = "When does my trip start?"
) {
    return new NextRequest("http://localhost/api/trips/trip-a/assistant", {
        method: "POST",
        body: JSON.stringify({ action: "message", conversationId, message }),
    });
}

function generationDiagnostics(overrides: Record<string, unknown> = {}) {
    return {
        apiVersion: "v1beta",
        model: "gemini-3.5-flash",
        providerStatus: null,
        providerCode: null,
        providerMessage: null,
        finishReason: "STOP",
        promptBlockReason: null,
        elapsedMs: 120,
        tokenUsage: {
            promptTokenCount: 20,
            candidateTokenCount: 8,
            thoughtsTokenCount: 4,
            totalTokenCount: 32,
        },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.createServiceClient.mockImplementation(() => fakeSupabase());
    mocks.loadContext.mockResolvedValue({
        current_date_utc: "2026-07-18",
        trip: { title: "Trip A" },
        context_notice: "allowlisted",
    });
    mocks.hydrate.mockResolvedValue([]);
    mocks.generate.mockResolvedValue({
        status: "success",
        message: "Your trip starts on Monday.",
        model: "gemini-3.5-flash-001",
        tokenUsage: {
            promptTokenCount: 20,
            candidateTokenCount: 8,
            thoughtsTokenCount: 4,
            totalTokenCount: 32,
        },
        diagnostics: generationDiagnostics(),
        metadata: {},
        recommendations: [],
        toolUsage: { functionCalls: 0, externalToolCalls: 0, placeResults: 0 },
    });
});

describe("trip assistant API authorization and validation", () => {
    it("rejects unauthenticated requests", async () => {
        mocks.createClient.mockResolvedValue(fakeSupabase({ user: null }));
        const response = await GET(
            new NextRequest("http://localhost/api/trips/trip-a/assistant"),
            routeContext()
        );
        expect(response.status).toBe(401);
    });

    it("does not reveal an inaccessible trip", async () => {
        mocks.createClient.mockResolvedValue(fakeSupabase({ trip: null }));
        const response = await GET(
            new NextRequest("http://localhost/api/trips/other-trip/assistant"),
            routeContext("other-trip")
        );
        expect(response.status).toBe(404);
    });

    it("rejects another user's conversation", async () => {
        mocks.createClient.mockResolvedValue(
            fakeSupabase({ conversation: conversation({ user_id: USER_B }) })
        );
        const response = await POST(messageRequest(), routeContext());
        expect(response.status).toBe(404);
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it("rejects a conversation/trip mismatch", async () => {
        mocks.createClient.mockResolvedValue(
            fakeSupabase({
                conversation: conversation({ id: CONVERSATION_B, trip_id: TRIP_B }),
            })
        );
        const response = await POST(
            messageRequest(CONVERSATION_B, "Tell me about it"),
            routeContext()
        );
        expect(response.status).toBe(404);
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it("validates conversation UUIDs and the 4,000-character message bound", async () => {
        const database = fakeSupabase({ conversation: conversation() });
        mocks.createClient.mockResolvedValue(database);

        const invalidConversation = await POST(
            messageRequest("not-a-uuid"),
            routeContext()
        );
        expect(invalidConversation.status).toBe(400);

        const oversized = await POST(
            messageRequest(CONVERSATION_A, "x".repeat(4_001)),
            routeContext()
        );
        expect(oversized.status).toBe(400);
        expect(database.writes).toHaveLength(0);
    });

    it("returns only the safe unavailable response when the dedicated key is missing", async () => {
        mocks.createClient.mockResolvedValue(fakeSupabase());
        mocks.configured.mockReturnValue(false);
        const response = await POST(messageRequest(null, "Hello"), routeContext());
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
            error: "The VAIVIA assistant is temporarily unavailable",
            code: "assistant_unavailable",
        });
    });
});

describe("trip assistant persistence and quota", () => {
    it("refreshes persisted Place-ID metadata server-side and never returns raw metadata", async () => {
        const database = fakeSupabase({
            conversation: conversation(),
            messages: [
                {
                    id: "50000000-0000-4000-8000-000000000003",
                    role: "assistant",
                    status: "complete",
                    content: "Nearby options",
                    created_at: "2026-07-18T00:01:00Z",
                    metadata: {
                        version: 1,
                        type: "google_places_recommendations",
                        recommendations: [
                            {
                                placeId: "ChIJPersistedPlace123",
                                matchReason: "Near your hotel.",
                                alreadySaved: false,
                            },
                        ],
                    },
                },
            ],
        });
        mocks.createClient.mockResolvedValue(database);
        mocks.hydrate.mockResolvedValue([
            {
                recommendationId: "safe-card-1",
                name: "Refreshed Café",
                category: "Cafe",
                address: null,
                matchReason: "Near your hotel.",
                distance: "Distance unavailable",
                rating: 4.5,
                userRatingCount: 100,
                priceLevel: null,
                hoursSummary: null,
                mapsUrl: "https://maps.google.com/?cid=1",
                alreadySaved: false,
            },
        ]);

        const response = await GET(
            new NextRequest("http://localhost/api/trips/trip-a/assistant"),
            routeContext()
        );
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.messages[0].recommendations[0].name).toBe("Refreshed Café");
        expect(payload.messages[0].metadata).toBeUndefined();
        expect(JSON.stringify(payload)).not.toContain("ChIJPersistedPlace123");
    });

    it("enforces the daily quota before persisting a message or calling Gemini", async () => {
        const userDatabase = fakeSupabase({ conversation: conversation() });
        mocks.createClient.mockResolvedValue(userDatabase);
        mocks.createServiceClient.mockImplementation(() =>
            fakeSupabase({ usage: { allowed: false, used: 50, remaining: 0 } })
        );

        const response = await POST(
            messageRequest(CONVERSATION_A, "One more question"),
            routeContext()
        );
        expect(response.status).toBe(429);
        expect(mocks.loadContext).toHaveBeenCalledWith(expect.anything(), TRIP_A);
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(userDatabase.writes).toHaveLength(0);
    });

    it("loads scoped context, persists both messages, and records model token usage", async () => {
        const userDatabase = fakeSupabase({ conversation: conversation() });
        const serviceDatabase = fakeSupabase();
        mocks.createClient.mockResolvedValue(userDatabase);
        mocks.createServiceClient.mockReturnValue(serviceDatabase);

        const response = await POST(messageRequest(), routeContext());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            userMessage: { status: "complete" },
            assistantMessage: {
                role: "assistant",
                content: "Your trip starts on Monday.",
            },
            usage: { used: 1, remaining: 49 },
        });
        expect(mocks.loadContext).toHaveBeenCalledWith(expect.anything(), TRIP_A);
        expect(mocks.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                tripId: TRIP_A,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: "When does my trip start?" }],
                    },
                ],
                systemInstruction: "system",
            })
        );
        const messageWrites = userDatabase.writes.filter(
            (write) => write.table === "ai_messages" && write.operation === "insert"
        );
        expect(messageWrites).toHaveLength(1);
        const assistantMessageWrite = serviceDatabase.writes.find(
            (write) =>
                write.table === "ai_messages" && write.operation === "insert"
        );
        expect(assistantMessageWrite?.payload).toMatchObject({
            role: "assistant",
            model: "gemini-3.5-flash-001",
            metadata: {},
        });
        expect(serviceDatabase.writes).toContainEqual(
            expect.objectContaining({
                table: "ai_usage_events",
                operation: "update",
                payload: expect.objectContaining({
                    outcome: "succeeded",
                    prompt_token_count: 20,
                    candidate_token_count: 8,
                    thoughts_token_count: 4,
                    total_token_count: 32,
                }),
            })
        );
        expect(
            userDatabase.writes.every((write) => write.table.startsWith("ai_"))
        ).toBe(true);
    });

    it("persists only typed place references while returning hydrated cards and usage counts", async () => {
        const userDatabase = fakeSupabase({ conversation: conversation() });
        const serviceDatabase = fakeSupabase();
        mocks.createClient.mockResolvedValue(userDatabase);
        mocks.createServiceClient.mockReturnValue(serviceDatabase);
        mocks.generate.mockResolvedValue({
            status: "success",
            message: "Here are nearby cafés.",
            model: "gemini-3.5-flash-001",
            tokenUsage: generationDiagnostics().tokenUsage,
            diagnostics: generationDiagnostics(),
            metadata: {
                version: 1,
                type: "google_places_recommendations",
                recommendations: [
                    {
                        placeId: "ChIJCafeCandidate123",
                        matchReason: "Near the saved hotel.",
                        alreadySaved: false,
                    },
                ],
            },
            recommendations: [
                {
                    recommendationId: "place_1",
                    name: "Safe Café",
                    category: "Cafe",
                    address: "12 King St",
                    matchReason: "Near the saved hotel.",
                    distance: "130 m straight-line",
                    rating: 4.7,
                    userRatingCount: 420,
                    priceLevel: "$$",
                    hoursSummary: null,
                    mapsUrl: "https://maps.google.com/?cid=123",
                    alreadySaved: false,
                },
            ],
            toolUsage: { functionCalls: 1, externalToolCalls: 1, placeResults: 1 },
        });

        const response = await POST(messageRequest(), routeContext());
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.assistantMessage.recommendations[0].name).toBe("Safe Café");
        expect(JSON.stringify(payload)).not.toContain("ChIJCafeCandidate123");
        const assistantWrite = serviceDatabase.writes.find(
            (write) =>
                write.table === "ai_messages" &&
                (write.payload as { role?: string }).role === "assistant"
        );
        expect(assistantWrite?.payload).toMatchObject({
            metadata: {
                recommendations: [{ placeId: "ChIJCafeCandidate123" }],
            },
        });
        expect(serviceDatabase.writes).toContainEqual(
            expect.objectContaining({
                table: "ai_usage_events",
                operation: "update",
                payload: expect.objectContaining({
                    outcome: "succeeded",
                    external_tool_calls: 1,
                    external_place_results: 1,
                }),
            })
        );
    });

    it("returns grounding ephemerally while persisting only a refresh placeholder and numeric counters", async () => {
        const userDatabase = fakeSupabase({ conversation: conversation() });
        const serviceDatabase = fakeSupabase();
        mocks.createClient.mockResolvedValue(userDatabase);
        mocks.createServiceClient.mockReturnValue(serviceDatabase);
        const groundedContent = "Toronto Pride programming is scheduled for June 25–28.";
        const refreshPlaceholder =
            "This current-information answer is not stored. Ask again to refresh it with Google Search.";
        mocks.generate.mockResolvedValue({
            status: "success",
            message: groundedContent,
            persistedMessage: refreshPlaceholder,
            model: "gemini-3.5-flash-001",
            tokenUsage: generationDiagnostics().tokenUsage,
            diagnostics: generationDiagnostics(),
            metadata: { version: 1, type: "current_web_refresh" },
            recommendations: [],
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
                        endIndex: new TextEncoder().encode(groundedContent).length,
                        sourceIds: ["source-1"],
                    },
                ],
                searchEntryPointHtml: "<div>Google Search Suggestions</div>",
                queryCount: 2,
            },
            toolUsage: {
                functionCalls: 1,
                externalToolCalls: 1,
                placeResults: 0,
                webSearchOperations: 1,
                webSearchQueries: 2,
            },
        });

        const response = await POST(
            messageRequest(
                CONVERSATION_A,
                "Use current web sources to find LGBTQ+ events, food festivals or tours, and beer, wine, or spirits experiences happening during my saved trip dates. Cite each time-sensitive claim."
            ),
            routeContext()
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.assistantMessage).toMatchObject({
            content: groundedContent,
            webGrounding: { queryCount: 2 },
        });
        const assistantWrite = serviceDatabase.writes.find(
            (write) =>
                write.table === "ai_messages" &&
                (write.payload as { role?: string }).role === "assistant"
        );
        expect(assistantWrite?.payload).toMatchObject({
            content: refreshPlaceholder,
            metadata: { version: 1, type: "current_web_refresh" },
        });
        expect(mocks.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                retrievalDecision: expect.objectContaining({ mode: "current_web" }),
            })
        );
        const persistedWrites = JSON.stringify([
            ...userDatabase.writes,
            ...serviceDatabase.writes,
        ]);
        expect(persistedWrites).not.toContain("example.org");
        expect(persistedWrites).not.toContain("Official Pride programme");
        expect(persistedWrites).not.toContain("Google Search Suggestions");
        expect(persistedWrites).not.toContain("provider query");
        expect(serviceDatabase.writes).toContainEqual(
            expect.objectContaining({
                table: "ai_usage_events",
                operation: "update",
                payload: expect.objectContaining({
                    outcome: "succeeded",
                    google_search_operations: 1,
                    google_search_queries: 2,
                }),
            })
        );
    });

    it("reopens only the grounded refresh placeholder with no stale citations or suggestions", async () => {
        const refreshPlaceholder =
            "This current-information answer is not stored. Ask again to refresh it with Google Search.";
        mocks.createClient.mockResolvedValue(
            fakeSupabase({
                conversation: conversation(),
                messages: [
                    {
                        id: "grounded-placeholder-message",
                        role: "assistant",
                        status: "complete",
                        content: refreshPlaceholder,
                        created_at: "2026-07-18T00:01:00Z",
                        metadata: { version: 1, type: "current_web_refresh" },
                    },
                ],
            })
        );

        const response = await GET(
            new NextRequest("http://localhost/api/trips/trip-a/assistant"),
            routeContext()
        );
        const payload = await response.json();
        expect(payload.messages).toEqual([
            expect.objectContaining({ content: refreshPlaceholder }),
        ]);
        expect(payload.messages[0].webGrounding).toBeUndefined();
        expect(JSON.stringify(payload)).not.toMatch(/groundingChunks|searchEntryPoint|https?:\/\//);
    });

    it("releases quota when grounded output is unusable and stores no incomplete query counters", async () => {
        const userDatabase = fakeSupabase({ conversation: conversation() });
        const serviceDatabase = fakeSupabase();
        mocks.createClient.mockResolvedValue(userDatabase);
        mocks.createServiceClient.mockReturnValue(serviceDatabase);
        mocks.generate.mockResolvedValue({
            status: "empty_output",
            message: "Current web information is temporarily unavailable. Please try again.",
            diagnostics: generationDiagnostics(),
            toolUsage: {
                functionCalls: 1,
                externalToolCalls: 1,
                placeResults: 0,
                webSearchOperations: 0,
                webSearchQueries: 0,
            },
        });

        const response = await POST(
            messageRequest(CONVERSATION_A, "What current events are on?"),
            routeContext()
        );
        const payload = await response.json();
        expect(response.status).toBe(502);
        expect(payload.usage).toEqual({ limit: 50, used: 0, remaining: 50 });
        expect(serviceDatabase.writes).toContainEqual(
            expect.objectContaining({
                table: "ai_usage_events",
                operation: "update",
                payload: expect.objectContaining({
                    outcome: "failed",
                    google_search_operations: 0,
                    google_search_queries: 0,
                }),
            })
        );
    });

    it.each([
        ["timeout", 504, "gemini_timeout"],
        ["rate_limited", 429, "gemini_rate_limited"],
        ["service_failure", 502, "gemini_service_failure"],
        ["empty_output", 502, "gemini_empty_output"],
        ["aborted", 499, "request_aborted"],
    ] as const)(
        "records a failed usage outcome for a %s provider result",
        async (status, expectedStatus, expectedCode) => {
            const userDatabase = fakeSupabase({ conversation: conversation() });
            const serviceDatabase = fakeSupabase();
            mocks.createClient.mockResolvedValue(userDatabase);
            mocks.createServiceClient.mockReturnValue(serviceDatabase);
            mocks.generate.mockResolvedValue({
                status,
                message: "The assistant could not complete this request",
                diagnostics: generationDiagnostics({
                    providerStatus: status === "service_failure" ? 400 : null,
                    providerCode:
                        status === "service_failure" ? "INVALID_ARGUMENT" : null,
                    providerMessage:
                        status === "service_failure"
                            ? "Invalid JSON payload received"
                            : null,
                    finishReason: status === "empty_output" ? "STOP" : null,
                }),
                toolUsage: {
                    functionCalls: 0,
                    externalToolCalls: 0,
                    placeResults: 0,
                },
            });

            const response = await POST(messageRequest(), routeContext());
            expect(response.status).toBe(expectedStatus);
            const payload = await response.json();
            expect(payload).toMatchObject({
                code: expectedCode,
                userMessage: { status: "failed" },
                usage: { limit: 50, used: 0, remaining: 50 },
            });
            expect(JSON.stringify(payload)).not.toContain("INVALID_ARGUMENT");
            expect(
                userDatabase.writes.filter(
                    (write) =>
                        write.table === "ai_messages" &&
                        (write.payload as { role?: string })?.role === "assistant"
                )
            ).toHaveLength(0);
            expect(serviceDatabase.writes).toContainEqual(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        outcome: "failed",
                        error_code: expectedCode,
                    }),
                })
            );
        }
    );
});
