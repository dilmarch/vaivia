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
});
