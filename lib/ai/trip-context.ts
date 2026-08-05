import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

const MAX_CONTEXT_ROWS_PER_SECTION = 40;
const MAX_CONTEXT_STRING_LENGTH = 500;

/** Fields that may leave VAIVIA and be included in the assistant context. */
export const TRIP_CONTEXT_FIELD_ALLOWLISTS = {
    trips: ["title", "description", "destination", "start_date", "end_date"],
    trip_legs: [
        "name",
        "city_name",
        "country_code",
        "region_code",
        "leg_type",
        "start_date",
        "end_date",
    ],
    itinerary_items: [
        "title",
        "category",
        "status",
        "item_date",
        "end_date",
        "start_time",
        "end_time",
        "timezone",
        "location",
        "formatted_address",
    ],
    transportation_items: [
        "title",
        "transport_type",
        "status",
        "provider_name",
        "provider_code",
        "transport_number",
        "departure_date",
        "departure_time",
        "departure_timezone",
        "departure_location",
        "departure_formatted_address",
        "departure_terminal",
        "departure_gate",
        "departure_platform",
        "arrival_date",
        "arrival_time",
        "arrival_timezone",
        "arrival_location",
        "arrival_formatted_address",
        "arrival_terminal",
        "arrival_gate",
        "arrival_platform",
        "pickup_location",
        "pickup_formatted_address",
        "dropoff_location",
        "dropoff_formatted_address",
    ],
    trip_accommodations: [
        "hotel_name",
        "accommodation_type",
        "status",
        "address",
        "city",
        "region",
        "country",
        "check_in_date",
        "check_in_time_start",
        "check_in_time_end",
        "check_out_date",
        "check_out_time",
        "free_cancellation_ends_on",
    ],
    trip_ideas: [
        "title",
        "description",
        "category",
        "location",
        "formatted_address",
        "location_city",
        "location_region",
        "location_country",
        "days_of_week",
        "availability_start_date",
        "availability_end_date",
        "time_of_day",
        "timezone",
        "opens_at",
        "closes_at",
        "is_24_hours",
        "estimated_cost",
        "currency",
        "ticket_policy",
        "age_policy",
        "dress_code",
        "tags",
    ],
    trip_food_items: [
        "item_type",
        "name",
        "description",
        "region",
        "formatted_address",
        "business_status",
        "meal_categories",
        "place_types",
        "primary_place_type",
    ],
    trip_members: [
        "display_name",
        "role",
        "confirmed_start_date",
        "confirmed_end_date",
        "personal_start_date",
        "personal_end_date",
    ],
    trip_budgets: ["name", "reporting_currency", "total_budget_amount"],
    trip_budget_line_items: [
        "name",
        "linked_expense_category",
        "planned_amount",
        "currency",
    ],
    trip_expenses: [
        "description",
        "category",
        "amount",
        "currency",
        "amount_in_reporting_currency",
        "reporting_currency",
        "expense_date",
        "transaction_date",
        "source_type",
    ],
    user_preferences: ["clock_format", "default_time_zone"],
} as const;

/** Explicitly excluded even when a source table contains these values. */
export const SENSITIVE_TRIP_CONTEXT_EXCLUSIONS = [
    "authentication data, passwords, session data, service credentials and API keys",
    "email addresses, phone numbers, usernames, authentication IDs and database IDs",
    "passport, identity-document and biometric information",
    "reservation codes, confirmation numbers, seat numbers and imported email contents",
    "payment methods, payer identities, split allocations, receipts and billing metadata",
    "private notes, personal food notes and archived or deleted records",
    "booking, ticket, website, social-media and storage URLs",
    "precise latitude/longitude, Google place IDs and raw provider metadata",
    "unrelated profiles, creator IDs, invitation IDs, audit timestamps and internal sort keys",
] as const;

export type VaiviaTripContext = {
    current_date_utc: string;
    trip: Record<string, unknown>;
    legs?: Record<string, unknown>[];
    travelers?: Record<string, unknown>[];
    itinerary_plans?: Record<string, unknown>[];
    transportation?: Record<string, unknown>[];
    stays?: Record<string, unknown>[];
    saved_ideas?: Record<string, unknown>[];
    food_ideas?: Record<string, unknown>[];
    budget_summary?: Record<string, unknown>[];
    budget_plan?: Record<string, unknown>[];
    expenses?: Record<string, unknown>[];
    travel_preferences?: Record<string, unknown>;
    context_notice: string;
};

export type TripContextSection =
    | "legs"
    | "itinerary"
    | "transportation"
    | "stays"
    | "ideas"
    | "food"
    | "travelers"
    | "budget"
    | "preferences";

