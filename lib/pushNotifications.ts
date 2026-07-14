import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service";

type PushOutboxRow = {
    id: string;
    notification_id: string;
    user_id: string;
    notification_type: string;
    title?: string | null;
    body?: string | null;
    destination_url?: string | null;
    event_id?: string | null;
    payload?: Record<string, unknown> | null;
    attempts: number;
};

type NotificationRow = {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body?: string | null;
    metadata?: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
};

function configureWebPush() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject =
        process.env.VAPID_SUBJECT || "mailto:support@thetravellinglinguist.com";

    if (!publicKey || !privateKey) {
        throw new Error("VAPID keys are not configured.");
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
}

function getNotificationUrl(notification: NotificationRow) {
    const metadata = notification.metadata || {};
    const url = metadata.url || metadata.href || metadata.path;
    if (typeof url === "string" && url.startsWith("/")) return url;
    return "/notifications";
}

async function markOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    outboxId: string,
    status: "processing" | "sent" | "skipped" | "failed",
    lastError?: string | null,
    nextAttemptAt?: string | null
) {
    await (supabase.from as any)("notification_push_outbox")
        .update({
            status,
            last_error: lastError || null,
            next_attempt_at: nextAttemptAt || null,
            sent_at: status === "sent" ? new Date().toISOString() : undefined,
            failed_at: status === "failed" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
            processed_at:
                status === "processing" ? null : new Date().toISOString(),
        })
        .eq("id", outboxId);
}

function getRetryTimestamp(attempts: number) {
    const delayMinutes = Math.min(60, Math.max(1, attempts) * 5);
    return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

export async function processNotificationPushOutbox(limit = 25) {
    configureWebPush();

    const supabase = createServiceRoleClient();
    const { data: outboxRows, error: outboxError } = await (supabase.rpc as any)(
        "claim_notification_push_outbox",
        { batch_limit: limit }
    );

    if (outboxError) {
        throw new Error(`Could not load push outbox: ${outboxError.message}`);
    }

    const rows = (outboxRows || []) as PushOutboxRow[];
    const results = [];

    for (const row of rows) {
        try {
            const result = await sendPushForNotification(row);
            results.push({ id: row.id, ...result });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown push error.";
            const shouldStopRetrying = row.attempts >= 5;
            await (supabase.from as any)("notification_push_outbox")
                .update({
                    status: "failed",
                    last_error: message,
                    next_attempt_at: shouldStopRetrying
                        ? null
                        : getRetryTimestamp(row.attempts),
                    processed_at:
                        shouldStopRetrying ? new Date().toISOString() : null,
                    failed_at: shouldStopRetrying
                        ? new Date().toISOString()
                        : null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", row.id);
            results.push({ id: row.id, status: "failed", error: message });
        }
    }

    return results;
}

async function sendPushForNotification(row: PushOutboxRow) {
    const supabase = createServiceRoleClient();
    const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .select("id,user_id,type,title,body,metadata")
        .eq("id", row.notification_id)
        .maybeSingle();

    if (notificationError || !notification) {
        await markOutbox(
            supabase,
            row.id,
            "skipped",
            notificationError?.message || "Notification no longer exists."
        );
        return { status: "skipped", reason: "missing-notification" };
    }

    const notificationRow = notification as NotificationRow;
    const { data: preference } = await (supabase.from as any)(
        "user_notification_preferences"
    )
        .select("push_enabled")
        .eq("user_id", notificationRow.user_id)
        .eq("notification_type", notificationRow.type)
        .maybeSingle();

    if (preference && preference.push_enabled === false) {
        await markOutbox(supabase, row.id, "skipped", "Push disabled.");
        return { status: "skipped", reason: "push-disabled" };
    }

    if (!preference) {
        await markOutbox(
            supabase,
            row.id,
            "skipped",
            "Push disabled by default until the user opts in."
        );
        return { status: "skipped", reason: "push-not-opted-in" };
    }

    const { data: subscriptions, error: subscriptionError } = await (
        supabase.from as any
    )("user_push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", notificationRow.user_id)
        .is("revoked_at", null);

    if (subscriptionError) {
        throw new Error(subscriptionError.message);
    }

    const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[];
    if (!activeSubscriptions.length) {
        await markOutbox(supabase, row.id, "skipped", "No active subscriptions.");
        return { status: "skipped", reason: "no-subscriptions" };
    }

    const payload = JSON.stringify({
        notificationId: notificationRow.id,
        type: notificationRow.type,
        eventId: row.event_id || row.payload?.eventId || notificationRow.id,
        title: row.title || notificationRow.title || "VAIVIA",
        body:
            row.body ||
            notificationRow.body ||
            "You have a new notification.",
        url: row.destination_url || getNotificationUrl(notificationRow),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: notificationRow.id,
    });
    let sentCount = 0;
    let temporaryFailureCount = 0;

    for (const subscription of activeSubscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth,
                    },
                },
                payload
            );
            sentCount += 1;
        } catch (error) {
            const statusCode =
                typeof error === "object" &&
                error &&
                "statusCode" in error &&
                typeof (error as { statusCode?: unknown }).statusCode === "number"
                    ? (error as { statusCode: number }).statusCode
                    : null;

            if (statusCode === 404 || statusCode === 410) {
                await (supabase.from as any)("user_push_subscriptions")
                    .update({
                        revoked_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", subscription.id);
            } else {
                temporaryFailureCount += 1;
                console.warn("Could not send push notification:", error);
            }
        }
    }

    if (sentCount === 0 && temporaryFailureCount > 0) {
        await markOutbox(
            supabase,
            row.id,
            "failed",
            "No push subscriptions accepted delivery.",
            row.attempts >= 5 ? null : getRetryTimestamp(row.attempts)
        );

        return { status: "failed", sentCount };
    }

    await markOutbox(
        supabase,
        row.id,
        sentCount > 0 ? "sent" : "skipped",
        sentCount > 0 ? null : "No active push subscriptions accepted delivery."
    );

    return { status: sentCount > 0 ? "sent" : "skipped", sentCount };
}
