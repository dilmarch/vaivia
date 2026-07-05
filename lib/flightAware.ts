import { getIcaoAirportCode } from "@/lib/airportCodes";

const IATA_TO_ICAO_AIRLINE_CODES: Record<string, string> = {
    AC: "ACA",
    WS: "WJA",
    PD: "POE",
    TS: "TSC",
    WG: "SWG",
    BA: "BAW",
    LH: "DLH",
    AF: "AFR",
    KL: "KLM",
    UA: "UAL",
    AA: "AAL",
    DL: "DAL",
    B6: "JBU",
    WN: "SWA",
    VS: "VIR",
    IB: "IBE",
    EI: "EIN",
    FR: "RYR",
    U2: "EZY",
    W6: "WZZ",
    VY: "VLG",
    TP: "TAP",
    EK: "UAE",
    QR: "QTR",
    EY: "ETD",
    SQ: "SIA",
    CX: "CPA",
    JL: "JAL",
    NH: "ANA",
    KE: "KAL",
    OZ: "AAR",
    BR: "EVA",
    CI: "CAL",
    QF: "QFA",
    NZ: "ANZ",
};

type FlightAwareUrlOptions = {
    departureDate?: string | null;
    departureTime?: string | null;
    departureTimezone?: string | null;
    originAirportCode?: string | null;
    destinationAirportCode?: string | null;
};

type FlightAwareHistoryUrlOptions = FlightAwareUrlOptions & {
    flightNumber?: string | null;
};

export function getFlightAwareIdent(flightNumber: string) {
    const cleaned = flightNumber.replace(/\s+/g, "").toUpperCase();
    const match = cleaned.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);

    if (!match) return cleaned;

    const [, iataCode, number] = match;
    const icaoCode = IATA_TO_ICAO_AIRLINE_CODES[iataCode];

    return `${icaoCode ?? iataCode}${number}`;
}

function compactDate(date: string) {
    return date.replaceAll("-", "");
}

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    const localizedDateAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour) % 24,
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((localizedDateAsUtc - date.getTime()) / 60000);
}

function zonedDateTimeToUtc(dateKey: string, timeString: string, timezone: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);
    let utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    for (let index = 0; index < 2; index += 1) {
        const offsetMinutes = getTimezoneOffsetMinutes(timezone, utcDate);
        utcDate = new Date(
            Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60000
        );
    }

    return utcDate;
}

function addMinutesToLocalDateTime(
    dateKey: string,
    timeString: string,
    minutesToAdd: number
) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);
    const adjustedDate = new Date(
        Date.UTC(year, month - 1, day, hours, minutes + minutesToAdd)
    );
    const adjustedYear = adjustedDate.getUTCFullYear();
    const adjustedMonth = String(adjustedDate.getUTCMonth() + 1).padStart(2, "0");
    const adjustedDay = String(adjustedDate.getUTCDate()).padStart(2, "0");
    const adjustedHours = String(adjustedDate.getUTCHours()).padStart(2, "0");
    const adjustedMinutes = String(adjustedDate.getUTCMinutes()).padStart(2, "0");

    return {
        dateKey: `${adjustedYear}-${adjustedMonth}-${adjustedDay}`,
        timeString: `${adjustedHours}:${adjustedMinutes}`,
    };
}

function formatUtcHistorySegment(
    departureDate?: string | null,
    departureTime?: string | null,
    departureTimezone?: string | null
) {
    if (!departureDate) return null;

    if (!departureTime || !departureTimezone) {
        return compactDate(departureDate);
    }

    try {
        const adjustedDeparture = addMinutesToLocalDateTime(
            departureDate,
            departureTime,
            10
        );
        const utcDate = zonedDateTimeToUtc(
            adjustedDeparture.dateKey,
            adjustedDeparture.timeString,
            departureTimezone
        );
        const year = utcDate.getUTCFullYear();
        const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(utcDate.getUTCDate()).padStart(2, "0");
        const hours = String(utcDate.getUTCHours()).padStart(2, "0");
        const minutes = String(utcDate.getUTCMinutes()).padStart(2, "0");

        return `${year}${month}${day}/${hours}${minutes}Z`;
    } catch {
        return compactDate(departureDate);
    }
}

export function getFlightAwareHistoryUrl({
    flightNumber,
    ...options
}: FlightAwareHistoryUrlOptions) {
    if (!flightNumber) return null;

    const ident = getFlightAwareIdent(flightNumber);
    const baseUrl = `https://www.flightaware.com/live/flight/${encodeURIComponent(
        ident
    )}`;
    const originIcao = getIcaoAirportCode(options.originAirportCode);
    const destinationIcao = getIcaoAirportCode(options.destinationAirportCode);

    if (
        !options.departureDate ||
        !options.departureTime ||
        !options.departureTimezone ||
        !originIcao ||
        !destinationIcao
    ) {
        return baseUrl;
    }

    const historySegment = formatUtcHistorySegment(
        options.departureDate,
        options.departureTime,
        options.departureTimezone
    );

    if (!historySegment || !historySegment.includes("/")) return baseUrl;

    return `${baseUrl}/history/${historySegment}/${originIcao}/${destinationIcao}`;
}

export function getFlightAwareUrl(
    flightNumber: string,
    options: FlightAwareUrlOptions = {}
) {
    return getFlightAwareHistoryUrl({ flightNumber, ...options }) || "";
}
