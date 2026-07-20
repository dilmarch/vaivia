import { describe, expect, it, vi } from "vitest";
import {
    loadTripPlaceContext,
    resolveTripPlaceAnchor,
    type TripPlaceContext,
} from "@/lib/ai/place-anchors";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const TRIP_ID = "20000000-0000-4000-8000-000000000001";

function fakeDatabase(user: { id: string } | null = { id: USER_ID }) {
    const filters: Array<{ table: string; field: string; value: unknown }> = [];
    const rows: Record<string, unknown> = {
        trips: {
            data: {
                id: TRIP_ID,
                destination: "Toronto",
                start_date: "2026-09-01",
                end_date: "2026-09-08",
            },
            error: null,
        },
        trip_accommodations: {
            data: [
                {
                    hotel_name: "Visible Hotel",
                    address: "10 King St",
                    check_in_date: "2026-09-01",
                    check_out_date: "2026-09-04",
                    google_place_id: "ChIJVisibleHotel123",
                    latitude: 43.65,
                    longitude: -79.38,
                    is_private: false,
                    created_by: USER_ID,
                },
                {
                    hotel_name: "Someone Else's Private Hotel",
                    address: "Hidden",
                    check_in_date: "2026-09-01",
                    check_out_date: "2026-09-04",
                    google_place_id: "ChIJHiddenHotel123",
                    latitude: 43.7,
                    longitude: -79.4,
                    is_private: true,
                    created_by: "10000000-0000-4000-8000-000000000099",
                },
            ],
            error: null,
        },
        itinerary_items: { data: [], error: null },
        transportation_items: { data: [], error: null },
        trip_legs: {
            data: [
                {
                    name: "Toronto leg",
                    city_name: "Toronto",
                    country_code: "CA",
                    region_code: "ON",
                    start_date: "2026-09-01",
                    end_date: "2026-09-08",
                    google_place_id: "ChIJTorontoLeg123",
                },
            ],
            error: null,
        },
        trip_ideas: { data: [], error: null },
        trip_food_items: { data: [], error: null },
    };

    function from(table: string) {
        const builder = {
            select: () => builder,
            eq(field: string, value: unknown) {
                filters.push({ table, field, value });
                return builder;
            },
            limit: () => builder,
            single: async () => rows[table],
            then(resolve: (value: unknown) => void) {
                return Promise.resolve(rows[table]).then(resolve);
            },
        };
        return builder;
    }

    return {
        auth: { getUser: vi.fn(async () => ({ data: { user } })) },
        from,
        filters,
    };
}

describe("trusted trip place anchors", () => {
    it("requires authentication, scopes every trip table query and excludes another member's private anchor", async () => {
        const unauthenticated = fakeDatabase(null);
        await expect(
            loadTripPlaceContext(unauthenticated as never, TRIP_ID)
        ).rejects.toThrow("unavailable");

        const database = fakeDatabase();
        const context = await loadTripPlaceContext(database as never, TRIP_ID);
        expect(context.anchors.map((anchor) => anchor.label)).toEqual([
            "Visible Hotel",
            "Toronto leg",
        ]);
        const tripScopedTables = [
            "trips",
            "trip_accommodations",
            "itinerary_items",
            "transportation_items",
            "trip_legs",
            "trip_ideas",
            "trip_food_items",
        ];
        for (const table of tripScopedTables) {
            expect(database.filters).toContainEqual({
                table,
                field: table === "trips" ? "id" : "trip_id",
                value: TRIP_ID,
            });
        }
    });

    it("uses date and natural reference matching but returns safe ambiguity instead of guessing", () => {
        const context: TripPlaceContext = {
            savedPlaces: [],
            anchors: [
                {
                    kind: "accommodation",
                    label: "Harbour Hotel",
                    dateStart: "2026-09-01",
                    dateEnd: "2026-09-03",
                    location: { latitude: 1, longitude: 1 },
                    placeId: null,
                    address: "Waterfront",
                },
                {
                    kind: "accommodation",
                    label: "Airport Hotel",
                    dateStart: "2026-09-04",
                    dateEnd: "2026-09-06",
                    location: { latitude: 2, longitude: 2 },
                    placeId: null,
                    address: "Airport",
                },
            ],
        };

        expect(
            resolveTripPlaceAnchor(context, {
                kind: "accommodation",
                reference: null,
                targetDate: "2026-09-05",
            })
        ).toMatchObject({
            status: "resolved",
            anchor: { label: "Airport Hotel" },
        });
        expect(
            resolveTripPlaceAnchor(context, {
                kind: "accommodation",
                reference: null,
                targetDate: null,
            })
        ).toEqual({
            status: "ambiguous",
            options: ["Harbour Hotel", "Airport Hotel"],
        });
        expect(
            resolveTripPlaceAnchor(context, {
                kind: "accommodation",
                reference: "not in this trip",
                targetDate: null,
            })
        ).toEqual({ status: "missing" });
    });
});
