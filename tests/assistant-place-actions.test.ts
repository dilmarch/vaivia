import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    resolveTrip: vi.fn(),
    loadOptions: vi.fn(),
    details: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: mocks.createClient,
}));
vi.mock("@/lib/tripRoutes", () => ({
    resolveTripRouteParam: mocks.resolveTrip,
}));
vi.mock("@/lib/ai/place-actions", () => ({
    loadAssistantPlaceActionOptions: mocks.loadOptions,
}));
vi.mock("@/lib/ai/google-places", () => ({
    getGooglePlaceDetails: mocks.details,
}));

import {
    DELETE,
    PATCH,
    POST,
    maxDuration,
} from "@/app/api/trips/[tripId]/assistant/actions/route";
import {
    getAssistantPlaceActionLabel,
    getAssistantPlaceTargetHref,
    isActionUuid,
    isAssistantPlaceActionType,
    isGooglePlaceId,
} from "@/lib/ai/place-action-contract";

const root = process.cwd();
const migrationPath =
    "supabase/migrations/20260720033254_add_assistant_place_actions_phase_two_c.sql";
const readMigration = () => readFileSync(resolve(root, migrationPath), "utf8");
const tripId = "10000000-0000-4000-8000-000000000001";
const conversationId = "20000000-0000-4000-8000-000000000001";
const messageId = "30000000-0000-4000-8000-000000000001";
const proposalId = "40000000-0000-4000-8000-000000000001";
const targetId = "50000000-0000-4000-8000-000000000001";
const placeId = "ChIJValidPlace123";

function context() {
    return { params: Promise.resolve({ tripId }) };
}

function request(method: string, body?: unknown, query = "") {
    return new NextRequest(`http://localhost/api/trips/${tripId}/assistant/actions${query}`, {
        method,
        ...(body === undefined
            ? {}
            : {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
              }),
    });
}

function tableQuery(savedLabel = "My saved place") {
    const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
            data: { title: savedLabel, name: savedLabel },
            error: null,
        }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return query;
}

function supabaseWithRpc(
    rpc: ReturnType<typeof vi.fn>,
    authenticated = true,
    from?: ReturnType<typeof vi.fn>
) {
    return {
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: authenticated ? { id: "user-a" } : null },
            }),
        },
        rpc,
        from: from || vi.fn(() => tableQuery()),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTrip.mockResolvedValue({
        trip: { id: tripId, title: "Trip", end_date: "2026-08-10" },
    });
    mocks.loadOptions.mockResolvedValue({
        tripLegs: [],
        itineraryCategories: [],
        timezoneHints: {},
    });
    mocks.details.mockResolvedValue({ status: "failure", code: "no_results" });
});

describe("assistant place action contract", () => {
    it("accepts only the three intended actions and bounded identifiers", () => {
        expect(isAssistantPlaceActionType("save_thing_to_do")).toBe(true);
        expect(isAssistantPlaceActionType("save_food")).toBe(true);
        expect(isAssistantPlaceActionType("add_itinerary")).toBe(true);
        expect(isAssistantPlaceActionType("delete_trip")).toBe(false);
        expect(isGooglePlaceId(placeId)).toBe(true);
        expect(isGooglePlaceId("https://maps.example/place")).toBe(false);
        expect(isActionUuid(proposalId)).toBe(true);
        expect(isActionUuid("proposal-from-model-prose")).toBe(false);
    });

    it("maps results only to the existing trip surfaces", () => {
        expect(getAssistantPlaceActionLabel("save_food")).toBe("Save to Eat & Drink");
        expect(getAssistantPlaceTargetHref(tripId, "trip_idea")).toContain(
            "tab=ideas"
        );
        expect(getAssistantPlaceTargetHref(tripId, "trip_food_item")).toContain(
            "/food?tab=places"
        );
        expect(getAssistantPlaceTargetHref(tripId, "itinerary_item")).toContain(
            "/itinerary"
        );
    });
});

