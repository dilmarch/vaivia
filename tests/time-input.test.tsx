import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sanitizeTimeInput, TimeInput } from "@/components/ui/time-input";

afterEach(() => {
  cleanup();
});

describe("smart time entry", () => {
  it.each([
    ["12", "12:"],
    ["21", "21:"],
    ["25", "02:5"],
    ["9", "09:"],
    ["94", "09:4"],
    ["0945", "09:45"],
    ["2:05", "02:05"],
  ])("formats %s as %s", (input, expected) => {
    expect(sanitizeTimeInput(input)).toBe(expected);
  });

  it("moves a second digit into minutes when it cannot form an hour", () => {
    render(<TimeInput aria-label="Departure time" />);
    const input = screen.getByRole("textbox", { name: "Departure time" });

    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveValue("2");

    fireEvent.change(input, { target: { value: "25" } });
    expect(input).toHaveValue("02:5");
  });

  it("pads an impossible leading hour digit before filling minutes", () => {
    render(<TimeInput aria-label="Arrival time" />);
    const input = screen.getByRole("textbox", { name: "Arrival time" });

    fireEvent.change(input, { target: { value: "9" } });
    expect(input).toHaveValue("09:");

    fireEvent.change(input, { target: { value: "09:4" } });
    expect(input).toHaveValue("09:4");
  });
});
