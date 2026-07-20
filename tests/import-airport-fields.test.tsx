import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportAirportFields from "@/components/ImportAirportFields";

vi.mock("next/script", () => ({
    default: ({ onLoad }: { onLoad?: () => void }) => (
        <button type="button" onClick={onLoad}>
            Load Google Maps
        </button>
    ),
}));

const findPlaceFromQuery = vi.fn();
const addListener = vi.fn(() => ({ remove: vi.fn() }));

beforeEach(() => {
    findPlaceFromQuery.mockImplementation(
        (
            request: { query: string },
            callback: (
                results: google.maps.places.PlaceResult[],
                status: google.maps.places.PlacesServiceStatus
            ) => void
        ) => {
            const isDeparture = request.query.includes("YYT");
            callback(
                [
                    {
                        name: isDeparture
                            ? "St. John's International Airport"
                            : "Toronto Pearson International Airport",
                        formatted_address: isDeparture
                            ? "St. John's, NL, Canada"
                            : "Mississauga, ON, Canada",
                        place_id: isDeparture ? "departure-place" : "arrival-place",
                        types: ["airport"],
                        geometry: {
                            location: {
                                lat: () => (isDeparture ? 47.6 : 43.7),
                                lng: () => (isDeparture ? -52.7 : -79.6),
                            } as google.maps.LatLng,
                        },
                    },
                ],
                "OK" as google.maps.places.PlacesServiceStatus
            );
        }
    );

    class PlacesServiceMock {
        findPlaceFromQuery = findPlaceFromQuery;
    }

    class AutocompleteMock {
        addListener = addListener;
        getPlace = vi.fn();
    }

    Object.defineProperty(window, "google", {
        configurable: true,
        value: {
            maps: {
                places: {
                    PlacesService: PlacesServiceMock,
                    PlacesServiceStatus: { OK: "OK" },
                    Autocomplete: AutocompleteMock,
                },
            },
        },
    });

    vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body || "{}")) as { lng?: number };
            return new Response(
                JSON.stringify({
                    timeZoneId:
                        body.lng === -52.7
                            ? "America/St_Johns"
                            : "America/Toronto",
                }),
                { status: 200 }
            );
        })
    );
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe("import airport validation", () => {
    it("automatically resolves airport codes to Google places and time zones", async () => {
        const { container } = render(
            <ImportAirportFields
                itemId="item-1"
                departureDate="2026-09-24"
                arrivalDate="2026-09-24"
                departure={{
                    location: "YYT",
                    formattedAddress: "",
                    googlePlaceId: "",
                    latitude: "",
                    longitude: "",
                    timezone: "",
                }}
                arrival={{
                    location: "YYZ",
                    formattedAddress: "",
                    googlePlaceId: "",
                    latitude: "",
                    longitude: "",
                    timezone: "",
                }}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Load Google Maps" }));

        await waitFor(() => {
            expect(
                screen.getByRole("textbox", {
                    name: /Departure airport, code, or city/i,
                })
            ).toHaveValue("St. John's International Airport");
            expect(
                screen.getByRole("textbox", {
                    name: /Arrival airport, code, or city/i,
                })
            ).toHaveValue("Toronto Pearson International Airport");
        });

        expect(screen.getAllByText("Google-validated airport")).toHaveLength(2);
        expect(
            container.querySelector(
                'input[name="item-1:leg_0_departure_google_place_id"]'
            )
        ).toHaveValue("departure-place");
        expect(
            container.querySelector(
                'input[name="item-1:leg_0_arrival_google_place_id"]'
            )
        ).toHaveValue("arrival-place");
        await waitFor(() => {
            expect(
                screen.getByRole("textbox", { name: "Departure time zone" })
            ).toHaveValue("America/St_Johns");
            expect(
                screen.getByRole("textbox", { name: "Arrival time zone" })
            ).toHaveValue("America/Toronto");
        });
        expect(findPlaceFromQuery).toHaveBeenCalledTimes(2);
    });
});
