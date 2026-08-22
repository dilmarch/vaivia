import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardData } from "@/lib/dashboard/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { HomeScreen } from "@/mobile/src/screens/HomeScreen";

const dashboard: DashboardData = {
  name: "Alex",
  countdownTarget: {
    tripTitle: "Montreal weekend",
    targetTitle: "Trip begins",
    targetDateIso: "2099-09-10T00:00:00",
  },
  countdownUnit: "days",
  currentUserId: "user-1",
  trips: [{
    id: "trip-1",
    slug: "montreal-weekend",
    title: "Montreal weekend",
    destination: "Montreal, Quebec",
    start_date: "2099-09-10",
    end_date: "2099-09-14",
    cover_image_url: "https://images.example.com/montreal.jpg",
    memberProfiles: [],
    planning: { accommodations: [], transportation: [] },
  }],
  passportStamps: [],
  wishlistItems: [],
  events: [],
  canManageEvents: false,
  profile: {
    name: "Alex",
    username: "alex",
    email: "alex@example.com",
    avatarUrl: null,
  },
};

afterEach(() => cleanup());

describe("mobile authenticated home dashboard", () => {
  it.each([320, 375, 390, 430])("reuses the responsive dashboard presentation at %ipx", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    const onTrips = vi.fn();
    const onTrip = vi.fn();
    const onTripsLoaded = vi.fn();
    const apiClient = { getHome: vi.fn().mockResolvedValue(dashboard) } as unknown as MobileApiClient;

    render(<HomeScreen apiClient={apiClient} onTripsLoaded={onTripsLoaded} onTrips={onTrips} onTrip={onTrip} onProfile={vi.fn()} />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveClass("text-6xl", "font-black");
    expect(screen.getByText("Upcoming Trips")).toHaveClass("tracking-[0.55em]");
    expect(screen.getByText("Planning checklist")).toBeInTheDocument();
    expect(screen.getByText("Places visited")).toBeInTheDocument();
    expect(screen.getByText("Places calling")).toBeInTheDocument();
    expect(onTripsLoaded).toHaveBeenCalledWith(dashboard.trips);

    fireEvent.click(screen.getByRole("button", { name: "Open Montreal weekend" }));
    expect(onTrip).toHaveBeenCalledWith("trip-1", "overview");
    fireEvent.click(screen.getByRole("button", { name: /See all trips/i }));
    expect(onTrips).toHaveBeenCalledOnce();
    expect(screen.getByText("Browse events")).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a retryable error without replacing it with an empty state", async () => {
    const getHome = vi.fn().mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(dashboard);
    render(<HomeScreen apiClient={{ getHome } as unknown as MobileApiClient} onTripsLoaded={vi.fn()} onTrips={vi.fn()} onTrip={vi.fn()} onProfile={vi.fn()} />);
    expect(await screen.findByText("Home is unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Upcoming Trips")).toBeInTheDocument();
    expect(getHome).toHaveBeenCalledTimes(2);
  });
});