describe("assistant place action API", () => {
    it("requires authentication before creating a proposal", async () => {
        const rpc = vi.fn();
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc, false));

        const response = await POST(
            request("POST", {
                conversationId,
                messageId,
                placeId,
                actionType: "save_food",
            }),
            context()
        );

        expect(response.status).toBe(401);
        expect(rpc).not.toHaveBeenCalled();
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("rejects forged card references before any RPC or provider call", async () => {
        const rpc = vi.fn();
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc));

        const response = await POST(
            request("POST", {
                conversationId,
                messageId: "model-prose",
                placeId: "not a place id",
                actionType: "save_food",
            }),
            context()
        );

        expect(response.status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("returns not found when the database rejects cross-user or cross-trip evidence", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc));

        const response = await POST(
            request("POST", {
                conversationId,
                messageId,
                placeId,
                actionType: "save_food",
            }),
            context()
        );

        expect(response.status).toBe(404);
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("reserves no more than one transient Place Details call per proposal", async () => {
        const rpc = vi.fn(async (name: string) => {
            if (name === "create_ai_place_action_proposal") {
                return {
                    data: [
                        {
                            proposal_id: proposalId,
                            proposal_status: "proposed",
                            proposal_expires_at: "2026-08-01T00:15:00Z",
                            existing_target_type: null,
                            existing_target_id: null,
                        },
                    ],
                    error: null,
                };
            }
            if (name === "reserve_ai_place_action_details_call") {
                return { data: true, error: null };
            }
            return { data: true, error: null };
        });
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc));
        mocks.details.mockResolvedValue({
            status: "success",
            data: {
                name: "Transient provider name",
                address: "Transient provider address",
                category: "restaurant",
                rating: 4.6,
                userRatingCount: 100,
                mapsUrl: "https://maps.google.com/example",
            },
        });

        const response = await POST(
            request("POST", {
                conversationId,
                messageId,
                placeId,
                actionType: "save_food",
            }),
            context()
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.preview.name).toBe("Transient provider name");
        expect(mocks.details).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith(
            "reserve_ai_place_action_details_call",
            { target_proposal_id: proposalId }
        );
        expect(rpc).toHaveBeenCalledWith(
            "complete_ai_place_action_details_call",
            expect.objectContaining({ target_proposal_id: proposalId })
        );
    });

    it("confirms only through the atomic RPC and never calls Places", async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: [
                {
                    proposal_status: "succeeded",
                    target_record_type: "trip_food_item",
                    target_record_id: targetId,
                    failure_code: null,
                },
            ],
            error: null,
        });
        const supabase = supabaseWithRpc(rpc);
        mocks.createClient.mockResolvedValue(supabase);

        const response = await PATCH(
            request("PATCH", {
                proposalId,
                fields: { label: "My own label", mealCategories: ["dinner"] },
            }),
            context()
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({
            status: "succeeded",
            savedTarget: { type: "trip_food_item", label: "My saved place" },
        });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith("confirm_ai_place_action_proposal", {
            target_proposal_id: proposalId,
            target_fields: {
                label: "My own label",
                mealCategories: ["dinner"],
            },
        });
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("cancels an unconfirmed proposal without a domain write", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
        const from = vi.fn(() => tableQuery());
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc, true, from));

        const response = await DELETE(
            request("DELETE", undefined, `?proposalId=${proposalId}`),
            context()
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            cancelled: true,
            status: "cancelled",
        });
        expect(rpc).toHaveBeenCalledWith("cancel_ai_place_action_proposal", {
            target_proposal_id: proposalId,
        });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(from).not.toHaveBeenCalled();
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("returns an explicit idempotent outcome for an already-cancelled proposal", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
        const from = vi.fn((table: string) => {
            expect(table).toBe("ai_place_action_proposals");
            const query = tableQuery();
            query.maybeSingle.mockResolvedValue({
                data: { status: "cancelled" },
                error: null,
            });
            return query;
        });
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc, true, from));

        const response = await DELETE(
            request("DELETE", undefined, `?proposalId=${proposalId}`),
            context()
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            cancelled: true,
            status: "already_cancelled",
        });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(from).toHaveBeenCalledTimes(1);
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it.each([
        ["succeeded", "action_already_succeeded"],
        ["expired", "action_not_cancellable"],
    ])(
        "does not report a %s proposal as cancelled",
        async (status, expectedCode) => {
            const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
            const from = vi.fn((table: string) => {
                expect(table).toBe("ai_place_action_proposals");
                const query = tableQuery();
                query.maybeSingle.mockResolvedValue({
                    data: { status },
                    error: null,
                });
                return query;
            });
            mocks.createClient.mockResolvedValue(
                supabaseWithRpc(rpc, true, from)
            );

            const response = await DELETE(
                request("DELETE", undefined, `?proposalId=${proposalId}`),
                context()
            );
            const payload = await response.json();

            expect(response.status).toBe(409);
            expect(payload).toMatchObject({ code: expectedCode });
            expect(payload).not.toHaveProperty("cancelled", true);
            expect(rpc).toHaveBeenCalledTimes(1);
            expect(from).toHaveBeenCalledTimes(1);
            expect(mocks.details).not.toHaveBeenCalled();
        }
    );

    it("does not use assistant quota or target-table writes while cancelling", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
        const from = vi.fn(() => tableQuery());
        mocks.createClient.mockResolvedValue(supabaseWithRpc(rpc, true, from));

        await DELETE(
            request("DELETE", undefined, `?proposalId=${proposalId}`),
            context()
        );

        expect(rpc.mock.calls.map(([name]) => name)).toEqual([
            "cancel_ai_place_action_proposal",
        ]);
        expect(from).not.toHaveBeenCalled();
        expect(mocks.details).not.toHaveBeenCalled();
    });

    it("keeps the review route bounded independently of the assistant route", () => {
        expect(maxDuration).toBe(30);
    });
});

