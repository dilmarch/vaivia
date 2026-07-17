import type { Json } from "@/src/types/supabase";
import {
    getJsonNumber,
    getJsonString,
    isJsonRecord,
} from "@/lib/travelEmailImports";
import { getAirlineCodeFromFlightNumber, getAirlineNameFromCode } from "@/lib/airlineIcons";

export type EditableImportedFlight = {
    itemId: string;
    isPrivate: string;
    airlineName: string;
    airlineCode: string;
    flightNumber: string;
    departureLocation: string;
    arrivalLocation: string;
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
    const total = getJsonNumber(source, ["cost", "total", "total_price", "price", "amount"]);

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
        arrivalLocation: clean(
            getJsonString(source, [
                "arrival_airport",
                "arrival_airport_code",
                "destination_airport",
                "destination",
                "arrival_location",
            ])
        ),
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
                "baggage",
                "luggage",
            ])
        ),
        notes: clean(getJsonString(source, ["notes"])),
        status: clean(getJsonString(source, ["status"])) || "planned",
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
