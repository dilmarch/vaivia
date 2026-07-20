import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccommodationAreaMaps, {
    type AccommodationAreaMapCity,
} from "@/components/accommodations/AccommodationAreaMaps";
import AccommodationPageTabs from "@/components/accommodations/AccommodationPageTabs";

vi.mock("next/script", () => ({
    default: () => null,
}));

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: routerRefresh }),
    usePathname: () => "/trips/summer/accommodations",
    useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "google");
});

const cities: AccommodationAreaMapCity[] = [
    {
        id: "toronto",
        name: "Toronto",
        countryName: "Canada",
        places: [
            {
                id: "stay-close",
                type: "accommodation",
                title: "Close Hotel",
                recordId: "stay-close",
                latitude: 43.6532,
                longitude: -79.3832,
                statusLabel: "tentative",
                isPlanningOption: true,
                checkInDate: "2026-09-02",
                checkOutDate: "2026-09-05",
                dateLabel: "Sep 2 - Sep 5",
                cost: 750,
                currency: "CAD",
                bookingUrl: "https://www.booking.com/hotel/example",
                accommodation: {
                    id: "stay-close",
                    trip_id: "summer",
                    hotel_name: "Close Hotel",
                    check_in_date: "2026-09-02",
                    check_out_date: "2026-09-05",
                    accommodation_type: "hotel",
                    status: "tentative",
                    booking_url: "https://www.booking.com/hotel/example",
                    is_planning_option: true,
                    cost: 750,
                    currency: "CAD",
                    is_private: false,
                },
            },
            {
                id: "stay-far",
                type: "accommodation",
                title: "Far Hotel",
                latitude: 44.6532,
                longitude: -79.3832,
                statusLabel: "booked",
                isPlanningOption: false,
            },
            {
                id: "activity-one",
                type: "scheduled",
                title: "Art Gallery",
                latitude: 43.6532,
                longitude: -79.3832,
            },
            {
                id: "idea-one",
                type: "idea",
                title: "Coffee shop",
                latitude: 43.654,
                longitude: -79.3832,
            },
            {
                id: "activity-without-location",
                type: "scheduled",
                title: "Unlocated activity",
                latitude: 0,
                longitude: 0,
            },
            {
                id: "idea-without-location",
                type: "idea",
                title: "Unlocated idea",
                latitude: Number.NaN,
                longitude: Number.NaN,
            },
        ],
    },
];

const areaMapProps = {
    tripId: "summer",
    createAction: vi.fn(async () => ({ ok: true as const })),
    updateAction: vi.fn(async () => ({ ok: true as const })),
    promoteAction: vi.fn(async () => ({ ok: true as const })),
    audienceOptions: [
        {
            kind: "member" as const,
            id: "member-me",
            displayName: "Me",
            status: "accepted" as const,
            isCurrentUser: true,
        },
        {
            kind: "member" as const,
            id: "member-friend",
            displayName: "Friend",
            status: "accepted" as const,
        },
    ],
    currentUserTripMemberId: "member-me",
};

