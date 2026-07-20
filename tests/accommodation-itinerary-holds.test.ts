import { describe, expect, it } from "vitest";
import { buildAccommodationItineraryHolds } from "@/lib/accommodationItineraryHolds";
import {
    getDisplayEventRange,
    type CalendarAccommodation,
    type ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";

function accommodation(
    overrides: Partial<CalendarAccommodation> = {}
): CalendarAccommodation {
    return {
        id: "stay-1",
        hotel_name: "The Annex Hotel",
        check_in_date: "2026-09-02",
        check_out_date: "2026-09-06",
        status: "booked",
        ...overrides,
    };
}

function flightArrival(
    arrivalTime: string,
    overrides: Partial<ItineraryCalendarItem> = {}
): ItineraryCalendarItem {
    return {
        id: `flight-${arrivalTime}`,
        title: "Flight to Toronto",
        item_date: "2026-09-02",
        end_date: "2026-09-02",
        start_time: "08:00",
        end_time: arrivalTime,
        category: "transportation",
        status: "confirmed",
        transportation_mode: "airplane",
        source_table: "transportation_items",
        ...overrides,
    };
}

describe("stay itinerary holds", () => {
    it("omits holds when the corresponding stay times are blank", () => {
        expect(
            buildAccommodationItineraryHolds({
                accommodations: [accommodation()],
                items: [],
            })
        ).toEqual([]);
    });

    it("creates two-hour check-in and checkout holds from the stated times", () => {
        const holds = buildAccommodationItineraryHolds({
            accommodations: [
                accommodation({
                    address: "296 Brunswick Ave, Toronto",
                    google_place_id: "place-123",
                    google_maps_url: "https://maps.google.com/example",
                    check_in_time_start: "15:00:00",
                    check_out_time: "11:00:00",
                }),
            ],
            items: [],
            timezoneByAccommodationId: {
                "stay-1": "America/Toronto",
            },
        });

        expect(holds).toMatchObject([
            {
                id: "accommodation-hold:stay-1:check_in",
                title: "Check in to The Annex Hotel",
                item_date: "2026-09-02",
                start_time: "15:00",
                end_time: "17:00",
                timezone: "America/Toronto",
                location: "296 Brunswick Ave, Toronto",
                formatted_address: "296 Brunswick Ave, Toronto",
                google_place_id: "place-123",
                location_website: "https://maps.google.com/example",
                accommodation_hold_kind: "check_in",
            },
            {
                id: "accommodation-hold:stay-1:check_out",
                title: "Check out of The Annex Hotel",
                item_date: "2026-09-06",
                start_time: "09:00",
                end_time: "11:00",
                timezone: "America/Toronto",
                accommodation_hold_kind: "check_out",
            },
        ]);
    });

    it("converts hotel-local hold times when the itinerary timezone changes", () => {
        const [checkInHold, checkOutHold] = buildAccommodationItineraryHolds({
            accommodations: [
                accommodation({
                    check_in_time_start: "15:00",
                    check_out_time: "11:00",
                }),
            ],
            items: [],
            timezoneByAccommodationId: {
                "stay-1": "America/Toronto",
            },
        });

        expect(
            getDisplayEventRange(checkInHold, "America/Vancouver")
        ).toMatchObject({
            startDateKey: "2026-09-02",
            endDateKey: "2026-09-02",
            startMinutes: 12 * 60,
            endMinutes: 14 * 60,
        });
        expect(
            getDisplayEventRange(checkOutHold, "America/Vancouver")
        ).toMatchObject({
            startDateKey: "2026-09-06",
            endDateKey: "2026-09-06",
            startMinutes: 6 * 60,
            endMinutes: 8 * 60,
        });
    });

    it("provides a Maps search even when only the stay name is available", () => {
        const [hold] = buildAccommodationItineraryHolds({
            accommodations: [
                accommodation({ check_in_time_start: "15:00" }),
            ],
            items: [],
        });

        expect(hold.location_website).toContain(
            "https://www.google.com/maps/search/"
        );
        expect(hold.location_website).toContain("The+Annex+Hotel");
    });

    it.each([
        ["19:00", "16:00", "20:00", "22:00"],
        ["10:00", "15:00", "15:00", "17:00"],
        ["15:30", "16:00", "16:30", "18:30"],
        ["14:00", "15:00", "15:00", "17:00"],
    ])(
        "uses the arrival buffer for a %s arrival and %s stated check-in",
        (arrivalTime, checkInTime, expectedStart, expectedEnd) => {
            const [hold] = buildAccommodationItineraryHolds({
                accommodations: [
                    accommodation({ check_in_time_start: checkInTime }),
                ],
                items: [flightArrival(arrivalTime)],
            });

            expect(hold).toMatchObject({
                start_time: expectedStart,
                end_time: expectedEnd,
            });
        }
    );

    it("uses the latest same-day transportation arrival and ignores cancelled arrivals", () => {
        const [hold] = buildAccommodationItineraryHolds({
            accommodations: [accommodation({ check_in_time_start: "16:00" })],
            items: [
                flightArrival("15:30"),
                flightArrival("18:00", { id: "late-cancelled", status: "cancelled" }),
                flightArrival("17:15", {
                    id: "train-arrival",
                    transportation_mode: "train",
                }),
                flightArrival("21:00", {
                    id: "wrong-day",
                    end_date: "2026-09-03",
                }),
            ],
        });

        expect(hold).toMatchObject({ start_time: "18:15", end_time: "20:15" });
    });

    it("keeps overnight check-in and checkout holds on the correct dates", () => {
        const holds = buildAccommodationItineraryHolds({
            accommodations: [
                accommodation({
                    check_in_time_start: "23:00",
                    check_out_time: "01:00",
                }),
            ],
            items: [flightArrival("23:30")],
        });

        expect(holds).toMatchObject([
            {
                item_date: "2026-09-03",
                end_date: null,
                start_time: "00:30",
                end_time: "02:30",
            },
            {
                item_date: "2026-09-05",
                end_date: "2026-09-06",
                start_time: "23:00",
                end_time: "01:00",
            },
        ]);
    });

    it("does not create holds for cancelled stays", () => {
        expect(
            buildAccommodationItineraryHolds({
                accommodations: [
                    accommodation({
                        status: "cancelled",
                        check_in_time_start: "15:00",
                        check_out_time: "11:00",
                    }),
                ],
                items: [],
            })
        ).toEqual([]);
    });
});
