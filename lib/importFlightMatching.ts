type FlightFingerprintInput = {
    flightNumber?: string | null;
    transport_number?: string | null;
    departureDate?: string | null;
    departure_date?: string | null;
    departureTime?: string | null;
    departure_time?: string | null;
    notes?: string | null;
    title?: string | null;
};

export type ImportedFlightMatchCandidate = FlightFingerprintInput & {
    id: string;
};

export type ExistingFlightForImportMerge = {
    status?: string | null;
    transport_number?: string | null;
    provider_name?: string | null;
    provider_code?: string | null;
    reservation_code?: string | null;
    baggage_info?: string | null;
    seat_number?: string | null;
    cabin_class?: string | null;
    departure_location?: string | null;
    arrival_location?: string | null;
    departure_date?: string | null;
    departure_time?: string | null;
    arrival_date?: string | null;
    arrival_time?: string | null;
    departure_timezone?: string | null;
    arrival_timezone?: string | null;
    departure_terminal?: string | null;
    arrival_terminal?: string | null;
    departure_formatted_address?: string | null;
    departure_google_place_id?: string | null;
    departure_lat?: number | null;
    departure_lng?: number | null;
    arrival_formatted_address?: string | null;
    arrival_google_place_id?: string | null;
    arrival_lat?: number | null;
    arrival_lng?: number | null;
    cost?: number | null;
    currency?: string | null;
    notes?: string | null;
};

export function parseImportedCoordinate(
    value: string | null | undefined,
    minimum: number,
    maximum: number
) {
    const coordinate = Number(String(value || "").trim());
    return Number.isFinite(coordinate) &&
        coordinate >= minimum &&
        coordinate <= maximum
        ? coordinate
        : null;
}

function importedMoney(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
}

/**
 * Builds a conservative duplicate merge. Imported values fill missing fields,
 * while conflicting user-entered values remain untouched. A planned match is
 * always upgraded to booked because a confirmation import is booking evidence.
 */
export function getImportedFlightMergePatch(
    data: Record<string, string>,
    current?: ExistingFlightForImportMerge | null
) {
    const existingHasCost = typeof current?.cost === "number";

    return {
        status:
            !current?.status || current.status === "planned"
                ? "booked"
                : current.status,
        transport_number: current?.transport_number || data.flight_number || null,
        provider_name: current?.provider_name || data.airline_name || null,
        provider_code: current?.provider_code || data.airline_code || null,
        reservation_code:
            current?.reservation_code || data.reservation_code || null,
        baggage_info:
            current?.baggage_info || data.luggage_requirements || null,
        seat_number: current?.seat_number || data.seat_number || null,
        cabin_class: current?.cabin_class || data.cabin_class || null,
        departure_location:
            current?.departure_location || data.departure_location || null,
        arrival_location:
            current?.arrival_location || data.arrival_location || null,
        departure_date: current?.departure_date || data.departure_date || null,
        departure_time: current?.departure_time || data.departure_time || null,
        arrival_date: current?.arrival_date || data.arrival_date || null,
        arrival_time: current?.arrival_time || data.arrival_time || null,
        departure_timezone:
            current?.departure_timezone || data.departure_timezone || null,
        arrival_timezone:
            current?.arrival_timezone || data.arrival_timezone || null,
        departure_terminal:
            current?.departure_terminal || data.departure_terminal || null,
        arrival_terminal:
            current?.arrival_terminal || data.arrival_terminal || null,
        departure_formatted_address:
            current?.departure_formatted_address ||
            data.departure_formatted_address ||
            null,
        departure_google_place_id:
            current?.departure_google_place_id ||
            data.departure_google_place_id ||
            null,
        departure_lat:
            current?.departure_lat ??
            parseImportedCoordinate(data.departure_lat, -90, 90),
        departure_lng:
            current?.departure_lng ??
            parseImportedCoordinate(data.departure_lng, -180, 180),
        arrival_formatted_address:
            current?.arrival_formatted_address ||
            data.arrival_formatted_address ||
            null,
        arrival_google_place_id:
            current?.arrival_google_place_id || data.arrival_google_place_id || null,
        arrival_lat:
            current?.arrival_lat ??
            parseImportedCoordinate(data.arrival_lat, -90, 90),
        arrival_lng:
            current?.arrival_lng ??
            parseImportedCoordinate(data.arrival_lng, -180, 180),
        cost: existingHasCost ? current.cost : importedMoney(data.cost),
        currency: existingHasCost
            ? current?.currency || data.currency || null
            : data.currency || current?.currency || null,
        notes: current?.notes || data.notes || null,
    };
}

export function normalizeImportedFlightNumber(value?: string | null) {
    return (value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

function normalizeFlightTime(value?: string | null) {
    const match = (value || "").trim().match(/^(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value || "";
}

export function getImportedFlightFingerprint(flight: FlightFingerprintInput) {
    const noteFlightNumber = flight.notes?.match(/^Flight:\s*([^\s]+)\s*$/im)?.[1];
    const titleFlightNumber = flight.title?.match(
        /\b([A-Z0-9]{2}\s*\d{1,4}[A-Z]?)\b/i
    )?.[1];

    return [
        normalizeImportedFlightNumber(
            flight.flightNumber ||
                flight.transport_number ||
                noteFlightNumber ||
                titleFlightNumber
        ),
        flight.departureDate || flight.departure_date || "",
        normalizeFlightTime(flight.departureTime || flight.departure_time),
    ].join("|");
}

function getImportedFlightIdentity(flight: FlightFingerprintInput) {
    const [flightNumber, departureDate, departureTime] =
        getImportedFlightFingerprint(flight).split("|");

    return { flightNumber, departureDate, departureTime };
}

/**
 * A flight number operates once on a particular departure date, which makes
 * that pair the durable import identity. Departure time is deliberately only
 * a ranking signal: confirmations and manually entered records can represent
 * the same local time differently, and schedules can change after booking.
 */
export function findImportedFlightMatch<T extends ImportedFlightMatchCandidate>(
    candidates: T[],
    importedFlight: FlightFingerprintInput
) {
    const imported = getImportedFlightIdentity(importedFlight);
    if (!imported.flightNumber || !imported.departureDate) return null;

    const matches = candidates.filter((candidate) => {
        const existing = getImportedFlightIdentity(candidate);
        return (
            existing.flightNumber === imported.flightNumber &&
            existing.departureDate === imported.departureDate
        );
    });

    return (
        matches.find(
            (candidate) =>
                getImportedFlightIdentity(candidate).departureTime ===
                imported.departureTime
        ) ||
        matches[0] ||
        null
    );
}
