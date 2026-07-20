import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrustedPlaceLocation } from "@/lib/ai/google-places";
import type { Database } from "@/src/types/supabase";

export const ASSISTANT_ANCHOR_KINDS = [
    "auto",
    "accommodation",
    "itinerary_activity",
    "destination",
    "transportation_arrival",
] as const;

export type AssistantAnchorKind = (typeof ASSISTANT_ANCHOR_KINDS)[number];

export type TripPlaceAnchor = {
    kind: Exclude<AssistantAnchorKind, "auto">;
    label: string;
    dateStart: string | null;
    dateEnd: string | null;
    location: TrustedPlaceLocation | null;
    placeId: string | null;
    address: string | null;
};

export type TripSavedPlace = { placeId: string | null; name: string };

export type TripPlaceContext = {
    anchors: TripPlaceAnchor[];
    savedPlaces: TripSavedPlace[];
};

type AnchorRequest = {
    kind: AssistantAnchorKind;
    reference: string | null;
    targetDate: string | null;
};

function clean(value: unknown, maxLength = 180) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

function nullable(value: unknown, maxLength = 180) {
    return clean(value, maxLength) || null;
}

function location(latitude: unknown, longitude: unknown): TrustedPlaceLocation | null {
    return typeof latitude === "number" &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        typeof longitude === "number" &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
        ? { latitude, longitude }
        : null;
}

function visibleToUser(
    row: { is_private?: boolean | null; created_by?: string | null },
    userId: string
) {
    return row.is_private !== true || row.created_by === userId;
}

function dateContains(anchor: TripPlaceAnchor, targetDate: string | null) {
    if (!targetDate) return true;
    if (anchor.dateStart && targetDate < anchor.dateStart) return false;
    if (anchor.dateEnd && targetDate > anchor.dateEnd) return false;
    return Boolean(anchor.dateStart || anchor.dateEnd);
}

function normalize(value: string) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Loads only internal anchor coordinates and provider IDs needed by the trusted
 * server. These fields never enter the Gemini prompt or the browser payload.
 * RLS and a fresh auth/trip lookup provide the same access boundary as Phase 1.
 */
