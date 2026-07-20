import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

const AIRPORT_TIMEZONE_TIMEOUT_MS = 5_000;
const MAX_AIRPORTS_PER_IMPORT = 20;

type FlightTimezoneInput = {
    departureLocation: string;
    arrivalLocation: string;
    departureDate?: string | null;
    arrivalDate?: string | null;
    departureTimezone?: string | null;
    arrivalTimezone?: string | null;
};

export type ResolvedFlightTimezones = {
    departureTimezone: string;
    arrivalTimezone: string;
};

type AirportRow = {
    ident: string | null;
    iata_code: string | null;
    latitude_deg: number | null;
    longitude_deg: number | null;
};

type AirportCoordinates = {
    latitude: number;
    longitude: number;
};

function normalizeAirportToken(value: string) {
    return value.trim().toUpperCase();
}

export function getAirportCodeCandidates(value?: string | null) {
    const normalized = normalizeAirportToken(value || "");
    if (!normalized) return [];

    const candidates = new Set<string>();
    if (/^[A-Z]{3,4}$/.test(normalized)) candidates.add(normalized);

    for (const match of normalized.matchAll(/(?:^|[^A-Z])([A-Z]{3,4})(?=$|[^A-Z])/g)) {
        candidates.add(match[1]);
    }

    return Array.from(candidates);
}

function isValidIanaTimezone(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;

    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

function getTimestampForDate(value?: string | null) {
    const timestamp = value
        ? Date.parse(`${value}T12:00:00Z`)
        : Number.NaN;
    return Math.floor(
        (Number.isFinite(timestamp) ? timestamp : Date.now()) / 1_000
    );
}

async function fetchTimezoneForAirport(
    coordinates: AirportCoordinates,
    date: string | null | undefined,
    apiKey: string
) {
    const query = new URLSearchParams({
        location: `${coordinates.latitude},${coordinates.longitude}`,
        timestamp: String(getTimestampForDate(date)),
        key: apiKey,
    });

    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/timezone/json?${query}`,
            { signal: AbortSignal.timeout(AIRPORT_TIMEZONE_TIMEOUT_MS) }
        );
        if (!response.ok) return "";

        const payload = (await response.json()) as {
            status?: unknown;
            timeZoneId?: unknown;
        };
        return payload.status === "OK" && isValidIanaTimezone(payload.timeZoneId)
            ? payload.timeZoneId
            : "";
    } catch {
        return "";
    }
}

function findAirportForLocation(
    rows: AirportRow[],
    location: string
) {
    const candidates = getAirportCodeCandidates(location);
    for (const candidate of candidates) {
        const airport = rows.find(
            (row) =>
                normalizeAirportToken(row.iata_code || "") === candidate ||
                normalizeAirportToken(row.ident || "") === candidate
        );
        if (airport) return airport;
    }
    return null;
}

/**
 * Resolves only missing time zones from VAIVIA's airport dataset. The review
 * UI performs Google Places validation when a reference row is unavailable.
 */
export async function resolveImportedFlightTimezones(
    supabase: SupabaseClient<Database>,
    flights: FlightTimezoneInput[]
): Promise<ResolvedFlightTimezones[]> {
    const existing = flights.map((flight) => ({
        departureTimezone: flight.departureTimezone?.trim() || "",
        arrivalTimezone: flight.arrivalTimezone?.trim() || "",
    }));
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
    if (!apiKey || flights.length === 0) return existing;
    const serverApiKey = apiKey;

    const codes = Array.from(
        new Set(
            flights.flatMap((flight) => [
                ...getAirportCodeCandidates(flight.departureLocation),
                ...getAirportCodeCandidates(flight.arrivalLocation),
            ])
        )
    ).slice(0, MAX_AIRPORTS_PER_IMPORT);
    const iataCodes = codes.filter((code) => code.length === 3);
    const airportIdentifiers = codes.filter((code) => code.length === 4);

    const [iataResult, identifierResult] = await Promise.all([
        iataCodes.length
            ? supabase
                  .from("airports")
                  .select("ident,iata_code,latitude_deg,longitude_deg")
                  .in("iata_code", iataCodes)
            : Promise.resolve({ data: [], error: null }),
        airportIdentifiers.length
            ? supabase
                  .from("airports")
                  .select("ident,iata_code,latitude_deg,longitude_deg")
                  .in("ident", airportIdentifiers)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const rows = [
        ...((iataResult.error ? [] : iataResult.data || []) as AirportRow[]),
        ...((identifierResult.error ? [] : identifierResult.data || []) as AirportRow[]),
    ];
    const timezoneCache = new Map<string, Promise<string>>();

    function resolve(
        location: string,
        date: string | null | undefined,
        currentTimezone: string
    ) {
        if (currentTimezone) return Promise.resolve(currentTimezone);
        if (!location.trim()) return Promise.resolve("");
        const airport = findAirportForLocation(rows, location);
        if (!airport) return Promise.resolve("");
        const airportKey = airport?.ident || airport?.iata_code || location;
        const cacheKey = `${airportKey}:${date || ""}`;
        const cached = timezoneCache.get(cacheKey);
        if (cached) return cached;

        const request = (async () => {
            const coordinates =
                typeof airport.latitude_deg === "number" &&
                typeof airport.longitude_deg === "number"
                    ? {
                          latitude: airport.latitude_deg,
                          longitude: airport.longitude_deg,
                      }
                    : null;

            return coordinates
                ? fetchTimezoneForAirport(coordinates, date, serverApiKey)
                : "";
        })();
        timezoneCache.set(cacheKey, request);
        return request;
    }

    return Promise.all(
        flights.map(async (flight, index) => ({
            departureTimezone: await resolve(
                flight.departureLocation,
                flight.departureDate,
                existing[index].departureTimezone
            ),
            arrivalTimezone: await resolve(
                flight.arrivalLocation,
                flight.arrivalDate,
                existing[index].arrivalTimezone
            ),
        }))
    );
}
