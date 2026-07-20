import type { HotelCapture } from "../types";
import {
    cleanText,
    confirmationNumberFromText,
    currencyFromText,
    dateFromUrl,
    getFirstText,
    getJsonLdNodes,
    getMeta,
    hasJsonLdType,
    integerFromUrl,
    isConfirmationPage,
    isoDate,
    nullableText,
    numberValue,
    sourceFor,
    signedNumberValue,
    type JsonLdNode,
} from "./common";

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function findOffer(node: JsonLdNode) {
    const raw = node.offers;
    if (Array.isArray(raw)) return asRecord(raw[0]);
    return asRecord(raw);
}

function getDateFromDocument(document: Document, selectors: string[]) {
    for (const selector of selectors) {
        const element = document.querySelector<HTMLInputElement | HTMLElement>(selector);
        const candidates = [
            element instanceof HTMLInputElement ? element.value : "",
            element?.getAttribute("data-date"),
            element?.getAttribute("datetime"),
            element?.textContent,
        ];
        for (const candidate of candidates) {
            const date = isoDate(candidate);
            if (date) return date;
        }
    }
    return "";
}

function getPrice(document: Document, hotelNode: JsonLdNode | undefined) {
    const offer = hotelNode ? findOffer(hotelNode) : {};
    const structuredPrice = numberValue(offer.price ?? offer.lowPrice);
    const structuredCurrency = cleanText(offer.priceCurrency, 3).toUpperCase();
    const priceText = getFirstText(document, [
        '[data-testid="price-and-discounted-price"]',
        '[data-testid="price-lockup-text"]',
        '[data-stid="price-lockup-text"]',
        '[itemprop="price"]',
        '.price',
    ]);
    const metaPrice = getMeta(document, "product:price:amount", "og:price:amount");
    const metaCurrency = getMeta(
        document,
        "product:price:currency",
        "og:price:currency"
    );
    const amount = structuredPrice ?? numberValue(metaPrice) ?? numberValue(priceText);
    const currency =
        (/^[A-Z]{3}$/.test(structuredCurrency) ? structuredCurrency : null) ||
        (/^[A-Za-z]{3}$/.test(metaCurrency) ? metaCurrency.toUpperCase() : null) ||
        currencyFromText(priceText);
    const basis = /per night|nightly|\/night/i.test(priceText)
        ? "per_night"
        : amount
          ? "total"
          : "unknown";

    return { amount, currency, basis } as HotelCapture["price"];
}

export function extractHotel(document: Document, url: URL): HotelCapture | null {
    const nodes = getJsonLdNodes(document);
    const hotelNode = nodes.find((node) =>
        hasJsonLdType(node, ["Hotel", "LodgingBusiness", "Resort", "Hostel", "Motel"])
    );
    const addressNode = asRecord(hotelNode?.address);
    const geoNode = asRecord(hotelNode?.geo);
    const bodyText = cleanText(document.body?.innerText || document.body?.textContent, 100000);
    const name =
        cleanText(hotelNode?.name, 200) ||
        getFirstText(document, [
            'h1[data-testid="title"]',
            '[data-stid="content-hotel-title"]',
            "h1",
        ], 200) ||
        cleanText(getMeta(document, "og:title"), 200);
    const pageLooksLikeHotel = Boolean(
        hotelNode ||
            /(hotel|hostel|resort|motel|apartment|property|room)/i.test(
                `${url.hostname} ${name} ${getMeta(document, "og:type")}`
            )
    );

    if (!name || !pageLooksLikeHotel) return null;

    const checkInDate =
        dateFromUrl(url, ["checkin", "check_in", "checkInDate", "startDate"]) ||
        getDateFromDocument(document, [
            'input[name*="checkin" i]',
            '[data-testid*="checkin" i]',
            'time[itemprop="checkinTime"]',
        ]);
    const checkOutDate =
        dateFromUrl(url, ["checkout", "check_out", "checkOutDate", "endDate"]) ||
        getDateFromDocument(document, [
            'input[name*="checkout" i]',
            '[data-testid*="checkout" i]',
            'time[itemprop="checkoutTime"]',
        ]);
    const address =
        nullableText(addressNode.streetAddress, 500) ||
        nullableText(hotelNode?.address, 500) ||
        nullableText(
            getFirstText(document, [
                '[data-testid="address"]',
                '[data-stid="content-hotel-address"]',
                '[itemprop="address"]',
            ]),
            500
        );
    const cancellationPolicy = nullableText(
        getFirstText(document, [
            '[data-testid*="cancellation" i]',
            '[class*="cancellation" i]',
            '[data-stid*="cancellation" i]',
        ], 800) || bodyText.match(/(?:free cancellation|non-refundable|cancellation policy)[^.\n]{0,500}/i)?.[0],
        800
    );
    const warnings: string[] = [];
    if (!checkInDate || !checkOutDate) warnings.push("Confirm the check-in and check-out dates.");
    const price = getPrice(document, hotelNode);
    if (!price.amount) warnings.push("No reliable price was detected.");
    if (!address) warnings.push("No property address was detected.");
    const captureKind = isConfirmationPage(url, bodyText) ? "confirmed" : "comparison";

    return {
        type: "hotel",
        captureKind,
        confidence: Math.min(
            1,
            0.35 + (hotelNode ? 0.25 : 0) + (checkInDate && checkOutDate ? 0.2 : 0) + (price.amount ? 0.1 : 0) + (address ? 0.1 : 0)
        ),
        warnings,
        name,
        address,
        city: nullableText(addressNode.addressLocality, 160),
        region: nullableText(addressNode.addressRegion, 160),
        country: nullableText(asRecord(addressNode.addressCountry).name || addressNode.addressCountry, 160),
        postalCode: nullableText(addressNode.postalCode, 40),
        latitude: signedNumberValue(geoNode.latitude),
        longitude: signedNumberValue(geoNode.longitude),
        googlePlaceId: null,
        checkInDate,
        checkOutDate,
        roomType: nullableText(
            getFirstText(document, [
                '[data-testid*="room-name" i]',
                '[data-stid*="room-name" i]',
                '[class*="room-name" i]',
            ]),
            200
        ),
        guests:
            integerFromUrl(url, ["group_adults", "adults", "adultCount", "travellers"]) ||
            null,
        rooms: integerFromUrl(url, ["no_rooms", "rooms", "roomCount"]),
        price,
        cancellationPolicy,
        freeCancellationEndsOn: "",
        paymentTerms: nullableText(
            bodyText.match(/(?:pay at (?:the )?property|pay now|pay later|no prepayment)[^.\n]{0,300}/i)?.[0],
            500
        ),
        confirmationNumber:
            captureKind === "confirmed" ? confirmationNumberFromText(bodyText) : null,
        source: sourceFor(url),
    };
}
