import type { SupabaseClient } from "@supabase/supabase-js";

export type TripRouteRecord = {
    id: string;
    slug?: string | null;
};

export const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
    return UUID_PATTERN.test(value);
}

const LATIN_SLUG_APPROXIMATIONS: Record<string, string> = {
    Æ: "AE",
    æ: "ae",
    Ð: "D",
    ð: "d",
    Đ: "D",
    đ: "d",
    Ħ: "H",
    ħ: "h",
    Ĳ: "IJ",
    ĳ: "ij",
    İ: "I",
    ı: "i",
    ĸ: "k",
    Ł: "L",
    ł: "l",
    Ŋ: "N",
    ŋ: "n",
    Œ: "OE",
    œ: "oe",
    Ø: "O",
    ø: "o",
    Þ: "Th",
    þ: "th",
    ẞ: "SS",
    ß: "ss",
};

function approximateSlugLetters(value: string) {
    return value
        .replace(/[ÆæÐðĐđĦħĲĳİıĸŁłŊŋŒœØøÞþẞß]/g, (character) => {
            return LATIN_SLUG_APPROXIMATIONS[character] || character;
        })
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizeFallbackTripNumber(value?: number | null) {
    if (!Number.isFinite(value || 0) || !value || value < 1) {
        return null;
    }

    return Math.floor(value);
}

export function slugifyTripTitle(value: string, fallbackTripNumber?: number | null) {
    const slug = value
        ? approximateSlugLetters(value)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "")
        : "";

    const fallback = normalizeFallbackTripNumber(fallbackTripNumber);

    return slug || (fallback ? `trip-${fallback}` : "trip");
}

export function sanitizeTripSlugInput(value: string) {
    return approximateSlugLetters(value)
        .trimStart()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+/g, "");
}

export function getTripRouteSegment(trip: TripRouteRecord | null | undefined) {
    return trip?.slug?.trim() || trip?.id || "";
}

export function getTripHref(
    trip: TripRouteRecord | null | undefined,
    suffix = ""
) {
    const segment = getTripRouteSegment(trip);
    return segment ? `/trips/${segment}${suffix}` : "/trips";
}

export function getTripItineraryHref(
    trip: TripRouteRecord | null | undefined,
    suffix = ""
) {
    return getTripHref(trip, `/itinerary${suffix}`);
}

export async function resolveTripRouteParam<T extends TripRouteRecord>(
    supabase: SupabaseClient,
    routeParam: string,
    select = "*"
) {
    const decodedParam = decodeURIComponent(routeParam);
    const query = supabase
        .from("trips")
        .select(select)
        .eq(isUuid(decodedParam) ? "id" : "slug", decodedParam)
        .maybeSingle();

    const { data, error } = await query;
    const trip = data as T | null;
    const routeSegment = trip ? getTripRouteSegment(trip) : "";

    return {
        trip,
        error,
        tripId: trip?.id || "",
        routeParam: decodedParam,
        routeSegment,
        shouldRedirect: Boolean(
            trip && routeSegment && routeSegment !== decodedParam
        ),
    };
}
