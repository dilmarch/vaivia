import { describe, expect, it } from "vitest";
import { stripStructuredFlightNotes } from "@/lib/flightNotes";

describe("flight notes", () => {
  it("removes multiline baggage already shown in the luggage field", () => {
    expect(
      stripStructuredFlightNotes(
        "Luggage requirements:\n1 personal item only; no carry-on bags permitted.",
      ),
    ).toBe("");
  });

  it("removes generated flight detail blocks but preserves custom notes", () => {
    expect(
      stripStructuredFlightNotes(
        [
          "Flight legs:",
          "Leg 1: YYT → YYZ\nFlight: AC123\nDeparture: 2026-08-01 09:00",
          "VISA requirements:\nElectronic authorization required.",
          "Ask for an aisle seat near the front.",
        ].join("\n\n"),
      ),
    ).toBe("Ask for an aisle seat near the front.");
  });

  it("does not alter ordinary notes", () => {
    expect(
      stripStructuredFlightNotes("Call the airline before departure."),
    ).toBe("Call the airline before departure.");
  });
});
