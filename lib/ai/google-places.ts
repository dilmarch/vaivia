import "server-only";

const GOOGLE_PLACES_TEXT_SEARCH_URL =
    "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_PLACES_TIMEOUT_MS = 8_000;
const MIN_RADIUS_METERS = 250;
const MAX_RADIUS_METERS = 10_000;
const MAX_RESULTS_PER_SEARCH = 10;

const SEARCH_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.primaryType",
    "places.types",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.businessStatus",
    "places.regularOpeningHours",
    "places.googleMapsUri",
].join(",");

const DETAILS_FIELD_MASK = SEARCH_FIELD_MASK.replaceAll("places.", "");

export type TrustedPlaceLocation = { latitude: number; longitude: number };

export type SanitizedGooglePlace = {
    placeId: string;
    name: string;
    address: string | null;
    category: string;
    types: string[];
    location: TrustedPlaceLocation;
    distanceMeters: number | null;
    rating: number | null;
    userRatingCount: number | null;
    priceLevel: string | null;
    businessStatus: string | null;
    hoursSummary: string | null;
    weeklyPeriods: Array<{
        open: { day: number; hour: number; minute: number };
        close: { day: number; hour: number; minute: number } | null;
    }>;
    mapsUrl: string;
};

export type GooglePlacesFailureCode =
    | "missing_configuration"
    | "timeout"
    | "rate_limited"
    | "billing_or_configuration"
    | "provider_failure"
    | "no_results";

export type GooglePlacesResult<T> =
    | { status: "success"; data: T }
    | { status: "failure"; code: GooglePlacesFailureCode };

type GooglePlacePayload = {
    id?: unknown;
    displayName?: { text?: unknown };
    formattedAddress?: unknown;
    primaryType?: unknown;
    types?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
    rating?: unknown;
    userRatingCount?: unknown;
    priceLevel?: unknown;
    businessStatus?: unknown;
    regularOpeningHours?: { weekdayDescriptions?: unknown; periods?: unknown };
    googleMapsUri?: unknown;
};

