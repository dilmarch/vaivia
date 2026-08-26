import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TransportationForm from "@/components/TransportationForm";
import TransportationEditForm from "@/components/TransportationEditForm";

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/example",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
});

describe("transportation form fields", () => {
  it("prefills a dragged calendar date and time range", async () => {
    render(
      <TransportationForm
        tripId="trip-1"
        submitAction={vi.fn()}
        isOpen
        onClose={vi.fn()}
        defaultDate="2026-09-24"
        defaultStartTime="10:15"
        defaultEndTime="11:45"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Train/ }));

    expect(
      document.querySelector('input[name="leg_0_departure_date"]'),
    ).toHaveValue("2026-09-24");
    expect(
      document.querySelector('input[name="leg_0_departure_time"]'),
    ).toHaveValue("10:15");
    expect(
      document.querySelector('input[name="leg_0_arrival_date"]'),
    ).toHaveValue("2026-09-24");
    expect(
      document.querySelector('input[name="leg_0_arrival_time"]'),
    ).toHaveValue("11:45");
  });

  it.each(["Train", "Metro / Subway", "Bus", "Tram", "Ferry"])(
    "shows Google locations and schedule fields for %s",
    async (mode) => {
      render(
        <TransportationForm
          tripId="trip-1"
          submitAction={vi.fn()}
          isOpen
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole("button", { name: new RegExp(mode) }),
      );

      expect(
        screen.getByPlaceholderText("Departure station or location"),
      ).toBeRequired();
      expect(
        screen.getByPlaceholderText("Arrival station or location"),
      ).toBeRequired();
      expect(
        document.querySelector('input[name="leg_0_departure_date"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('input[name="leg_0_departure_time"]'),
      ).toBeRequired();
      expect(
        document.querySelector('input[name="leg_0_arrival_date"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('input[name="leg_0_arrival_time"]'),
      ).toBeRequired();
      expect(
        document.querySelector('input[name="leg_0_departure_google_place_id"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('input[name="leg_0_arrival_google_place_id"]'),
      ).toBeInTheDocument();

      if (mode === "Metro / Subway") {
        expect(
          document.querySelector('input[name="transportation_mode"]'),
        ).toHaveValue("subway");
      }
    },
  );

  it.each(["Taxi", "Car"])(
    "shows Google route locations and schedule fields for %s",
    async (mode) => {
      render(
        <TransportationForm
          tripId="trip-1"
          submitAction={vi.fn()}
          isOpen
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(
        await screen.findByRole("button", { name: new RegExp(mode) }),
      );

      expect(
        screen.getByPlaceholderText("Where are you starting?"),
      ).toBeRequired();
      expect(
        screen.getByPlaceholderText("Where are you arriving?"),
      ).toBeRequired();
      expect(
        document.querySelector('input[name="leg_0_departure_date"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('input[name="leg_0_departure_time"]'),
      ).toBeRequired();
      expect(
        document.querySelector('input[name="leg_0_arrival_date"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('input[name="leg_0_arrival_time"]'),
      ).toBeRequired();
    },
  );

  it("blocks submission when locations were typed but not selected from Google", async () => {
    render(
      <TransportationForm
        tripId="trip-1"
        submitAction={vi.fn()}
        isOpen
        onClose={vi.fn()}
        initialItem={{
          mode: "train",
          flightLegs: [
            {
              departureLocation: "Typed departure",
              departureDate: "2026-08-01",
              departureTime: "09:00",
              departureTimezone: "America/Toronto",
              arrivalLocation: "Typed arrival",
              arrivalDate: "2026-08-01",
              arrivalTime: "12:00",
              arrivalTimezone: "America/Toronto",
              departureTerminal: "",
              arrivalTerminal: "",
              flightNumber: "",
              airlineName: "",
            },
          ],
        }}
      />,
    );

    const form = await screen.findByRole("button", { name: "Save" });
    fireEvent.submit(form.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose both departure and arrival locations from the Google suggestions.",
    );
  });

  it("preserves the subway mode when editing a saved metro trip", () => {
    render(
      <TransportationEditForm
        tripId="trip-1"
        itemId="transportation-1"
        submitAction={vi.fn()}
        initialItem={{ transport_type: "subway" }}
      />,
    );

    expect(
      document.querySelector('input[name="transportation_mode"]'),
    ).toHaveValue("subway");
  });

  it("prefills canonical Supabase flight fields without dropping the flight number", () => {
    render(
      <TransportationEditForm
        tripId="trip-1"
        itemId="transportation-1"
        submitAction={vi.fn()}
        initialItem={{
          transport_type: "flight",
          departure_date: "2026-10-03",
          departure_time: "14:40:00",
          arrival_date: "2026-10-03",
          arrival_time: "16:50:00",
          transport_number: "JX717",
          provider_name: "STARLUX Airlines",
          provider_code: "JX",
        }}
      />,
    );

    expect(document.querySelector('input[name="flight_number"]')).toHaveValue(
      "JX717",
    );
    expect(document.querySelector('input[name="airline_name"]')).toHaveValue(
      "STARLUX Airlines",
    );
    expect(document.querySelector('input[name="airline_code"]')).toHaveValue(
      "JX",
    );
    expect(document.querySelector('input[name="item_date"]')).toHaveValue(
      "2026-10-03",
    );
    expect(document.querySelector('input[name="start_time"]')).toHaveValue(
      "14:40",
    );
  });

  it("recovers a legacy flight number from the saved title before editing", () => {
    render(
      <TransportationEditForm
        tripId="trip-1"
        itemId="transportation-1"
        submitAction={vi.fn()}
        initialItem={{
          transport_type: "flight",
          title: "JX717 Taiwan Taoyuan to Hanoi",
          provider_code: "JX",
        }}
      />,
    );

    expect(document.querySelector('input[name="flight_number"]')).toHaveValue(
      "JX717",
    );
  });
});
