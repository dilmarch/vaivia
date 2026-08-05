const AIRLINE_CHECK_IN_URLS: Record<string, string> = {
    "7C": "https://www.jejuair.net/en/prepare/checkin/guide.do",
    AA: "https://www.aa.com/reservation/flightCheckInViewReservationsAccess.do",
    AC: "https://www.aircanada.com/ca/en/aco/home/fly/check-in.html",
    AF: "https://wwws.airfrance.us/check-in",
    AS: "https://www.alaskaair.com/booking/reservation-lookup",
    BA: "https://www.britishairways.com/travel/olcilandingpageauthreq/public/en_gb",
    B6: "https://www.jetblue.com/checkin",
    BR: "https://www.evaair.com/en-global/manage-your-trip/check-in/online-check-in/",
    DL: "https://www.delta.com/PCCOciWeb/findBy.action",
    EK: "https://www.emirates.com/manage-booking/online-check-in/",
    FR: "https://www.ryanair.com/gb/en/lp/check-in",
    LH: "https://www.lufthansa.com/us/en/online-check-in",
    QR: "https://www.qatarairways.com/en/check-in.html",
    RK: "https://www.ryanair.com/gb/en/lp/check-in",
    U2: "https://www.easyjet.com/en/help/booking-and-check-in/check-in",
    UA: "https://www.united.com/en/us/checkin",
    VJ: "https://www.vietjetair.com/en/check-in",
    VN: "https://www.vietnamairlines.com/us/en/travel-information/check-in/online-check-in",
    VS: "https://www.virginatlantic.com/check-in",
    WS: "https://www.westjet.com/en-ca/manage/check-in",
};

const AIRLINE_CODES_BY_NAME: Array<[RegExp, string]> = [
    [/air canada/i, "AC"],
    [/american airlines/i, "AA"],
    [/air france/i, "AF"],
    [/alaska airlines/i, "AS"],
    [/british airways/i, "BA"],
    [/delta/i, "DL"],
    [/easyjet/i, "U2"],
    [/emirates/i, "EK"],
    [/eva air/i, "BR"],
    [/jeju air/i, "7C"],
    [/jetblue/i, "B6"],
    [/lufthansa/i, "LH"],
    [/qatar airways/i, "QR"],
    [/ryanair/i, "FR"],
    [/united airlines/i, "UA"],
    [/vietjet/i, "VJ"],
    [/vietnam airlines/i, "VN"],
    [/virgin atlantic/i, "VS"],
    [/westjet/i, "WS"],
];

function normalizeAirlineCode(value?: string | null) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

export function getAirlineCheckInUrl({
    airlineCode,
    airlineName,
    flightNumber,
}: {
    airlineCode?: string | null;
    airlineName?: string | null;
    flightNumber?: string | null;
}) {
    const explicitCode = normalizeAirlineCode(airlineCode);
    const flightCode = normalizeAirlineCode(flightNumber).match(/^([A-Z0-9]{2})\d/)?.[1];
    const nameCode = AIRLINE_CODES_BY_NAME.find(([pattern]) =>
        pattern.test(String(airlineName || ""))
    )?.[1];
    const code = explicitCode || flightCode || nameCode || "";

    return AIRLINE_CHECK_IN_URLS[code] || null;
}