function getGooglePlacesApiKey() {
    return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export function isGooglePlacesConfigured() {
    return Boolean(getGooglePlacesApiKey());
}

function clampInteger(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function cleanString(value: unknown, maxLength: number) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

function safeNumber(value: unknown, minimum: number, maximum: number) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : null;
}

export function isTrustedLocation(value: unknown): value is TrustedPlaceLocation {
    if (!value || typeof value !== "object") return false;
    const location = value as Record<string, unknown>;
    return (
        typeof location.latitude === "number" &&
        Number.isFinite(location.latitude) &&
        location.latitude >= -90 &&
        location.latitude <= 90 &&
        typeof location.longitude === "number" &&
        Number.isFinite(location.longitude) &&
        location.longitude >= -180 &&
        location.longitude <= 180
    );
}

export function straightLineDistanceMeters(
    from: TrustedPlaceLocation,
    to: TrustedPlaceLocation
) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(to.latitude - from.latitude);
    const longitudeDelta = radians(to.longitude - from.longitude);
    const startLatitude = radians(from.latitude);
    const endLatitude = radians(to.latitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(startLatitude) *
            Math.cos(endLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function safeMapsUrl(value: unknown, placeId: string) {
    if (typeof value === "string") {
        try {
            const url = new URL(value);
            if (
                url.protocol === "https:" &&
                (url.hostname === "maps.google.com" ||
                    url.hostname === "www.google.com" ||
                    url.hostname.endsWith(".google.com"))
            ) {
                return url.toString();
            }
        } catch {
            // Fall through to Google's documented query-place link format.
        }
    }
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
}

function sanitizePlace(
    payload: GooglePlacePayload,
    origin?: TrustedPlaceLocation
): SanitizedGooglePlace | null {
    const placeId = cleanString(payload.id, 255);
    const name = cleanString(payload.displayName?.text, 160);
    if (!placeId || !name || !isTrustedLocation(payload.location)) return null;

    const descriptions = Array.isArray(
        payload.regularOpeningHours?.weekdayDescriptions
    )
        ? payload.regularOpeningHours?.weekdayDescriptions
              .map((item) => cleanString(item, 120))
              .filter(Boolean)
              .slice(0, 7)
        : [];

    const types = Array.isArray(payload.types)
        ? payload.types.map((item) => cleanString(item, 80)).filter(Boolean).slice(0, 20)
        : [];
    const category = cleanString(payload.primaryType, 80) || types[0] || "place";
    const weeklyPeriods = Array.isArray(payload.regularOpeningHours?.periods)
        ? payload.regularOpeningHours.periods
              .map((period) => {
                  if (!period || typeof period !== "object") return null;
                  const raw = period as Record<string, unknown>;
                  const sanitizePoint = (value: unknown) => {
                      if (!value || typeof value !== "object") return null;
                      const point = value as Record<string, unknown>;
                      return typeof point.day === "number" &&
                          Number.isSafeInteger(point.day) &&
                          point.day >= 0 &&
                          point.day <= 6 &&
                          (point.hour === undefined ||
                              (typeof point.hour === "number" &&
                                  Number.isSafeInteger(point.hour) &&
                                  point.hour >= 0 &&
                                  point.hour <= 23)) &&
                          (point.minute === undefined ||
                              (typeof point.minute === "number" &&
                                  Number.isSafeInteger(point.minute) &&
                                  point.minute >= 0 &&
                                  point.minute <= 59))
                          ? {
                                day: point.day,
                                hour: (point.hour as number | undefined) || 0,
                                minute: (point.minute as number | undefined) || 0,
                            }
                          : null;
                  };
                  const open = sanitizePoint(raw.open);
                  if (!open) return null;
                  return { open, close: sanitizePoint(raw.close) };
              })
              .filter(
                  (
                      period
                  ): period is {
                      open: { day: number; hour: number; minute: number };
                      close: { day: number; hour: number; minute: number } | null;
                  } => Boolean(period)
              )
              .slice(0, 20)
        : [];

    return {
        placeId,
        name,
        address: cleanString(payload.formattedAddress, 240) || null,
        category,
        types,
        location: payload.location,
        distanceMeters: origin
            ? straightLineDistanceMeters(origin, payload.location)
            : null,
        rating: safeNumber(payload.rating, 0, 5),
        userRatingCount:
            typeof payload.userRatingCount === "number" &&
            Number.isSafeInteger(payload.userRatingCount) &&
            payload.userRatingCount >= 0
                ? payload.userRatingCount
                : null,
        priceLevel: cleanString(payload.priceLevel, 40) || null,
        businessStatus: cleanString(payload.businessStatus, 40) || null,
        hoursSummary:
            descriptions.length > 0
                ? `${descriptions.join(" · ")} (verify for your visit)`
                : null,
        weeklyPeriods,
        mapsUrl: safeMapsUrl(payload.googleMapsUri, placeId),
    };
}

async function placesFetch(
    url: string,
    init: RequestInit,
    signal?: AbortSignal
): Promise<GooglePlacesResult<unknown>> {
    const apiKey = getGooglePlacesApiKey();
    if (!apiKey) return { status: "failure", code: "missing_configuration" };

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, GOOGLE_PLACES_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...init,
            cache: "no-store",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                ...init.headers,
            },
        });
        if (!response.ok) {
            if (response.status === 429) {
                return { status: "failure", code: "rate_limited" };
            }
            if (response.status === 400 || response.status === 403) {
                return { status: "failure", code: "billing_or_configuration" };
            }
            return { status: "failure", code: "provider_failure" };
        }
        return { status: "success", data: await response.json() };
    } catch {
        return {
            status: "failure",
            code: timedOut ? "timeout" : "provider_failure",
        };
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
    }
}

