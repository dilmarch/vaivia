import { NextRequest, NextResponse } from "next/server";
import {
    getAssistantPlaceTargetHref,
    isActionUuid,
    isAssistantPlaceActionType,
    isGooglePlaceId,
    type AssistantPlaceActionPreview,
    type AssistantPlaceSavedTarget,
} from "@/lib/ai/place-action-contract";
import { loadAssistantPlaceActionOptions } from "@/lib/ai/place-actions";
import { getGooglePlaceDetails } from "@/lib/ai/google-places";
import { createClient } from "@/lib/supabase/server";
import { resolveTripRouteParam } from "@/lib/tripRoutes";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ tripId: string }> };
type ProposalRow = {
    proposal_id: string | null;
    proposal_status: string;
    proposal_expires_at: string | null;
    existing_target_type: string | null;
    existing_target_id: string | null;
};
type ConfirmationRow = {
    proposal_status: string;
    target_record_type: string | null;
    target_record_id: string | null;
    failure_code: string | null;
};

function safeError(message: string, status: number, code: string) {
    return NextResponse.json({ error: message, code }, { status });
}

async function authenticateTrip(context: RouteContext) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { error: safeError("Authentication required", 401, "unauthorized") };
    }

    const { tripId: routeParam } = await context.params;
    const resolved = await resolveTripRouteParam<{
        id: string;
        title: string;
        end_date: string | null;
    }>(supabase, routeParam, "id,title,end_date");
    if (!resolved.trip) {
        return { error: safeError("Trip not found", 404, "trip_not_found") };
    }

    return { supabase, user, trip: resolved.trip };
}

function targetType(value: unknown): AssistantPlaceSavedTarget["type"] | null {
    return value === "trip_idea" ||
        value === "trip_food_item" ||
        value === "itinerary_item"
        ? value
        : null;
}

async function loadSavedTarget({
    supabase,
    tripId,
    type,
    id,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tripId: string;
    type: AssistantPlaceSavedTarget["type"];
    id: string;
}): Promise<AssistantPlaceSavedTarget | null> {
    if (type === "trip_idea") {
        const { data } = await supabase
            .from("trip_ideas")
            .select("title")
            .eq("trip_id", tripId)
            .eq("id", id)
            .maybeSingle();
        if (!data) return null;
        return {
            type,
            label: data.title,
            href: getAssistantPlaceTargetHref(tripId, type),
        };
    }
    if (type === "trip_food_item") {
        const { data } = await supabase
            .from("trip_food_items")
            .select("name")
            .eq("trip_id", tripId)
            .eq("id", id)
            .maybeSingle();
        if (!data) return null;
        return {
            type,
            label: data.name,
            href: getAssistantPlaceTargetHref(tripId, type),
        };
    }

    const { data } = await supabase
        .from("itinerary_items")
        .select("title")
        .eq("trip_id", tripId)
        .eq("id", id)
        .maybeSingle();
    if (!data) return null;
    return {
        type,
        label: data.title,
        href: getAssistantPlaceTargetHref(tripId, type),
    };
}

function transientPreview(
    place: Awaited<ReturnType<typeof getGooglePlaceDetails>>
): AssistantPlaceActionPreview | null {
    if (place.status !== "success") return null;
    return {
        name: place.data.name,
        address: place.data.address,
        category: place.data.category,
        rating: place.data.rating,
        userRatingCount: place.data.userRatingCount,
        mapsUrl: place.data.mapsUrl,
    };
}

