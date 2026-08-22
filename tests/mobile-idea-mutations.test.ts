import { describe, expect, it, vi } from "vitest";
import {
  IdeaMutationError,
  createIdeasFromNotepadForUser,
  ideaToItineraryInput,
  toggleIdeaReactionForUser,
} from "@/lib/ideas/mutations";
import { MobileApiClient } from "@/mobile/src/lib/apiClient";
import type { Tables } from "@/src/types/supabase";

function builder(result: { data: unknown; error: unknown }, capture?: { inserted?: unknown }) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn((rows: unknown) => { if (capture) capture.inserted = rows; return query; }),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("shared trip idea mutation rules", () => {
  it("keeps the existing owner-only reaction permission explicit", async () => {
    const trip = builder({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const member = builder({ data: { id: "member-1" }, error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(trip).mockReturnValueOnce(member) };
    await expect(toggleIdeaReactionForUser({
      supabase: supabase as never,
      userId: "member-user",
      tripId: "trip-1",
      ideaId: "idea-1",
      reaction: "heart",
    })).rejects.toMatchObject<Partial<IdeaMutationError>>({ status: 403, code: "forbidden" });
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it("expands every non-empty notepad line for each validated trip location", async () => {
    const capture: { inserted?: unknown } = {};
    const trip = builder({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const legs = builder({ data: [{ id: "leg-1" }, { id: "leg-2" }], error: null });
    const ideas = builder({ data: [{ id: "idea-1" }, { id: "idea-2" }, { id: "idea-3" }, { id: "idea-4" }], error: null }, capture);
    const supabase = {
      from: vi.fn().mockReturnValueOnce(trip).mockReturnValueOnce(legs).mockReturnValueOnce(ideas),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    await createIdeasFromNotepadForUser({
      supabase: supabase as never,
      userId: "owner-1",
      tripId: "trip-1",
      input: {
        entries: ["Museum", "Museum"],
        locations: [
          { key: "a", label: "Lisbon", tripLegId: "leg-1", countryCode: "PT" },
          { key: "b", label: "Porto", tripLegId: "leg-2", countryCode: "PT" },
        ],
      },
    });
    const rows = capture.inserted as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => `${row.title}:${row.trip_leg_id}`)).toEqual([
      "Museum:leg-1", "Museum:leg-1", "Museum:leg-2", "Museum:leg-2",
    ]);
  });

  it("maps a saved idea into the Phase 4 itinerary contract with source metadata", () => {
    const idea = {
      id: "idea-1", trip_id: "trip-1", title: "Biodome", description: "Rainy day", category: "Sightseeing",
      tags: [], days_of_week: [], time_of_day: [], opens_at: null, closes_at: null, is_archived: false,
      created_by: "owner-1", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
      location: "Montreal Biodome", formatted_address: "4777 Pierre-de Coubertin Ave", google_place_id: "place-1",
      location_lat: 45.56, location_lng: -73.55, timezone: "America/Toronto", timezone_source: "google",
      url: "https://example.com", estimated_cost: 20, currency: "CAD", sort_order: 0, ticket_policy: "advance_ticket",
      age_policy: "all_ages", dress_code: null, is_24_hours: false, location_city: "Montreal", location_region: "Quebec",
      location_country: "Canada", location_country_code: "CA", location_postal_code: null, is_private: true, attended: false,
      trip_leg_id: "leg-1", availability_start_date: null, availability_end_date: null, assistant_action_proposal_id: null,
      google_place_id_saved_at: null, place_source: null,
    } satisfies Tables<"trip_ideas">;
    expect(ideaToItineraryInput(idea, { itemDate: "2026-09-11", startTime: "13:00", endTime: "15:00" })).toMatchObject({
      title: "Biodome",
      sourceIdeaId: "idea-1",
      tripLegId: "leg-1",
      googlePlaceId: "place-1",
      isPrivate: true,
      itemDate: "2026-09-11",
    });
  });
});

describe("mobile trip idea API client", () => {
  it("uses narrow authenticated endpoints for all idea workflows", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const client = new MobileApiClient({ baseUrl: "https://vaivia.app", getAuthState: () => ({ sessionExists: true, accessToken: "test-token", authenticatedUserId: "owner-1" }), fetchImplementation });
    await client.createIdea("trip-1", { title: "Museum", location: "Lisbon" });
    await client.updateIdea("trip-1", "idea-1", { title: "Museum", location: "Porto" });
    await client.setIdeaAttended("trip-1", "idea-1", true);
    await client.toggleIdeaReaction("trip-1", "idea-1", "heart");
    await client.addIdeaToItinerary("trip-1", "idea-1", { itemDate: "2026-09-11" });
    await client.deleteIdea("trip-1", "idea-1");
    expect(fetchImplementation.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "POST https://vaivia.app/api/mobile/v1/trips/trip-1/ideas",
      "PATCH https://vaivia.app/api/mobile/v1/ideas/idea-1",
      "PATCH https://vaivia.app/api/mobile/v1/ideas/idea-1",
      "PUT https://vaivia.app/api/mobile/v1/ideas/idea-1/reaction",
      "POST https://vaivia.app/api/mobile/v1/ideas/idea-1/itinerary",
      "DELETE https://vaivia.app/api/mobile/v1/ideas/idea-1",
    ]);
    expect(new Headers((fetchImplementation.mock.calls[0][1] as RequestInit).headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("coalesces duplicate idea submissions with the same idempotency key", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchImplementation = vi.fn(async () => { await gate; return new Response(JSON.stringify({ data: { idea: { id: "idea-1" } } }), { status: 201 }); });
    const client = new MobileApiClient({ baseUrl: "https://vaivia.app", getAuthState: () => ({ sessionExists: true, accessToken: "token", authenticatedUserId: "owner-1" }), fetchImplementation });
    const options = { idempotencyKey: "create-idea-1" };
    const first = client.createIdea("trip-1", { title: "Museum", location: "Lisbon" }, options);
    const second = client.createIdea("trip-1", { title: "Museum", location: "Lisbon" }, options);
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
