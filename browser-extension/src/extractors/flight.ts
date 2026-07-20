import type { FlightCapture, FlightLeg } from "../types";
import {
    cleanText,
    confirmationNumberFromText,
    currencyFromText,
    getFirstText,
    getJsonLdNodes,
    getMeta,
    hasJsonLdType,
    isConfirmationPage,
    nullableText,
    numberValue,
    sourceFor,
    type JsonLdNode,
} from "./common";

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getLocation(value: unknown) {
    const record = asRecord(value);
    return (
        cleanText(record.iataCode, 5).toUpperCase() ||
        cleanText(record.name, 160) ||
        cleanText(value, 160)
    );
}

function getDateTime(value: unknown) {
    const text = cleanText(value, 100);
    const match = text.match(
        /^(20\d{2}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/
    );
    if (!match) return { date: "", time: "", timezone: "" };
    const offset = match[3] || "";
    return {
        date: match[1],
        time: match[2],
        timezone:
            offset === "Z"
                ? "UTC"
                : offset
                  ? `UTC${offset.includes(":") ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`}`
                  : "",
    };
}

function nodeToLeg(node: JsonLdNode): FlightLeg | null {
    const departure = getDateTime(node.departureTime);
    const arrival = getDateTime(node.arrivalTime);
    const departureLocation = getLocation(node.departureAirport);
    const arrivalLocation = getLocation(node.arrivalAirport);
    const airline = asRecord(node.provider || node.airline);
    const flightNumber = cleanText(node.flightNumber, 30).toUpperCase();

    if (!departureLocation || !arrivalLocation || !departure.date || !arrival.date) {
        return null;
    }

    return {
        departureLocation,
        arrivalLocation,
        departureDate: departure.date,
        arrivalDate: arrival.date,
        departureTime: departure.time,
        arrivalTime: arrival.time,
        departureTimezone: departure.timezone,
        arrivalTimezone: arrival.timezone,
        departureTerminal: cleanText(node.departureTerminal, 80),
        arrivalTerminal: cleanText(node.arrivalTerminal, 80),
        flightNumber,
        airlineName: cleanText(airline.name, 160),
        cost: "",
        currency: "",
    };
}

function collectFlightNodes(nodes: JsonLdNode[]) {
    const flights = nodes.filter((node) => hasJsonLdType(node, ["Flight"]));
    const reservations = nodes.filter((node) =>
        hasJsonLdType(node, ["FlightReservation"])
    );

    for (const reservation of reservations) {
        const reserved = reservation.reservationFor;
        if (Array.isArray(reserved)) {
            reserved.forEach((item) => {
                if (item && typeof item === "object") flights.push(item as JsonLdNode);
            });
        } else if (reserved && typeof reserved === "object") {
            flights.push(reserved as JsonLdNode);
        }
    }

    return flights;
}

function getAccessibleFlightLegs(document: Document) {
    const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
            '[aria-label*="flight" i], [data-testid*="flight" i], [data-stid*="flight" i]'
        )
    ).slice(0, 40);
    const seen = new Set<string>();
    const legs: FlightLeg[] = [];

    for (const element of elements) {
        const text = cleanText(element.getAttribute("aria-label") || element.innerText, 2000);
        const airports = Array.from(text.matchAll(/\b[A-Z]{3}\b/g), (match) => match[0]).filter(
            (code) => !["USD", "CAD", "EUR", "GBP", "AM", "PM"].includes(code)
        );
        const dates = Array.from(text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g), (match) => match[0]);
        const times = Array.from(
            text.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[AP]M)?\b/gi),
            (match) => match[0]
        );
        const flightNumber = text.match(/\b([A-Z0-9]{2,3})\s?(\d{1,4})\b/)?.[0] || "";
        if (airports.length < 2 || dates.length < 1 || times.length < 2) continue;

        const key = `${airports[0]}-${airports[1]}-${dates[0]}-${times[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        legs.push({
            departureLocation: airports[0],
            arrivalLocation: airports[1],
            departureDate: dates[0],
            arrivalDate: dates[1] || dates[0],
            departureTime: times[0].slice(0, 5),
            arrivalTime: times[1].slice(0, 5),
            departureTimezone: "",
            arrivalTimezone: "",
            departureTerminal: "",
            arrivalTerminal: "",
            flightNumber: flightNumber.replace(/\s+/g, ""),
            airlineName: "",
            cost: "",
            currency: "",
        });
    }

    return legs.slice(0, 8);
}

export function extractFlight(document: Document, url: URL): FlightCapture | null {
    const nodes = getJsonLdNodes(document);
    const flightNodes = collectFlightNodes(nodes);
    const structuredLegs = flightNodes
        .map(nodeToLeg)
        .filter((leg): leg is FlightLeg => Boolean(leg));
    const legs = structuredLegs.length ? structuredLegs : getAccessibleFlightLegs(document);
    const bodyText = cleanText(document.body?.innerText || document.body?.textContent, 100000);
    const pageLooksLikeFlight = Boolean(
        legs.length ||
            /(flights?|airline|airport|itinerary|departure|arrival)/i.test(
                `${url.hostname} ${document.title} ${getMeta(document, "og:title")}`
            )
    );

    if (!pageLooksLikeFlight) return null;
    if (!legs.length) return null;

    const priceText = getFirstText(document, [
        '[data-testid*="price" i]',
        '[data-stid*="price" i]',
        '[aria-label*="total price" i]',
        '[class*="price" i]',
    ]);
    const priceAmount =
        numberValue(getMeta(document, "product:price:amount", "og:price:amount")) ||
        numberValue(priceText);
    const currency =
        cleanText(
            getMeta(document, "product:price:currency", "og:price:currency"),
            3
        ).toUpperCase() || currencyFromText(priceText);
    const captureKind = isConfirmationPage(url, bodyText) ? "confirmed" : "comparison";
    const firstLeg = legs[0];
    const lastLeg = legs.at(-1) || firstLeg;
    const isRoundTrip = Boolean(
        legs.length > 1 &&
            firstLeg.departureLocation === lastLeg.arrivalLocation &&
            firstLeg.arrivalLocation === lastLeg.departureLocation
    );
    const warnings: string[] = [];
    if (!priceAmount) warnings.push("No reliable total price was detected.");
    if (legs.some((leg) => !leg.flightNumber)) warnings.push("Confirm missing flight numbers.");
    if (legs.some((leg) => !leg.departureTimezone || !leg.arrivalTimezone)) {
        warnings.push("Time zones were not available on the page and should be reviewed in VAIVIA.");
    }

    return {
        type: "flight",
        captureKind,
        confidence: Math.min(
            1,
            0.35 + (structuredLegs.length ? 0.35 : 0.15) + (priceAmount ? 0.1 : 0) + (legs.every((leg) => leg.flightNumber) ? 0.1 : 0)
        ),
        warnings,
        label: `${firstLeg.departureLocation} → ${lastLeg.arrivalLocation}`,
        isRoundTrip,
        returnLegCount: isRoundTrip ? 1 : 0,
        legs,
        price: {
            amount: priceAmount,
            currency: /^[A-Z]{3}$/.test(currency || "") ? currency : null,
            basis: /per (?:person|travell?er)|each/i.test(priceText)
                ? "per_person"
                : priceAmount
                  ? "total"
                  : "unknown",
        },
        cabinClass: nullableText(
            bodyText.match(/\b(?:basic economy|economy|premium economy|business class|first class)\b/i)?.[0],
            100
        ),
        baggageInfo: nullableText(
            bodyText.match(/(?:baggage|bags? included|carry-on|checked bag)[^.\n]{0,400}/i)?.[0],
            500
        ),
        confirmationNumber:
            captureKind === "confirmed" ? confirmationNumberFromText(bodyText) : null,
        source: sourceFor(url),
    };
}
