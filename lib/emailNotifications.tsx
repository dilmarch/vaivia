import "server-only";

import { render, toPlainText } from "react-email";
import { GenericNotificationEmail } from "@/emails/notifications/GenericNotificationEmail";
import { getEmailSenderConfig, getResendClient } from "@/lib/email/resend";
import { createServiceRoleClient } from "@/lib/supabase/service";

type EmailOutboxRow = {
    id: string;
    notification_id: string;
    user_id: string;
    notification_type: string;
    recipient_email: string;
    subject: string;
    template_key: string;
    payload: Record<string, unknown>;
    attempts: number;
};

type ProcessedEmailResult = {
    id: string;
    status: "sent" | "cancelled" | "failed" | "queued";
    reason?: string;
};

class PermanentEmailError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

function getNotificationBody(row: EmailOutboxRow) {
    const body = row.payload.body;
    if (typeof body === "string" && body.trim()) return body.trim();
    return "You have a new update waiting in VAIVIA.";
}

function getNotificationTitle(row: EmailOutboxRow) {
    const title = row.payload.title;
    if (typeof title === "string" && title.trim()) return title.trim();
    return row.subject || "VAIVIA notification";
}

function getNotificationUrl(row: EmailOutboxRow, appUrl: string) {
    const metadata = asRecord(row.payload.metadata);
    const candidate = metadata.url || metadata.href || metadata.path;
    const path =
        typeof candidate === "string" && candidate.startsWith("/")
            ? candidate
            : "/notifications";

    return `${appUrl}${path}`;
}

function getEmailEyebrow(notificationType: string) {
    return notificationType
        .split("_")
        .filter(Boolean)
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ");
}

function getActionLabel(notificationType: string) {
    if (notificationType.includes("invite")) return "View invitation";
    if (notificationType.includes("friend")) return "View friends";
    if (notificationType.includes("passport")) return "View passport";
    if (notificationType.includes("terms")) return "Review terms";
    if (notificationType.includes("trip")) return "Open trip";
    return "Open VAIVIA";
}

function getPreview(row: EmailOutboxRow) {
    const body = getNotificationBody(row);
    return body.length > 140 ? `${body.slice(0, 137)}...` : body;
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

async function markEmailOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    outboxId: string,
    values: Record<string, unknown>
) {
    await supabase
        .from("notification_email_outbox")
        .update({
            ...values,
            updated_at: new Date().toISOString(),
        })
        .eq("id", outboxId);
}

async function cancelEmailOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: EmailOutboxRow,
    reason: string
): Promise<ProcessedEmailResult> {
    await markEmailOutbox(supabase, row.id, {
        status: "cancelled",
        last_error: reason,
        failed_at: null,
        next_attempt_at: null,
    });

    return { id: row.id, status: "cancelled", reason };
}

async function failOrRetryEmailOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: EmailOutboxRow,
    error: unknown,
    permanent = false
): Promise<ProcessedEmailResult> {
    const message =
        error instanceof Error ? error.message : "Could not send email notification.";
    const shouldFail = permanent || row.attempts >= 5;
    const nextAttemptAt = new Date(
        Date.now() + getRetryDelayMinutes(row.attempts) * 60 * 1000
    ).toISOString();

    await markEmailOutbox(supabase, row.id, {
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

async function sendEmailForOutboxRow(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: EmailOutboxRow
): Promise<ProcessedEmailResult> {
    const { data: preference, error: preferenceError } = await supabase
        .from("user_notification_preferences")
        .select("email_enabled")
        .eq("user_id", row.user_id)
        .eq("notification_type", row.notification_type)
        .maybeSingle();

    if (preferenceError) throw new Error(preferenceError.message);
    if (!preference?.email_enabled) {
        return cancelEmailOutbox(supabase, row, "preference_disabled");
    }

    const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(row.user_id);

    if (userError) {
        throw new PermanentEmailError("recipient_user_missing");
    }

    const currentEmail = userData.user?.email?.trim();
    if (!currentEmail) {
        throw new PermanentEmailError("recipient_email_missing");
    }

    const sender = getEmailSenderConfig();
    const actionUrl = getNotificationUrl(row, sender.appUrl);
    const email = (
        <GenericNotificationEmail
            appUrl={sender.appUrl}
            eyebrow={getEmailEyebrow(row.notification_type)}
            title={getNotificationTitle(row)}
            body={getNotificationBody(row)}
            actionUrl={actionUrl}
            actionLabel={getActionLabel(row.notification_type)}
            preview={getPreview(row)}
        />
    );
    const html = await render(email);
    const text = toPlainText(html);
    const resend = getResendClient();
    const { data, error } = await resend.emails.send(
        {
            from: sender.from,
            to: currentEmail,
            replyTo: sender.replyTo,
            subject: row.subject || getNotificationTitle(row),
            html,
            text,
        },
        {
            headers: {
                "Idempotency-Key": `notification-email-${row.notification_id}`,
            },
        }
    );

    if (error) {
        throw isPermanentResendError(error)
            ? new PermanentEmailError(error.message)
            : new Error(error.message);
    }

    await markEmailOutbox(supabase, row.id, {
        status: "sent",
        provider_message_id: data?.id || null,
        sent_at: new Date().toISOString(),
        failed_at: null,
        last_error: null,
        next_attempt_at: null,
    });

    return { id: row.id, status: "sent" };
}

export async function processNotificationEmailOutbox(limit = 25) {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("claim_notification_email_outbox", {
        batch_limit: limit,
    });

    if (error) {
        throw new Error(`Could not claim email outbox: ${error.message}`);
    }

    const rows = (data || []) as EmailOutboxRow[];
    const results: ProcessedEmailResult[] = [];

    for (const row of rows) {
        try {
            results.push(await sendEmailForOutboxRow(supabase, row));
        } catch (error) {
            results.push(
                await failOrRetryEmailOutbox(
                    supabase,
                    row,
                    error,
                    error instanceof PermanentEmailError
                )
            );
        }
    }

    return results;
}