export const ALL_TRIP_CONTEXT_SECTIONS: readonly TripContextSection[] = [
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

export type AuthorizedTripContextSnapshot = {
    title: string;
    notes?: string | null;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
};

export type TripContextLoadOptions = {
    /** Set only after the route has authenticated and authorized this trip. */
    authorizedUserId?: string;
    /** RLS-authorized lightweight trip row from the route access check. */
    authorizedTrip?: AuthorizedTripContextSnapshot;
    sections?: readonly TripContextSection[];
};

function sanitizeContextValue(value: unknown): unknown {
    if (typeof value === "string") {
        return value.trim().slice(0, MAX_CONTEXT_STRING_LENGTH);
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        return value
            .slice(0, 20)
            .map((item) =>
                typeof item === "string" ? item.trim().slice(0, 100) : null
            )
            .filter((item): item is string => Boolean(item));
    }
    return null;
}

function allowlistRecord(
    record: Record<string, unknown>,
    fields: readonly string[]
) {
    return Object.fromEntries(
        fields
            .map((field) => [field, sanitizeContextValue(record[field])] as const)
            .filter(([, value]) => {
                if (value === null || value === undefined || value === "") return false;
                return !Array.isArray(value) || value.length > 0;
            })
    );
}

function allowlistRows(
    rows: Record<string, unknown>[] | null,
    fields: readonly string[]
) {
    return (rows || [])
        .slice(0, MAX_CONTEXT_ROWS_PER_SECTION)
        .map((row) => allowlistRecord(row, fields))
        .filter((row) => Object.keys(row).length > 0);
}

function addRowsWhenPresent(
    context: VaiviaTripContext,
    key: keyof VaiviaTripContext,
    rows: Record<string, unknown>[]
) {
    if (rows.length > 0) {
        (context as Record<string, unknown>)[key] = rows;
    }
}

/**
 * Loads a compact RLS-filtered snapshot for one selected trip. Authentication
 * and the trip SELECT happen before any related rows are queried, so this
 * function remains safe even if a caller passes an untrusted route parameter.
 */
export async function loadTripAssistantContext(
    supabase: SupabaseClient<Database>,
    tripId: string,
    now = new Date(),
    options: TripContextLoadOptions = {}
): Promise<VaiviaTripContext> {
    let userId = options.authorizedUserId || null;
    let tripData = options.authorizedTrip || null;
    if (!userId || !tripData) {
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Trip context is unavailable");
        userId = user.id;
        const tripResult = await supabase
            .from("trips")
            .select("title,notes,destination,start_date,end_date")
            .eq("id", tripId)
            .single();
        if (tripResult.error || !tripResult.data) {
            throw new Error("Trip context is unavailable");
        }
        tripData = tripResult.data;
    }

    const requested = new Set(options.sections || ALL_TRIP_CONTEXT_SECTIONS);
    const queries: Array<PromiseLike<{ data: unknown; error: unknown }>> = [];
    const keys: string[] = [];
    const addQuery = (key: string, query: PromiseLike<{ data: unknown; error: unknown }>) => {
        keys.push(key);
        queries.push(query);
    };

    if (requested.has("legs")) addQuery("legs", supabase
            .from("trip_legs")
            .select("name,city_name,country_code,region_code,leg_type,start_date,end_date")
            .eq("trip_id", tripId)
            .order("start_date")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("itinerary")) addQuery("itinerary", supabase
            .from("itinerary_items")
            .select("title,category,status,item_date,end_date,start_time,end_time,timezone,location,formatted_address")
            .eq("trip_id", tripId)
            .order("item_date")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("transportation")) addQuery("transportation", supabase
            .from("transportation_items")
            .select("title,transport_type,status,provider_name,provider_code,transport_number,departure_date,departure_time,departure_timezone,departure_location,departure_formatted_address,departure_terminal,departure_gate,departure_platform,arrival_date,arrival_time,arrival_timezone,arrival_location,arrival_formatted_address,arrival_terminal,arrival_gate,arrival_platform,pickup_location,pickup_formatted_address,dropoff_location,dropoff_formatted_address")
            .eq("trip_id", tripId)
            .order("departure_date")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("stays")) addQuery("stays", supabase
            .from("trip_accommodations")
            .select("hotel_name,accommodation_type,status,address,city,region,country,check_in_date,check_in_time_start,check_in_time_end,check_out_date,check_out_time,free_cancellation_ends_on")
            .eq("trip_id", tripId)
            .eq("is_planning_option", false)
            .order("check_in_date")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("ideas")) addQuery("ideas", supabase
            .from("trip_ideas")
            .select("title,description,category,location,formatted_address,location_city,location_region,location_country,days_of_week,availability_start_date,availability_end_date,time_of_day,timezone,opens_at,closes_at,is_24_hours,estimated_cost,currency,ticket_policy,age_policy,dress_code,tags")
            .eq("trip_id", tripId)
            .eq("is_archived", false)
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("food")) addQuery("food", supabase
            .from("trip_food_items")
            .select("item_type,name,description,region,formatted_address,business_status,meal_categories,place_types,primary_place_type")
            .eq("trip_id", tripId)
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("travelers")) addQuery("travelers", supabase
            .from("trip_members")
            .select("user_id,role,confirmed_start_date,confirmed_end_date,personal_start_date,personal_end_date")
            .eq("trip_id", tripId)
            .eq("status", "active")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    if (requested.has("budget")) {
        addQuery("budgets", supabase
            .from("trip_budgets")
            .select("name,reporting_currency,total_budget_amount")
            .eq("trip_id", tripId)
            .eq("is_active", true)
            .limit(5));
        addQuery("budgetPlan", supabase
            .from("trip_budget_line_items")
            .select("name,linked_expense_category,planned_amount,currency")
            .eq("trip_id", tripId)
            .order("sort_order")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
        addQuery("expenses", supabase
            .from("trip_expenses")
            .select("description,category,amount,currency,amount_in_reporting_currency,reporting_currency,expense_date,transaction_date,source_type")
            .eq("trip_id", tripId)
            .is("deleted_at", null)
            .order("expense_date")
            .limit(MAX_CONTEXT_ROWS_PER_SECTION));
    }
    if (requested.has("preferences")) addQuery("preferences", supabase
            .from("user_preferences")
            .select("clock_format,default_time_zone")
            .eq("user_id", userId)
            .maybeSingle());

    const results = await Promise.all(queries);
    const resultByKey = new Map(keys.map((key, index) => [key, results[index]!]));
    if (results.some((result) => result.error)) {
        throw new Error("Trip context is incomplete");
    }

    const rows = (key: string) =>
        ((resultByKey.get(key)?.data || []) as Record<string, unknown>[]);
    const members = rows("travelers") as Array<Record<string, unknown> & { user_id: string }>;
    const memberUserIds = members.map((member) => member.user_id);
    const profileNames = new Map<string, string>();

    if (memberUserIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
            .from("connected_public_user_profiles")
            .select("id,first_name,last_name")
            .in("id", memberUserIds);
        if (profileError) throw new Error("Trip context is incomplete");

        for (const profile of profiles || []) {
            if (!profile.id) continue;
            const displayName = [profile.first_name, profile.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
            if (displayName) profileNames.set(profile.id, displayName);
        }
    }

    const travelerRows = members.map((member, index) => ({
        display_name: profileNames.get(member.user_id) || `Traveler ${index + 1}`,
        role: member.role,
        confirmed_start_date: member.confirmed_start_date,
        confirmed_end_date: member.confirmed_end_date,
        personal_start_date: member.personal_start_date,
        personal_end_date: member.personal_end_date,
    }));

    const trip = allowlistRecord(
        {
            title: tripData.title,
            description: tripData.notes,
            destination: tripData.destination,
            start_date: tripData.start_date,
            end_date: tripData.end_date,
        },
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trips
    );

    const context: VaiviaTripContext = {
        current_date_utc: now.toISOString().slice(0, 10),
        trip,
        context_notice:
            "Read-only allowlisted VAIVIA data. Status fields identify booked/confirmed versus planned items; itinerary_plans are scheduled plans, saved_ideas and food_ideas are optional unscheduled ideas, and omitted sections have no visible saved records. Sensitive fields are excluded.",
    };

    addRowsWhenPresent(context, "legs", allowlistRows(
        rows("legs"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_legs
    ));
    addRowsWhenPresent(context, "travelers", allowlistRows(
        travelerRows as Record<string, unknown>[],
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_members
    ));
    addRowsWhenPresent(context, "itinerary_plans", allowlistRows(
        rows("itinerary"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.itinerary_items
    ));
    addRowsWhenPresent(context, "transportation", allowlistRows(
        rows("transportation"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.transportation_items
    ));
    addRowsWhenPresent(context, "stays", allowlistRows(
        rows("stays"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_accommodations
    ));
    addRowsWhenPresent(context, "saved_ideas", allowlistRows(
        rows("ideas"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_ideas
    ));
    addRowsWhenPresent(context, "food_ideas", allowlistRows(
        rows("food"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_food_items
    ));
    addRowsWhenPresent(context, "budget_summary", allowlistRows(
        rows("budgets"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_budgets
    ));
    addRowsWhenPresent(context, "budget_plan", allowlistRows(
        rows("budgetPlan"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_budget_line_items
    ));
    addRowsWhenPresent(context, "expenses", allowlistRows(
        rows("expenses"),
        TRIP_CONTEXT_FIELD_ALLOWLISTS.trip_expenses
    ));

    const preferences = resultByKey.get("preferences")?.data;
    if (preferences) {
        const preferences = allowlistRecord(
            resultByKey.get("preferences")!.data as Record<string, unknown>,
            TRIP_CONTEXT_FIELD_ALLOWLISTS.user_preferences
        );
        if (Object.keys(preferences).length > 0) context.travel_preferences = preferences;
    }

    return context;
}
