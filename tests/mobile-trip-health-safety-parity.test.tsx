import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripHealthSafetyScreen } from "@/mobile/src/screens/TripHealthSafetyScreen";

const detail: MobileTripDetailResponse = {
  trip: {
    id: "trip-1",
    slug: "lisbon-summer",
    title: "Lisbon summer",
    destination: "Lisbon, Portugal",
    start_date: "2026-09-10",
    end_date: "2026-09-14",
    cover_image_url: "https://images.example.com/lisbon.jpg",
    cover_image_source: "unsplash",
    cover_image_photographer_name: "A Photographer",
    cover_image_photographer_url: "https://example.com/photographer",
    notes: "Keep copies of travel documents.",
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
  healthSafety: {
    destinations: [
      {
        id: "destination-1",
        label: "Lisbon",
        placeId: "place-1",
        countryCode: "PT",
        countryName: "Portugal",
        latitude: 38.7223,
        longitude: -9.1393,
        sortOrder: 0,
      },
    ],
    advisoryResult: {
      ok: true,
      dataset: {
        generatedAt: "2026-08-20T11:00:00.000Z",
        generatedDescription: "August 20, 2026 at 11:00 UTC",
        fetchedAt: "2026-08-20T12:00:00.000Z",
        advisories: [
          {
            countryCode: "PT",
            countryName: "Portugal",
            advisoryLevel: 1,
            advisoryText: "Exercise a high degree of caution in Portugal.",
            hasRegionalAdvisory: true,
            latestUpdateType: "Risk level change",
            latestUpdateDescription: "Updated regional guidance.",
            publishedAt: "2026-08-20T10:00:00.000Z",
            publishedDescription: "August 20, 2026",
            urlSlug: "portugal",
          },
        ],
      },
    },
  },
};

function renderHealthSafety(payload: MobileTripDetailResponse = detail) {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(payload),
  } as unknown as MobileApiClient;
  return render(
    <TripHealthSafetyScreen apiClient={apiClient} tripId="trip-1" />,
  );
}

afterEach(() => cleanup());

describe("mobile Health & Safety strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive advisory presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderHealthSafety();

      await waitFor(() => {
        expect(screen.getByText("Exercise a high degree of caution in Portugal.")).toBeInTheDocument();
      });
      const headings = screen.getAllByRole("heading", { name: "Health & Safety" });
      expect(headings).toHaveLength(2);
      expect(headings[0]).toHaveClass("text-5xl", "font-black", "tracking-tight");
      expect(headings[1]).toHaveClass("text-3xl", "font-black", "sm:text-4xl");
      expect(screen.getByText("Government travel guidance")).toHaveClass(
        "tracking-[0.2em]",
        "text-lime-300",
      );
      expect(screen.getByLabelText("Travel advisory: Exercise a high degree of caution")).toHaveClass(
        "border-amber-300/55",
        "bg-amber-950/70",
      );
      expect(screen.getByText("Includes regional advisories")).toHaveClass(
        "rounded-full",
        "text-sky-100",
      );
      expect(screen.getByText("Keep copies of travel documents.")).toHaveClass(
        "rounded-[1.25rem]",
        "leading-6",
      );
      expect(document.querySelector("main")).toHaveClass(
        "vaivia-page-bg",
        "overflow-x-clip",
      );

      const officialLink = screen.getByRole("link", {
        name: "Review official advisory",
      });
      expect(officialLink).toHaveAttribute(
        "href",
        "https://travel.gc.ca/destinations/portugal",
      );
      expect(officialLink).toHaveAttribute("target", "_blank");
      expect(officialLink).toHaveAttribute("rel", "noreferrer");
      expect(screen.getByRole("link", { name: "Government of Canada" })).toHaveAttribute(
        "target",
        "_blank",
      );
    },
  );

  it("uses the shared empty and official-source unavailable states", async () => {
    const emptyDetail: MobileTripDetailResponse = {
      ...detail,
      healthSafety: {
        destinations: [],
        advisoryResult: detail.healthSafety!.advisoryResult,
      },
    };
    const { unmount } = renderHealthSafety(emptyDetail);
    expect(await screen.findByText("No destinations yet")).toBeInTheDocument();
    unmount();

    renderHealthSafety({
      ...detail,
      healthSafety: {
        destinations: detail.healthSafety!.destinations,
        advisoryResult: { ok: false, reason: "source_unavailable" },
      },
    });
    expect(
      await screen.findByText("Travel advisories are temporarily unavailable"),
    ).toBeInTheDocument();
  });

  it("uses shared loading and retry states for the authenticated request", async () => {
    const pendingApiClient = {
      getTrip: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as MobileApiClient;
    const { unmount } = render(
      <TripHealthSafetyScreen apiClient={pendingApiClient} tripId="trip-1" />,
    );
    expect(
      screen.getByRole("status", { name: "Loading Health & Safety" }),
    ).toBeInTheDocument();
    unmount();

    const failingApiClient = {
      getTrip: vi.fn().mockRejectedValue(new Error("Guidance request failed")),
    } as unknown as MobileApiClient;
    render(<TripHealthSafetyScreen apiClient={failingApiClient} tripId="trip-1" />);
    expect(await screen.findByText("Guidance request failed")).toBeInTheDocument();
  });
});
