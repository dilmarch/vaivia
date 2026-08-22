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
  MobileNotificationDestination,
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
    updateNotification: vi.fn().mockResolvedValue({ notification: {} }),
    reviewNotification: vi.fn().mockResolvedValue({ handled: true, destination: { name: "trip", tripId: "trip-1", view: "overview" } }),
  } as unknown as MobileApiClient;
}

function renderHistory({
  client = apiClient({
    notifications: [notification()],
    activeActionNotificationIds: ["notification-1"],
  }),
  onBack = vi.fn(),
  onNavigate = vi.fn(),
}: {
  client?: MobileApiClient;
  onBack?: () => void;
  onNavigate?: (destination: MobileNotificationDestination | null) => void;
} = {}) {
  return {
    ...render(
      <NotificationHistoryScreen
        apiClient={client}
        onBack={onBack}
        onNavigate={onNavigate}
      />,
    ),
    client,
    onBack,
    onNavigate,
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

  it("opens trip alerts and enables notification mutations", async () => {
    const onNavigate = vi.fn();
    const client = apiClient({ notifications: [notification()], activeActionNotificationIds: ["notification-1"] });
    renderHistory({ client, onNavigate });

    fireEvent.click(await screen.findByRole("button", { name: "Review plans" }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ name: "trip", tripId: "trip-1", view: "overview" }));
    expect(client.reviewNotification).toHaveBeenCalledWith("notification-1", "open", undefined, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Mark notification read" }));
    await waitFor(() => expect(client.updateNotification).toHaveBeenCalledWith("notification-1", "read", expect.anything()));
  });

  it("opens review UI for invitation workflows", async () => {
    renderHistory({ client: apiClient({ notifications: [notification({ type: "friend_request_received" })], activeActionNotificationIds: ["notification-1"] }) });
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByRole("dialog", { name: "Weather update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });
});
