import { afterEach, describe, expect, it, vi } from "vitest";
import {
    findGooglePlaceByText,
    getGooglePlaceDetails,
    searchGooglePlaces,
    straightLineDistanceMeters,
} from "@/lib/ai/google-places";

const origin = { latitude: 43.6532, longitude: -79.3832 };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("server-only Google Places client", () => {
    it("fails safely without the dedicated key and never falls back to browser keys", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
        vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "browser-key-must-not-be-used");
        vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "timezone-key-must-not-be-used");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            searchGooglePlaces({
                query: "cafés",
                origin,
                radiusMeters: 3_000,
                maxResults: 8,
            })
        ).resolves.toEqual({
            status: "failure",
            code: "missing_configuration",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses Text Search (New), a minimum field mask, clamps bounds and post-filters radius", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "server-only-test-key");
        const fetchMock = vi.fn(async () =>
            response({
                places: [
                    {
                        id: "ChIJCafeInside123",
                        displayName: { text: "Inside Café" },
                        formattedAddress: "1 Queen St, Toronto",
                        primaryType: "cafe",
                        types: ["cafe", "restaurant"],
                        location: { latitude: 43.654, longitude: -79.382 },
                        rating: 4.6,
                        userRatingCount: 321,
                        priceLevel: "PRICE_LEVEL_MODERATE",
                        businessStatus: "OPERATIONAL",
                        regularOpeningHours: {
                            weekdayDescriptions: ["Monday: 8:00 AM–6:00 PM"],
                        },
                        googleMapsUri: "https://maps.google.com/?cid=123",
                        websiteUri: "https://must-not-be-requested.example",
                    },
                    {
                        id: "ChIJOutsideRadius123",
                        displayName: { text: "Far Café" },
                        primaryType: "cafe",
                        location: { latitude: 44.2, longitude: -79.38 },
                    },
                ],
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await searchGooglePlaces({
            query: "cafés",
            origin,
            radiusMeters: 999_999,
            maxResults: 99,
            priceLevels: ["PRICE_LEVEL_MODERATE", "INVALID"],
        });

        expect(result).toMatchObject({
            status: "success",
            data: [
                {
                    placeId: "ChIJCafeInside123",
                    name: "Inside Café",
                    category: "cafe",
                    rating: 4.6,
                    userRatingCount: 321,
                },
            ],
        });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
        expect(JSON.parse(init.body as string)).toMatchObject({
            textQuery: "cafés",
            pageSize: 10,
            locationBias: { circle: { center: origin, radius: 10_000 } },
            priceLevels: ["PRICE_LEVEL_MODERATE"],
        });
        const headers = init.headers as Record<string, string>;
        expect(headers["X-Goog-Api-Key"]).toBe("server-only-test-key");
        expect(headers["X-Goog-FieldMask"]).toContain("places.id");
        expect(headers["X-Goog-FieldMask"]).not.toContain("websiteUri");
    });

    it("supports trusted saved-address resolution and allowlisted Place Details", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
        const payload = {
            id: "ChIJTrustedAnchor123",
            displayName: { text: "Saved Hotel" },
            formattedAddress: "10 King St",
            primaryType: "lodging",
            types: ["lodging"],
            location: origin,
            googleMapsUri: "javascript:alert(1)",
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response({ places: [payload] }))
            .mockResolvedValueOnce(response(payload));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            findGooglePlaceByText({ query: "10 King St" })
        ).resolves.toMatchObject({ status: "success", data: { location: origin } });
        const details = await getGooglePlaceDetails({
            placeId: "ChIJTrustedAnchor123",
            origin,
        });
        expect(details).toMatchObject({
            status: "success",
            data: {
                mapsUrl:
                    "https://www.google.com/maps/search/?api=1&query_place_id=ChIJTrustedAnchor123",
                distanceMeters: 0,
            },
        });
        expect(fetchMock.mock.calls[1]?.[0]).toBe(
            "https://places.googleapis.com/v1/places/ChIJTrustedAnchor123"
        );
    });

    it("maps provider errors to safe codes without returning raw responses", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                response(
                    { error: { message: "secret provider configuration details" } },
                    403
                )
            )
        );
        const result = await getGooglePlaceDetails({ placeId: "ChIJAnyPlace123" });
        expect(result).toEqual({
            status: "failure",
            code: "billing_or_configuration",
        });
        expect(JSON.stringify(result)).not.toContain("secret provider");
    });

    it("labels only mathematically computed straight-line distance", () => {
        expect(straightLineDistanceMeters(origin, origin)).toBe(0);
        expect(
            straightLineDistanceMeters(origin, {
                latitude: 43.66,
                longitude: -79.39,
            })
        ).toBeGreaterThan(0);
    });
});
