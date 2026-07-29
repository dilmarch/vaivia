import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ItineraryCalendar from "@/components/ItineraryCalendar";

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/itinerary",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/script", () => ({
    default: () => null,
}));

beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => cleanup());

const actions = {
    deleteAction: vi.fn(async () => undefined),
    createAction: vi.fn(async () => undefined),
    updateAction: vi.fn(async () => undefined),
    updateTransportationAction: vi.fn(async () => undefined),
    moveItemAction: vi.fn(async () => undefined),
};

function preparePointerSurface(surface: HTMLElement) {
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 680,
        bottom: 1920,
        width: 680,
        height: 1920,
        toJSON: () => ({}),
    });
    Object.defineProperties(surface, {
        setPointerCapture: { value: vi.fn(), configurable: true },
        hasPointerCapture: {
            value: vi.fn(() => true),
            configurable: true,
        },
        releasePointerCapture: { value: vi.fn(), configurable: true },
    });
}

describe("calendar drag creation", () => {
    it.each(["day", "week"] as const)(
        "selects a precise range in %s view",
        (defaultView) => {
            const onCreateTimeRange = vi.fn();

            render(
                <ItineraryCalendar
                    tripId="trip-a"
                    items={[]}
                    tripStartDate="2026-09-02"
                    defaultView={defaultView}
                    moveTargetTrips={[]}
                    onCreateTimeRange={onCreateTimeRange}
                    {...actions}
                />
            );

            const surface = screen.getByRole("button", {
                name: /Create an itinerary item on .*September 2, 2026.*Click and drag/i,
            });
            preparePointerSurface(surface);

            fireEvent.pointerDown(surface, {
                pointerId: 7,
                pointerType: "mouse",
                button: 0,
                clientY: 640,
            });
            fireEvent.pointerMove(surface, {
                pointerId: 7,
                pointerType: "mouse",
                clientY: 800,
            });
            fireEvent.pointerUp(surface, {
                pointerId: 7,
                pointerType: "mouse",
                button: 0,
                clientY: 800,
            });

            expect(onCreateTimeRange).toHaveBeenCalledWith({
                dateKey: "2026-09-02",
                startTime: "08:00",
                endTime: "10:00",
            });
        }
    );

    it("shows a navigable month grid and opens a selected day", () => {
        render(
            <ItineraryCalendar
                tripId="trip-a"
                items={[]}
                tripStartDate="2026-09-02"
                defaultView="month"
                moveTargetTrips={[]}
                {...actions}
            />
        );

        expect(screen.getByLabelText("September 2026")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Open day view for Wednesday, September 2, 2026",
            })
        );

        expect(screen.getByText("Wednesday, September 2, 2026"))
            .toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Day" }))
            .toHaveClass("bg-lime-300");
    });
});
