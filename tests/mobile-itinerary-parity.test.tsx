import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripItineraryScreen } from "@/mobile/src/screens/TripItineraryScreen";

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
      is_private: true,
      audience_mode: "just_me",
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
      id: "activity-1",
      source_id: "activity-1",
      trip_id: "trip-1",
      title: "Old Montreal walking tour",
      item_date: "2026-09-11",
      end_date: null,
      start_time: "10:00:00",
      end_time: "12:00:00",
      category: "activity",
      category_name: "Sightseeing",
      category_color_hex: "#ff3ca6",
      status: "confirmed",
      location: "Old Montreal",
      notes: "Meet at the square.",
      cover_image_url: null,
      timezone: "America/Toronto",
      is_private: false,
      audience_mode: "everyone",
      source: "itinerary",
      people: [],
    },
    {
      id: "stay-1-check-in",
      source_id: "stay-1",
      trip_id: "trip-1",
      title: "Check in to Hotel Bonaventure",
      item_date: "2026-09-11",
      end_date: null,
      start_time: "15:00:00",
      end_time: "17:00:00",
      category: "accommodation",
      category_name: "Stay",
      category_color_hex: "#bef264",
      status: "confirmed",
      location: "Montreal, Quebec",
      notes: null,
      cover_image_url: null,
      timezone: "America/Toronto",
      is_private: false,
      audience_mode: "everyone",
      source: "itinerary",
      accommodation_hold_kind: "check_in",
      people: [],
    },
  ],
};

afterEach(() => cleanup());

describe("mobile itinerary strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive itinerary at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const apiClient = {
        getTrip: vi.fn().mockResolvedValue(detail),
      } as unknown as MobileApiClient;

      render(<TripItineraryScreen apiClient={apiClient} tripId="trip-1" onAdd={vi.fn()} onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByRole("heading", { name: /^Itinerary/ })).toHaveLength(2);
      });
      expect(document.querySelector(".vaivia-itinerary-calendar")).toHaveClass(
        "rounded-[2rem]",
        "bg-[#03030a]",
        "shadow-2xl",
      );
      expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("button", { name: "Day" })).toBeEnabled();
      expect(screen.getByText("Air Canada AC 123")).toBeInTheDocument();
      expect(document.querySelector(".vaivia-airline-branded-card")).toHaveClass(
        "border-l-[16px]",
      );
      expect(screen.getByText("Old Montreal walking tour")).toBeInTheDocument();
      expect(
        document.querySelector('[data-accommodation-hold="check_in"]'),
      ).toHaveClass("border-l-lime-300", "rounded-[1.25rem]");
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(
        screen.getByTitle(/Toronto, America\/Toronto$/),
      ).toBeInTheDocument();
    },
  );

  it("keeps list date and time-zone controls interactive", async () => {
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue(detail),
    } as unknown as MobileApiClient;
    render(<TripItineraryScreen apiClient={apiClient} tripId="trip-1" onAdd={vi.fn()} onEdit={vi.fn()} />);

    await screen.findByText("Air Canada AC 123");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByDisplayValue("2026-09-17")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTitle(/Toronto, America\/Toronto$/),
    );
    expect(
      screen.getByTitle(/Toronto, America\/Toronto$/),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
