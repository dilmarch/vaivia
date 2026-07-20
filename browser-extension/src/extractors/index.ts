import type { TravelCapture } from "../types";
import { extractFlight } from "./flight";
import { extractHotel } from "./hotel";

export function extractTravelPage(document: Document, url: URL): TravelCapture | null {
    const hostname = url.hostname.toLowerCase();
    const title = document.title.toLowerCase();
    const flightFirst =
        hostname.includes("flights") ||
        hostname.includes("aircanada") ||
        hostname.includes("westjet") ||
        hostname.includes("kayak") ||
        /\bflight\b/.test(title);

    return flightFirst
        ? extractFlight(document, url) || extractHotel(document, url)
        : extractHotel(document, url) || extractFlight(document, url);
}
