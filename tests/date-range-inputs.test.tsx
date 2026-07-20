import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DateRangeInputs } from "@/components/ui/date-range-inputs";
import {
  getValidEndDate,
  isDateRangeOrdered,
} from "@/lib/dateRange";
import {
  buildAccommodationPayload,
  validateAccommodationPayload,
} from "@/lib/accommodations";

afterEach(() => cleanup());

describe("date range rules", () => {
  it("defaults an empty or earlier end to the following day", () => {
    expect(getValidEndDate("2026-08-10", "")).toBe("2026-08-11");
    expect(getValidEndDate("2026-08-10", "2026-08-09")).toBe(
      "2026-08-11",
    );
  });

  it("allows a same-day range", () => {
    expect(getValidEndDate("2026-08-10", "2026-08-10")).toBe(
      "2026-08-10",
    );
    expect(isDateRangeOrdered("2026-08-10", "2026-08-10")).toBe(true);
    expect(getValidEndDate("2026-08-10", "2026-0")).toBe("2026-0");
  });

  it("accepts a same-day stay and rejects an earlier checkout", () => {
    const formData = new FormData();
    formData.set("hotel_name", "Day stay");
    formData.set("check_in_date", "2026-08-10");
    formData.set("check_out_date", "2026-08-10");

    const sameDayPayload = buildAccommodationPayload(formData, "trip-1");
    expect(validateAccommodationPayload(sameDayPayload)).not.toContain(
      "Check-out date cannot be before check-in date.",
    );

    formData.set("check_out_date", "2026-08-09");
    expect(
      validateAccommodationPayload(
        buildAccommodationPayload(formData, "trip-1"),
      ),
    ).toContain("Check-out date cannot be before check-in date.");
  });

  it("auto-adjusts interactively and still permits a manual same-day end", () => {
    render(
      <DateRangeInputs
        startName="start_date"
        endName="end_date"
        startLabel="Start date"
        endLabel="End date"
      />,
    );

    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");

    fireEvent.change(start, { target: { value: "2026-08-10" } });
    expect(end).toHaveValue("2026-08-11");

    fireEvent.change(end, { target: { value: "2026-08-10" } });
    expect(end).toHaveValue("2026-08-10");

    fireEvent.change(end, { target: { value: "2026-08-09" } });
    expect(end).toHaveValue("2026-08-11");
  });
});
