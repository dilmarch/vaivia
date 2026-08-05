import { describe, expect, it } from "vitest";
import {
    MS_PER_HOUR,
    getCountdownDisplay,
} from "@/lib/countdownDisplay";
import { getAirlineCheckInUrl } from "@/lib/flightCheckIn";
import { buildFlightDepartureBuffers } from "@/lib/flightDepartureBuffers";
import { getDefaultItineraryDateKey } from "@/lib/itineraryDefaults";
import { parseNotepadLocations, splitNotepadLines } from "@/lib/notepadEntries";
import { isTripVisibleOnDashboard } from "@/lib/tripDashboardVisibility";

describe("during-trip experience helpers", () => {
    it("shows the arrival message for one hour and then expires the countdown", () => {
        const target = new Date("2026-08-04T10:00:00.000Z");

        expect(getCountdownDisplay(target, "seconds", target)).toMatchObject({
            state: "arrived",
            value: "The moment has finally arrived!",
        });
        expect(
            getCountdownDisplay(
                target,
                "seconds",
                new Date(target.getTime() + MS_PER_HOUR - 1)
            ).state
        ).toBe("arrived");
        expect(
            getCountdownDisplay(
                target,
                "seconds",
                new Date(target.getTime() + MS_PER_HOUR)
            ).state
        ).toBe("expired");
    });

    it("defaults pre-trip to day one, during-trip to today, and post-trip to the end", () => {
        const base = { tripStartDate: "2026-08-10", tripEndDate: "2026-08-20" };
        expect(
            getDefaultItineraryDateKey({ ...base, todayKey: "2026-08-04" })
        ).toBe("2026-08-10");
        expect(
            getDefaultItineraryDateKey({ ...base, todayKey: "2026-08-14" })
        ).toBe("2026-08-14");
        expect(
            getDefaultItineraryDateKey({ ...base, todayKey: "2026-08-25" })
        ).toBe("2026-08-20");
        expect(
            getDefaultItineraryDateKey({
                ...base,
                todayKey: "2026-08-04",
                requestedDate: "2026-08-17",
            })
        ).toBe("2026-08-17");
    });

    it("creates a four-hour airport departure buffer, including across midnight", () => {
        const buffers = buildFlightDepartureBuffers([
            {
                id: "flight-1",
                title: "AC 801 to Lisbon",
                item_date: "2026-08-10",
                start_time: "02:30",
                source_table: "transportation_items",
                transportation_mode: "airplane",
                departure_timezone: "America/Toronto",
            },
        ]);

        expect(buffers).toHaveLength(1);
        expect(buffers[0]).toMatchObject({
            title: "Depart for airport",
            item_date: "2026-08-09",
            start_time: "22:30",
            end_date: "2026-08-10",
            end_time: "02:30",
            timezone: "America/Toronto",
            is_flight_departure_buffer: true,
        });
    });

    it("uses supported official airline check-in destinations and hides unknown ones", () => {
        expect(getAirlineCheckInUrl({ airlineCode: "AC" })).toContain(
            "aircanada.com"
        );
        expect(getAirlineCheckInUrl({ flightNumber: "UA123" })).toContain(
            "united.com"
        );
        expect(getAirlineCheckInUrl({ airlineName: "Unknown Air" })).toBeNull();
    });

    it("splits non-empty notepad lines and safely parses selected cities", () => {
        expect(splitNotepadLines("Old Port\r\n\n Karaoke \nVillage bar")).toEqual([
            "Old Port",
            "Karaoke",
            "Village bar",
        ]);
        expect(
            parseNotepadLocations(
                JSON.stringify([{ key: "trip-leg:a", label: "Lisbon" }])
            )
        ).toMatchObject([{ key: "trip-leg:a", label: "Lisbon" }]);
        expect(parseNotepadLocations("not-json")).toEqual([]);
    });

    it("removes a trip from the dashboard exactly five days after it ends", () => {
        expect(isTripVisibleOnDashboard("2026-08-01", "2026-08-05")).toBe(true);
        expect(isTripVisibleOnDashboard("2026-08-01", "2026-08-06")).toBe(false);
    });
});