describe("Phase 2C database enforcement", () => {
    it("stores only action state, Place ID and bounded numeric detail telemetry", () => {
        const migration = readMigration();
        const tableDefinition = migration.slice(
            migration.indexOf("create table public.ai_place_action_proposals"),
            migration.indexOf("create index ai_place_action_proposals_user_trip_created_idx")
        );

        expect(tableDefinition).toContain("google_place_id text not null");
        expect(tableDefinition).toContain("place_details_call_count smallint");
        expect(tableDefinition).toContain(
            "check (place_details_call_count between 0 and 1)"
        );
        expect(tableDefinition).not.toMatch(
            /\b(?:name|address|coordinates|latitude|longitude|url|rating|hours|provider_payload|query)\b/i
        );
    });

    it("enforces user ownership, active-trip access and least-privilege grants", () => {
        const migration = readMigration();
        expect(migration).toContain(
            "user_id = (select auth.uid())\n  and public.is_trip_active_member(trip_id)"
        );
        expect(migration).toContain(
            "revoke all on table public.ai_place_action_proposals from public, anon, authenticated"
        );
        expect(migration).toContain(
            "grant select on table public.ai_place_action_proposals to authenticated"
        );
        expect(migration).not.toMatch(
            /grant (?:insert|update|delete) on table public\.ai_place_action_proposals to authenticated/i
        );
    });

    it("accepts only complete Places-card messages from the same conversation, user and trip", () => {
        const migration = readMigration();
        expect(migration).toContain("conversation.user_id = current_user_id");
        expect(migration).toContain("message.conversation_id = target_conversation_id");
        expect(migration).toContain("message.trip_id = target_trip_id");
        expect(migration).toContain("message.user_id = current_user_id");
        expect(migration).toContain("message.role = 'assistant'");
        expect(migration).toContain("message.status = 'complete'");
        expect(migration).toContain(
            "message.metadata ->> 'type' = 'google_places_recommendations'"
        );
        expect(migration).toContain(
            "recommendation ->> 'placeId' = normalized_place_id"
        );
    });

    it("uses short-lived, locked, atomic and idempotent confirmation", () => {
        const migration = readMigration();
        expect(migration).toContain("now() + interval '15 minutes'");
        expect(migration).toContain("for update;");
        expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
        expect(migration).toContain("if proposal.status = 'succeeded' then");
        expect(migration).toContain("proposal.expires_at <= now()");
        expect(migration).toContain("when unique_violation then");
        expect(migration).toContain("when others then");
    });

    it("writes only a Place ID plus explicit user-authored fields to target tables", () => {
        const migration = readMigration();
        const confirmation = migration.slice(
            migration.indexOf("create or replace function public.confirm_ai_place_action_proposal")
        );

        expect(confirmation).toContain("insert into public.trip_ideas");
        expect(confirmation).toContain("insert into public.trip_food_items");
        expect(confirmation).toContain("insert into public.itinerary_items");
        expect(confirmation).toContain("proposal.google_place_id");
        expect(confirmation).toContain("label_value");
        expect(confirmation).not.toMatch(
            /insert into public\.(?:trip_ideas|trip_food_items|itinerary_items)[\s\S]{0,500}\b(?:formatted_address|latitude|longitude|website_url|phone_number|rating|opening_hours)\b/i
        );
    });

    it("prevents duplicate assistant saves and immutable-link tampering", () => {
        const migration = readMigration();
        expect(migration).toContain("trip_ideas_assistant_place_unique_idx");
        expect(migration).toContain("trip_food_items_assistant_place_unique_idx");
        expect(migration).toContain("Assistant place linkage is immutable");
        expect(migration).toContain("Invalid assistant place action link");
        const hardening = readFileSync(
            resolve(
                root,
                "supabase/migrations/20260720034809_restrict_private_assistant_action_duplicates.sql"
            ),
            "utf8"
        );
        expect(hardening).toContain("duplicate detection must mirror Things to Do visibility");
        expect(hardening).toContain("not idea.is_private or idea.created_by = current_user_id");
    });

    it("keeps user-authored target fields editable after success while locking Places linkage", () => {
        const editCompatibility = readFileSync(
            resolve(
                root,
                "supabase/migrations/20260720035245_allow_user_field_edits_on_assistant_targets.sql"
            ),
            "utf8"
        );
        expect(editCompatibility).toContain(
            "without blocking later\n-- edits to the user's own title"
        );
        expect(editCompatibility).toContain(
            "new.google_place_id is not distinct from old.google_place_id"
        );
        expect(editCompatibility).toContain("Assistant place linkage is immutable");

        const ownershipScope = readFileSync(
            resolve(
                root,
                "supabase/migrations/20260720035654_lock_assistant_target_ownership_scope.sql"
            ),
            "utf8"
        );
        expect(ownershipScope).toContain(
            "new.trip_id is not distinct from old.trip_id"
        );
        expect(ownershipScope).toContain(
            "new.created_by is distinct from proposal.user_id"
        );
    });
});
