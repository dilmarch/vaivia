import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ItineraryCalendar, {
    type CalendarAccommodation,
} from "@/components/ItineraryCalendar";
import { buildAccommodationItineraryHolds } from "@/lib/accommodationItineraryHolds";

vi.mock("next/script", () => ({
    default: () => null,
}));

afterEach(() => cleanup());

const stay: CalendarAccommodation = {
    id: "stay-1",
    hotel_name: "The Annex Hotel",
    accommodation_type: "hotel",
    status: "booked",
    address: "296 Brunswick Ave, Toronto",
    check_in_date: "2026-09-02",
    check_out_date: "2026-09-06",
    check_in_time_start: "15:00",
    check_in_time_end: "23:59",
    check_out_time: "11:00",
    booking_url: "https://www.booking.com/hotel/example",
    google_maps_url: "https://maps.google.com/example",
    cost: 750,
    currency: "CAD",
    notes: "Ask about luggage storage.",
};

const actions = {
    deleteAction: vi.fn(async () => undefined),
    createAction: vi.fn(async () => undefined),
    updateAction: vi.fn(async () => undefined),
    updateTransportationAction: vi.fn(async () => undefined),
    moveItemAction: vi.fn(async () => undefined),
};

describe("stay itinerary hold actions", () => {
    it("opens stay details and provides a direct location action", () => {
        const holds = buildAccommodationItineraryHolds({
            accommodations: [stay],
            items: [],
        });

        render(
            <ItineraryCalendar
                tripId="trip-1"
                items={holds}
                accommodations={[stay]}
                tripStartDate="2026-09-02"
                listOnly
                moveTargetTrips={[]}
                {...actions}
            />
        );

        expect(screen.getAllByRole("button", { name: "Details" })).toHaveLength(2);
        for (const locationLink of screen.getAllByRole("link", {
            name: "Location",
        })) {
            expect(locationLink).toHaveAttribute(
                "href",
                "https://maps.google.com/example"
            );
        }

        fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]);

        expect(
            screen.getByRole("heading", { name: "The Annex Hotel" })
        ).toBeInTheDocument();
        expect(screen.getByText("Booked · Hotel")).toBeInTheDocument();
        expect(screen.getByText("Ask about luggage storage.")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /booking link/i })
        ).toHaveAttribute("href", "https://www.booking.com/hotel/example");
    });
});
