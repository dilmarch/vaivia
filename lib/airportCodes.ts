const IATA_TO_ICAO_AIRPORT_CODES: Record<string, string> = {
    YYT: "CYYT",
    YUL: "CYUL",
    YYZ: "CYYZ",
    YTZ: "CYTZ",
    YVR: "CYVR",
    YYC: "CYYC",
    YEG: "CYEG",
    YHZ: "CYHZ",
    YOW: "CYOW",
    YWG: "CYWG",
    YQB: "CYQB",
    LGW: "EGKK",
    LHR: "EGLL",
    LCY: "EGLC",
    LTN: "EGGW",
    STN: "EGSS",
    BER: "EDDB",
    FRA: "EDDF",
    MUC: "EDDM",
    HAM: "EDDH",
    DUS: "EDDL",
    CGN: "EDDK",
    CDG: "LFPG",
    ORY: "LFPO",
    AMS: "EHAM",
    LIS: "LPPT",
    OPO: "LPPR",
    MAD: "LEMD",
    BCN: "LEBL",
    FCO: "LIRF",
    MXP: "LIMC",
    LIN: "LIML",
    VCE: "LIPZ",
    ZRH: "LSZH",
    GVA: "LSGG",
    VIE: "LOWW",
    BRU: "EBBR",
    DUB: "EIDW",
    CPH: "EKCH",
    ARN: "ESSA",
    OSL: "ENGM",
    HEL: "EFHK",
    JFK: "KJFK",
    EWR: "KEWR",
    LGA: "KLGA",
    BOS: "KBOS",
    IAD: "KIAD",
    DCA: "KDCA",
    ORD: "KORD",
    ATL: "KATL",
    MIA: "KMIA",
    FLL: "KFLL",
    MCO: "KMCO",
    LAX: "KLAX",
    SFO: "KSFO",
    SEA: "KSEA",
    LAS: "KLAS",
    DFW: "KDFW",
    DEN: "KDEN",
    DXB: "OMDB",
    DOH: "OTHH",
    AUH: "OMAA",
    SIN: "WSSS",
    HKG: "VHHH",
    ICN: "RKSI",
    GMP: "RKSS",
    NRT: "RJAA",
    HND: "RJTT",
    TPE: "RCTP",
    BKK: "VTBS",
    SGN: "VVTS",
    HAN: "VVNB",
    SYD: "YSSY",
    MEL: "YMML",
    AKL: "NZAA",
};

const AIRPORT_NAME_TO_IATA_CODES: Record<string, string> = {
    "ST JOHN'S INTERNATIONAL AIRPORT": "YYT",
    "ST. JOHN'S INTERNATIONAL AIRPORT": "YYT",
    "ST JOHNS INTERNATIONAL AIRPORT": "YYT",
    "ST. JOHNS INTERNATIONAL AIRPORT": "YYT",
    "LONDON GATWICK AIRPORT": "LGW",
    "GATWICK AIRPORT": "LGW",
    "LONDON HEATHROW AIRPORT": "LHR",
    "HEATHROW AIRPORT": "LHR",
    "LONDON CITY AIRPORT": "LCY",
    "LONDON STANSTED AIRPORT": "STN",
    "LONDON LUTON AIRPORT": "LTN",
    "BERLIN BRANDENBURG AIRPORT": "BER",
    "TORONTO PEARSON INTERNATIONAL AIRPORT": "YYZ",
    "BILLY BISHOP TORONTO CITY AIRPORT": "YTZ",
    "MONTRÉAL-TRUDEAU INTERNATIONAL AIRPORT": "YUL",
    "MONTREAL-TRUDEAU INTERNATIONAL AIRPORT": "YUL",
    "MONTRÉAL-PIERRE ELLIOTT TRUDEAU INTERNATIONAL AIRPORT": "YUL",
    "MONTREAL-PIERRE ELLIOTT TRUDEAU INTERNATIONAL AIRPORT": "YUL",
    "MONTRÉAL-PIERRE ELLIOTT TRUDEAU INTL AIRPORT": "YUL",
    "MONTREAL-PIERRE ELLIOTT TRUDEAU INTL AIRPORT": "YUL",
    "HALIFAX STANFIELD INTERNATIONAL AIRPORT": "YHZ",
    "VANCOUVER INTERNATIONAL AIRPORT": "YVR",
    "CALGARY INTERNATIONAL AIRPORT": "YYC",
    "EDMONTON INTERNATIONAL AIRPORT": "YEG",
    "OTTAWA INTERNATIONAL AIRPORT": "YOW",
};

function normalizeAirportName(value: string) {
    return value
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[‐‑‒–—―]/g, "-")
        .replace(/\s*-\s*/g, "-")
        .replace(/\s+/g, " ")
        .replace(/[’]/g, "'");
}

function getAirportIataCodeFromName(value: string) {
    const normalizedName = normalizeAirportName(value);

    for (const [airportName, iataCode] of Object.entries(
        AIRPORT_NAME_TO_IATA_CODES
    )) {
        if (normalizeAirportName(airportName) === normalizedName) {
            return iataCode;
        }
    }

    for (const [airportName, iataCode] of Object.entries(
        AIRPORT_NAME_TO_IATA_CODES
    )) {
        const normalizedAirportName = normalizeAirportName(airportName);
        if (
            normalizedName.includes(normalizedAirportName) ||
            normalizedAirportName.includes(normalizedName)
        ) {
            return iataCode;
        }
    }

    if (
        normalizedName.includes("PIERRE ELLIOTT TRUDEAU") ||
        normalizedName.includes("MONTREAL-TRUDEAU") ||
        normalizedName.includes("MONTREAL TRUDEAU")
    ) {
        return "YUL";
    }

    return null;
}

export function getIcaoAirportCode(code?: string | null) {
    if (!code) return null;

    const cleaned = code.trim().toUpperCase();

    if (/^[A-Z]{4}$/.test(cleaned)) return cleaned;
    if (/^[A-Z]{3}$/.test(cleaned)) {
        return IATA_TO_ICAO_AIRPORT_CODES[cleaned] ?? null;
    }

    const airportIataCode = getAirportIataCodeFromName(code);
    if (airportIataCode) {
        return IATA_TO_ICAO_AIRPORT_CODES[airportIataCode] ?? null;
    }

    return null;
}

export function getIataAirportCode(code?: string | null) {
    if (!code) return null;

    const cleaned = code.trim().toUpperCase();

    if (/^[A-Z]{3}$/.test(cleaned) && IATA_TO_ICAO_AIRPORT_CODES[cleaned]) {
        return cleaned;
    }

    if (/^[A-Z]{4}$/.test(cleaned)) {
        return (
            Object.entries(IATA_TO_ICAO_AIRPORT_CODES).find(
                ([, icaoCode]) => icaoCode === cleaned
            )?.[0] ?? null
        );
    }

    return getAirportIataCodeFromName(code);
}
