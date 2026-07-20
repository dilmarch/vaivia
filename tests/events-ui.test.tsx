import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventRegistrationPanel from "@/components/events/EventRegistrationPanel";
import OrganizerEventCreateModal from "@/components/events/OrganizerEventCreateModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("event registration interface", () => {
  it("renders free and paid tiers from authoritative server data", () => {
    render(
      <EventRegistrationPanel
        eventId="event-a"
        slug="night-market"
        registrationMode="ticketed"
        authenticated
        initiallySaved={false}
        ticketTypes={[
          {
            id: "free",
            event_id: "event-a",
            name: "Community",
            description: null,
            price_minor: 0,
            fee_minor: 0,
            tax_minor: 0,
            currency: "CAD",
            total_quantity: 10,
            quantity_held: 1,
            quantity_sold: 2,
            sales_start_at: null,
            sales_end_at: null,
            min_per_order: 1,
            max_per_order: 3,
            max_per_customer: null,
            display_order: 0,
            state: "active",
            attendee_instructions: null,
          },
          {
            id: "vip",
            event_id: "event-a",
            name: "VIP",
            description: null,
            price_minor: 2500,
            fee_minor: 0,
            tax_minor: 0,
            currency: "CAD",
            total_quantity: 2,
            quantity_held: 0,
            quantity_sold: 2,
            sales_start_at: null,
            sales_end_at: null,
            min_per_order: 1,
            max_per_order: 2,
            max_per_customer: 2,
            display_order: 1,
            state: "sold_out",
            attendee_instructions: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getByText("Free · 7 left")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText(/\$25\.00 · Sold out/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "VIP quantity" }),
    ).toBeDisabled();
  });

  it("shows RSVP and save actions without exposing organizer tools", () => {
    render(
      <EventRegistrationPanel
        eventId="event-a"
        slug="private-dinner"
        registrationMode="rsvp"
        authenticated={false}
        initiallySaved={false}
        ticketTypes={[]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm RSVP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save event" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/publish event/i)).not.toBeInTheDocument();
  });
});

describe("organizer event editor", () => {
  it("opens the add-event route as a VAIVIA modal with validated place and date/time controls", () => {
    render(
      <OrganizerEventCreateModal
        event={{
          starts_at_local: "2026-09-24T17:40",
          ends_at_local: "2026-09-24T19:40",
          status: "draft",
          visibility: "public",
          registration_mode: "rsvp",
        }}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /Find the venue or address/i }),
    ).toHaveAttribute("placeholder", "Search Google for a venue or address");
    expect(screen.getAllByRole("button", { name: "Open calendar" })).toHaveLength(
      3,
    );
    expect(
      screen.getAllByRole("button", { name: "Open time selector" }),
    ).toHaveLength(3);
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(
      document.querySelector('input[name="starts_at_local"]'),
    ).toHaveValue("2026-09-24T17:40");
    expect(
      screen.getByRole("button", { name: "Close add event modal" }),
    ).toBeInTheDocument();
  });
});
