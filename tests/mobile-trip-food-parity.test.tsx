import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripFoodScreen } from "@/mobile/src/screens/TripFoodScreen";

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
    notes: "Try one local restaurant each night.",
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
  food: {
    items: [
      {
        id: "food-1",
        trip_id: "trip-1",
        item_type: "place",
        name: "Joe Beef",
        description: "A classic Montreal restaurant.",
        region: "Little Burgundy",
        personal_note: "Reserve early.",
        google_place_id: "google-place-1",
        formatted_address: "2491 Notre-Dame St W, Montreal, QC",
        place_types: ["restaurant", "food"],
        business_status: "OPERATIONAL",
        regular_opening_hours: {
          open_now: true,
          weekday_text: Array.from(
            { length: 7 },
            (_, index) => `${index}: 5:30 PM – 11:00 PM`,
          ),
        },
        website_url: "https://joebeef.com",
        phone_number: "+15149356500",
        google_maps_url: "https://maps.google.com/example",
        facebook_url: null,
        instagram_url: "https://instagram.com/joebeef",
        meal_categories: ["dinner", "drinks"],
        created_by: "user-1",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        reaction_summaries: [
          {
            reaction: "heart",
            value: 2,
            count: 1,
            profiles: [
              {
                user_id: "user-1",
                first_name: "Alex",
                last_name: "Rivera",
                username: "alex",
                avatar_url: null,
              },
            ],
          },
        ],
        current_user_reaction: "heart",
        reaction_score: 2,
        tried_count: 1,
        current_user_tried: true,
      },
    ],
  },
};

function renderFood(payload: MobileTripDetailResponse = detail) {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(payload),
  } as unknown as MobileApiClient;
  return render(<TripFoodScreen apiClient={apiClient} tripId="trip-1" />);
}

afterEach(() => cleanup());

describe("mobile Eat & Drink strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive food presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderFood();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Joe Beef" })).toBeInTheDocument();
      });
      const eatAndDrinkHeadings = screen.getAllByRole("heading", {
        name: "Eat & Drink",
      });
      expect(eatAndDrinkHeadings).toHaveLength(2);
      expect(
        eatAndDrinkHeadings.find((heading) => heading.classList.contains("text-4xl")),
      ).toHaveClass(
        "text-4xl",
        "font-black",
        "tracking-tight",
      );
      expect(screen.getByRole("button", { name: "Places to Eat" })).toHaveClass(
        "bg-lime-300",
        "rounded-full",
      );
      expect(screen.getByRole("heading", { name: "Joe Beef" })).toHaveClass(
        "text-2xl",
        "font-black",
        "tracking-tight",
      );
      expect(screen.getByText("2491 Notre-Dame St W, Montreal, QC")).toHaveClass(
        "text-sm",
        "font-semibold",
      );
      expect(screen.getByText("Open now")).toHaveClass(
        "uppercase",
        "tracking-[0.16em]",
      );
      expect(screen.getByText("Dinner")).toHaveClass("rounded-full");
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(document.querySelector(".grid.gap-5.md\\:grid-cols-2")).toBeInTheDocument();
      expect(document.querySelector("main")).toHaveClass("overflow-x-clip");
      expect(screen.getByRole("button", { name: "Edit Joe Beef" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Mark Joe Beef as not tried" })).toBeDisabled();
    },
  );

  it("switches to the shared Foods to Try empty state without a route change", async () => {
    renderFood();
    await screen.findByRole("heading", { name: "Joe Beef" });

    fireEvent.click(screen.getByRole("button", { name: "Foods to Try" }));
    expect(screen.getByRole("heading", { name: "No foods saved yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a Food" })).toBeDisabled();
  });

  it("uses the shared loading and retry states", async () => {
    const pendingApiClient = {
      getTrip: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as MobileApiClient;
    const { unmount } = render(
      <TripFoodScreen apiClient={pendingApiClient} tripId="trip-1" />,
    );
    expect(screen.getByRole("status", { name: "Loading Eat & Drink" })).toBeInTheDocument();
    unmount();

    const failingApiClient = {
      getTrip: vi.fn().mockRejectedValue(new Error("Food request failed")),
    } as unknown as MobileApiClient;
    render(<TripFoodScreen apiClient={failingApiClient} tripId="trip-1" />);
    expect(await screen.findByText("Food request failed")).toBeInTheDocument();
  });
});
