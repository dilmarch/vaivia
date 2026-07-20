import { describe, expect, it } from "vitest";
import { buildItineraryTimezoneHints } from "@/lib/itineraryTimezoneHints";

describe("itinerary timezone hints", () => {
    it("uses a scheduled item's timezone for every date it spans", () => {
        expect(
            buildItineraryTimezoneHints([
                {
                    item_date: "2026-09-02",
                    end_date: "2026-09-04",
                    category: "activity",
                    timezone: "America/Toronto",
                },
            ])
        ).toEqual({
            "2026-09-02": "America/Toronto",
            "2026-09-03": "America/Toronto",
            "2026-09-04": "America/Toronto",
        });
    });

    it("uses the arrival timezone when transportation arrives on that date", () => {
        expect(
            buildItineraryTimezoneHints([
                {
                    item_date: "2026-09-02",
                    end_date: "2026-09-02",
                    category: "transportation",
                    timezone: "America/St_Johns",
                    departure_timezone: "America/St_Johns",
                    arrival_timezone: "America/Toronto",
                },
            ])
        ).toEqual({ "2026-09-02": "America/Toronto" });
    });

    it("carries the last known timezone through the remaining trip dates", () => {
        expect(
            buildItineraryTimezoneHints(
                [
                    {
                        item_date: "2026-09-02",
                        end_date: "2026-09-02",
                        category: "transportation",
                        departure_timezone: "America/St_Johns",
                        arrival_timezone: "America/Toronto",
                    },
                ],
                "2026-09-05"
            )
        ).toEqual({
            "2026-09-02": "America/Toronto",
            "2026-09-03": "America/Toronto",
            "2026-09-04": "America/Toronto",
            "2026-09-05": "America/Toronto",
        });
    });

    it("prefers an explicit scheduled-item timezone over transportation", () => {
        expect(
            buildItineraryTimezoneHints([
                {
                    item_date: "2026-09-02",
                    category: "transportation",
                    departure_timezone: "America/St_Johns",
                },
                {
                    item_date: "2026-09-02",
                    category: "activity",
                    timezone: "America/Toronto",
                },
            ])
        ).toEqual({ "2026-09-02": "America/Toronto" });
    });
});
