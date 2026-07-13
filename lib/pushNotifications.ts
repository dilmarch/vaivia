import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service";

type PushOutboxRow = {
    id: string;
    notification_id: string;
    user_id: string;
    notification_type: string;
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
    lastError?: string | null
) {
    await (supabase.from as any)("notification_push_outbox")
        .update({
            status,
            last_error: lastError || null,
            processed_at:
                status === "processing" ? null : new Date().toISOString(),
        })
        .eq("id", outboxId);
}

export async function processNotificationPushOutbox(limit = 25) {
    configureWebPush();

    const supabase = createServiceRoleClient();
    const { data: outboxRows, error: outboxError } = await (supabase.from as any)(
        "notification_push_outbox"
    )
        .select("id,notification_id,user_id,notification_type,attempts")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit);

    if (outboxError) {
        throw new Error(`Could not load push outbox: ${outboxError.message}`);
    }

    const rows = (outboxRows || []) as PushOutboxRow[];
    const results = [];

    for (const row of rows) {
        await markOutbox(supabase, row.id, "processing");

        try {
            const result = await sendPushForNotification(row);
            results.push({ id: row.id, ...result });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown push error.";
            await (supabase.from as any)("notification_push_outbox")
                .update({
                    status: row.attempts >= 4 ? "failed" : "pending",
                    attempts: row.attempts + 1,
                    last_error: message,
                    processed_at:
                        row.attempts >= 4 ? new Date().toISOString() : null,
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
        title: notificationRow.title || "VAIVIA",
        body: notificationRow.body || "You have a new notification.",
        url: getNotificationUrl(notificationRow),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: notificationRow.id,
    });
    let sentCount = 0;

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
                console.warn("Could not send push notification:", error);
            }
        }
    }

    await markOutbox(
        supabase,
        row.id,
        sentCount > 0 ? "sent" : "failed",
        sentCount > 0 ? null : "No push subscriptions accepted delivery."
    );

    return { status: sentCount > 0 ? "sent" : "failed", sentCount };
}
