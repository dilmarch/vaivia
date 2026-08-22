import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventCheckInScreen } from "@/mobile/src/screens/EventCheckInScreen";
import {
  EventOperationsDetailScreen,
  EventOperationsListScreen,
} from "@/mobile/src/screens/EventOperationsScreen";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";

const event = {
  id: "event-1",
  slug: "night-market",
  title: "Night Market",
  status: "published",
  visibility: "public",
  starts_at: "2026-09-24T22:00:00.000Z",
  timezone: "America/St_Johns",
  registration_mode: "ticketed",
};

const detail = {
  event,
  stats: { tickets: 1, confirmedRsvps: 0, completedOrders: 1 },
  attendees: [
    {
      id: "ticket-1",
      ticketId: "ticket-1",
      ticketNumber: "VAE-123",
      name: "Traveler",
      email: "traveler@example.com",
      tier: "Admission",
      status: "checked_in",
      registeredAt: "2026-08-20T12:00:00.000Z",
      checkedInAt: "2026-09-24T22:05:00.000Z",
    },
  ],
};

afterEach(() => cleanup());

describe("mobile event operations UI", () => {
  it("opens an authorized managed event while leaving event creation disabled", async () => {
    const onEvent = vi.fn();
    const apiClient = {
      getManagedEvents: vi.fn().mockResolvedValue({
        role: "event_organizer",
        events: [event],
      }),
    } as unknown as MobileApiClient;
    render(
      <EventOperationsListScreen
        apiClient={apiClient}
        onEvent={onEvent}
        onPublicEvent={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Door tools" }));
    expect(onEvent).toHaveBeenCalledWith("event-1");
    expect(screen.getByRole("button", { name: "New event" })).toBeDisabled();
  });

  it("supports attendee lookup and an authorized undo", async () => {
    const getManagedEvent = vi.fn().mockResolvedValue(detail);
    const undoEventCheckIn = vi.fn().mockResolvedValue({
      ticketId: "ticket-1",
      status: "active",
    });
    const apiClient = {
      getManagedEvent,
      undoEventCheckIn,
    } as unknown as MobileApiClient;
    render(
      <EventOperationsDetailScreen
        apiClient={apiClient}
        eventId="event-1"
        onBack={vi.fn()}
        onCheckIn={vi.fn()}
      />,
    );
    expect(await screen.findByText("Traveler")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search attendees" }), {
      target: { value: "nobody" },
    });
    expect(screen.getByText("No attendees match these filters.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search attendees" }), {
      target: { value: "VAE-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo check-in" }));
    await waitFor(() =>
      expect(undoEventCheckIn).toHaveBeenCalledWith(
        "event-1",
        "ticket-1",
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    );
  });

  it("checks in by ticket number and leaves native camera activation deferred", async () => {
    const checkInEvent = vi.fn().mockResolvedValue({ result: "checked_in" });
    const apiClient = {
      getManagedEvent: vi.fn().mockResolvedValue(detail),
      checkInEvent,
    } as unknown as MobileApiClient;
    render(
      <EventCheckInScreen
        apiClient={apiClient}
        eventId="event-1"
        onBack={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Check in · Night Market" });
    expect(screen.getByRole("button", { name: "Start camera" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Ticket number" }), {
      target: { value: "VAE-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Ticket checked in")).toBeInTheDocument();
    expect(checkInEvent).toHaveBeenCalledWith(
      "event-1",
      "VAE-123",
    );
  });
});
