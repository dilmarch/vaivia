import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripStaysScreen } from "@/mobile/src/screens/TripStaysScreen";

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
  itinerary: [],
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
  stays: {
    accommodations: [
      {
        id: "stay-1",
        trip_id: "trip-1",
        created_by: "user-1",
        hotel_name: "Hotel Bonaventure",
        address: "900 Rue de la Gauchetière O, Montréal, QC",
        city: "Montreal",
        region: "Quebec",
        country: "Canada",
        check_in_date: "2026-09-10",
        check_out_date: "2026-09-12",
        free_cancellation_ends_on: "2026-09-07",
        check_in_time_start: "15:00:00",
        check_in_time_end: "18:00:00",
        check_out_time: "11:00:00",
        accommodation_type: "hotel",
        status: "booked",
        website: "https://hotel.example.com",
        google_maps_url: "https://maps.google.com/example",
        cost: 900,
        currency: "CAD",
        is_private: true,
        notes: "Breakfast included.",
        audience_mode: "custom",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
    audienceOptions: [
      {
        kind: "member",
        id: "member-1",
        displayName: "Alex Rivera",
        avatarUrl: null,
        status: "accepted",
        secondaryLabel: "@alex",
        isCurrentUser: true,
      },
      {
        kind: "invitation",
        id: "invite-1",
        displayName: "guest@example.com",
        avatarUrl: null,
        status: "invited",
        secondaryLabel: "Pending invitation",
      },
    ],
    participants: [
      {
        item_id: "stay-1",
        participant_kind: "member",
        trip_member_id: "member-1",
        user_id: "user-1",
      },
    ],
    travelers: [
      {
        kind: "member",
        id: "member-1",
        userId: "user-1",
        displayName: "Alex Rivera",
        avatarUrl: null,
        secondaryLabel: "@alex",
        isCurrentUser: true,
      },
      {
        kind: "invitation",
        id: "invite-1",
        displayName: "guest@example.com",
        secondaryLabel: "Pending invitation",
        requiredLegIds: ["leg-1"],
      },
    ],
    legs: [
      {
        id: "leg-1",
        startDate: "2026-09-10",
        endDate: "2026-09-14",
        memberIds: ["member-1"],
        memberDatesByMemberId: {
          "member-1": {
            startDate: "2026-09-10",
            endDate: "2026-09-14",
          },
        },
      },
    ],
    currentUserTripMemberId: "member-1",
  },
};

function renderStays(payload: MobileTripDetailResponse = detail) {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(payload),
  } as unknown as MobileApiClient;
  return render(<TripStaysScreen apiClient={apiClient} tripId="trip-1" />);
}

afterEach(() => cleanup());

describe("mobile Trip Stays strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive Stays presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderStays();

      await waitFor(() => {
        expect(screen.getAllByRole("heading", { name: "Stays" })).toHaveLength(2);
      });
      expect(
        screen.getByRole("button", {
          name: "Planned Stays: Coverage and booking details",
        }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        screen.getByRole("button", {
          name: "Compare Stays: Compare stays with your plans",
        }),
      ).toBeDisabled();
      expect(screen.getByText("Who has a place to stay?")).toHaveClass(
        "text-3xl",
        "font-black",
      );
      expect(screen.getAllByRole("img", { name: "Not booked" }).length).toBeGreaterThan(0);
      expect(document.querySelector('[data-stays-presentation="stays"]')).toHaveClass(
        "rounded-[2rem]",
        "bg-[#03030a]/90",
      );
      expect(document.querySelector('[data-stay-card="stay-1"]')).toHaveClass(
        "rounded-[1.6rem]",
        "shadow-2xl",
      );
      expect(screen.getByRole("heading", { name: "Hotel Bonaventure" })).toHaveClass(
        "text-2xl",
        "font-black",
      );
      expect(screen.getByText("Booked · Hotel")).toBeInTheDocument();
      expect(
        screen.getByText("900 Rue de la Gauchetière O, Montréal, QC"),
      ).toBeInTheDocument();
      expect(screen.getByText("Sep 10, 2026")).toBeInTheDocument();
      expect(screen.getByText("Sep 12, 2026")).toBeInTheDocument();
      expect(screen.getByText("Free cancellation ends")).toHaveClass(
        "tracking-[0.18em]",
      );
      expect(screen.getByText("CA$900.00")).toBeInTheDocument();
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(screen.getByRole("button", { name: "Add stay unavailable" })).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: "Edit Hotel Bonaventure unavailable",
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Open in Google Maps unavailable" }),
      ).toBeDisabled();
      expect(document.querySelector("main")).toHaveClass("overflow-x-clip");
    },
  );

  it("uses the existing responsive empty state", async () => {
    renderStays({
      ...detail,
      stays: { ...detail.stays!, accommodations: [], participants: [] },
    });

    expect(await screen.findByText("No stays yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add hotels, rentals, hostels, or places you’re staying so they’re easy to find during your trip.",
      ),
    ).toBeInTheDocument();
  });
});