describe("stay planning", () => {
    it("exposes separate stays and planning tabs", () => {
        render(
            <AccommodationPageTabs
                activeTab="planning"
                baseHref="/trips/summer/accommodations"
            />
        );

        expect(
            screen.getByRole("link", { name: /^planned stays: coverage/i })
        ).toHaveAttribute("href", "/trips/summer/accommodations");
        expect(
            screen.getByRole("link", { name: /^compare stays: compare/i })
        ).toHaveAttribute("href", "/trips/summer/accommodations?tab=planning");
        expect(
            screen.getByRole("link", { name: /^compare stays: compare/i })
        ).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("navigation", { name: "Stay views" })).toBeInTheDocument();
    });

    it("ranks stays against scheduled activities and ideas", () => {
        render(
            <AccommodationAreaMaps
                cities={cities}
                {...areaMapProps}
            />
        );

        expect(screen.getByText("Compare Stays")).toBeInTheDocument();
        expect(screen.getByText("Planned accommodations")).toBeInTheDocument();
        expect(screen.queryByText("Other trip stays")).not.toBeInTheDocument();
        expect(screen.getByText("Stay ideas to compare")).toBeInTheDocument();
        expect(screen.getByText("Within 1 km of 2 activities")).toBeInTheDocument();
        expect(screen.getByText("3 nights")).toBeInTheDocument();
        expect(screen.getByText(/750\.00/)).toBeInTheDocument();
        expect(screen.getByText("1 Scheduled")).toBeInTheDocument();
        expect(screen.getByText("1 Idea")).toBeInTheDocument();
        expect(screen.queryByText("Unlocated activity")).not.toBeInTheDocument();
        expect(screen.queryByText("Unlocated idea")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /add stay option/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /book stay/i })
        ).toHaveAttribute("href", "https://www.booking.com/hotel/example");
        expect(
            screen.getByRole("button", { name: /edit stay idea/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /add to itinerary/i })
        ).toBeInTheDocument();
    });

    it("uses a planning-specific add modal and a separate promotion modal", () => {
        render(<AccommodationAreaMaps cities={cities} {...areaMapProps} />);

        fireEvent.click(
            screen.getByRole("button", { name: /add stay option/i })
        );
        expect(
            screen.getByRole("heading", { name: "Add stay option" })
        ).toBeInTheDocument();
        expect(screen.getByText("Booking link")).toBeInTheDocument();
        expect(screen.queryByText("Check-in time start")).not.toBeInTheDocument();
        expect(screen.queryByText(/^Status$/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /close stay modal/i }));

        fireEvent.click(
            screen.getAllByRole("button", { name: /add to itinerary/i }).at(-1)!
        );
        expect(
            screen.getByRole("heading", {
                name: /add close hotel to the trip/i,
            })
        ).toBeInTheDocument();
        expect(screen.getByText("Check-in starts")).toBeInTheDocument();
        expect(screen.getByText("Check-out time")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Confirm price")).toBeInTheDocument();
        expect(screen.getByText("Guests")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute(
            "aria-pressed",
            "true"
        );
    });

    it("submits the confirmed price and guest audience before planning the stay", async () => {
        const promoteAction = vi.fn(async (formData: FormData) => {
            void formData;
            return { ok: true as const };
        });
        routerRefresh.mockClear();
        render(
            <AccommodationAreaMaps
                cities={cities}
                {...areaMapProps}
                promoteAction={promoteAction}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: /add to itinerary/i })
        );
        fireEvent.click(
            screen.getAllByRole("button", { name: /friend/i })[0]
        );
        fireEvent.click(
            screen.getAllByRole("button", { name: /add to itinerary/i }).at(-1)!
        );

        await waitFor(() => expect(promoteAction).toHaveBeenCalledTimes(1));
        const formData = promoteAction.mock.calls[0]?.[0];
        expect(formData).toBeInstanceOf(FormData);
        expect(formData?.get("cost")).toBe("750");
        expect(formData?.get("currency")).toBe("CAD");
        expect(formData?.get("audience_mode")).toBe("custom");
        expect(formData?.getAll("audience_member_ids")).toEqual([
            "member-me",
        ]);
        expect(routerRefresh).toHaveBeenCalledTimes(1);
    });

    it("opens the stay idea in an editable planning form", () => {
        render(<AccommodationAreaMaps cities={cities} {...areaMapProps} />);

        fireEvent.click(
            screen.getByRole("button", { name: /edit stay idea/i })
        );

        expect(
            screen.getByRole("heading", { name: "Edit stay option" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: /hotel \/ stay name/i })
        ).toHaveValue("Close Hotel");
        expect(screen.getByRole("spinbutton", { name: "Cost" })).toHaveValue(750);
    });

    it("lets travelers show or hide available metro and transit detail", () => {
        render(<AccommodationAreaMaps cities={cities} {...areaMapProps} />);

        const filters = screen.getByLabelText("Map filters");
        const transitToggle = screen.getByRole("button", {
            name: /metro & transit/i,
        });
        const attractionToggle = screen.getByRole("button", {
            name: /popular attractions/i,
        });
        const foodToggle = screen.getByRole("button", {
            name: /places to eat/i,
        });

        expect(filters).toHaveClass("absolute", "left-3", "top-3");
        expect(transitToggle).toHaveAttribute("aria-pressed", "true");
        expect(attractionToggle).toHaveAttribute("aria-pressed", "true");
        expect(foodToggle).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(transitToggle);
        fireEvent.click(attractionToggle);
        fireEvent.click(foodToggle);

        expect(transitToggle).toHaveAttribute("aria-pressed", "false");
        expect(attractionToggle).toHaveAttribute("aria-pressed", "false");
        expect(foodToggle).toHaveAttribute("aria-pressed", "false");
    });

    it("attaches the Google transit layer to each city map", () => {
        const mapInstance = {
            fitBounds: vi.fn(),
            setCenter: vi.fn(),
            setOptions: vi.fn(),
            setZoom: vi.fn(),
        };
        const setTransitMap = vi.fn();

        Object.defineProperty(window, "google", {
            configurable: true,
            value: {
                maps: {
                    Map: vi.fn(function MockMap() {
                        return mapInstance;
                    }),
                    LatLngBounds: vi.fn(function MockLatLngBounds() {
                        return { extend: vi.fn() };
                    }),
                    InfoWindow: vi.fn(function MockInfoWindow() {
                        return {
                            close: vi.fn(),
                            open: vi.fn(),
                            setContent: vi.fn(),
                        };
                    }),
                    Marker: vi.fn(function MockMarker() {
                        return {
                            addListener: vi.fn(),
                            setMap: vi.fn(),
                        };
                    }),
                    TransitLayer: vi.fn(function MockTransitLayer() {
                        return { setMap: setTransitMap };
                    }),
                    SymbolPath: { CIRCLE: 0 },
                },
            },
        });

        render(<AccommodationAreaMaps cities={cities} {...areaMapProps} />);

        expect(setTransitMap).toHaveBeenCalledWith(mapInstance);
        fireEvent.click(
            screen.getByRole("button", { name: /metro & transit/i })
        );
        expect(setTransitMap).toHaveBeenLastCalledWith(null);
    });

    it("fits trip markers tightly and exposes only permitted Google place results", async () => {
        const mapInstance = {
            fitBounds: vi.fn(),
            setCenter: vi.fn(),
            setOptions: vi.fn(),
            setZoom: vi.fn(),
        };
        const markerOptions: Array<google.maps.MarkerOptions> = [];
        const markerClickHandlers = new Map<string, () => void>();
        const setInfoWindowContent = vi.fn();
        const openInfoWindow = vi.fn();
        const MapMock = vi.fn(function MockMap() {
            return mapInstance;
        });
        const nearbySearch = vi.fn(
            (
                request: google.maps.places.PlaceSearchRequest,
                callback: (
                    results: google.maps.places.PlaceResult[],
                    status: google.maps.places.PlacesServiceStatus
                ) => void
            ) => {
                const isAttraction = request.type === "tourist_attraction";
                callback(
                    [
                        {
                            name: isAttraction ? "Popular Museum" : "Local Bistro",
                            place_id: isAttraction ? "attraction-1" : "food-1",
                            types: [isAttraction ? "tourist_attraction" : "restaurant"],
                            vicinity: "Nearby",
                            geometry: {
                                location: {
                                    lat: () => 43.654,
                                    lng: () => -79.383,
                                } as google.maps.LatLng,
                            },
                        },
                        {
                            name: "Hotel Restaurant",
                            place_id: "hotel-1",
                            types: [
                                isAttraction ? "tourist_attraction" : "restaurant",
                                "lodging",
                            ],
                            geometry: {
                                location: {
                                    lat: () => 43.655,
                                    lng: () => -79.384,
                                } as google.maps.LatLng,
                            },
                        },
                    ],
                    google.maps.places.PlacesServiceStatus.OK
                );
            }
        );

        Object.defineProperty(window, "google", {
            configurable: true,
            value: {
                maps: {
                    Map: MapMock,
                    LatLngBounds: vi.fn(function MockLatLngBounds() {
                        return {
                            extend: vi.fn(),
                            getCenter: () => ({
                                lat: () => 43.6532,
                                lng: () => -79.3832,
                            }),
                        };
                    }),
                    InfoWindow: vi.fn(function MockInfoWindow() {
                        return {
                            close: vi.fn(),
                            open: openInfoWindow,
                            setContent: setInfoWindowContent,
                        };
                    }),
                    Marker: vi.fn(function MockMarker(
                        options: google.maps.MarkerOptions
                    ) {
                        markerOptions.push(options);
                        return {
                            addListener: vi.fn(
                                (eventName: string, callback: () => void) => {
                                    if (eventName === "click" && options.title) {
                                        markerClickHandlers.set(
                                            String(options.title),
                                            callback
                                        );
                                    }
                                }
                            ),
                            setMap: vi.fn(),
                        };
                    }),
                    TransitLayer: vi.fn(function MockTransitLayer() {
                        return { setMap: vi.fn() };
                    }),
                    SymbolPath: { CIRCLE: 0 },
                    places: {
                        PlacesService: vi.fn(function MockPlacesService() {
                            return { nearbySearch };
                        }),
                        PlacesServiceStatus: { OK: "OK" },
                    },
                },
            },
        });

        render(<AccommodationAreaMaps cities={cities} {...areaMapProps} />);

        expect(MapMock).toHaveBeenCalledWith(
            expect.any(HTMLElement),
            expect.objectContaining({ clickableIcons: false })
        );
        expect(mapInstance.fitBounds).toHaveBeenCalledWith(
            expect.anything(),
            { top: 72, right: 24, bottom: 24, left: 24 }
        );
        expect(nearbySearch).toHaveBeenCalledTimes(2);

        await waitFor(() => {
            const titles = markerOptions.map((options) => options.title);
            expect(titles).toContain("Popular Museum");
            expect(titles).toContain("Local Bistro");
            expect(titles).not.toContain("Hotel Restaurant");
        });

        act(() => markerClickHandlers.get("Popular Museum")?.());
        const popoverContent = setInfoWindowContent.mock.lastCall?.[0];
        expect(popoverContent).toBeInstanceOf(HTMLElement);
        expect(popoverContent).toHaveAttribute(
            "data-vaivia-map-popover",
            "true"
        );
        expect(popoverContent).toHaveTextContent("Popular Museum");
        expect(popoverContent).toHaveTextContent("Popular attraction");
        expect(popoverContent).toHaveClass("vaivia-map-popover");
        const googleMapsLink =
            within(popoverContent).getByRole("link", {
                name: "Open in Google Maps",
            });
        expect(googleMapsLink).toHaveClass("vaivia-map-popover__button");
        expect(googleMapsLink).toHaveAttribute(
            "data-vaivia-map-button",
            "true"
        );
        expect(googleMapsLink).toHaveAttribute(
            "href",
            "https://www.google.com/maps/search/?api=1&query=Popular%20Museum&query_place_id=attraction-1"
        );
        expect(openInfoWindow).toHaveBeenCalledWith({
            map: mapInstance,
            anchor: expect.anything(),
        });

        act(() => markerClickHandlers.get("Art Gallery")?.());
        const tripPlacePopover = setInfoWindowContent.mock.lastCall?.[0];
        expect(tripPlacePopover).toBeInstanceOf(HTMLElement);
        expect(
            within(tripPlacePopover).getByRole("link", {
                name: "Open in Google Maps",
            })
        ).toHaveAttribute(
            "href",
            "https://www.google.com/maps/search/?api=1&query=43.6532,-79.3832"
        );
    });

    it("provides guidance before any locations can be mapped", () => {
        render(<AccommodationAreaMaps cities={[]} {...areaMapProps} />);

        expect(screen.getByText("No mapped places yet")).toBeInTheDocument();
    });
});
