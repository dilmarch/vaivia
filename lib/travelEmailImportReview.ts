import type { Json } from "@/src/types/supabase";
import { getJsonString, isJsonRecord } from "@/lib/travelEmailImports";
import { getAirlineCodeFromFlightNumber, getAirlineNameFromCode } from "@/lib/airlineIcons";
import { stripStructuredFlightNotes } from "@/lib/flightNotes";

export type EditableImportedFlight = {
    itemId: string;
    isPrivate: string;
    airlineName: string;
    airlineCode: string;
    flightNumber: string;
    departureLocation: string;
    departureFormattedAddress: string;
    departureGooglePlaceId: string;
    departureLat: string;
    departureLng: string;
    arrivalLocation: string;
    arrivalFormattedAddress: string;
    arrivalGooglePlaceId: string;
    arrivalLat: string;
    arrivalLng: string;
    departureDate: string;
    departureTime: string;
    arrivalDate: string;
    arrivalTime: string;
    departureTerminal: string;
    arrivalTerminal: string;
    departureTimezone: string;
    arrivalTimezone: string;
    seatNumber: string;
    cabinClass: string;
    reservationCode: string;
    cost: string;
    currency: string;
    visaRequirements: string;
    luggageRequirements: string;
    notes: string;
    status: string;
};

export type ImportTripOption = {
    id: string;
    slug?: string | null;
    title: string;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
};

export type TripMatchResult = {
    recommendedTripId: string | null;
    confidence: "recommended" | "possible" | "select";
    alternatives: string[];
};

function clean(value: string) {
    return value.trim();
}

function normalizeTime(value: string) {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return trimmed;
    return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeFlightNumber(value: string, airlineCode: string) {
    const compact = value.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!compact) return "";
    if (/^[A-Z0-9]{2}\d/.test(compact)) return compact;
    if (/^\d+[A-Z]?$/.test(compact) && airlineCode) {
        return `${airlineCode}${compact}`;
    }
    return compact;
}

