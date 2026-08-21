import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  MobileNotification,
  MobileNotificationHistoryResponse,
} from "@/lib/mobileApi/contracts";
import { NotificationHistoryScreen } from "@/mobile/src/screens/NotificationHistoryScreen";
import { MobileApiError, type MobileApiClient } from "@/mobile/src/lib/apiClient";

function notification(
  overrides: Partial<MobileNotification> = {},
): MobileNotification {
  return {
    id: "notification-1",
    type: "weather_alert",
    title: "Weather update",
    body: "Heavy rain may affect tomorrow's plans.",
    read_at: null,
    created_at: "2026-08-20T12:00:00.000Z",
    trip_id: "trip-1",
    invitation_id: null,
    archived_at: null,
    metadata: {
      severity: "MODERATE",
      weatherAlertKind: "official",
      locationLabel: "Montréal",
    },
    ...overrides,
  };
}

function apiClient(
  response:
    | MobileNotificationHistoryResponse
    | Promise<MobileNotificationHistoryResponse>,
) {
  return {
    getNotificationHistory: vi.fn(() => Promise.resolve(response)),
  } as unknown as MobileApiClient;
}

function renderHistory({
  client = apiClient({
    notifications: [notification()],
    activeActionNotificationIds: ["notification-1"],
  }),
  supportedTripIds = ["trip-1"],
  onBack = vi.fn(),
  onOpenTrip = vi.fn(),
}: {
  client?: MobileApiClient;
  supportedTripIds?: string[];
  onBack?: () => void;
  onOpenTrip?: (tripId: string) => void;
} = {}) {
  return {
    ...render(
      <NotificationHistoryScreen
        apiClient={client}
        supportedTripIds={supportedTripIds}
        onBack={onBack}
        onOpenTrip={onOpenTrip}
      />,
    ),
    client,
    onBack,
    onOpenTrip,
  };
}

afterEach(() => cleanup());

describe("mobile notification history parity", () => {
  it.each([320, 375, 390, 430])(
    "keeps the responsive web history shell at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });

      renderHistory();

      expect(
        await screen.findByRole("heading", { name: "Notification history" }),
      ).toHaveClass("text-4xl", "font-black", "tracking-tight");
      expect(screen.getByRole("main")).toHaveClass(
        "bg-[#0c0115]",
        "px-4",
        "pt-32",
      );
      expect(screen.getByText("Weather update").closest("article")).toHaveClass(
        "rounded-[1.5rem]",
        "border-lime-300/35",
        "bg-lime-300/10",
      );
    },
  );

  it("renders large read, unread, archived, and action-required histories", async () => {
    const notifications = Array.from({ length: 40 }, (_, index) =>
      notification({
        id: `notification-${index}`,
        title: `Notification ${index}`,
        type: index === 0 ? "weather_alert" : "trip_updated",
        read_at: index % 2 ? "2026-08-20T13:00:00.000Z" : null,
        archived_at:
          index === 2 ? "2026-08-20T14:00:00.000Z" : null,
      }),
    );
    renderHistory({
      client: apiClient({
        notifications,
        activeActionNotificationIds: ["notification-0"],
      }),
    });

    expect(await screen.findByText("Notification 39")).toBeInTheDocument();
    expect(screen.getByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(40);
  });

  it("shows the exact empty state", async () => {
    renderHistory({
      client: apiClient({ notifications: [], activeActionNotificationIds: [] }),
    });

    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Trip updates and collaboration invites will appear here.",
      ),
    ).toBeInTheDocument();
  });

  it("shows API errors, retries, and handles an expired session", async () => {
    const getNotificationHistory = vi
      .fn()
      .mockRejectedValueOnce(new MobileApiError("Unauthorized", 401))
      .mockResolvedValueOnce({
        notifications: [],
        activeActionNotificationIds: [],
      });
    const client = { getNotificationHistory } as unknown as MobileApiClient;
    renderHistory({ client });

    expect(await screen.findByRole("alert")).toHaveTextContent("Unauthorized");
    fireEvent.click(screen.getByRole("button", { name: "Retry notifications" }));
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
    expect(getNotificationHistory).toHaveBeenCalledTimes(2);
  });

  it("refreshes the history when the app returns to the foreground", async () => {
    const getNotificationHistory = vi.fn().mockResolvedValue({
      notifications: [],
      activeActionNotificationIds: [],
    });
    renderHistory({
      client: { getNotificationHistory } as unknown as MobileApiClient,
    });

    await waitFor(() => expect(getNotificationHistory).toHaveBeenCalledOnce());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(getNotificationHistory).toHaveBeenCalledTimes(2));
  });

  it("opens supported trip alerts and disables every notification mutation", async () => {
    const onOpenTrip = vi.fn();
    renderHistory({ onOpenTrip });

    fireEvent.click(await screen.findByRole("button", { name: "Review plans" }));
    expect(onOpenTrip).toHaveBeenCalledWith("trip-1");
    expect(
      screen.getByRole("button", { name: "Mark notification read" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toBeDisabled();
  });

  it("does not open a notification whose destination is unavailable", async () => {
    const onOpenTrip = vi.fn();
    renderHistory({ supportedTripIds: [], onOpenTrip });

    expect(
      await screen.findByRole("button", { name: "Review plans" }),
    ).toBeDisabled();
    expect(onOpenTrip).not.toHaveBeenCalled();
  });
});
