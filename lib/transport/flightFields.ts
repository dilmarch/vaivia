type TransportationFlightRecord = {
    flight_number?: unknown;
    transport_number?: unknown;
    airline_name?: unknown;
    provider_name?: unknown;
    airline_code?: unknown;
    provider_code?: unknown;
    notes?: unknown;
    title?: unknown;
};

function getText(
    record: TransportationFlightRecord,
    keys: Array<keyof TransportationFlightRecord>
) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }

    return "";
}

export function extractFlightNumber(value?: string | null) {
    if (!value) return "";

    for (const match of value
        .toUpperCase()
        .matchAll(/\b([A-Z0-9]{2,3})[\s-]?(\d{1,4}[A-Z]?)\b/g)) {
        const airlineCode = match[1];
        if (/[A-Z]/.test(airlineCode)) return `${airlineCode}${match[2]}`;
    }

    return "";
}

export function getTransportationFlightNumber(
    record: TransportationFlightRecord
) {
    const storedFlightNumber = getText(record, [
        "transport_number",
        "flight_number",
    ]);
    if (storedFlightNumber) return storedFlightNumber;

    const notes = getText(record, ["notes"]);
    const noteFlightNumber = notes.match(
        /(?:^|\r?\n)Flight:\s*([A-Z0-9][A-Z0-9\s-]*\d[A-Z0-9\s-]*)/i
    )?.[1];

    return (
        extractFlightNumber(noteFlightNumber) ||
        extractFlightNumber(getText(record, ["title"]))
    );
}

export function getTransportationAirlineName(
    record: TransportationFlightRecord
) {
    return getText(record, ["provider_name", "airline_name"]);
}

export function getTransportationAirlineCode(
    record: TransportationFlightRecord
) {
    return getText(record, ["provider_code", "airline_code"]);
}

export function getCanonicalFlightPersistenceFields({
    airlineName,
    airlineCode,
    flightNumber,
}: {
    airlineName?: string | null;
    airlineCode?: string | null;
    flightNumber?: string | null;
}) {
    return {
        provider_name: airlineName?.trim() || null,
        provider_code: airlineCode?.trim() || null,
        transport_number: flightNumber?.trim() || null,
    };
}

export function getFlightTitleLabel({
    airlineName,
    airlineCode,
    flightNumber,
    title,
}: {
    airlineName?: string | null;
    airlineCode?: string | null;
    flightNumber?: string | null;
    title?: string | null;
}) {
    if (!flightNumber) return title || airlineName || airlineCode || "Flight";

    const normalizedFlightNumber = flightNumber.trim().toUpperCase();
    const normalizedAirlineCode = airlineCode?.trim().toUpperCase() || "";
    const shouldShowAirlineCode =
        normalizedAirlineCode &&
        !normalizedFlightNumber.startsWith(normalizedAirlineCode);
    const airlineLabel =
        airlineName || (shouldShowAirlineCode ? normalizedAirlineCode : "");

    return [airlineLabel, flightNumber].filter(Boolean).join(" ");
}
