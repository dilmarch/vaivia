import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import { MobileTripCard } from "@/mobile/src/components/MobileTripCard";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripsScreen } from "@/mobile/src/screens/TripsScreen";

const trip: MobileTripSummary = {
  id: "trip-1",
  slug: "montreal-weekend",
  title: "Montreal weekend",
  destination: "Montreal, Quebec",
  start_date: "2099-09-10",
  end_date: "2099-09-14",
  cover_image_url: "https://images.example.com/montreal.jpg",
  membershipRole: "owner",
  archived_at: null,
  viewerTripMemberId: "member-1",
  viewerAssignedLegCount: 1,
  viewerStartDate: "2099-09-10",
  viewerEndDate: "2099-09-14",
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

afterEach(() => cleanup());

describe("mobile trips index visual parity", () => {
  it.each([320, 375, 390, 430])(
    "uses the responsive web trip card at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const onOpen = vi.fn();
      render(<MobileTripCard trip={trip} index={0} onOpen={onOpen} />);

      const action = screen.getByRole("button", {
        name: "Open Montreal weekend",
      });
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
      expect(screen.getByText("Montreal")).toHaveClass(
        "leading-[0.78]",
        "font-black",
      );
      expect(screen.getByTitle("Alex Rivera")).toHaveTextContent("AR");

      fireEvent.click(action);
      expect(onOpen).toHaveBeenCalledOnce();
    },
  );

  it("loads trips, filters archives, and preserves touch navigation", async () => {
    const onSelectTrip = vi.fn();
    const archivedTrip: MobileTripSummary = {
      ...trip,
      id: "trip-archive",
      title: "Archived Toronto trip",
      destination: "Toronto, Ontario",
      archived_at: "2099-10-01T00:00:00.000Z",
    };
    const apiClient = {
      getTrips: vi.fn().mockResolvedValue({ trips: [trip, archivedTrip] }),
    } as unknown as MobileApiClient;

    render(
      <TripsScreen
        apiClient={apiClient}
        onSelectTrip={onSelectTrip}
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const upcomingCard = await screen.findByRole("button", {
      name: "Open Montreal weekend",
    });
    fireEvent.click(upcomingCard);
    expect(onSelectTrip).toHaveBeenCalledWith("trip-1");

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(
      screen.getByRole("button", { name: "Open Archived Toronto trip" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Montreal weekend" }),
    ).not.toBeInTheDocument();
  });
});
