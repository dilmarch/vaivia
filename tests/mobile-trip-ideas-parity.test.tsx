import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripIdeasScreen } from "@/mobile/src/screens/TripIdeasScreen";

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
  itinerary: [],
  itineraryTimezones: [],
  ideas: [
    {
      id: "idea-1",
      trip_id: "trip-1",
      title: "Visit the Biodome",
      description: "A rainy-day family activity.",
      category: "Sightseeing",
      tags: ["family", "rainy day"],
      days_available: ["Friday"],
      availability_start_date: "2026-09-10",
      availability_end_date: "2026-09-14",
      time_of_day: ["Afternoon"],
      location: "Montreal Biodome",
      formatted_address: "4777 Pierre-de Coubertin Ave",
      google_place_id: "place-1",
      location_city: "Montreal",
      location_country: "Canada",
      location_country_code: "CA",
      location_website: "https://example.com/venue",
      ticket_website: "https://example.com/tickets",
      is_24_hours: false,
      ticket_policy: "advance_ticket",
      age_policy: "all_ages",
      is_private: true,
      is_archived: false,
      attended: false,
      current_user_reaction: "heart",
      reaction_score: 2,
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
              avatar_url: null,
            },
          ],
        },
      ],
    },
    {
      id: "idea-2",
      trip_id: "trip-1",
      title: "Toronto stopover museum",
      description: null,
      category: "Culture",
      tags: ["museum"],
      days_available: [],
      time_of_day: [],
      location_city: "Toronto",
      is_archived: false,
      attended: true,
    },
  ],
};

function renderIdeas() {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(detail),
  } as unknown as MobileApiClient;
  return render(<TripIdeasScreen apiClient={apiClient} tripId="trip-1" />);
}

afterEach(() => cleanup());

describe("mobile Trip Ideas strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive web presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderIdeas();

      await screen.findByRole("heading", { name: "Trip Ideas" });
      expect(document.querySelector("[data-trip-ideas-presentation]")).toHaveClass(
        "space-y-6",
      );
      expect(screen.getByRole("heading", { name: "Things to Do" })).toHaveClass(
        "text-2xl",
        "font-black",
      );
      expect(screen.getByText("Visit the Biodome")).toHaveClass(
        "text-2xl",
        "font-black",
        "tracking-tight",
      );
      expect(screen.getByText("Private")).toBeInTheDocument();
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");
      expect(screen.getByRole("button", { name: "Edit Visit the Biodome" })).toBeDisabled();
      expect(screen.getAllByRole("button", { name: "Add to itinerary" })[0]).toBeDisabled();
      expect(screen.getByRole("link", { name: "Venue" })).toHaveAttribute(
        "href",
        "https://example.com/venue",
      );
      expect(document.querySelector("main")).toHaveClass("overflow-x-clip");
    },
  );

  it("keeps the shared search, location tabs, and filters browsable", async () => {
    renderIdeas();
    await screen.findByText("Visit the Biodome");

    fireEvent.click(screen.getByRole("tab", { name: /Montreal, 1 thing/ }));
    expect(screen.queryByText("Toronto stopover museum")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /All locations/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search ideas" }), {
      target: { value: "museum" },
    });
    expect(screen.getByText("Toronto stopover museum")).toBeInTheDocument();
    expect(screen.queryByText("Visit the Biodome")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Category")).toBeVisible();
    expect(screen.getByLabelText("Show archived")).not.toBeChecked();
  });

  it("renders the shared empty state", async () => {
    const apiClient = {
      getTrip: vi.fn().mockResolvedValue({ ...detail, ideas: [] }),
    } as unknown as MobileApiClient;
    render(<TripIdeasScreen apiClient={apiClient} tripId="trip-1" />);

    expect(await screen.findByText("No trip ideas yet")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Add a restaurant, museum/)).toBeInTheDocument();
    });
  });
});
