import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripTransportScreen } from "@/mobile/src/screens/TripTransportScreen";

const detail: MobileTripDetailResponse = {
  trip: {
    id: "trip-1",
    slug: "montreal-weekend",
    title: "Montreal weekend",
    destination: "Montreal, Quebec",
    start_date: "2026-09-10",
    end_date: "2026-09-14",
    cover_image_url: "https://images.example.com/montreal.jpg",
    cover_image_source: "unsplash",
    cover_image_photographer_name: "A Photographer",
    cover_image_photographer_url: "https://example.com/photographer",
    notes: null,
    membershipRole: "owner",
    viewerTripMemberId: "member-1",
  },
  overview: {
    locations: [],
    going: [],
    invited: [],
    displayStartDate: "2026-09-10",
    displayEndDate: "2026-09-14",
    missingDateLabel: "Add a leg",
    transportation: [],
    stays: [],
    budget: { currency: "CAD", budgeted: 0, spent: 0, hasBudget: false },
  },
  itineraryTimezones: ["America/St_Johns", "America/Toronto"],
  ideas: [],
  budget: {
    budget: null,
    lineItems: [],
    expenses: [],
    splits: [],
    settlementPayments: [],
    participants: [],
    defaultCurrency: "CAD",
  },
  itinerary: [
    {
      id: "transportation:flight-1",
      source_id: "flight-1",
      trip_id: "trip-1",
      title: "Flight to Montreal",
      item_date: "2026-09-10",
      end_date: "2026-09-10",
      start_time: "09:30:00",
      end_time: "11:45:00",
      category: "transportation",
      category_name: "Transportation",
      category_color_hex: "#38bdf8",
      status: "confirmed",
      location: "YYT → YUL",
      notes: null,
      cover_image_url: null,
      timezone: "America/St_Johns",
      is_private: false,
      audience_mode: "custom",
      source: "transportation",
      transportation_mode: "airplane",
      airline_name: "Air Canada",
      airline_code: "AC",
      flight_number: "AC 123",
      reservation_code: "ABC123",
      departure_location: "YYT St. John's International Airport",
      arrival_location: "YUL Montréal–Trudeau International Airport",
      departure_timezone: "America/St_Johns",
      arrival_timezone: "America/Toronto",
      departure_terminal: "Terminal 1",
      arrival_terminal: "Terminal A",
      is_assigned_to_viewer: true,
      people: [
        {
          id: "user-1",
          name: "Alex Rivera",
          avatar_url: null,
          initials: "AR",
        },
      ],
    },
    {
      id: "transportation:train-1",
      source_id: "train-1",
      trip_id: "trip-1",
      title: "VIA Rail to Quebec City",
      item_date: "2026-09-12",
      end_date: "2026-09-12",
      start_time: "08:00:00",
      end_time: "11:20:00",
      category: "transportation",
      category_name: "Transportation",
      category_color_hex: "#38bdf8",
      status: "booked",
      location: "Montreal Central Station → Gare du Palais",
      notes: "Coach 3 · Seat 12A",
      cover_image_url: null,
      timezone: "America/Toronto",
      is_private: false,
      audience_mode: "custom",
      source: "transportation",
      transportation_mode: "train",
      reservation_code: "VIA456",
      departure_location: "Montreal Central Station",
      arrival_location: "Gare du Palais",
      departure_timezone: "America/Toronto",
      arrival_timezone: "America/Toronto",
      is_assigned_to_viewer: false,
      people: [
        {
          id: "user-2",
          name: "Blair Chen",
          avatar_url: null,
          initials: "BC",
        },
      ],
    },
  ],
};

function renderTransport(payload: MobileTripDetailResponse = detail) {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(payload),
  } as unknown as MobileApiClient;
  return render(<TripTransportScreen apiClient={apiClient} tripId="trip-1" />);
}

afterEach(() => cleanup());

describe("mobile Trip Transport strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive Transport presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderTransport();

      await waitFor(() => {
        expect(screen.getAllByRole("heading", { name: "Transport" })).toHaveLength(2);
      });
      expect(
        document.querySelector('[data-transport-presentation="transport"]'),
      ).toHaveClass("space-y-5");
      expect(screen.getByRole("button", { name: "Transport" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen.getByRole("button", { name: "Compare Flights" }),
      ).toBeDisabled();
      expect(screen.getByText("Transport view")).toHaveClass(
        "tracking-[0.22em]",
      );
      expect(screen.getByText("Air Canada AC 123")).toBeInTheDocument();
      expect(document.querySelector(".vaivia-airline-branded-card")).toHaveClass(
        "border-l-[16px]",
      );
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(screen.queryByText("VIA Rail to Quebec City")).not.toBeInTheDocument();
      expect(document.querySelector("main")).toHaveClass("overflow-x-clip");
      expect(document.querySelector(".vaivia-itinerary-calendar")).toHaveClass(
        "rounded-[2rem]",
        "bg-[#03030a]",
      );
    },
  );

  it("switches between viewer assignments and all member transportation", async () => {
    renderTransport();
    await screen.findByText("Air Canada AC 123");

    fireEvent.click(screen.getByRole("button", { name: "All members" }));
    expect(screen.getByText("VIA Rail to Quebec City")).toBeInTheDocument();
    expect(screen.getByTitle("Blair Chen")).toHaveTextContent("BC");
    expect(
      screen.getByText("Showing transportation for everyone on this trip."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "My transport" }));
    expect(screen.queryByText("VIA Rail to Quebec City")).not.toBeInTheDocument();
  });

  it("uses the existing responsive empty state", async () => {
    renderTransport({ ...detail, itinerary: [] });
    expect(await screen.findByText("No itinerary items yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add flights, work obligations, activities, or loose ideas."),
    ).toBeInTheDocument();
  });
});
