import { describe, expect, it } from "vitest";
import {
  formatMobileDate,
  formatMobileDateRange,
  formatMobileTime,
} from "@/mobile/src/lib/formatting";

describe("mobile date formatting", () => {
  it("formats date-only values without shifting calendar days", () => {
    expect(formatMobileDate("2026-08-19")).toContain("Aug");
    expect(formatMobileDate("2026-08-19")).toContain("19");
  });

  it("formats trip ranges and itinerary times", () => {
    expect(formatMobileDateRange("2026-08-19", "2026-08-22")).toContain("–");
    expect(formatMobileTime("13:05:00")).toBe("1:05 p.m.");
  });
});
