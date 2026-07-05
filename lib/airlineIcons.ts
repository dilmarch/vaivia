const AIRLINE_DOMAINS: Record<string, string> = {
    AC: "aircanada.com",
    WS: "westjet.com",
    PD: "flyporter.com",
    TS: "airtransat.com",
    WG: "sunwing.ca",
    AA: "aa.com",
    DL: "delta.com",
    UA: "united.com",
    WN: "southwest.com",
    B6: "jetblue.com",
    AS: "alaskaair.com",
    BA: "britishairways.com",
    LH: "lufthansa.com",
    AF: "airfrance.com",
    KL: "klm.com",
    IB: "iberia.com",
    EI: "aerlingus.com",
    TP: "flytap.com",
    FR: "ryanair.com",
    U2: "easyjet.com",
    W6: "wizzair.com",
    VY: "vueling.com",
    EK: "emirates.com",
    QR: "qatarairways.com",
    EY: "etihad.com",
    SQ: "singaporeair.com",
    CX: "cathaypacific.com",
    JL: "jal.co.jp",
    NH: "ana.co.jp",
    KE: "koreanair.com",
    OZ: "flyasiana.com",
    BR: "evaair.com",
    CI: "china-airlines.com",
    QF: "qantas.com",
    NZ: "airnewzealand.com",
};

const AIRLINE_NAMES_BY_CODE: Record<string, string> = {
    AC: "Air Canada",
    WS: "WestJet",
    PD: "Porter Airlines",
    TS: "Air Transat",
    WG: "Sunwing Airlines",
    AA: "American Airlines",
    DL: "Delta Air Lines",
    UA: "United Airlines",
    WN: "Southwest Airlines",
    B6: "JetBlue",
    AS: "Alaska Airlines",
    BA: "British Airways",
    LH: "Lufthansa",
    AF: "Air France",
    KL: "KLM",
    IB: "Iberia",
    EI: "Aer Lingus",
    TP: "TAP Air Portugal",
    FR: "Ryanair",
    U2: "easyJet",
    W6: "Wizz Air",
    VY: "Vueling",
    EK: "Emirates",
    QR: "Qatar Airways",
    EY: "Etihad Airways",
    SQ: "Singapore Airlines",
    CX: "Cathay Pacific",
    JL: "Japan Airlines",
    NH: "All Nippon Airways",
    KE: "Korean Air",
    OZ: "Asiana Airlines",
    BR: "EVA Air",
    CI: "China Airlines",
    QF: "Qantas",
    NZ: "Air New Zealand",
};

export function getAirlineCodeFromFlightNumber(flightNumber?: string | null) {
    if (!flightNumber) return null;

    const cleaned = flightNumber.trim().toUpperCase().replace(/\s+/g, "");
    const match = cleaned.match(/^([A-Z0-9]{2})(\d+)/);

    return match?.[1] ?? null;
}

export function getAirlineNameFromCode(airlineCode?: string | null) {
    if (!airlineCode) return "";
    return AIRLINE_NAMES_BY_CODE[airlineCode.trim().toUpperCase()] || "";
}

export function getAirlineIconUrl(
    flightNumber?: string | null,
    airlineCode?: string | null
) {
    const code =
        getAirlineCodeFromFlightNumber(flightNumber) ||
        airlineCode?.trim().toUpperCase();

    if (!code) return null;

    const domain = AIRLINE_DOMAINS[code];
    if (!domain) return null;

    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain
    )}&sz=64`;
}
