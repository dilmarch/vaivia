import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

export const TRIP_DESTINATIONS_FORM_FIELD = "destination_places_json";

export type TripDestinationInput = {
    label: string;
    placeId: string | null;
    countryCode: string | null;
    countryName: string | null;
};

export type TripDestinationRecord = TripDestinationInput & {
    id: string | null;
    sortOrder: number;
};

function cleanText(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeCountryCode(value: unknown) {
    const countryCode = cleanText(value, 2).toUpperCase();
    return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function parseLegacyDestinationLabels(
    value: FormDataEntryValue | string | null | undefined
) {
    return String(value || "")
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => ({
            label,
            placeId: null,
            countryCode: null,
            countryName: null,
        }));
}

export function parseTripDestinationsFormData(formData: FormData) {
    const rawJson = String(formData.get(TRIP_DESTINATIONS_FORM_FIELD) || "");
    let candidates: unknown[] = [];

    if (rawJson) {
        try {
            const parsed = JSON.parse(rawJson) as unknown;
            if (Array.isArray(parsed)) candidates = parsed;
        } catch {
            candidates = [];
        }
    }

    const parsedDestinations = candidates
        .slice(0, 25)
        .map((candidate): TripDestinationInput | null => {
            if (!candidate || typeof candidate !== "object") return null;
            const record = candidate as Record<string, unknown>;
            const label = cleanText(record.label, 200);
            if (!label) return null;

            return {
                label,
                placeId: cleanText(record.placeId, 255) || null,
                countryCode: normalizeCountryCode(record.countryCode),
                countryName: cleanText(record.countryName, 120) || null,
            };
        })
        .filter((destination): destination is TripDestinationInput =>
            Boolean(destination)
        );

    const destinations = parsedDestinations.length
        ? parsedDestinations
        : parseLegacyDestinationLabels(formData.get("destination"));
    const seen = new Set<string>();

    return destinations.filter((destination) => {
        const key = destination.placeId
            ? `place:${destination.placeId}`
            : `label:${destination.label.toLocaleLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function destinationLookupKeys(destination: TripDestinationInput) {
    return [
        destination.placeId ? `place:${destination.placeId}` : "",
        `label:${destination.label.toLocaleLowerCase()}`,
    ].filter(Boolean);
}

export async function syncTripDestinationsFromForm({
    supabase,
    tripId,
    formData,
}: {
    supabase: SupabaseClient<Database>;
    tripId: string;
    formData: FormData;
}) {
    const destinations = parseTripDestinationsFormData(formData);
    const { data: existingRows, error: existingError } = await supabase
        .from("trip_destinations")
        .select("label,google_place_id,country_code,country_name")
        .eq("trip_id", tripId);

    if (existingError) {
        throw new Error("Could not load saved trip destinations.");
    }

    const existingByKey = new Map<
        string,
        {
            country_code: string | null;
            country_name: string | null;
            google_place_id: string | null;
        }
    >();
    (existingRows || []).forEach((row) => {
        const normalized: TripDestinationInput = {
            label: row.label,
            placeId: row.google_place_id,
            countryCode: row.country_code,
            countryName: row.country_name,
        };
        destinationLookupKeys(normalized).forEach((key) =>
            existingByKey.set(key, row)
        );
    });

    if (destinations.length > 0) {
        const rows = destinations.map((destination, sortOrder) => {
            const existing = destinationLookupKeys(destination)
                .map((key) => existingByKey.get(key))
                .find(Boolean);

            return {
                trip_id: tripId,
                label: destination.label,
                google_place_id:
                    destination.placeId || existing?.google_place_id || null,
                country_code:
                    destination.countryCode || existing?.country_code || null,
                country_name:
                    destination.countryName || existing?.country_name || null,
                sort_order: sortOrder,
            };
        });
        const { error: upsertError } = await supabase
            .from("trip_destinations")
            .upsert(rows, { onConflict: "trip_id,sort_order" });

        if (upsertError) {
            throw new Error("Could not save trip destination country codes.");
        }
    }

    const deleteQuery = supabase
        .from("trip_destinations")
        .delete()
        .eq("trip_id", tripId);
    const { error: deleteError } =
        destinations.length === 0
            ? await deleteQuery
            : await deleteQuery.gte("sort_order", destinations.length);

    if (deleteError) {
        throw new Error("Could not finish updating trip destinations.");
    }
}

export async function loadTripDestinations({
    supabase,
    tripId,
    legacyDestination,
}: {
    supabase: SupabaseClient<Database>;
    tripId: string;
    legacyDestination?: string | null;
}): Promise<TripDestinationRecord[]> {
    const [{ data: rows, error }, { data: legRows, error: legError }] =
        await Promise.all([
            supabase
                .from("trip_destinations")
                .select(
                    "id,label,google_place_id,country_code,country_name,sort_order"
                )
                .eq("trip_id", tripId)
                .order("sort_order", { ascending: true }),
            supabase
                .from("trip_legs")
                .select("id,name,google_place_id,country_code,sort_order")
                .eq("trip_id", tripId)
                .order("sort_order", { ascending: true }),
        ]);

    if (error) {
        console.warn("Could not load normalized trip destinations:", {
            code: error.code,
            message: error.message,
            tripId,
        });
    }
    if (legError) {
        console.warn("Could not load trip legs as destination fallback:", {
            code: legError.code,
            message: legError.message,
            tripId,
        });
    }

    type LegRow = {
        id: string;
        name: string;
        google_place_id: string | null;
        country_code: string | null;
        sort_order: number;
    };
    const legByKey = new Map<string, LegRow>();
    (legRows || []).forEach((leg) => {
        if (leg.google_place_id) legByKey.set(`place:${leg.google_place_id}`, leg);
        legByKey.set(`label:${leg.name.toLocaleLowerCase()}`, leg);
    });

    if (rows?.length) {
        return rows.map((row) => {
            const matchingLeg =
                (row.google_place_id
                    ? legByKey.get(`place:${row.google_place_id}`)
                    : undefined) ||
                legByKey.get(`label:${row.label.toLocaleLowerCase()}`);
            return {
                id: row.id,
                label: row.label,
                placeId: row.google_place_id,
                countryCode: row.country_code || matchingLeg?.country_code || null,
                countryName: row.country_name,
                sortOrder: row.sort_order,
            };
        });
    }

    const fallbackLegs = (legRows || []).filter(
        (leg, index, values) =>
            Boolean(leg.country_code) &&
            values.findIndex(
                (candidate) =>
                    candidate.country_code === leg.country_code &&
                    candidate.name.toLocaleLowerCase() ===
                        leg.name.toLocaleLowerCase()
            ) === index
    );
    if (fallbackLegs.length) {
        return fallbackLegs.map((leg, index) => ({
            id: leg.id,
            label: leg.name,
            placeId: leg.google_place_id,
            countryCode: leg.country_code,
            countryName: null,
            sortOrder: index,
        }));
    }

    return parseLegacyDestinationLabels(legacyDestination).map(
        (destination, sortOrder) => ({
            ...destination,
            id: null,
            sortOrder,
        })
    );
}
