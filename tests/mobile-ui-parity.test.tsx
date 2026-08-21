import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItineraryDateHeading, TripSectionHeading } from "@/components/trips/TripPresentation";
import type {
  MobileItineraryItem,
  MobileTripDetailResponse,
  MobileTripSummary,
} from "@/lib/mobileApi/contracts";
import { getTripAccentColor, getTripDurationDays } from "@/lib/tripPresentation";
import { MobileItineraryCard } from "@/mobile/src/components/MobileItineraryCard";
import { MobileTripCard } from "@/mobile/src/components/MobileTripCard";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripDetailScreen } from "@/mobile/src/screens/TripDetailScreen";
import { TripsScreen } from "@/mobile/src/screens/TripsScreen";

const trip: MobileTripSummary = {
  id: "trip-1",
  slug: "montreal-weekend",
  title: "Montreal weekend",
  destination: "Montreal, Quebec",
  start_date: "2026-09-10",
  end_date: "2026-09-14",
  cover_image_url: "https://images.example.com/montreal.jpg",
  membershipRole: "owner",
  archived_at: null,
  viewerTripMemberId: "member-1",
  viewerAssignedLegCount: 1,
  viewerStartDate: "2026-09-10",
  viewerEndDate: "2026-09-14",
  memberProfiles: [
    {
      id: "traveler-1",
      first_name: "Alex",
      last_name: "Rivera",
      username: "alex",
      avatar_url: null,
    },
  ],
};

const itineraryItem: MobileItineraryItem = {
  id: "item-1",
  trip_id: trip.id,
  title: "Flight to Montreal",
  item_date: "2026-09-10",
  end_date: null,
  start_time: "09:30:00",
  end_time: "11:45:00",
  category: "transportation",
  status: "confirmed",
  location: "St. John's International Airport",
  notes: "Arrive two hours early.",
  cover_image_url: null,
  timezone: null,
  is_private: false,
  audience_mode: "everyone",
  source: "transportation",
  source_id: "item-1",
  category_name: "Transportation",
  category_color_hex: "#00d5ff",
  transportation_mode: "airplane",
  people: [],
};

afterEach(() => cleanup());

describe("shared trip presentation", () => {
  it("keeps the web itinerary typography available to both runtimes", () => {
    render(
      <>
        <TripSectionHeading eyebrow="Travel plan" title="Itinerary" />
        <ItineraryDateHeading>Thursday, September 10</ItineraryDateHeading>
      </>,
    );

    expect(screen.getByText("Travel plan")).toHaveClass("tracking-[0.55em]");
    expect(screen.getByRole("heading", { name: "Itinerary" })).toHaveClass(
      "text-3xl",
      "font-black",
    );
    expect(
      screen.getByRole("heading", { name: "Thursday, September 10" }),
    ).toHaveClass("border-lime-300/20", "text-lime-300");
  });

  it("shares trip accent and inclusive duration behavior", () => {
    expect(getTripAccentColor(0)).toBe("var(--vaivia-neon-soft-solid)");
    expect(getTripAccentColor(7)).toBe("#7c3cff");
    expect(getTripDurationDays("2026-09-10", "2026-09-14")).toBe(5);
    expect(getTripDurationDays(null, null)).toBe(0);
  });
});

describe("mobile parity components", () => {
  it.each([320, 375, 390, 430])(
    "uses the exact responsive web trip-card presentation at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const onOpen = vi.fn();
      render(<MobileTripCard trip={trip} index={0} onOpen={onOpen} />);

      const action = screen.getByRole("button", { name: "Open Montreal weekend" });
      const card = action.closest("article");
      const accentLayer = card?.querySelector<HTMLElement>(
        ".vaivia-trip-card-accent",
      );
      const image = card?.querySelector(".vaivia-trip-card-image");
      const duration = card?.querySelector(".vaivia-trip-card-duration");

      expect(card).toHaveClass(
        "h-[500px]",
        "min-w-[300px]",
        "md:h-[535px]",
        "md:min-w-[330px]",
        "lg:h-[560px]",
        "lg:min-w-[355px]",
      );
      expect(accentLayer?.style.webkitMaskImage).toContain(
        "./trip-shape-a.svg?v=wide-20260707",
      );
      expect(image).toHaveClass(
        "brightness-[0.88]",
        "contrast-[1.25]",
        "saturate-[1.45]",
      );
      expect(duration).toHaveClass("left-9", "top-7", "h-20", "w-20");
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Montreal")).toHaveClass(
        "leading-[0.78]",
        "font-black",
      );
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      fireEvent.click(action);
      expect(onOpen).toHaveBeenCalledOnce();
    },
  );

  it("renders read-only itinerary details in the web card language", () => {
    render(<MobileItineraryCard item={itineraryItem} />);

    const card = document.querySelector(".vaivia-airline-branded-card");
    expect(card).toHaveClass(
      "border-l-[16px]",
      "bg-[var(--airline-card-accent)]",
    );
    expect(screen.getByText("Flight to Montreal")).toBeInTheDocument();
    expect(screen.getByText("CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText("Departure")).toBeInTheDocument();
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toBeDisabled();
  });

  it("loads the trip list and preserves touch navigation", async () => {
    const onSelectTrip = vi.fn();
    const apiClient = {
      getTrips: vi.fn().mockResolvedValue({ trips: [trip] }),
    } as unknown as MobileApiClient;

    render(
      <TripsScreen
        apiClient={apiClient}
        onSelectTrip={onSelectTrip}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const card = await screen.findByRole("button", { name: "Open Montreal weekend" });
    fireEvent.click(card);
    expect(onSelectTrip).toHaveBeenCalledWith("trip-1");
  });

  it.each([320, 375, 390, 430])(
    "renders the shared overview without horizontal overflow at %ipx",
    async (width) => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    const detail: MobileTripDetailResponse = {
      trip: {
        ...trip,
        notes: "Pack for cool evenings.",
        cover_image_source: "unsplash",
        cover_image_photographer_name: "A Photographer",
        cover_image_photographer_url: "https://example.com/photographer",
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
      itinerary: [itineraryItem],
      itineraryTimezones: [],
    };
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue(detail),
    } as unknown as MobileApiClient;
    render(<TripDetailScreen apiClient={apiClient} tripId="trip-1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Trip Overview" })).toBeInTheDocument();
    });
    expect(screen.getByText("Montreal weekend")).toHaveClass(
      "tracking-[0.3em]",
      "text-lime-200",
    );
    expect(screen.getByText("Trip Legs")).toHaveClass("tracking-[0.2em]");
    expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.getByText("Stays")).toBeInTheDocument();
    expect(screen.queryByText("Flight to Montreal")).not.toBeInTheDocument();
    expect(document.querySelector("main")).toHaveClass("min-h-screen", "bg-[#0c0115]");
  });
});
