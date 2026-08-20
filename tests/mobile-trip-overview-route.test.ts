import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateMobileRequest: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticateMobileRequest,
  mobileJson: (_request: Request, body: unknown, init?: ResponseInit) =>
    Response.json(body, init),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

import { GET, OPTIONS } from "@/app/api/mobile/v1/trips/[tripId]/route";

type TableResult = { data: unknown; error: null };

function createQuery(result: TableResult, maybeSingleResult = result) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    is: () => query,
    order: () => query,
    maybeSingle: () => Promise.resolve(maybeSingleResult),
    then: (
      resolve: (value: TableResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("mobile trip overview route", () => {
  beforeEach(() => {
    const tableResults: Record<string, TableResult> = {
      trips: {
        data: {
          id: "trip-1",
          slug: "montreal",
          title: "Montreal weekend",
          destination: "🇨🇦 Montreal",
          start_date: "2026-09-10",
          end_date: "2026-09-14",
          cover_image_url: "https://images.example.com/montreal.jpg",
          cover_image_source: "unsplash",
          cover_image_storage_path: null,
          cover_image_photographer_name: "A Photographer",
          cover_image_photographer_url: "https://example.com/photographer",
          notes: "Pack layers.",
          user_id: "user-123",
        },
        error: null,
      },
      itinerary_items: { data: [], error: null },
      transportation_items: {
        data: [
          {
            id: "transport-1",
            trip_id: "trip-1",
            title: "Flight to Montreal",
            transport_type: "airplane",
            transport_number: "AC 123",
            departure_date: "2026-09-10",
            arrival_date: "2026-09-10",
            departure_time: "09:30:00",
            arrival_time: "11:45:00",
            departure_location: "YYT St. John's International Airport",
            arrival_location: "YUL Montréal–Trudeau International Airport",
            status: "confirmed",
            notes: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
      trip_accommodations: {
        data: [
          {
            id: "stay-1",
            hotel_name: "Hotel Bonaventure",
            status: "booked",
            city: "Montreal",
            region: "Quebec",
            country: "Canada",
            check_in_date: "2026-09-10",
            check_out_date: "2026-09-14",
          },
        ],
        error: null,
      },
      trip_members: {
        data: [
          {
            id: "member-1",
            user_id: "user-123",
            role: "owner",
            status: "active",
            created_at: null,
          },
        ],
        error: null,
      },
      trip_invitations: {
        data: [
          {
            id: "invite-1",
            invited_email: "guest@example.com",
            invited_username: null,
            status: "pending",
            created_at: null,
          },
        ],
        error: null,
      },
      trip_family_members: { data: [], error: null },
      trip_legs: {
        data: [
          {
            id: "leg-1",
            name: "Montreal",
            city_name: "Montreal",
            country_code: "CA",
            icon_emoji: null,
            start_date: "2026-09-10",
            end_date: "2026-09-14",
            leg_type: "destination",
            sort_order: 0,
          },
        ],
        error: null,
      },
      trip_budgets: {
        data: {
          id: "budget-1",
          reporting_currency: "CAD",
          total_budget_amount: 2000,
          is_active: true,
        },
        error: null,
      },
      trip_budget_line_items: { data: [], error: null },
      trip_expenses: {
        data: [
          {
            amount: 450,
            amount_in_reporting_currency: 450,
            reporting_currency: "CAD",
            currency: "CAD",
          },
        ],
        error: null,
      },
      connected_public_user_profiles: {
        data: [
          {
            id: "user-123",
            first_name: "Alex",
            last_name: "Rivera",
            username: "alex",
            avatar_url: null,
          },
        ],
        error: null,
      },
      trip_member_legs: {
        data: [
          {
            trip_leg_id: "leg-1",
            is_joining: true,
            start_date: "2026-09-10",
            end_date: "2026-09-14",
          },
        ],
        error: null,
      },
    };
    const from = vi.fn((table: string) => {
      const result = tableResults[table] || { data: [], error: null };
      return createQuery(result, result);
    });
    mocks.authenticateMobileRequest.mockResolvedValue({
      user: { id: "user-123" },
      supabase: {
        from,
        storage: {
          from: () => ({
            createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        },
      },
    });
  });

  it("returns the read-only data needed by the shared overview presentation", async () => {
    const request = new Request("https://vaivia.app/api/mobile/v1/trips/trip-1");
    const response = await GET(request, {
      params: Promise.resolve({ tripId: "trip-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      trip: {
        id: "trip-1",
        title: "Montreal weekend",
        cover_image_source: "unsplash",
      },
      overview: {
        locations: [
          expect.objectContaining({ label: "Montreal", flag: "🇨🇦" }),
        ],
        going: [expect.objectContaining({ label: "Alex Rivera", initial: "AR" })],
        invited: [expect.objectContaining({ label: "guest@example.com" })],
        transportation: [
          expect.objectContaining({ id: "transport-1", detail: "09:30 - 11:45 · AC 123" }),
        ],
        stays: [expect.objectContaining({ label: expect.stringContaining("Hotel Bonaventure") })],
        budget: {
          currency: "CAD",
          budgeted: 2000,
          spent: 450,
          hasBudget: true,
        },
      },
      itinerary: expect.any(Array),
    });
  });

  it("preserves bearer authentication and CORS preflight behavior", async () => {
    mocks.authenticateMobileRequest.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const request = new Request("https://vaivia.app/api/mobile/v1/trips/trip-1");

    expect(
      (
        await GET(request, {
          params: Promise.resolve({ tripId: "trip-1" }),
        })
      ).status,
    ).toBe(401);
    expect(OPTIONS(request).status).toBe(204);
  });
});