export async function POST(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;
    const { supabase, user, trip } = authenticated;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return safeError("Invalid request", 400, "invalid_request");
    }

    if (
        !isActionUuid(body.conversationId) ||
        !isActionUuid(body.messageId) ||
        !isGooglePlaceId(body.placeId) ||
        !isAssistantPlaceActionType(body.actionType)
    ) {
        return safeError("Invalid action request", 400, "invalid_request");
    }

    const { data, error } = await supabase.rpc(
        "create_ai_place_action_proposal",
        {
            target_trip_id: trip.id,
            target_conversation_id: body.conversationId,
            target_message_id: body.messageId,
            target_place_id: body.placeId.trim(),
            target_action_type: body.actionType,
        }
    );
    const proposal = (data?.[0] || null) as ProposalRow | null;
    if (error || !proposal) {
        return safeError("Action not found", 404, "action_not_found");
    }

    const duplicateType = targetType(proposal.existing_target_type);
    const alreadySaved =
        duplicateType && proposal.existing_target_id
            ? await loadSavedTarget({
                  supabase,
                  tripId: trip.id,
                  type: duplicateType,
                  id: proposal.existing_target_id,
              })
            : null;
    const options = await loadAssistantPlaceActionOptions({
        supabase,
        tripId: trip.id,
        userId: user.id,
        tripEndDate: trip.end_date,
    });

    if (proposal.proposal_status === "already_saved") {
        return NextResponse.json({
            proposal: null,
            preview: null,
            previewUnavailable: false,
            alreadySaved,
            options,
        });
    }

    if (
        !proposal.proposal_id ||
        !proposal.proposal_expires_at ||
        proposal.proposal_status !== "proposed"
    ) {
        return safeError("Action is no longer available", 409, "action_unavailable");
    }

    const { data: reserved } = await supabase.rpc(
        "reserve_ai_place_action_details_call",
        { target_proposal_id: proposal.proposal_id }
    );
    let preview: AssistantPlaceActionPreview | null = null;
    if (reserved === true) {
        const details = await getGooglePlaceDetails({
            placeId: body.placeId.trim(),
            signal: request.signal,
        });
        preview = transientPreview(details);
        await supabase.rpc("complete_ai_place_action_details_call", {
            target_proposal_id: proposal.proposal_id,
            target_outcome: preview ? "succeeded" : "failed",
        });
    }

    return NextResponse.json({
        proposal: {
            id: proposal.proposal_id,
            actionType: body.actionType,
            expiresAt: proposal.proposal_expires_at,
        },
        preview,
        previewUnavailable: preview === null,
        alreadySaved: null,
        options,
    });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;
    const { supabase, trip } = authenticated;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return safeError("Invalid request", 400, "invalid_request");
    }
    if (
        !isActionUuid(body.proposalId) ||
        !body.fields ||
        typeof body.fields !== "object" ||
        Array.isArray(body.fields)
    ) {
        return safeError("Invalid confirmation", 400, "invalid_request");
    }

    const { data, error } = await supabase.rpc(
        "confirm_ai_place_action_proposal",
        {
            target_proposal_id: body.proposalId,
            target_fields: body.fields,
        }
    );
    const result = (data?.[0] || null) as ConfirmationRow | null;
    if (error || !result) {
        return safeError("Action not found", 404, "action_not_found");
    }

    const savedType = targetType(result.target_record_type);
    const savedTarget =
        savedType && result.target_record_id
            ? await loadSavedTarget({
                  supabase,
                  tripId: trip.id,
                  type: savedType,
                  id: result.target_record_id,
              })
            : null;

    if (result.proposal_status === "succeeded" && savedTarget) {
        return NextResponse.json({ status: "succeeded", savedTarget });
    }
    if (result.failure_code === "already_saved" && savedTarget) {
        return NextResponse.json({ status: "already_saved", savedTarget });
    }

    const conflictCodes = new Set([
        "proposal_expired",
        "action_not_available",
        "target_write_failed",
    ]);
    if (conflictCodes.has(result.failure_code || "")) {
        return safeError(
            result.failure_code === "proposal_expired"
                ? "This review expired. Open Save and try again."
                : "This action could not be completed safely.",
            409,
            result.failure_code || "action_unavailable"
        );
    }

    return safeError(
        "Review the highlighted fields and try again.",
        400,
        result.failure_code || "invalid_fields"
    );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;
    const { supabase, trip } = authenticated;
    const proposalId = request.nextUrl.searchParams.get("proposalId");
    if (!isActionUuid(proposalId)) {
        return safeError("Invalid action", 400, "invalid_request");
    }

    const { data, error } = await supabase.rpc(
        "cancel_ai_place_action_proposal",
        { target_proposal_id: proposalId }
    );
    if (error) {
        return safeError(
            "This action could not be cancelled",
            500,
            "action_cancel_failed"
        );
    }
    if (data === true) {
        return NextResponse.json({ cancelled: true, status: "cancelled" });
    }

    const { data: currentProposal, error: lookupError } = await supabase
        .from("ai_place_action_proposals")
        .select("status")
        .eq("id", proposalId)
        .eq("trip_id", trip.id)
        .maybeSingle();

    if (lookupError || !currentProposal) {
        return safeError("Action not found", 404, "action_not_found");
    }
    if (currentProposal.status === "cancelled") {
        return NextResponse.json({
            cancelled: true,
            status: "already_cancelled",
        });
    }
    if (currentProposal.status === "succeeded") {
        return safeError(
            "This item was already saved. Cancelling the review does not remove it.",
            409,
            "action_already_succeeded"
        );
    }
    return safeError(
        "This action can no longer be cancelled",
        409,
        "action_not_cancellable"
    );
}
