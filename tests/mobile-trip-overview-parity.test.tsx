import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripDetailScreen } from "@/mobile/src/screens/TripDetailScreen";

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
    notes: "Pack for cool evenings.",
    membershipRole: "owner",
  },
  overview: {
    locations: [
      {
        id: "leg-1",
        flag: "🇨🇦",
        label: "Montreal",
        startDate: "2026-09-10",
        endDate: "2026-09-14",
      },
    ],
    going: [
      {
        id: "traveler-1",
        label: "Alex Rivera",
        avatarUrl: null,
        initial: "AR",
      },
    ],
    invited: [],
    displayStartDate: "2026-09-10",
    displayEndDate: "2026-09-14",
    missingDateLabel: "Add a leg",
    transportation: [],
    stays: [],
    budget: {
      currency: "CAD",
      budgeted: 0,
      spent: 0,
      hasBudget: false,
    },
  },
  itinerary: [
    {
      id: "item-1",
      trip_id: "trip-1",
      title: "This itinerary item must stay hidden",
      item_date: "2026-09-10",
      end_date: null,
      start_time: "09:30:00",
      end_time: "11:45:00",
      category: "transportation",
      status: "confirmed",
      location: "Airport",
      notes: null,
      cover_image_url: null,
      timezone: null,
      is_private: false,
      audience_mode: "everyone",
      source: "transportation",
      source_id: "item-1",
      category_name: "Transportation",
      category_color_hex: "#38bdf8",
      people: [],
    },
  ],
  itineraryTimezones: [],
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
};

afterEach(() => cleanup());

describe("mobile trip overview visual parity", () => {
  it.each([320, 375, 390, 430])(
    "uses the responsive web hierarchy and shared presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const apiClient = {
        getTrip: vi.fn().mockResolvedValue(detail),
      } as unknown as MobileApiClient;

      render(<TripDetailScreen apiClient={apiClient} tripId="trip-1" />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Trip Overview" }),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("heading", { name: "Trip Overview" })).toHaveClass(
        "text-5xl",
        "font-black",
        "tracking-tight",
      );
      expect(screen.getByText("Montreal weekend")).toHaveClass(
        "tracking-[0.3em]",
        "text-lime-200",
      );
      expect(document.querySelector(".vaivia-trip-header-cover-media")).toHaveClass(
        "aspect-[16/7]",
        "object-cover",
      );
      expect(screen.getByText("Trip Legs")).toHaveClass("tracking-[0.2em]");
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(screen.getByText("Transport")).toBeInTheDocument();
      expect(screen.getByText("Stays")).toBeInTheDocument();
      expect(
        screen.queryByText("This itinerary item must stay hidden"),
      ).not.toBeInTheDocument();
      expect(document.querySelector("main")).toHaveClass(
        "min-h-screen",
        "bg-[#0c0115]",
      );
    },
  );

  it("opens Trip Ideas from the shared overview tile", async () => {
    const onIdeas = vi.fn();
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue(detail),
    } as unknown as MobileApiClient;
    render(
      <TripDetailScreen
        apiClient={apiClient}
        tripId="trip-1"
        onIdeas={onIdeas}
      />,
    );

    await screen.findByRole("heading", { name: "Trip Overview" });
    fireEvent.click(
      screen.getByRole("button", { name: /Visit trip ideas/ }),
    );
    expect(onIdeas).toHaveBeenCalledOnce();
  });

  it("opens Transport from the shared overview tile", async () => {
    const onTransport = vi.fn();
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue(detail),
    } as unknown as MobileApiClient;
    render(
      <TripDetailScreen
        apiClient={apiClient}
        tripId="trip-1"
        onTransport={onTransport}
      />,
    );

    await screen.findByRole("heading", { name: "Trip Overview" });
    fireEvent.click(screen.getByRole("button", { name: /Visit transport/ }));
    expect(onTransport).toHaveBeenCalledOnce();
  });

  it("opens Eat & Drink from both shared overview tiles", async () => {
    const onFood = vi.fn();
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue(detail),
    } as unknown as MobileApiClient;
    render(
      <TripDetailScreen
        apiClient={apiClient}
        tripId="trip-1"
        onFood={onFood}
      />,
    );

    await screen.findByRole("heading", { name: "Trip Overview" });
    fireEvent.click(screen.getByRole("button", { name: /Visit restaurants/ }));
    fireEvent.click(screen.getByRole("button", { name: /Visit foods/ }));
    expect(onFood).toHaveBeenCalledTimes(2);
  });
});
