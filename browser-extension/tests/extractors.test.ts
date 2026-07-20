// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { extractTravelPage } from "../src/extractors";

function setPage(html: string, title = "") {
    document.documentElement.innerHTML = html;
    document.title = title;
}

describe("VAIVIA travel page extraction", () => {
    it("extracts a structured hotel comparison with dates and a total price", () => {
        setPage(`
            <head>
                <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Hotel",
                        "name": "Harbour Lights Hotel",
                        "address": {
                            "@type": "PostalAddress",
                            "streetAddress": "10 Water Street",
                            "addressLocality": "St. John's",
                            "addressRegion": "NL",
                            "addressCountry": "Canada",
                            "postalCode": "A1C 1A1"
                        },
                        "geo": { "latitude": 47.56, "longitude": -52.71 },
                        "offers": { "price": "499.25", "priceCurrency": "CAD" }
                    }
                </script>
            </head>
            <body><h1>Harbour Lights Hotel</h1><div data-testid="address">10 Water Street</div></body>
        `);

        const capture = extractTravelPage(
            document,
            new URL("https://www.booking.com/hotel/ca/harbour.html?checkin=2026-09-01&checkout=2026-09-04&group_adults=2&no_rooms=1")
        );

        expect(capture?.type).toBe("hotel");
        if (capture?.type !== "hotel") return;
        expect(capture.name).toBe("Harbour Lights Hotel");
        expect(capture.checkInDate).toBe("2026-09-01");
        expect(capture.checkOutDate).toBe("2026-09-04");
        expect(capture.price).toMatchObject({ amount: 499.25, currency: "CAD" });
        expect(capture.longitude).toBe(-52.71);
        expect(capture.guests).toBe(2);
    });

    it("classifies a completed hotel reservation as confirmed", () => {
        setPage(`
            <head>
                <script type="application/ld+json">
                    {"@type":"Hotel","name":"City Hotel","address":"1 Main Road"}
                </script>
            </head>
            <body>
                <h1>Booking confirmed</h1>
                <p>Your confirmation number: ABC12345</p>
                <input name="checkin" value="2026-10-02" />
                <input name="checkout" value="2026-10-05" />
            </body>
        `);

        const capture = extractTravelPage(
            document,
            new URL("https://hotel.example/booking-confirmed")
        );

        expect(capture?.type).toBe("hotel");
        if (capture?.type !== "hotel") return;
        expect(capture.captureKind).toBe("confirmed");
        expect(capture.confirmationNumber).toBe("ABC12345");
    });

    it("extracts every structured segment in a confirmed flight itinerary", () => {
        setPage(`
            <head>
                <meta property="product:price:amount" content="1250.90" />
                <meta property="product:price:currency" content="CAD" />
                <script type="application/ld+json">
                    {
                        "@type": "FlightReservation",
                        "reservationFor": [
                            {
                                "@type": "Flight",
                                "flightNumber": "AC 101",
                                "provider": { "name": "Air Canada" },
                                "departureAirport": { "iataCode": "YYZ" },
                                "arrivalAirport": { "iataCode": "YVR" },
                                "departureTime": "2026-09-26T08:00:00-04:00",
                                "arrivalTime": "2026-09-26T10:05:00-07:00"
                            },
                            {
                                "@type": "Flight",
                                "flightNumber": "AC 65",
                                "provider": { "name": "Air Canada" },
                                "departureAirport": { "iataCode": "YVR" },
                                "arrivalAirport": { "iataCode": "ICN" },
                                "departureTime": "2026-09-26T12:00:00-07:00",
                                "arrivalTime": "2026-09-27T16:20:00+09:00"
                            }
                        ]
                    }
                </script>
            </head>
            <body>
                <h1>Flight booking confirmed</h1>
                <p>Booking reference: ZXCV12</p>
            </body>
        `, "Air Canada flight confirmation");

        const capture = extractTravelPage(
            document,
            new URL("https://www.aircanada.com/booking/confirmation")
        );

        expect(capture?.type).toBe("flight");
        if (capture?.type !== "flight") return;
        expect(capture.captureKind).toBe("confirmed");
        expect(capture.legs).toHaveLength(2);
        expect(capture.legs[0]).toMatchObject({
            departureLocation: "YYZ",
            arrivalLocation: "YVR",
            departureTimezone: "UTC-04:00",
        });
        expect(capture.legs[1].arrivalLocation).toBe("ICN");
        expect(capture.price).toMatchObject({ amount: 1250.9, currency: "CAD" });
        expect(capture.confirmationNumber).toBe("ZXCV12");
    });
});
