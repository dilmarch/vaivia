import { describe, expect, it, vi } from "vitest";
import { createTripInvitation, removeTripMember, setTripFamilyMember } from "@/lib/trips/collaboration";
import { setTripArchivedForOwner, TripLifecycleError } from "@/lib/trips/lifecycle";

function terminal<T>(value: T) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(async () => value),
    maybeSingle: vi.fn(async () => value),
  };
  return builder;
}

describe("shared trip lifecycle authorization", () => {
  it("rejects an accepted member attempting an owner-only archive", async () => {
    const tripQuery = terminal({ data: { id: "trip-1", user_id: "owner-1" }, error: null });
    const supabase = { from: vi.fn(() => tripQuery) };

    await expect(
      setTripArchivedForOwner({
        supabase: supabase as never,
        userId: "member-1",
        tripId: "trip-1",
        archived: true,
      }),
    ).rejects.toMatchObject<Partial<TripLifecycleError>>({ status: 403, code: "forbidden" });
    expect(tripQuery.update).not.toHaveBeenCalled();
  });

  it("archives only after the owner check and scopes the write to owner and trip", async () => {
    const ownerLookup = terminal({ data: { id: "trip-1", user_id: "owner-1" }, error: null });
    const updateQuery = terminal({ data: { id: "trip-1", archived_at: "2026-08-22T00:00:00Z" }, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(ownerLookup)
      .mockReturnValueOnce(updateQuery);
    const supabase = { from };

    await expect(
      setTripArchivedForOwner({
        supabase: supabase as never,
        userId: "owner-1",
        tripId: "trip-1",
        archived: true,
      }),
    ).resolves.toMatchObject({ id: "trip-1" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "trip-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("user_id", "owner-1");
  });

  it("prevents a non-member from inviting and an accepted member from removing another member", async () => {
    const noMembership = terminal({ data: null, error: null });
    const tripQuery = terminal({ data: { id: "trip-1", user_id: "owner-1" }, error: null });
    const rpc = vi.fn();
    const supabase = { from: vi.fn().mockReturnValueOnce(noMembership).mockReturnValueOnce(tripQuery), rpc };

    await expect(
      createTripInvitation({
        supabase: supabase as never,
        userId: "member-1",
        tripId: "trip-1",
        input: { inviteeIdentifier: "friend@example.com", consentConfirmed: true },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeTripMember({
        supabase: supabase as never,
        userId: "member-1",
        tripId: "trip-1",
        memberUserId: "member-2",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows only a user-owned family member to be assigned", async () => {
    const membership = terminal({ data: { id: "tm-1", role: "member", status: "active" }, error: null });
    const family = terminal({ data: null, error: null });
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(membership)
        .mockReturnValueOnce(family),
    };

    await expect(
      setTripFamilyMember({
        supabase: supabase as never,
        userId: "member-1",
        tripId: "trip-1",
        familyMemberId: "someone-elses-family",
        included: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
