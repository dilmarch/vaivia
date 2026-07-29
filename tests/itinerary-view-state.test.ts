import { describe, expect, it } from "vitest";
import {
    buildItineraryViewUrl,
    isItineraryCalendarPath,
    isItineraryDateKey,
    isItineraryView,
} from "@/lib/itineraryViewState";

describe("itinerary view state", () => {
    it("recognizes supported views and real local date keys", () => {
        expect(isItineraryView("list")).toBe(true);
        expect(isItineraryView("day")).toBe(true);
        expect(isItineraryView("week")).toBe(true);
        expect(isItineraryView("month")).toBe(true);
        expect(isItineraryView("year")).toBe(false);

        expect(isItineraryDateKey("2026-07-28")).toBe(true);
        expect(isItineraryDateKey("2026-02-30")).toBe(false);
        expect(isItineraryDateKey("July 28")).toBe(false);
    });

    it("limits in-place saves to the itinerary calendar route", () => {
        expect(isItineraryCalendarPath("/trips/trip-a/itinerary")).toBe(true);
        expect(isItineraryCalendarPath("/trips/trip-a/itinerary/")).toBe(true);
        expect(
            isItineraryCalendarPath("/trips/trip-a/itinerary/item-a/edit")
        ).toBe(false);
        expect(isItineraryCalendarPath("/trips/trip-a")).toBe(false);
    });

    it("adds the active view and date while preserving other itinerary state", () => {
        expect(
            buildItineraryViewUrl(
                "https://example.com/trips/trip-a/itinerary?add=scheduled#calendar",
                "day",
                "2026-07-28"
            )
        ).toBe(
            "/trips/trip-a/itinerary?add=scheduled&view=day&date=2026-07-28#calendar"
        );
    });

    it("replaces stale view state without carrying an invalid date", () => {
        expect(
            buildItineraryViewUrl(
                "/trips/trip-a/itinerary?view=list&date=2026-07-01",
                "week",
                "invalid"
            )
        ).toBe("/trips/trip-a/itinerary?view=week");
    });
});
