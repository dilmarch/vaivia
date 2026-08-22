import { describe, expect, it, vi } from "vitest";
import {
  createItineraryItemForUser,
  ItineraryMutationError,
  updateItineraryItemForUser,
} from "@/lib/itinerary/mutations";

function query<T>(result: T) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };
  return builder;
}

describe("shared itinerary mutation authorization and validation", () => {
  it("validates input before attempting an itinerary insert", async () => {
    const trip = query({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const from = vi.fn(() => trip);
    await expect(
      createItineraryItemForUser({
        supabase: { from } as never,
        userId: "owner-1",
        tripId: "trip-1",
        input: { title: "", itemDate: "bad-date" },
      }),
    ).rejects.toMatchObject<Partial<ItineraryMutationError>>({
      status: 422,
      code: "validation_error",
      fieldErrors: expect.objectContaining({ title: expect.any(Array), itemDate: expect.any(Array) }),
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rejects a user without accepted trip membership", async () => {
    const trip = query({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const membership = query({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(trip).mockReturnValueOnce(membership);
    await expect(
      createItineraryItemForUser({
        supabase: { from } as never,
        userId: "outsider-1",
        tripId: "trip-1",
        input: { title: "Museum", itemDate: "2026-09-12" },
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("scopes an update lookup to both trip and item", async () => {
    const trip = query({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const item = query({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(trip).mockReturnValueOnce(item);
    await expect(
      updateItineraryItemForUser({
        supabase: { from } as never,
        userId: "owner-1",
        tripId: "trip-1",
        itemId: "another-trip-item",
        input: { title: "Museum", itemDate: "2026-09-12" },
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(item.eq).toHaveBeenCalledWith("id", "another-trip-item");
    expect(item.eq).toHaveBeenCalledWith("trip_id", "trip-1");
  });
});
