import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccommodationAreaMaps, {
    type AccommodationAreaMapCity,
} from "@/components/accommodations/AccommodationAreaMaps";
import AccommodationPageTabs from "@/components/accommodations/AccommodationPageTabs";

vi.mock("next/script", () => ({
    default: () => null,
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
                latitude: 43.6532,
                longitude: -79.3832,
                statusLabel: "tentative",
            },
            {
                id: "stay-far",
                type: "accommodation",
                title: "Far Hotel",
                latitude: 44.6532,
                longitude: -79.3832,
                statusLabel: "booked",
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

describe("accommodations planning", () => {
    it("exposes separate stays and planning tabs", () => {
        render(
            <AccommodationPageTabs
                activeTab="planning"
                baseHref="/trips/summer/accommodations"
            />
        );

        expect(
            screen.getByRole("link", { name: /^stays: coverage/i })
        ).toHaveAttribute("href", "/trips/summer/accommodations");
        expect(
            screen.getByRole("link", { name: /^planning: compare/i })
        ).toHaveAttribute("href", "/trips/summer/accommodations?tab=planning");
        expect(
            screen.getByRole("link", { name: /^planning: compare/i })
        ).toHaveAttribute("aria-current", "page");
    });

    it("ranks stays against scheduled activities and ideas", () => {
        render(
            <AccommodationAreaMaps
                cities={cities}
                addAccommodationHref="/trips/summer/accommodations?addAccommodation=1"
            />
        );

        expect(screen.getByText("Closest overall")).toBeInTheDocument();
        expect(screen.getByText("0 m from Close Hotel")).toBeInTheDocument();
        expect(screen.getByText("1 Scheduled")).toBeInTheDocument();
        expect(screen.getByText("1 Idea")).toBeInTheDocument();
        expect(screen.queryByText("Unlocated activity")).not.toBeInTheDocument();
        expect(screen.queryByText("Unlocated idea")).not.toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /add stay option/i })
        ).toHaveAttribute(
            "href",
            "/trips/summer/accommodations?addAccommodation=1"
        );
    });

    it("lets travelers show or hide available metro and transit detail", () => {
        render(<AccommodationAreaMaps cities={cities} />);

        const transitToggle = screen.getByRole("button", {
            name: /metro & transit/i,
        });
        expect(transitToggle).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(transitToggle);

        expect(transitToggle).toHaveAttribute("aria-pressed", "false");
    });

    it("attaches the Google transit layer to each city map", () => {
        const mapInstance = { fitBounds: vi.fn() };
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

        render(<AccommodationAreaMaps cities={cities} />);

        expect(setTransitMap).toHaveBeenCalledWith(mapInstance);
        fireEvent.click(
            screen.getByRole("button", { name: /metro & transit/i })
        );
        expect(setTransitMap).toHaveBeenLastCalledWith(null);
    });

    it("provides guidance before any locations can be mapped", () => {
        render(<AccommodationAreaMaps cities={[]} />);

        expect(screen.getByText("No mapped places yet")).toBeInTheDocument();
    });
});
