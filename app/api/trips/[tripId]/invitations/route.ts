import { NextResponse } from "next/server";
import { processExternalInviteEmailOutbox } from "@/lib/externalInviteEmails";
import { createClient } from "@/lib/supabase/server";
import {
    createTripInvitation,
    updateInvitationLegs,
} from "@/lib/trips/collaboration";
import { TripLifecycleError } from "@/lib/trips/lifecycle";

export const runtime = "nodejs";

type InviteRequestBody = {
    invitee_identifier?: unknown;
    consent_confirmed?: unknown;
    target_leg_ids?: unknown;
    target_transportation_item_ids?: unknown;
    target_accommodation_item_ids?: unknown;
};

type UpdateInviteLegsRequestBody = {
    invitation_id?: unknown;
    target_leg_ids?: unknown;
};

function getStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function getInviteErrorStatus(message: string) {
    const normalized = message.toLowerCase();
    if (
        normalized.includes("not authenticated") ||
        normalized.includes("authentication required")
    ) {
        return 401;
    }

    if (
        normalized.includes("do not have access") ||
        normalized.includes("do not have permission") ||
        normalized.includes("blocked") ||
        normalized.includes("cannot invite")
    ) {
        return 403;
    }

    if (
        normalized.includes("required") ||
        normalized.includes("already") ||
        normalized.includes("duplicate")
    ) {
        return 400;
    }

    return 500;
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ tripId: string }> }
) {
    const { tripId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: InviteRequestBody;
    try {
        body = (await request.json()) as InviteRequestBody;
    } catch {
        return NextResponse.json(
            { error: "Invitation details are required." },
            { status: 400 }
        );
    }

    const inviteeIdentifier =
        typeof body.invitee_identifier === "string"
            ? body.invitee_identifier.trim()
            : "";

    if (!inviteeIdentifier) {
        return NextResponse.json(
            { error: "Invitee email or username is required." },
            { status: 400 }
        );
    }

    let invitationId: string;
    try {
        ({ invitationId } = await createTripInvitation({
            supabase,
            userId: user.id,
            tripId,
            input: {
                inviteeIdentifier,
                consentConfirmed: body.consent_confirmed === true,
                legIds: getStringArray(body.target_leg_ids),
                transportationItemIds: getStringArray(
                    body.target_transportation_item_ids
                ),
                accommodationItemIds: getStringArray(
                    body.target_accommodation_item_ids
                ),
            },
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not send invitation.";
        return NextResponse.json(
            { error: message },
            {
                status:
                    error instanceof TripLifecycleError
                        ? error.status
                        : getInviteErrorStatus(message),
            }
        );
    }

    let externalEmailProcessed = false;
    try {
        await processExternalInviteEmailOutbox(10);
        externalEmailProcessed = true;
    } catch (processError) {
        console.warn("Trip invitation was created, but external invite email processing did not complete:", {
            message:
                processError instanceof Error
                    ? processError.message
                    : "Unknown external invite processor error.",
        });
    }

    return NextResponse.json({
        invitationId,
        externalEmailProcessed,
    });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ tripId: string }> }
) {
    const { tripId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: UpdateInviteLegsRequestBody;
    try {
        body = (await request.json()) as UpdateInviteLegsRequestBody;
    } catch {
        return NextResponse.json(
            { error: "Invitation leg selections are required." },
            { status: 400 }
        );
    }

    const invitationId =
        typeof body.invitation_id === "string" ? body.invitation_id.trim() : "";
    if (!invitationId) {
        return NextResponse.json(
            { error: "Invitation ID is required." },
            { status: 400 }
        );
    }

    try {
        const { selectedLegCount } = await updateInvitationLegs({
            supabase,
            userId: user.id,
            tripId,
            invitationId,
            legIds: getStringArray(body.target_leg_ids),
        });
        return NextResponse.json({ selectedLegCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update invitation.";
        return NextResponse.json(
            { error: message },
            {
                status:
                    error instanceof TripLifecycleError
                        ? error.status
                        : getInviteErrorStatus(message),
            }
        );
    }
}
