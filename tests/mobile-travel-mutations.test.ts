import { describe, expect, it } from "vitest";
import { normalizeStayMutationInput, StayMutationError } from "@/lib/accommodations/mutations";
import { normalizeTransportationMutationInput, TransportMutationError } from "@/lib/transport/mutations";

describe("mobile travel mutation validation", () => {
  it.each(["flight", "train", "bus", "ferry", "car", "rental_car"])("normalizes a %s without weakening visibility", (transportType) => {
    const result = normalizeTransportationMutationInput({
      transportType,
      departureDate: "2026-09-01",
      arrivalDate: "2026-09-01",
      departureLocation: "St. John's",
      arrivalLocation: "Toronto",
      audienceMode: "just_me",
      cost: "200.50",
      currency: "cad",
    });
    expect(result.payload).toMatchObject({
      transport_type: transportType,
      is_private: true,
      audience_mode: "just_me",
      cost: 200.5,
      currency: "CAD",
    });
  });

  it("rejects invalid transport chronology and coordinates", () => {
    expect(() => normalizeTransportationMutationInput({
      transportType: "flight",
      departureDate: "2026-09-02",
      arrivalDate: "2026-09-01",
      departureLocation: "A",
      arrivalLocation: "B",
      departureLat: 100,
    })).toThrow(TransportMutationError);
  });

  it("normalizes a mapped stay and preserves planning status", () => {
    const result = normalizeStayMutationInput({
      hotelName: "Harbour Hotel",
      accommodationType: "hotel",
      checkInDate: "2026-09-01",
      checkOutDate: "2026-09-04",
      googlePlaceId: "ChIJStay",
      latitude: 47.56,
      longitude: -52.71,
      isPlanningOption: true,
      cost: "450",
      currency: "usd",
    });
    expect(result.payload).toMatchObject({
      hotel_name: "Harbour Hotel",
      google_place_id: "ChIJStay",
      latitude: 47.56,
      longitude: -52.71,
      is_planning_option: true,
      currency: "USD",
    });
  });

  it("rejects invalid stay dates before any database mutation", () => {
    expect(() => normalizeStayMutationInput({
      hotelName: "Invalid Stay",
      checkInDate: "2026-09-04",
      checkOutDate: "2026-09-04",
    })).toThrow(StayMutationError);
  });
});