export async function searchGooglePlaces({
    query,
    origin,
    radiusMeters,
    maxResults,
    priceLevels = [],
    signal,
}: {
    query: string;
    origin: TrustedPlaceLocation;
    radiusMeters: number;
    maxResults: number;
    priceLevels?: string[];
    signal?: AbortSignal;
}): Promise<GooglePlacesResult<SanitizedGooglePlace[]>> {
    const safeQuery = cleanString(query, 160);
    if (!safeQuery || !isTrustedLocation(origin)) {
        return { status: "failure", code: "provider_failure" };
    }
    const radius = clampInteger(radiusMeters, MIN_RADIUS_METERS, MAX_RADIUS_METERS);
    const limit = clampInteger(maxResults, 1, MAX_RESULTS_PER_SEARCH);
    const allowedPriceLevels = new Set([
        "PRICE_LEVEL_FREE",
        "PRICE_LEVEL_INEXPENSIVE",
        "PRICE_LEVEL_MODERATE",
        "PRICE_LEVEL_EXPENSIVE",
        "PRICE_LEVEL_VERY_EXPENSIVE",
    ]);
    const safePriceLevels = priceLevels
        .map((value) => cleanString(value, 40))
        .filter((value) => allowedPriceLevels.has(value))
        .slice(0, 5);
    const result = await placesFetch(
        GOOGLE_PLACES_TEXT_SEARCH_URL,
        {
            method: "POST",
            headers: { "X-Goog-FieldMask": SEARCH_FIELD_MASK },
            body: JSON.stringify({
                textQuery: safeQuery,
                pageSize: limit,
                locationBias: {
                    circle: { center: origin, radius },
                },
                ...(safePriceLevels.length > 0
                    ? { priceLevels: safePriceLevels }
                    : {}),
            }),
        },
        signal
    );
    if (result.status === "failure") return result;

    const payload = result.data as { places?: unknown };
    const places = Array.isArray(payload.places)
        ? payload.places
              .map((place) => sanitizePlace(place as GooglePlacePayload, origin))
              .filter((place): place is SanitizedGooglePlace => Boolean(place))
              .filter(
                  (place) =>
                      place.distanceMeters !== null && place.distanceMeters <= radius
              )
              .slice(0, limit)
        : [];
    return places.length > 0
        ? { status: "success", data: places }
        : { status: "failure", code: "no_results" };
}

/** Resolves a VAIVIA-saved destination/address when it has no stored coordinates. */
export async function findGooglePlaceByText({
    query,
    signal,
}: {
    query: string;
    signal?: AbortSignal;
}): Promise<GooglePlacesResult<SanitizedGooglePlace>> {
    const safeQuery = cleanString(query, 240);
    if (!safeQuery) return { status: "failure", code: "provider_failure" };
    const result = await placesFetch(
        GOOGLE_PLACES_TEXT_SEARCH_URL,
        {
            method: "POST",
            headers: { "X-Goog-FieldMask": SEARCH_FIELD_MASK },
            body: JSON.stringify({ textQuery: safeQuery, pageSize: 1 }),
        },
        signal
    );
    if (result.status === "failure") return result;
    const payload = result.data as { places?: unknown };
    const first = Array.isArray(payload.places)
        ? sanitizePlace(payload.places[0] as GooglePlacePayload)
        : null;
    return first
        ? { status: "success", data: first }
        : { status: "failure", code: "no_results" };
}

export async function getGooglePlaceDetails({
    placeId,
    origin,
    signal,
}: {
    placeId: string;
    origin?: TrustedPlaceLocation;
    signal?: AbortSignal;
}): Promise<GooglePlacesResult<SanitizedGooglePlace>> {
    const safePlaceId = cleanString(placeId, 255);
    if (!safePlaceId) return { status: "failure", code: "provider_failure" };
    const result = await placesFetch(
        `${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(safePlaceId)}`,
        {
            method: "GET",
            headers: { "X-Goog-FieldMask": DETAILS_FIELD_MASK },
        },
        signal
    );
    if (result.status === "failure") return result;
    const place = sanitizePlace(result.data as GooglePlacePayload, origin);
    return place
        ? { status: "success", data: place }
        : { status: "failure", code: "no_results" };
}

/**
 * Refreshes a stored Place ID using Google's IDs-only field mask. The caller may
 * persist the returned ID, but no other provider content is requested or stored.
 */
export async function refreshGooglePlaceId({
    placeId,
    signal,
}: {
    placeId: string;
    signal?: AbortSignal;
}): Promise<GooglePlacesResult<string>> {
    const safePlaceId = cleanString(placeId, 255);
    if (!safePlaceId) return { status: "failure", code: "provider_failure" };
    const result = await placesFetch(
        `${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(safePlaceId)}`,
        {
            method: "GET",
            headers: { "X-Goog-FieldMask": "id" },
        },
        signal
    );
    if (result.status === "failure") return result;
    const refreshedId = cleanString(
        (result.data as { id?: unknown } | null)?.id,
        255
    );
    return refreshedId
        ? { status: "success", data: refreshedId }
        : { status: "failure", code: "no_results" };
}
