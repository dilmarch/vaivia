import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCheckoutScreen } from "@/mobile/src/screens/EventCheckoutScreen";
import { EventDetailScreen } from "@/mobile/src/screens/EventDetailScreen";
import { EventTicketScreen } from "@/mobile/src/screens/EventTicketScreen";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";

const browserMocks = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }));
vi.mock("@capacitor/browser", () => ({ Browser: browserMocks }));

const event = {
  id: "event-1",
  slug: "night-market",
  title: "Night Market",
  short_summary: "Food and music after dark.",
  description: "A community night market.",
  category: "Community",
  tags: [],
  cover_image_storage_path: null,
  cover_image_alt: null,
  coverImageUrl: null,
  status: "published" as const,
  visibility: "public" as const,
  registration_mode: "ticketed" as const,
  starts_at: "2026-09-24T22:00:00.000Z",
  ends_at: "2026-09-25T01:00:00.000Z",
  timezone: "America/St_Johns",
  venue_type: "physical" as const,
  venue_name: "Dream Haus",
  city: "St. John's",
  region: "NL",
  country: "Canada",
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  browserMocks.open.mockResolvedValue(undefined);
});

describe("mobile attendee event workflows", () => {
  it("opens paid Stripe checkout in the Capacitor browser after reservation", async () => {
    const onCheckout = vi.fn();
    const apiClient = {
      getEvent: vi.fn().mockResolvedValue({
        event,
        saved: false,
        ticketTypes: [{
          id: "tier-1", event_id: event.id, name: "Admission", description: null,
          price_minor: 2500, fee_minor: 100, tax_minor: 0, currency: "CAD",
          total_quantity: 10, quantity_held: 0, quantity_sold: 0,
          sales_start_at: null, sales_end_at: null, min_per_order: 1,
          max_per_order: 4, max_per_customer: 4, display_order: 0,
          state: "active", attendee_instructions: null,
        }],
      }),
      registerEvent: vi.fn().mockResolvedValue({
        mode: "paid",
        orderId: "order-1",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_safe",
      }),
    } as unknown as MobileApiClient;
    render(<EventDetailScreen apiClient={apiClient} eventId={event.id} onCheckout={onCheckout} onMyEvents={vi.fn()} />);
    const quantity = await screen.findByRole("combobox", { name: "Admission quantity" });
    fireEvent.change(quantity, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(browserMocks.open).toHaveBeenCalledWith({
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
      presentationStyle: "popover",
    }));
    expect(onCheckout).toHaveBeenCalledWith("order-1", "pending");
  });

  it("does not treat a cancelled callback as payment success and refreshes on resume", async () => {
    const getEventCheckoutStatus = vi.fn().mockResolvedValue({
      orderId: "order-1",
      status: "pending",
      ready: false,
      ticketIds: [],
    });
    const apiClient = { getEventCheckoutStatus } as unknown as MobileApiClient;
    render(<EventCheckoutScreen apiClient={apiClient} orderId="order-1" resultHint="cancelled" onMyEvents={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Checkout cancelled" })).toBeInTheDocument();
    expect(screen.queryByText("Your tickets are ready")).not.toBeInTheDocument();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(getEventCheckoutStatus).toHaveBeenCalledTimes(2));
  });

  it("downloads an owned Apple Wallet pass through the authenticated API client", async () => {
    const downloadAppleWalletPass = vi.fn().mockResolvedValue(new Blob(["pkpass"]));
    const apiClient = {
      getEventTicket: vi.fn().mockResolvedValue({
        ticket: {
          id: "ticket-1", ticket_number: "VAI-100", attendee_name: "Traveler",
          status: "active", events: event,
          event_ticket_types: { name: "Admission", attendee_instructions: null },
        },
        privateDetails: null,
        qrDataUrl: "data:image/png;base64,cXJjb2Rl",
        appleWalletAvailable: true,
      }),
      downloadAppleWalletPass,
    } as unknown as MobileApiClient;
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:wallet-pass");
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<EventTicketScreen apiClient={apiClient} ticketId="ticket-1" onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to Apple Wallet" }));
    await waitFor(() => expect(downloadAppleWalletPass).toHaveBeenCalledWith("ticket-1"));
    expect(createObjectUrl).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    createObjectUrl.mockRestore();
    anchorClick.mockRestore();
  });
});
