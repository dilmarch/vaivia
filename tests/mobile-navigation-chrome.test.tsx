import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import { MobileAppChrome } from "@/mobile/src/components/MobileAppChrome";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";

const trip: MobileTripSummary = {
  id: "trip-1",
  slug: "montreal",
  title: "Montreal weekend",
  destination: "Montreal",
  start_date: "2026-09-10",
  end_date: "2026-09-14",
  cover_image_url: null,
  membershipRole: "owner",
};

function createApiClient() {
  return {
    getNotifications: vi.fn().mockResolvedValue({
      notifications: [
        {
          id: "notification-1",
          type: "weather_alert",
          title: "Weather update",
          body: "Rain is expected tomorrow.",
          read_at: null,
          created_at: "2026-08-20T12:00:00.000Z",
          trip_id: trip.id,
          invitation_id: null,
          metadata: null,
        },
      ],
      navigationProfile: { role: null, avatar_url: null },
      pendingImportCount: 0,
    }),
  } as unknown as MobileApiClient;
}

function renderChrome(overrides: Partial<ComponentProps<typeof MobileAppChrome>> = {}) {
  const props: ComponentProps<typeof MobileAppChrome> = {
    apiClient: createApiClient(),
    trips: [trip],
    activeTripId: null,
    userEmail: "traveler@example.com",
    onTrips: vi.fn(),
    onSelectTrip: vi.fn(),
    onSignOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<MobileAppChrome {...props} />), props };
}

afterEach(() => cleanup());

describe("mobile navigation chrome parity", () => {
  it.each([320, 375, 390, 430])(
    "keeps every responsive web control and safe-area geometry at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });

      renderChrome();

      expect(screen.getByRole("button", { name: "VAIVIA home" })).toHaveClass(
        "top-[calc(1rem+var(--safe-area-top))]",
        "h-12",
        "w-12",
        "rounded-2xl",
        "backdrop-blur-xl",
      );
      expect(
        screen.getByRole("button", { name: "Open trips menu" }),
      ).toHaveClass("h-12", "rounded-full", "bg-lime-300", "px-5");
      expect(
        screen.getByRole("button", { name: "Open notifications" }),
      ).toHaveClass("h-12", "w-12", "backdrop-blur-xl");
      expect(screen.getByRole("searchbox", { name: "Search VAIVIA" })).toBeVisible();

      const navigation = screen.getByRole("navigation", {
        name: "Mobile navigation",
      });
      expect(navigation).toHaveClass(
        "h-[calc(5.5rem+var(--safe-area-bottom))]",
        "vaivia-mobile-fixed-dock",
      );
      expect(
        within(navigation).getByRole("button", { name: "Open trip views" }),
      ).toHaveClass("h-14", "w-14", "rounded-full", "backdrop-blur-xl");
      expect(
        screen.getByRole("button", { name: "Open quick add menu" }),
      ).toBeEnabled();
    },
  );

  it("opens the complete base and more menus while disabling unavailable routes", () => {
    renderChrome();

    fireEvent.click(screen.getByRole("button", { name: "Open trip views" }));
    expect(screen.getByRole("button", { name: "Events coming soon" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "My Events coming soon" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ask Concierge coming soon" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Open more options" }));
    expect(screen.getByRole("button", { name: "Settings coming soon" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Account" })).toBeEnabled();
  });

  it("shows the exact trip-context item order and active overview state", () => {
    renderChrome({ activeTripId: trip.id });
    fireEvent.click(screen.getByRole("button", { name: "Open trip views" }));

    const navigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    const labels = within(navigation)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));

    expect(labels.slice(0, 9)).toEqual([
      "Trip overview",
      "Itinerary coming soon",
      "Trip Ideas coming soon",
      "Budget coming soon",
      "Transport coming soon",
      "Eat & Drink coming soon",
      "Stays coming soon",
      "Ask Concierge coming soon",
      "Health & Safety coming soon",
    ]);
    expect(screen.getByRole("button", { name: "Trip overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("supports trips, account sign-out, search input, and outside-click closing", () => {
    const onTrips = vi.fn();
    const onSelectTrip = vi.fn();
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    renderChrome({ onTrips, onSelectTrip, onSignOut });

    fireEvent.click(screen.getByRole("button", { name: "Open trips menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Montreal weekend" }));
    expect(onSelectTrip).toHaveBeenCalledWith("trip-1");

    fireEvent.click(screen.getByRole("button", { name: "Open trips menu" }));
    fireEvent.click(screen.getByRole("button", { name: "See all trips" }));
    expect(onTrips).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search VAIVIA" }), {
      target: { value: "Montreal" },
    });
    expect(screen.getByRole("searchbox", { name: "Search VAIVIA" })).toHaveValue(
      "Montreal",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open more options" }));
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open trip views" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Events coming soon" })).toBeNull();
  });

  it("opens read-only notifications with a badge and complete disabled footer", async () => {
    renderChrome();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByText("Weather update")).toBeInTheDocument();
    expect(screen.getByText("Rain is expected tomorrow.")).toBeInTheDocument();
    expect(screen.getByText("Review on web")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Travel imports" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "See previous notifications" }),
    ).toBeDisabled();
  });

  it("opens the full Quick Add option set without broken actions", () => {
    renderChrome();
    fireEvent.click(screen.getByRole("button", { name: "Open quick add menu" }));

    QUICK_ADD_EXPECTED.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    });
    expect(
      screen.getByRole("button", { name: "Close quick add menu" }),
    ).toBeEnabled();
  });
});

const QUICK_ADD_EXPECTED = [
  "Add trip",
  "Add transportation",
  "Add stay",
  "Add expense",
  "Add food or restaurant",
  "Add things to do",
  "Suggest new feature",
];
