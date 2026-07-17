import { NextResponse } from "next/server";
import { processExternalInviteEmailOutbox } from "@/lib/externalInviteEmails";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type InviteRequestBody = {
    invitee_identifier?: unknown;
    consent_confirmed?: unknown;
    target_leg_ids?: unknown;
    target_transportation_item_ids?: unknown;
    target_accommodation_item_ids?: unknown;
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

    const { data: invitationId, error } = await supabase.rpc(
        "create_trip_invitation_with_assignments",
        {
            target_trip_id: tripId,
            invitee_identifier: inviteeIdentifier,
            consent_confirmed: body.consent_confirmed === true,
            target_leg_ids: getStringArray(body.target_leg_ids),
            target_transportation_item_ids: getStringArray(
                body.target_transportation_item_ids
            ),
            target_accommodation_item_ids: getStringArray(
                body.target_accommodation_item_ids
            ),
        }
    );

    if (error) {
        console.error("Could not create trip invitation:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });

        return NextResponse.json(
            {
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            },
            { status: getInviteErrorStatus(error.message) }
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