function getJsonStringList(data: Json, keys: string[]) {
    if (!isJsonRecord(data)) return [];

    for (const key of keys) {
        const value = data[key];
        if (Array.isArray(value)) {
            return value
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean);
        }
        if (typeof value === "string" && value.trim()) {
            return value
                .split(/\n|;|,(?=\s*[A-Za-z])/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    return [];
}

export function getImportedTravelerNames(data: Json) {
    return getJsonStringList(data, [
        "traveler_names",
        "traveller_names",
        "passenger_names",
        "passengers",
        "travelers",
    ]);
}

const IMPORT_PRICE_KEYS = [
    "booking_total",
    "grand_total",
    "total_amount",
    "total_price",
    "total",
    "cost",
    "price",
    "amount",
];

const IMPORT_CURRENCY_KEYS = ["currency", "currency_code"];

function parseImportedMoney(value: Json | undefined) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;

    const match = value.replace(/\u00a0/g, " ").match(/-?\d[\d, ]*(?:\.\d+)?/);
    if (!match) return null;
    const amount = Number(match[0].replace(/[ ,]/g, ""));
    return Number.isFinite(amount) ? amount : null;
}

function getImportedPrice(record: Record<string, Json>) {
    for (const key of IMPORT_PRICE_KEYS) {
        const amount = parseImportedMoney(record[key]);
        if (amount !== null) return amount;
    }
    return null;
}

function getImportedCurrency(record: Record<string, Json>) {
    const explicit = getJsonString(record, IMPORT_CURRENCY_KEYS)
        .trim()
        .toUpperCase();
    if (/^[A-Z]{3}$/.test(explicit)) return explicit;

    for (const key of IMPORT_PRICE_KEYS) {
        const value = record[key];
        if (typeof value !== "string") continue;
        const currencyMatch = value.toUpperCase().match(/\b[A-Z]{3}\b/);
        if (currencyMatch) return currencyMatch[0];
    }
    return "";
}

function getConfirmationPriceRecords(data: Json | null | undefined) {
    if (!isJsonRecord(data)) return [];

    const records: Record<string, Json>[] = [data];
    const summary = data.summary;
    if (isJsonRecord(summary)) {
        records.unshift(summary);
        for (const key of ["pricing", "payment", "fare", "totals"]) {
            const nested = summary[key];
            if (isJsonRecord(nested)) records.unshift(nested);
        }
    }
    return records;
}

/**
 * Airline confirmations commonly quote one booking total for several segments.
 * Keep that total on the first reviewed flight so it is not double-counted.
 */
export function applyConfirmationPriceToFlights(
    flights: EditableImportedFlight[],
    importData: Json | null | undefined
) {
    if (flights.length === 0) return flights;

    const confirmationRecords = getConfirmationPriceRecords(importData);
    const confirmationRecord = confirmationRecords.find(
        (record) => getImportedPrice(record) !== null
    );
    const pricedFlight = flights.find((flight) => flight.cost.trim());
    const amount = confirmationRecord
        ? getImportedPrice(confirmationRecord)
        : pricedFlight
          ? parseImportedMoney(pricedFlight.cost)
          : null;

    if (amount === null) return flights;

    const currency =
        (confirmationRecord && getImportedCurrency(confirmationRecord)) ||
        pricedFlight?.currency ||
        flights[0].currency;

    return flights.map((flight, index) => ({
        ...flight,
        cost: index === 0 ? String(amount) : "",
        currency: index === 0 && currency ? currency : flight.currency,
    }));
}

export function getEditableImportedFlight(
    itemId: string,
    extractedData: Json,
    reviewedData?: Json | null
): EditableImportedFlight {
    const source = isJsonRecord(reviewedData) ? reviewedData : extractedData;
    const flightNumberRaw = getJsonString(source, [
        "flight_number",
        "flight",
        "transport_number",
    ]);
    const airlineCode =
        getJsonString(source, [
            "airline_code",
            "marketing_airline_code",
            "carrier_code",
            "provider_code",
        ]) || getAirlineCodeFromFlightNumber(flightNumberRaw) || "";
    const flightNumber = normalizeFlightNumber(flightNumberRaw, airlineCode);
    const airlineName =
        getJsonString(source, ["airline_name", "airline", "carrier", "provider_name"]) ||
        getAirlineNameFromCode(airlineCode);
    const departureDate = getJsonString(source, [
        "departure_date",
        "depart_date",
        "date",
    ]);
    const arrivalDate =
        getJsonString(source, ["arrival_date", "arrive_date"]) || departureDate;
    const total = getImportedPrice(isJsonRecord(source) ? source : {});
    const importedStatus = clean(getJsonString(source, ["status"]));

    return {
        itemId,
        isPrivate: clean(getJsonString(source, ["is_private"])),
        airlineName: clean(airlineName),
        airlineCode: clean(airlineCode).toUpperCase(),
        flightNumber,
        departureLocation: clean(
            getJsonString(source, [
                "departure_airport",
                "departure_airport_code",
                "origin_airport",
                "origin",
                "departure_location",
            ])
        ),
        departureFormattedAddress: clean(
            getJsonString(source, ["departure_formatted_address"])
        ),
        departureGooglePlaceId: clean(
            getJsonString(source, ["departure_google_place_id"])
        ),
        departureLat: clean(getJsonString(source, ["departure_lat"])),
        departureLng: clean(getJsonString(source, ["departure_lng"])),
        arrivalLocation: clean(
            getJsonString(source, [
                "arrival_airport",
                "arrival_airport_code",
                "destination_airport",
                "destination",
                "arrival_location",
            ])
        ),
        arrivalFormattedAddress: clean(
            getJsonString(source, ["arrival_formatted_address"])
        ),
        arrivalGooglePlaceId: clean(
            getJsonString(source, ["arrival_google_place_id"])
        ),
        arrivalLat: clean(getJsonString(source, ["arrival_lat"])),
        arrivalLng: clean(getJsonString(source, ["arrival_lng"])),
        departureDate: clean(departureDate),
        departureTime: normalizeTime(
            getJsonString(source, [
                "departure_local_time",
                "departure_time",
                "depart_time",
            ])
        ),
        arrivalDate: clean(arrivalDate),
        arrivalTime: normalizeTime(
            getJsonString(source, ["arrival_local_time", "arrival_time"])
        ),
        departureTerminal: clean(getJsonString(source, ["departure_terminal"])),
        arrivalTerminal: clean(getJsonString(source, ["arrival_terminal"])),
        departureTimezone: clean(
            getJsonString(source, ["departure_timezone", "origin_timezone"])
        ),
        arrivalTimezone: clean(
            getJsonString(source, ["arrival_timezone", "destination_timezone"])
        ),
        seatNumber: clean(getJsonString(source, ["seat_number", "seat"])),
        cabinClass: clean(getJsonString(source, ["cabin_class", "cabin"])),
        reservationCode: clean(
            getJsonString(source, [
                "reservation_code",
                "booking_reference",
                "confirmation_number",
                "record_locator",
            ])
        ),
        cost: total === null ? "" : String(total),
        currency: clean(getJsonString(source, ["currency", "currency_code"])).toUpperCase(),
        visaRequirements: clean(
            getJsonString(source, [
                "visa_requirements",
                "visa_requirement",
                "entry_requirements",
            ])
        ),
        luggageRequirements: clean(
            getJsonString(source, [
                "luggage_requirements",
                "luggage_requirement",
                "baggage_info",
                "baggage_allowance",
                "checked_baggage",
                "baggage",
                "luggage",
            ])
        ),
        notes: stripStructuredFlightNotes(
            clean(getJsonString(source, ["notes"]))
        ),
        status:
            !importedStatus || importedStatus === "planned"
                ? "booked"
                : importedStatus,
    };
}

function parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(left: Date, right: Date) {
    return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function tripText(trip: ImportTripOption) {
    return `${trip.title} ${trip.destination || ""}`.toLowerCase();
}

function flightText(flight: EditableImportedFlight) {
    return `${flight.departureLocation} ${flight.arrivalLocation}`.toLowerCase();
}

export function matchImportToTrips(
    flights: EditableImportedFlight[],
    trips: ImportTripOption[]
): TripMatchResult {
    const scoredTrips = trips.map((trip) => {
        const start = parseDate(trip.start_date);
        const end = parseDate(trip.end_date);
        const tripHaystack = tripText(trip);
        let score = 0;

        for (const flight of flights) {
            const departure = parseDate(flight.departureDate);
            const arrival = parseDate(flight.arrivalDate);
            const routeHaystack = flightText(flight);

            if (start && end && departure) {
                if (departure >= start && departure <= end) score += 50;
                const distanceFromStart = Math.abs(daysBetween(departure, start));
                const distanceFromEnd = Math.abs(daysBetween(departure, end));
                if (distanceFromStart === 1 || distanceFromEnd === 1) score += 15;
                if (distanceFromStart > 7 && distanceFromEnd > 7) score -= 50;
            }

            if (start && end && arrival) {
                if (arrival >= start && arrival <= end) score += 35;
            }

            if (routeHaystack && tripHaystack) {
                const tokens = routeHaystack
                    .split(/[^a-z0-9]+/)
                    .filter((token) => token.length >= 3);
                if (tokens.some((token) => tripHaystack.includes(token))) {
                    score += 25;
                }
            }
        }

        if (flights.length > 1 && score > 0) score += 10;
        return { trip, score };
    });

    scoredTrips.sort((left, right) => right.score - left.score);
    const best = scoredTrips[0];

    if (!best || best.score <= 0) {
        return {
            recommendedTripId: null,
            confidence: "select",
            alternatives: scoredTrips.slice(0, 3).map(({ trip }) => trip.id),
        };
    }

    return {
        recommendedTripId: best.trip.id,
        confidence: best.score >= 60 ? "recommended" : "possible",
        alternatives: scoredTrips.slice(1, 4).map(({ trip }) => trip.id),
    };
}

export function getRequiredFlightIssues(flight: EditableImportedFlight) {
    return [
        ["Flight number", flight.flightNumber],
        ["Departure airport", flight.departureLocation],
        ["Arrival airport", flight.arrivalLocation],
        ["Departure date", flight.departureDate],
        ["Departure local time", flight.departureTime],
        ["Arrival date", flight.arrivalDate],
        ["Arrival local time", flight.arrivalTime],
    ]
        .filter(([, value]) => !value)
        .map(([label]) => label);
}
