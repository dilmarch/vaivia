import "server-only";

import { render, toPlainText } from "react-email";
import { GenericNotificationEmail } from "@/emails/notifications/GenericNotificationEmail";
import { getEmailSenderConfig, getResendClient } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service";

type ExternalInviteOutboxRow = {
    id: string;
    event_key: string;
    invite_type: "trip_invite" | "friend_invite" | "passport_stamp_share";
    recipient_email: string;
    subject: string;
    payload: Record<string, unknown>;
    attempts: number;
};

type ProcessedExternalInviteResult = {
    id: string;
    status: "sent" | "failed" | "queued";
    reason?: string;
};

class PermanentExternalInviteEmailError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

function asString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function getRetryDelayMinutes(attempts: number) {
    return Math.min(24 * 60, Math.max(5, 5 * 2 ** Math.max(0, attempts - 1)));
}

function isPermanentResendError(error: unknown) {
    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return (
        message.includes("invalid") ||
        message.includes("not found") ||
        message.includes("forbidden") ||
        message.includes("unauthorized") ||
        message.includes("domain") ||
        message.includes("recipient")
    );
}

function getInviteEyebrow(inviteType: ExternalInviteOutboxRow["invite_type"]) {
    if (inviteType === "trip_invite") return "Trip invitation";
    if (inviteType === "passport_stamp_share") return "Passport stamp";
    return "Friend invitation";
}

function getInviteTitle(row: ExternalInviteOutboxRow) {
    if (row.subject.trim()) return row.subject.trim();
    if (row.invite_type === "trip_invite") return "You are invited to a trip on VAIVIA";
    if (row.invite_type === "passport_stamp_share") {
        return "You received a passport stamp on VAIVIA";
    }
    return "You are invited to join VAIVIA";
}

function getInviteBody(row: ExternalInviteOutboxRow) {
    const payload = asRecord(row.payload);
    const inviterName = asString(payload.inviterName) || "Someone";
    const tripTitle = asString(payload.tripTitle) || "a trip";

    if (row.invite_type === "trip_invite") {
        return `${inviterName} invited you to join ${tripTitle} on VAIVIA. Create your account with this email address to review the invitation and start planning.`;
    }

    if (row.invite_type === "passport_stamp_share") {
        return `${inviterName} sent you a passport stamp on VAIVIA. Create your account with this email address to review it.`;
    }

    return `${inviterName} added you as a friend on VAIVIA. Create your account with this email address to connect and start planning together.`;
}

function getInviteUrl(row: ExternalInviteOutboxRow, appUrl: string) {
    const payload = asRecord(row.payload);
    const signupPath = asString(payload.signupPath) || "/auth/sign-up";
    const url = new URL(signupPath, appUrl);

    url.searchParams.set("email", row.recipient_email);

    const invitationId = asString(payload.invitationId);
    if (invitationId) url.searchParams.set("invitation", invitationId);

    const inviteType = asString(payload.inviteType) || row.invite_type;
    if (inviteType) url.searchParams.set("invite", inviteType);

    return url.toString();
}

function getPreview(row: ExternalInviteOutboxRow) {
    const body = getInviteBody(row);
    return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

async function markExternalInviteOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    outboxId: string,
    values: Record<string, unknown>
) {
    await supabase
        .from("external_email_invite_outbox")
        .update({
            ...values,
            updated_at: new Date().toISOString(),
        })
        .eq("id", outboxId);
}

async function failOrRetryExternalInviteOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: ExternalInviteOutboxRow,
    error: unknown,
    permanent = false
): Promise<ProcessedExternalInviteResult> {
    const message =
        error instanceof Error ? error.message : "Could not send invite email.";
    const shouldFail = permanent || row.attempts >= 5;
    const nextAttemptAt = new Date(
        Date.now() + getRetryDelayMinutes(row.attempts) * 60 * 1000
    ).toISOString();

    await markExternalInviteOutbox(supabase, row.id, {
        status: shouldFail ? "failed" : "queued",
        last_error: message.slice(0, 1000),
        failed_at: shouldFail ? new Date().toISOString() : null,
        next_attempt_at: shouldFail ? null : nextAttemptAt,
    });

    return {
        id: row.id,
        status: shouldFail ? "failed" : "queued",
        reason: shouldFail ? "send-failed" : "retry-scheduled",
    };
}

async function sendExternalInviteEmail(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: ExternalInviteOutboxRow
): Promise<ProcessedExternalInviteResult> {
    if (!row.recipient_email.trim()) {
        throw new PermanentExternalInviteEmailError("recipient_email_missing");
    }

    const sender = getEmailSenderConfig();
    const actionUrl = getInviteUrl(row, sender.appUrl);
    const title = getInviteTitle(row);
    const body = getInviteBody(row);
    const email = (
        <GenericNotificationEmail
            appUrl={sender.appUrl}
            eyebrow={getInviteEyebrow(row.invite_type)}
            title={title}
            body={body}
            actionUrl={actionUrl}
            actionLabel="Join VAIVIA"
            preview={getPreview(row)}
        />
    );
    const html = await render(email);
    const text = toPlainText(html);
    const resend = getResendClient();
    const { data, error } = await resend.emails.send(
        {
            from: sender.from,
            to: row.recipient_email,
            replyTo: sender.replyTo,
            subject: title,
            html,
            text,
        },
        {
            headers: {
                "Idempotency-Key": `external-invite-email-${row.event_key}`,
            },
        }
    );

    if (error) {
        throw isPermanentResendError(error)
            ? new PermanentExternalInviteEmailError(error.message)
            : new Error(error.message);
    }

    await markExternalInviteOutbox(supabase, row.id, {
        status: "sent",
        provider_message_id: data?.id || null,
        sent_at: new Date().toISOString(),
        failed_at: null,
        last_error: null,
        next_attempt_at: null,
    });

    return { id: row.id, status: "sent" };
}

export async function processExternalInviteEmailOutbox(limit = 25) {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc(
        "claim_external_email_invite_outbox",
        {
            batch_limit: limit,
        }
    );

    if (error) {
        throw new Error(`Could not claim external invite email outbox: ${error.message}`);
    }

    const rows = (data || []) as ExternalInviteOutboxRow[];
    const results: ProcessedExternalInviteResult[] = [];

    for (const row of rows) {
        try {
            results.push(await sendExternalInviteEmail(supabase, row));
        } catch (error) {
            results.push(
                await failOrRetryExternalInviteOutbox(
                    supabase,
                    row,
                    error,
                    error instanceof PermanentExternalInviteEmailError
                )
            );
        }
    }

    return results;
}
