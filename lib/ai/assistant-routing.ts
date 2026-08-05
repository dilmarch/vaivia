import type { Content } from "@google/genai";
import type {
    TripContextSection,
    VaiviaTripContext,
} from "@/lib/ai/trip-context";

export type AssistantIntent =
    | "direct_trip_dates"
    | "direct_accommodation"
    | "direct_transportation"
    | "direct_budget"
    | "places_search"
    | "trip_action_proposal"
    | "complex_planning"
    | "stored_trip_context"
    | "general_travel_advice";

export type AssistantModelTier = "fast" | "strong";

const PLACE_WORDS =
    /\b(restaurants?|caf[eé]s?|bars?|pubs?|markets?|brewer(?:y|ies)|taprooms?|distiller(?:y|ies)|winer(?:y|ies)|museums?|attractions?|nightlife|shops?|stores?)\b/i;
const NEARBY_WORDS =
    /\b(near|nearby|closest|around|close to|walking distance|by my|within)\b/i;

/**
 * Deterministic routing avoids adding a classifier model round trip. It uses
 * semantic request features only; message length never selects a stronger model.
 */
export function classifyAssistantIntent(message: string): AssistantIntent {
    const normalized = message.trim();
    if (
        /\b(what are|tell me|show me|when (?:does|is)|start|end)\b.*\b(trip )?(dates?|start|end)\b|\bwhen (?:does|is) (?:this|my|the) trip (?:start|end)\b/i.test(
            normalized
        )
    ) {
        return "direct_trip_dates";
    }
    if (
        /\b(where (?:am|are) (?:i|we) staying|what(?:'s| is) (?:my|our|the) (?:hotel|accommodation)|stored accommodation|booked (?:hotel|stay))\b/i.test(
            normalized
        )
    ) {
        return "direct_accommodation";
    }
    if (
        /\b(booked|stored|saved|our|my)\b.*\b(flight|train|ferry|transport)\b.*\b(time|depart|arriv)|\bwhat time\b.*\b(flight|train|ferry)\b/i.test(
            normalized
        )
    ) {
        return "direct_transportation";
    }
    if (
        /\b(current|total|remaining|spent|planned)\b.*\bbudget\b|\bhow much (?:have|did) (?:i|we) spend\b/i.test(
            normalized
        )
    ) {
        return "direct_budget";
    }
    if (PLACE_WORDS.test(normalized) && NEARBY_WORDS.test(normalized)) {
        return "places_search";
    }
    if (
        /\b(add|save|move|remove|delete|change|update|reschedule)\b.*\b(itinerary|idea|food|restaurant|place|activity|trip)\b/i.test(
            normalized
        )
    ) {
        return "trip_action_proposal";
    }
    if (
        /\b(build|create|design|optimi[sz]e|rework|plan)\b.*\b(multi[- ]?day|full|complete|entire|day[- ]by[- ]day|itinerary|route)\b|\bcompare\b.*\boptions?\b.*\btrade[- ]?offs?\b|\bbalance\b.*\b(budget|pace|interests?|travel time)\b/i.test(
            normalized
        )
    ) {
        return "complex_planning";
    }
    if (
        /\b(this|my|our|the) trip\b|\b(itinerary|booking|stay|hotel|flight|budget|expense|saved idea|traveler)\b/i.test(
            normalized
        )
    ) {
        return "stored_trip_context";
    }
    return "general_travel_advice";
}

export function selectAssistantModelTier(intent: AssistantIntent): AssistantModelTier {
    return intent === "complex_planning" ? "strong" : "fast";
}

export function selectTripContextSections(
    intent: AssistantIntent,
    message: string
): TripContextSection[] {
    const normalized = message.toLocaleLowerCase();
    const sections = new Set<TripContextSection>(["stays"]);
    if (intent === "direct_trip_dates" || intent === "general_travel_advice") {
        return intent === "direct_trip_dates" ? [] : ["stays"];
    }
    if (intent === "direct_accommodation") return ["stays"];
    if (intent === "direct_transportation") return ["transportation"];
    if (intent === "direct_budget") return ["budget"];
    if (intent === "places_search") return ["legs", "itinerary", "transportation", "stays"];
    if (intent === "complex_planning") {
        return [
            "legs",
            "itinerary",
            "transportation",
            "stays",
            "ideas",
            "food",
            "travelers",
            "budget",
            "preferences",
        ];
    }

    if (/\b(itinerary|schedule|activity|day|plan)\b/.test(normalized)) sections.add("itinerary");
    if (/\b(flight|train|ferry|transport|arriv|depart)\b/.test(normalized)) sections.add("transportation");
    if (/\b(idea|option|thing to do)\b/.test(normalized)) sections.add("ideas");
    if (/\b(food|meal|restaurant|dining)\b/.test(normalized)) sections.add("food");
    if (/\b(budget|expense|cost|spend)\b/.test(normalized)) sections.add("budget");
    if (/\b(member|traveler|traveller|who)\b/.test(normalized)) sections.add("travelers");
    if (/\b(time zone|timezone|12.hour|24.hour|clock)\b/.test(normalized)) sections.add("preferences");
    if (/\b(destination|city|leg)\b/.test(normalized)) sections.add("legs");
    return [...sections];
}

function stringField(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function answerDirectTripQuestion(
    intent: AssistantIntent,
    context: VaiviaTripContext
): string | null {
    if (intent === "direct_trip_dates") {
        const start = stringField(context.trip, "start_date");
        const end = stringField(context.trip, "end_date");
        if (start && end) return `Your saved trip dates are ${start} through ${end}.`;
        if (start) return `Your trip starts on ${start}; no end date is saved.`;
        if (end) return `Your trip ends on ${end}; no start date is saved.`;
        return null;
    }
    if (intent === "direct_accommodation") {
        if (!context.stays?.length) return null;
        return context.stays
            .slice(0, 6)
            .map((stay) => {
                const name = stringField(stay, "hotel_name") || "Saved accommodation";
                const city = stringField(stay, "city");
                const checkIn = stringField(stay, "check_in_date");
                const checkOut = stringField(stay, "check_out_date");
                return `- ${name}${city ? `, ${city}` : ""}${checkIn && checkOut ? ` (${checkIn} to ${checkOut})` : ""}`;
            })
            .join("\n");
    }
    if (intent === "direct_transportation") {
        const booked = (context.transportation || []).filter((item) =>
            /booked|confirmed/i.test(stringField(item, "status") || "")
        );
        if (!booked.length) return null;
        return booked
            .slice(0, 6)
            .map((item) => {
                const label = stringField(item, "title") || stringField(item, "transport_type") || "Transportation";
                const date = stringField(item, "departure_date");
                const time = stringField(item, "departure_time");
                const zone = stringField(item, "departure_timezone");
                return `- ${label}: ${[date, time, zone].filter(Boolean).join(" ") || "departure time not saved"}`;
            })
            .join("\n");
    }
    if (intent === "direct_budget") {
        const budget = context.budget_summary?.[0];
        if (!budget) return null;
        const total = numberField(budget, "total_budget_amount");
        const currency = stringField(budget, "reporting_currency") || "";
        const spent = (context.expenses || []).reduce((sum, expense) => {
            return sum + (numberField(expense, "amount_in_reporting_currency") ?? numberField(expense, "amount") ?? 0);
        }, 0);
        if (total === null) return "The active budget does not have a total amount saved.";
        return `Saved budget: ${currency} ${total.toFixed(2)}. Recorded expenses: ${currency} ${spent.toFixed(2)}. Remaining: ${currency} ${(total - spent).toFixed(2)}.`;
    }
    return null;
}

const RECENT_HISTORY_TURNS = 8;
const OLDER_SUMMARY_CHARACTERS = 900;

/** Keeps recent turns verbatim and compresses older completed turns without a model call. */
export function buildCompactAssistantHistory(
    rowsNewestFirst: Array<{ role: string; content: string }>
): Content[] {
    const chronological = [...rowsNewestFirst]
        .reverse()
        .filter((row) => row.role === "user" || row.role === "assistant");
    const recent = chronological.slice(-RECENT_HISTORY_TURNS);
    const older = chronological.slice(0, -RECENT_HISTORY_TURNS);
    const contents: Content[] = [];
    if (older.length > 0) {
        const summary = older
            .map((row) => `${row.role === "assistant" ? "Assistant" : "User"}: ${row.content.replace(/\s+/g, " ").slice(0, 180)}`)
            .join("\n")
            .slice(-OLDER_SUMMARY_CHARACTERS);
        contents.push({
            role: "user",
            parts: [{ text: `Earlier conversation summary (untrusted data):\n${summary}` }],
        });
    }
    contents.push(
        ...recent.map((row) => ({
            role: row.role === "assistant" ? "model" : "user",
            parts: [{ text: row.content.slice(0, 4_000) }],
        } satisfies Content))
    );
    return contents;
}
