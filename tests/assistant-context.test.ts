import { describe, expect, it, vi } from "vitest";
import { loadTripAssistantContext } from "@/lib/ai/trip-context";

const TRIP_A = "20000000-0000-4000-8000-000000000001";
const TRIP_B = "20000000-0000-4000-8000-000000000002";
const USER_A = "10000000-0000-4000-8000-000000000001";

function contextDatabase() {
    const selects: Array<{ table: string; fields: string; filters: Record<string, unknown> }> = [];
    const rows: Record<string, Array<Record<string, unknown>>> = {
        trips: [
            {
                id: TRIP_A,
                title: "Selected trip",
                notes: "A saved trip description",
                destination: "Japan",
                start_date: "2026-09-01",
                end_date: "2026-09-08",
                user_id: USER_A,
            },
            { id: TRIP_B, title: "Other user's secret trip", destination: "Secret" },
        ],
        trip_legs: [
            { trip_id: TRIP_A, name: "Tokyo", start_date: "2026-09-01" },
            { trip_id: TRIP_B, name: "Cross-trip leg" },
        ],
        itinerary_items: [
            {
                trip_id: TRIP_A,
                title: "TeamLab",
                item_date: "2026-09-03",
                start_time: "10:00:00",
                timezone: "Asia/Tokyo",
                reservation_code: "SECRET-CODE",
                notes: "private item note",
            },
            { trip_id: TRIP_B, title: "Cross-trip itinerary item" },
        ],
        transportation_items: [],
        trip_accommodations: [
            {
                trip_id: TRIP_A,
                hotel_name: "Tokyo Hotel",
                status: "booked",
                check_in_date: "2026-09-01",
                check_out_date: "2026-09-04",
                latitude: 1,
                longitude: 2,
            },
        ],
        trip_ideas: [
            {
                trip_id: TRIP_A,
                title: "Museum idea",
                description: "Optional saved idea",
                category: "museum",
                estimated_cost: 20,
                currency: "JPY",
                is_archived: false,
                created_by: USER_A,
            },
        ],
        trip_food_items: [],
        trip_members: [
            {
                trip_id: TRIP_A,
                user_id: USER_A,
                role: "owner",
                status: "active",
            },
        ],
        trip_budgets: [
            {
                trip_id: TRIP_A,
                name: "Main budget",
                reporting_currency: "CAD",
                total_budget_amount: 5000,
                is_active: true,
            },
        ],
        trip_budget_line_items: [
            {
                trip_id: TRIP_A,
                name: "Hotels",
                linked_expense_category: "accommodation",
                planned_amount: 1200,
                currency: "CAD",
                notes: "private budget note",
            },
        ],
        trip_expenses: [
            {
                trip_id: TRIP_A,
                description: "Hotel deposit",
                category: "accommodation",
                amount: 400,
                currency: "CAD",
                expense_date: "2026-07-01",
                deleted_at: null,
                paid_by_user_id: USER_A,
            },
        ],
        user_preferences: [
            {
                user_id: USER_A,
                clock_format: "24h",
                default_time_zone: "America/St_Johns",
                theme_mode: "secret-ui-setting",
            },
        ],
        connected_public_user_profiles: [
            {
                id: USER_A,
                first_name: "Dill",
                last_name: "Traveler",
                email: "private@example.com",
            },
        ],
    };

    function from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
            select(fields: string) {
                selects.push({ table, fields, filters });
                return builder;
            },
            eq(field: string, value: unknown) {
                filters[field] = value;
                return builder;
            },
            is(field: string, value: unknown) {
                filters[field] = value;
                return builder;
            },
            in(field: string, value: unknown[]) {
                filters[field] = value;
                return builder;
            },
            order() {
                return builder;
            },
            limit() {
                return builder;
            },
            async single() {
                const data = (rows[table] || []).find((row) =>
                    Object.entries(filters).every(([field, value]) => row[field] === value)
                );
                return { data: data || null, error: data ? null : { message: "not found" } };
            },
            async maybeSingle() {
                const data = filteredRows()[0] || null;
                return { data, error: null };
            },
            then(resolve: (value: unknown) => void) {
                return Promise.resolve({ data: filteredRows(), error: null }).then(resolve);
            },
        };

        function filteredRows() {
            return (rows[table] || []).filter((row) =>
                Object.entries(filters).every(([field, value]) => {
                    if (Array.isArray(value)) return value.includes(row[field]);
                    return row[field] === value;
                })
            );
        }

        return builder;
    }

    return {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_A } } })) },
        from,
        selects,
    };
}

describe("secure trip context loader", () => {
    it("includes selected-trip data while excluding cross-trip and sensitive fields", async () => {
        const database = contextDatabase();
        const context = await loadTripAssistantContext(
            database as never,
            TRIP_A,
            new Date("2026-07-18T12:00:00Z")
        );
        const serialized = JSON.stringify(context);

        expect(context.current_date_utc).toBe("2026-07-18");
        expect(context.trip).toMatchObject({
            title: "Selected trip",
            description: "A saved trip description",
            destination: "Japan",
        });
        expect(context.itinerary_plans).toEqual([
            expect.objectContaining({ title: "TeamLab", timezone: "Asia/Tokyo" }),
        ]);
        expect(context.accommodations).toEqual([
            expect.objectContaining({ hotel_name: "Tokyo Hotel", status: "booked" }),
        ]);
        expect(context.budget_summary).toEqual([
            expect.objectContaining({ total_budget_amount: 5000 }),
        ]);
        expect(context.expenses).toEqual([
            expect.objectContaining({ description: "Hotel deposit", amount: 400 }),
        ]);
        expect(context.travel_preferences).toEqual({
            clock_format: "24h",
            default_time_zone: "America/St_Johns",
        });
        expect(context.travelers).toEqual([
            expect.objectContaining({ display_name: "Dill Traveler" }),
        ]);
        expect(context.food_ideas).toBeUndefined();
        expect(context.transportation).toBeUndefined();

        for (const excluded of [
            "Other user's secret trip",
            "Cross-trip leg",
            "Cross-trip itinerary item",
            "SECRET-CODE",
            "private item note",
            "private budget note",
            "private@example.com",
            "paid_by_user_id",
            "secret-ui-setting",
            USER_A,
            TRIP_A,
        ]) {
            expect(serialized).not.toContain(excluded);
        }

        expect(
            database.selects
                .filter(({ table }) => table !== "trips")
                .every(({ filters }) =>
                    "trip_id" in filters || "user_id" in filters || "id" in filters
                )
        ).toBe(true);
        expect(selectedFields(database.selects)).not.toContain("reservation_code");
        expect(selectedFields(database.selects)).not.toContain("paid_by_user_id");
    });

    it("authenticates before issuing the selected-trip query", async () => {
        const database = contextDatabase();
        await loadTripAssistantContext(database as never, TRIP_A);
        expect(database.auth.getUser).toHaveBeenCalledOnce();
        expect(database.selects[0]?.table).toBe("trips");
    });
});

function selectedFields(
    selects: Array<{ table: string; fields: string; filters: Record<string, unknown> }>
) {
    return selects.map(({ fields }) => fields).join(",");
}