export async function loadTripPlaceContext(
    supabase: SupabaseClient<Database>,
    tripId: string
): Promise<TripPlaceContext> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Trip place context is unavailable");

    const [tripResult, accommodationsResult, itineraryResult, transportationResult, legsResult, ideasResult, foodResult] =
        await Promise.all([
            supabase
                .from("trips")
                .select("id,destination,start_date,end_date")
                .eq("id", tripId)
                .single(),
            supabase
                .from("trip_accommodations")
                .select("hotel_name,address,city,region,country,check_in_date,check_out_date,google_place_id,latitude,longitude,is_private,created_by")
                .eq("trip_id", tripId)
                .eq("is_planning_option", false)
                .limit(100),
            supabase
                .from("itinerary_items")
                .select("title,location,formatted_address,item_date,end_date,google_place_id,location_lat,location_lng,is_private,created_by")
                .eq("trip_id", tripId)
                .limit(100),
            supabase
                .from("transportation_items")
                .select("title,arrival_date,arrival_location,arrival_formatted_address,arrival_google_place_id,arrival_lat,arrival_lng,is_private,created_by")
                .eq("trip_id", tripId)
                .limit(100),
            supabase
                .from("trip_legs")
                .select("name,city_name,country_code,region_code,start_date,end_date,google_place_id")
                .eq("trip_id", tripId)
                .limit(100),
            supabase
                .from("trip_ideas")
                .select("title,location,google_place_id,is_private,created_by,is_archived")
                .eq("trip_id", tripId)
                .eq("is_archived", false)
                .limit(100),
            supabase
                .from("trip_food_items")
                .select("name,google_place_id")
                .eq("trip_id", tripId)
                .limit(100),
        ]);

    const results = [
        tripResult,
        accommodationsResult,
        itineraryResult,
        transportationResult,
        legsResult,
        ideasResult,
        foodResult,
    ];
    if (results.some((result) => result.error) || !tripResult.data) {
        throw new Error("Trip place context is unavailable");
    }

    const anchors: TripPlaceAnchor[] = [];
    for (const row of accommodationsResult.data || []) {
        if (!visibleToUser(row, user.id)) continue;
        const label = clean(row.hotel_name);
        if (!label) continue;
        anchors.push({
            kind: "accommodation",
            label,
            dateStart: row.check_in_date,
            dateEnd: row.check_out_date,
            location: location(row.latitude, row.longitude),
            placeId: nullable(row.google_place_id, 255),
            address:
                nullable(row.address) ||
                nullable([row.city, row.region, row.country].filter(Boolean).join(", ")),
        });
    }
    for (const row of itineraryResult.data || []) {
        if (!visibleToUser(row, user.id)) continue;
        const label = clean(row.title || row.location);
        if (!label) continue;
        anchors.push({
            kind: "itinerary_activity",
            label,
            dateStart: row.item_date,
            dateEnd: row.end_date || row.item_date,
            location: location(row.location_lat, row.location_lng),
            placeId: nullable(row.google_place_id, 255),
            address: nullable(row.formatted_address || row.location),
        });
    }
    for (const row of transportationResult.data || []) {
        if (!visibleToUser(row, user.id)) continue;
        const arrivalLabel = clean(row.arrival_location || row.arrival_formatted_address);
        if (!arrivalLabel) continue;
        anchors.push({
            kind: "transportation_arrival",
            label: row.title ? `${clean(row.title)} arrival — ${arrivalLabel}` : arrivalLabel,
            dateStart: row.arrival_date,
            dateEnd: row.arrival_date,
            location: location(row.arrival_lat, row.arrival_lng),
            placeId: nullable(row.arrival_google_place_id, 255),
            address: nullable(row.arrival_formatted_address || row.arrival_location),
        });
    }
    for (const row of legsResult.data || []) {
        const label = clean(
            row.name ||
                [row.city_name, row.region_code, row.country_code]
                    .filter(Boolean)
                    .join(", ")
        );
        if (!label) continue;
        anchors.push({
            kind: "destination",
            label,
            dateStart: row.start_date,
            dateEnd: row.end_date,
            location: null,
            placeId: nullable(row.google_place_id, 255),
            address: nullable(
                [row.city_name, row.region_code, row.country_code]
                    .filter(Boolean)
                    .join(", ")
            ),
        });
    }
    if (anchors.every((anchor) => anchor.kind !== "destination")) {
        const label = clean(tripResult.data.destination);
        if (label) {
            anchors.push({
                kind: "destination",
                label,
                dateStart: tripResult.data.start_date,
                dateEnd: tripResult.data.end_date,
                location: null,
                placeId: null,
                address: label,
            });
        }
    }

    const savedPlaces: TripSavedPlace[] = [
        ...(itineraryResult.data || [])
            .filter((row) => visibleToUser(row, user.id))
            .map((row) => ({
                placeId: nullable(row.google_place_id, 255),
                name: clean(row.title || row.location),
            })),
        ...(ideasResult.data || [])
            .filter((row) => visibleToUser(row, user.id))
            .map((row) => ({
                placeId: nullable(row.google_place_id, 255),
                name: clean(row.title || row.location),
            })),
        ...(foodResult.data || []).map((row) => ({
            placeId: nullable(row.google_place_id, 255),
            name: clean(row.name),
        })),
    ].filter((item) => item.name || item.placeId);

    return { anchors, savedPlaces };
}

export function resolveTripPlaceAnchor(
    context: TripPlaceContext,
    request: AnchorRequest
):
    | { status: "resolved"; anchor: TripPlaceAnchor }
    | { status: "ambiguous"; options: string[] }
    | { status: "missing" } {
    let candidates = context.anchors.filter(
        (anchor) => request.kind === "auto" || anchor.kind === request.kind
    );
    if (request.targetDate) {
        const dated = candidates.filter((anchor) => dateContains(anchor, request.targetDate));
        candidates = dated;
    }
    if (request.reference) {
        const reference = normalize(request.reference);
        const matched = candidates.filter((anchor) => {
            const label = normalize(`${anchor.label} ${anchor.address || ""}`);
            return label.includes(reference) || reference.includes(normalize(anchor.label));
        });
        if (matched.length > 0) candidates = matched;
        else return { status: "missing" };
    }

    if (candidates.length === 1) return { status: "resolved", anchor: candidates[0] };
    if (candidates.length === 0) return { status: "missing" };

    const ranked = [...candidates].sort((a, b) => {
        const priority = {
            accommodation: 0,
            itinerary_activity: 1,
            transportation_arrival: 2,
            destination: 3,
        } as const;
        return priority[a.kind] - priority[b.kind];
    });
    return {
        status: "ambiguous",
        options: ranked.slice(0, 5).map((anchor) => anchor.label),
    };
}

export function isAlreadySavedPlace(
    savedPlaces: TripSavedPlace[],
    place: { placeId: string; name: string }
) {
    const name = normalize(place.name);
    return savedPlaces.some(
        (saved) =>
            (saved.placeId && saved.placeId === place.placeId) ||
            (name && normalize(saved.name) === name)
    );
}
