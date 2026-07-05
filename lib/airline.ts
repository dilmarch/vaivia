export function getAirlineLogoUrl(airlineCode?: string | null): string | null {
    if (!airlineCode) return null;

    const normalizedCode = airlineCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(normalizedCode)) return null;

    return `https://content.airhex.com/content/logos/airlines_${normalizedCode}_200_200_s.png`;
}

export function inferAirlineCodeFromFlightNumber(flightNumber: string) {
    return flightNumber.trim().toUpperCase().match(/^[A-Z]{2,3}/)?.[0] || "";
}

const AIRLINE_NAMES_BY_CODE: Record<string, string> = {
    AC: "Air Canada",
    AF: "Air France",
    AA: "American Airlines",
    AS: "Alaska Airlines",
    BA: "British Airways",
    B6: "JetBlue",
    DL: "Delta Air Lines",
    EK: "Emirates",
    LH: "Lufthansa",
    QR: "Qatar Airways",
    RK: "Ryanair UK",
    UA: "United Airlines",
    VS: "Virgin Atlantic",
    WS: "WestJet",
};

export function getAirlineNameFromCode(airlineCode?: string | null) {
    if (!airlineCode) return "";
    return AIRLINE_NAMES_BY_CODE[airlineCode.trim().toUpperCase()] || "";
}
