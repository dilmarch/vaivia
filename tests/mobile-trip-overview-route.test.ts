import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateMobileRequest: vi.fn(),
  fetchGovernmentTravelAdvisories: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticateMobileRequest,
  mobileJson: (_request: Request, body: unknown, init?: ResponseInit) =>
    Response.json(body, init),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/governmentTravelAdvisories", () => ({
  fetchGovernmentTravelAdvisories: mocks.fetchGovernmentTravelAdvisories,
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
    mocks.fetchGovernmentTravelAdvisories.mockResolvedValue({
      ok: true,
      dataset: {
        generatedAt: "2026-08-20T11:00:00.000Z",
        generatedDescription: "August 20, 2026 at 11:00 UTC",
        fetchedAt: "2026-08-20T12:00:00.000Z",
        advisories: [
          {
            countryCode: "CA",
            countryName: "Canada",
            advisoryLevel: 0,
            advisoryText: "Take normal security precautions.",
            hasRegionalAdvisory: false,
            latestUpdateType: "Editorial change",
            latestUpdateDescription: "Updated travel information.",
            publishedAt: "2026-08-20T10:00:00.000Z",
            publishedDescription: "August 20, 2026",
            urlSlug: "canada",
          },
          {
            countryCode: "US",
            countryName: "United States",
            advisoryLevel: 0,
            advisoryText: "This unrelated advisory should not be returned.",
            hasRegionalAdvisory: false,
            latestUpdateType: null,
            latestUpdateDescription: "Unrelated update.",
            publishedAt: "2026-08-20T10:00:00.000Z",
            publishedDescription: "August 20, 2026",
            urlSlug: "united-states",
          },
        ],
      },
    });
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
      itinerary_items: {
        data: [
          {
            id: "itinerary-1",
            trip_id: "trip-1",
            title: "Old Montreal walking tour",
            item_date: "2026-09-11",
            end_date: null,
            start_time: "10:00:00",
            end_time: "12:00:00",
            category: "activity",
            category_id: "category-1",
            status: "confirmed",
            location: "Old Montreal",
            notes: "Meet at the square.",
            cover_image_url: null,
            timezone: "America/Toronto",
            is_private: false,
            audience_mode: "custom",
            sort_order: 0,
          },
        ],
        error: null,
      },
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
            departure_timezone: "America/St_Johns",
            arrival_timezone: "America/Toronto",
            departure_terminal: "Terminal 1",
            arrival_terminal: "Terminal A",
            provider_name: "Air Canada",
            provider_code: "AC",
            reservation_code: "ABC123",
            is_private: false,
            audience_mode: "custom",
            itinerary_item_id: null,
          },
        ],
        error: null,
      },
      trip_accommodations: {
        data: [
          {
            id: "stay-1",
            created_by: "user-123",
            hotel_name: "Hotel Bonaventure",
            status: "booked",
            city: "Montreal",
            region: "Quebec",
            country: "Canada",
            check_in_date: "2026-09-10",
            check_out_date: "2026-09-14",
            check_in_time_start: "15:00:00",
            check_in_time_end: "18:00:00",
            check_out_time: "11:00:00",
            free_cancellation_ends_on: "2026-09-07",
            address: "900 Rue de la Gauchetière O",
            google_maps_url: null,
            google_place_id: null,
            accommodation_type: "hotel",
            is_private: false,
            audience_mode: "custom",
            trip_id: "trip-1",
            website: "https://hotel.example.com",
            booking_url: "https://booking.example.com/reservation",
            cost: 900,
            currency: "CAD",
            notes: "Breakfast included.",
            trip_leg_id: "leg-1",
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
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
            invitation_scope: "selected_legs",
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
          trip_id: "trip-1",
          name: "Montreal budget",
          reporting_currency: "CAD",
          total_budget_amount: 2000,
          is_active: true,
        },
        error: null,
      },
      trip_budget_line_items: {
        data: [
          {
            id: "line-1",
            budget_id: "budget-1",
            trip_id: "trip-1",
            category_id: "budget-category-1",
            name: "Entertainment",
            linked_expense_category: "entertainment",
            planned_amount: 500,
            currency: "CAD",
            notes: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
      trip_expenses: {
        data: [
          {
            id: "expense-1",
            trip_id: "trip-1",
            expense_date: "2026-09-11",
            transaction_date: "2026-09-11",
            description: "Museum tickets",
            category: "entertainment",
            budget_category_id: "budget-category-1",
            amount: 450,
            amount_in_reporting_currency: 450,
            reporting_currency: "CAD",
            currency: "CAD",
            exchange_rate_used: 1,
            exchange_rate_is_manual: false,
            paid_by_trip_member_id: "member-1",
            paid_by_user_id: "user-123",
            split_method: "equal",
            source_type: "manual",
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
            trip_member_id: "member-1",
            is_joining: true,
            start_date: "2026-09-10",
            end_date: "2026-09-14",
          },
        ],
        error: null,
      },
      trip_invitation_legs: {
        data: [
          {
            invitation_id: "invite-1",
            trip_leg_id: "leg-1",
            is_included: true,
          },
        ],
        error: null,
      },
      user_categories: {
        data: [{ id: "category-1", name: "Sightseeing", color_key: "pink" }],
        error: null,
      },
      category_color_options: {
        data: [{ key: "pink", hex: "#ff3ca6" }],
        error: null,
      },
      trip_item_participants: {
        data: [
          {
            item_type: "itinerary",
            item_id: "itinerary-1",
            participant_kind: "member",
            trip_member_id: "member-1",
            invitation_id: null,
            family_member_id: null,
            guest_name: null,
            user_id: "user-123",
          },
          {
            item_type: "accommodation",
            item_id: "stay-1",
            participant_kind: "member",
            trip_member_id: "member-1",
            invitation_id: null,
            family_member_id: null,
            guest_name: null,
            user_id: "user-123",
          },
        ],
        error: null,
      },
      transportation_item_travelers: {
        data: [
          {
            id: "traveler-1",
            transportation_item_id: "transport-1",
            user_id: "user-123",
            family_member_id: null,
            guest_name: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      },
      trip_ideas: {
        data: [
          {
            id: "idea-1",
            trip_id: "trip-1",
            created_by: "user-123",
            title: "Visit the Biodome",
            description: "Rainy-day option.",
            category: "Sightseeing",
            tags: ["family", "rainy day"],
            days_of_week: ["friday"],
            availability_start_date: "2026-09-10",
            availability_end_date: "2026-09-14",
            time_of_day: ["afternoon"],
            opens_at: null,
            closes_at: null,
            location: "Montreal Biodome",
            address: null,
            formatted_address: "4777 Pierre-de Coubertin Ave",
            google_place_id: "place-1",
            location_city: "Montreal",
            location_region: "Quebec",
            location_country: "Canada",
            location_country_code: "CA",
            location_website: "https://example.com/venue",
            ticket_website: "https://example.com/tickets",
            is_24_hours: false,
            ticket_policy: "advance_ticket",
            ticket_type: null,
            age_policy: "all_ages",
            dress_code: null,
            other_notes: null,
            is_private: false,
            is_archived: false,
            attended: false,
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      },
      trip_food_items: {
        data: [
          {
            id: "food-1",
            trip_id: "trip-1",
            item_type: "place",
            name: "Joe Beef",
            description: "Montreal restaurant",
            region: "Little Burgundy",
            personal_note: "Reserve early.",
            google_place_id: "google-place-1",
            place_source: "google_places",
            formatted_address: "2491 Notre-Dame St W, Montreal, QC",
            location_lat: 45.482,
            location_lng: -73.575,
            primary_place_type: "restaurant",
            place_types: ["restaurant", "food"],
            business_status: "OPERATIONAL",
            regular_opening_hours: {
              open_now: true,
              weekday_text: ["Monday: 5:30 PM – 11:00 PM"],
            },
            website_url: "https://joebeef.com",
            phone_number: "+15149356500",
            google_maps_url: "https://maps.google.com/example",
            facebook_url: null,
            instagram_url: "https://instagram.com/joebeef",
            meal_categories: ["dinner"],
            created_by: "user-123",
            created_at: "2026-08-02T00:00:00Z",
            updated_at: "2026-08-02T00:00:00Z",
          },
        ],
        error: null,
      },
      trip_food_reactions: {
        data: [
          {
            food_item_id: "food-1",
            user_id: "user-123",
            reaction: "heart",
            score: 2,
          },
        ],
        error: null,
      },
      trip_food_tried: {
        data: [
          { food_item_id: "food-1", user_id: "user-123" },
        ],
        error: null,
      },
      trip_idea_reactions: {
        data: [
          {
            idea_id: "idea-1",
            user_id: "user-123",
            reaction: "heart",
            score: 2,
          },
        ],
        error: null,
      },
      trip_expense_splits: {
        data: [
          {
            id: "split-1",
            expense_id: "expense-1",
            trip_id: "trip-1",
            participant_kind: "member",
            trip_member_id: "member-1",
            split_amount: 450,
            split_percentage: 100,
            currency: "CAD",
            amount_in_reporting_currency: 450,
            is_included: true,
          },
        ],
        error: null,
      },
      trip_expense_settlements: { data: [], error: null },
      user_finance_settings: {
        data: { home_currency: "USD" },
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
      itineraryTimezones: expect.arrayContaining([
        "America/St_Johns",
        "America/Toronto",
      ]),
      ideas: [
        expect.objectContaining({
          id: "idea-1",
          title: "Visit the Biodome",
          location_city: "Montreal",
          current_user_reaction: "heart",
          reaction_score: 2,
        }),
      ],
      budget: {
        budget: expect.objectContaining({
          id: "budget-1",
          reporting_currency: "CAD",
        }),
        lineItems: [
          expect.objectContaining({
            id: "line-1",
            name: "Entertainment",
            planned_amount: 500,
          }),
        ],
        expenses: [
          expect.objectContaining({
            id: "expense-1",
            description: "Museum tickets",
            amount_in_reporting_currency: 450,
          }),
        ],
        splits: [expect.objectContaining({ id: "split-1" })],
        settlementPayments: [],
        participants: expect.arrayContaining([
          expect.objectContaining({
            userId: "user-123",
            label: "Alex Rivera",
            isCurrentUser: true,
          }),
          expect.objectContaining({
            invitationId: "invite-1",
            label: "guest@example.com",
          }),
        ]),
        defaultCurrency: "USD",
      },
      stays: {
        accommodations: [
          expect.objectContaining({
            id: "stay-1",
            hotel_name: "Hotel Bonaventure",
            free_cancellation_ends_on: "2026-09-07",
            cost: 900,
            currency: "CAD",
          }),
        ],
        audienceOptions: expect.arrayContaining([
          expect.objectContaining({
            id: "member-1",
            displayName: "Alex Rivera",
            isCurrentUser: true,
          }),
          expect.objectContaining({
            id: "invite-1",
            status: "invited",
          }),
        ]),
        participants: [
          expect.objectContaining({
            item_id: "stay-1",
            trip_member_id: "member-1",
          }),
        ],
        travelers: expect.arrayContaining([
          expect.objectContaining({
            id: "member-1",
            displayName: "Alex Rivera",
          }),
          expect.objectContaining({
            id: "invite-1",
            requiredLegIds: ["leg-1"],
          }),
        ]),
        legs: [
          expect.objectContaining({
            id: "leg-1",
            memberIds: ["member-1"],
          }),
        ],
        currentUserTripMemberId: "member-1",
      },
      food: {
        items: [
          expect.objectContaining({
            id: "food-1",
            name: "Joe Beef",
            formatted_address: "2491 Notre-Dame St W, Montreal, QC",
            meal_categories: ["dinner"],
            current_user_reaction: "heart",
            reaction_score: 2,
            current_user_tried: true,
            tried_count: 1,
          }),
        ],
      },
      healthSafety: {
        destinations: [
          expect.objectContaining({
            id: "leg-1",
            label: "Montreal",
            countryCode: "CA",
          }),
        ],
        advisoryResult: {
          ok: true,
          dataset: {
            advisories: [
              expect.objectContaining({
                countryCode: "CA",
                advisoryText: "Take normal security precautions.",
              }),
            ],
          },
        },
      },
    });

    const body = await (await GET(request, {
      params: Promise.resolve({ tripId: "trip-1" }),
    })).json();
    expect(body.itinerary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "itinerary-1",
          category_name: "Sightseeing",
          category_color_hex: "#ff3ca6",
          people: [expect.objectContaining({ name: "Alex Rivera" })],
        }),
        expect.objectContaining({
          id: "transportation:transport-1",
          airline_name: "Air Canada",
          airline_code: "AC",
          reservation_code: "ABC123",
          is_assigned_to_viewer: true,
          people: [expect.objectContaining({ name: "Alex Rivera" })],
        }),
        expect.objectContaining({ is_flight_departure_buffer: true }),
        expect.objectContaining({ accommodation_hold_kind: "check_in" }),
        expect.objectContaining({ accommodation_hold_kind: "check_out" }),
      ]),
    );
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
