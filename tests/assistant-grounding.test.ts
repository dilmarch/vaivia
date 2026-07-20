import { describe, expect, it } from "vitest";
import {
    ASSISTANT_MAX_GROUNDING_SOURCES,
    parseAssistantWebGrounding,
} from "@/lib/ai/grounding-contract";
import {
    GROUNDED_RESPONSE_REFRESH_PLACEHOLDER,
    parseCurrentWebArguments,
    selectAssistantRetrieval,
} from "@/lib/ai/current-web-grounding";

const answer = "Pride programming runs from June 25–28.";
const answerBytes = new TextEncoder().encode(answer).length;

function metadata(overrides: Record<string, unknown> = {}) {
    return {
        webSearchQueries: ["provider query must remain ephemeral"],
        searchEntryPoint: {
            renderedContent: '<div class="search">Search suggestions</div>',
        },
        groundingChunks: [
            {
                web: {
                    uri: "https://example.org/pride",
                    title: "Official Pride programme",
                },
            },
        ],
        groundingSupports: [
            {
                segment: { startIndex: 0, endIndex: answerBytes, partIndex: 0 },
                groundingChunkIndices: [0],
            },
        ],
        ...overrides,
    };
}

describe("Google Search grounding boundary", () => {
    const exactSmokePrompt =
        "Use current web sources to find LGBTQ+ events, food festivals or tours, and beer, wine, or spirits experiences happening during my saved trip dates. Cite each time-sensitive claim.";
    const tripContext = {
        current_date_utc: "2026-07-19",
        trip: {
            title: "Toronto",
            destination: "Toronto",
            start_date: "2026-09-02",
            end_date: "2026-09-05",
        },
        context_notice: "allowlisted",
    };

    it("server-routes the exact smoke prompt to one bounded current-web request", () => {
        const decision = selectAssistantRetrieval({
            contents: [{ role: "user", parts: [{ text: exactSmokePrompt }] }],
            context: tripContext,
        });
        expect(decision).toMatchObject({
            mode: "current_web",
            isGroundedFollowUp: false,
            call: {
                name: "search_current_web",
                args: {
                    question: exactSmokePrompt,
                    topic: "events",
                    location: "Toronto",
                    start_date: "2026-09-02",
                    end_date: "2026-09-05",
                },
            },
        });
    });

    it("rebuilds a grounded follow-up from the original request and latest question", () => {
        const followUp = "Which of these are on Friday or Saturday night?";
        const decision = selectAssistantRetrieval({
            contents: [
                { role: "user", parts: [{ text: exactSmokePrompt }] },
                {
                    role: "model",
                    parts: [{ text: GROUNDED_RESPONSE_REFRESH_PLACEHOLDER }],
                },
                { role: "user", parts: [{ text: followUp }] },
            ],
            context: tripContext,
        });
        expect(decision).toMatchObject({
            mode: "current_web",
            isGroundedFollowUp: true,
            call: {
                args: {
                    question: `${exactSmokePrompt} Follow-up: ${followUp}`,
                },
            },
        });
    });

    it.each([
        ["Find restaurants near my hotel.", "places"],
        ["Find breweries within walking distance of my accommodation.", "places"],
        ["Find beer festivals happening during my trip dates.", "current_web"],
        [
            "Use current web sources to find restaurant events during my trip.",
            "current_web",
        ],
        ["Summarize this trip.", "none"],
    ] as const)("routes %s to %s", (prompt, expectedMode) => {
        const decision = selectAssistantRetrieval({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            context: tripContext,
        });
        expect(decision.mode).toBe(expectedMode);
    });

    it("returns bounded ephemeral sources, supports, suggestions and a numeric query count", () => {
        expect(parseAssistantWebGrounding(answer, metadata())).toEqual({
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
                    endIndex: answerBytes,
                    sourceIds: ["source-1"],
                },
            ],
            searchEntryPointHtml: '<div class="search">Search suggestions</div>',
            queryCount: 1,
        });
    });

    it("permits only HTTP(S), deduplicates sources and enforces source bounds", () => {
        const chunks = Array.from(
            { length: ASSISTANT_MAX_GROUNDING_SOURCES + 5 },
            (_, index) => ({
                web: {
                    uri:
                        index === 0
                            ? "javascript:alert(1)"
                            : `https://example.org/source-${index}`,
                    title: `<img onerror=alert(${index})>`,
                },
            })
        );
        const parsed = parseAssistantWebGrounding(
            answer,
            metadata({
                groundingChunks: chunks,
                groundingSupports: [
                    {
                        segment: { startIndex: 0, endIndex: answerBytes },
                        groundingChunkIndices: [0, 1, 1, 19, 24],
                    },
                ],
            })
        );
        expect(parsed?.sources).toHaveLength(19);
        expect(parsed?.supports[0]?.sourceIds).toEqual(["source-1", "source-19"]);
        expect(parsed?.sources.every((source) => /^https?:/.test(source.url))).toBe(true);
    });

    it("rejects missing suggestions, missing supports, invalid ranges and excess queries", () => {
        expect(
            parseAssistantWebGrounding(
                answer,
                metadata({ searchEntryPoint: undefined })
            )
        ).toBeNull();
        expect(
            parseAssistantWebGrounding(answer, metadata({ groundingSupports: [] }))
        ).toBeNull();
        expect(
            parseAssistantWebGrounding(
                answer,
                metadata({
                    groundingSupports: [
                        {
                            segment: { startIndex: 0, endIndex: answerBytes + 1 },
                            groundingChunkIndices: [0],
                        },
                    ],
                })
            )
        ).toBeNull();
        expect(
            parseAssistantWebGrounding(
                answer,
                metadata({ webSearchQueries: Array.from({ length: 21 }, () => "q") })
            )
        ).toBeNull();
    });

    it("validates minimum web arguments and rejects URLs, coordinates and invalid dates", () => {
        expect(
            parseCurrentWebArguments({
                question: "What Pride events are happening during our trip?",
                topic: "lgbtq_events",
                location: "Toronto",
                start_date: "2026-06-25",
                end_date: "2026-06-28",
            })
        ).toMatchObject({ topic: "lgbtq_events", location: "Toronto" });
        expect(
            parseCurrentWebArguments({
                question: "Fetch https://example.org",
                topic: "events",
            })
        ).toBeNull();
        expect(
            parseCurrentWebArguments({
                question: "Events here",
                topic: "events",
                location: "43.6532,-79.3832",
            })
        ).toBeNull();
        expect(
            parseCurrentWebArguments({
                question: "Events here",
                topic: "events",
                start_date: "2026-02-30",
            })
        ).toBeNull();
    });
});
