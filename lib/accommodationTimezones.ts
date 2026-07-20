export type AccommodationTimezoneCandidate = {
    id: string;
    latitude?: number | null;
    longitude?: number | null;
};

type TimezoneResponse = {
    timeZoneId?: unknown;
};

const timezoneRequestCache = new Map<string, Promise<string | null>>();

function isCoordinate(value: unknown, minimum: number, maximum: number) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum
    );
}

export function getAccommodationCoordinateKey(
    accommodation: AccommodationTimezoneCandidate
) {
    if (
        !isCoordinate(accommodation.latitude, -90, 90) ||
        !isCoordinate(accommodation.longitude, -180, 180)
    ) {
        return null;
    }

    return `${accommodation.latitude},${accommodation.longitude}`;
}

export function isSupportedTimezone(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;

    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

async function requestTimezone(
    accommodation: AccommodationTimezoneCandidate,
    fetcher: typeof fetch
) {
    const response = await fetcher("/api/timezone", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            lat: accommodation.latitude,
            lng: accommodation.longitude,
        }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TimezoneResponse;
    return isSupportedTimezone(data.timeZoneId) ? data.timeZoneId : null;
}

export function resolveAccommodationTimezone(
    accommodation: AccommodationTimezoneCandidate,
    fetcher: typeof fetch = fetch
) {
    const coordinateKey = getAccommodationCoordinateKey(accommodation);
    if (!coordinateKey) return Promise.resolve(null);

    const cachedRequest = timezoneRequestCache.get(coordinateKey);
    if (cachedRequest) return cachedRequest;

    const request = requestTimezone(accommodation, fetcher).catch(() => null);
    timezoneRequestCache.set(coordinateKey, request);
    return request;
}

export async function resolveAccommodationTimezones(
    accommodations: AccommodationTimezoneCandidate[],
    fetcher: typeof fetch = fetch
) {
    const resolvedEntries = await Promise.all(
        accommodations.map(async (accommodation) => [
            accommodation.id,
            await resolveAccommodationTimezone(accommodation, fetcher),
        ] as const)
    );

    return Object.fromEntries(
        resolvedEntries.filter(
            (entry): entry is readonly [string, string] => Boolean(entry[1])
        )
    );
}

export function clearAccommodationTimezoneCacheForTests() {
    timezoneRequestCache.clear();
}
