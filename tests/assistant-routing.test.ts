import { describe, expect, it } from "vitest";
import {
    answerDirectTripQuestion,
    buildCompactAssistantHistory,
    classifyAssistantIntent,
    selectAssistantModelTier,
    selectTripContextSections,
} from "@/lib/ai/assistant-routing";

describe("assistant latency routing", () => {
    it("routes routine and complex requests semantically, never by length", () => {
        expect(classifyAssistantIntent("What are my trip dates?"))
            .toBe("direct_trip_dates");
        expect(classifyAssistantIntent("Find restaurants near my hotel"))
            .toBe("places_search");
        expect(classifyAssistantIntent("Build a complete day-by-day itinerary balancing budget and pace"))
            .toBe("complex_planning");
        expect(selectAssistantModelTier("complex_planning")).toBe("strong");
        expect(
            selectAssistantModelTier(
                classifyAssistantIntent(`Hello ${"please ".repeat(500)}`)
            )
        ).toBe("fast");
    });

    it("loads only intent-relevant trip sections", () => {
        expect(selectTripContextSections("direct_trip_dates", "trip dates"))
            .toEqual([]);
        expect(selectTripContextSections("direct_budget", "current budget"))
            .toEqual(["budget"]);
        expect(selectTripContextSections("places_search", "cafes near my hotel"))
            .toEqual(["legs", "itinerary", "transportation", "stays"]);
        expect(selectTripContextSections("stored_trip_context", "check my flight"))
            .toEqual(expect.arrayContaining(["stays", "transportation"]));
    });

    it("answers unambiguous stored facts without Gemini", () => {
        const base = {
            current_date_utc: "2026-08-05",
            trip: {
                title: "Japan",
                start_date: "2026-09-01",
                end_date: "2026-09-08",
            },
            context_notice: "allowlisted",
        };
        expect(answerDirectTripQuestion("direct_trip_dates", base))
            .toBe("Your saved trip dates are 2026-09-01 through 2026-09-08.");
        expect(answerDirectTripQuestion("general_travel_advice", base)).toBeNull();
    });

    it("bounds history while retaining recent turns and an older summary", () => {
        const rows = Array.from({ length: 20 }, (_, index) => ({
            role: index % 2 === 0 ? "assistant" : "user",
            content: `turn-${index}`,
        }));
        const contents = buildCompactAssistantHistory(rows);
        expect(contents).toHaveLength(9);
        expect(contents[0]?.parts?.[0]?.text).toContain("Earlier conversation summary");
        expect(contents.at(-1)?.parts?.[0]?.text).toBe("turn-0");
    });
});
