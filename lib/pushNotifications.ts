import "server-only";

import { createHash } from "node:crypto";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isNotificationChannelEnabled } from "@/lib/notifications/deliveryChannels";

const MAX_PUSH_ATTEMPTS = 5;

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

type PushDeliveryRow = {
    id: string;
    subscription_id: string | null;
    status: "pending" | "processing" | "sent" | "retry" | "invalid" | "failed";
    attempts: number;
    next_attempt_at: string | null;
};

export type PushErrorClassification = {
    code: "subscription_invalid" | "rate_limited" | "provider_rejected" | "network_error";
    permanent: boolean;
    statusCode: number | null;
};

type WebPushSender = (
    subscription: webpush.PushSubscription,
    payload: string
) => Promise<{ headers?: Record<string, string | string[] | undefined> }>;

export type WebPushAttemptResult =
    | { status: "sent"; providerMessageId: string | null }
    | {
          status: "invalid" | "retry" | "failed";
          classification: PushErrorClassification;
      };

function configureWebPush() {
    const publicKey =
        process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey =
        process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
    const subject =
        process.env.WEB_PUSH_SUBJECT?.trim() || process.env.VAPID_SUBJECT?.trim();

    if (!publicKey || !privateKey || !subject) {
        throw new Error("VAPID keys and subject are not configured.");
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
}

function safeRelativeUrl(value: unknown) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : "/notifications";
}

function getNotificationUrl(notification: NotificationRow) {
    const metadata = notification.metadata || {};
    return safeRelativeUrl(
        metadata.deepLink || metadata.url || metadata.href || metadata.path
    );
}

export function buildPushPayload(
    row: PushOutboxRow,
    notification: NotificationRow
) {
    const isWeather = notification.type === "weather_alert";
    return {
        notificationId: notification.id,
        type: notification.type,
        eventId: row.event_id || row.payload?.eventId || notification.id,
        title: isWeather
            ? "Weather alert for your trip"
            : row.title || notification.title || "VAIVIA",
        body: isWeather
            ? "Adverse weather may affect upcoming travel plans. Open VAIVIA for details and follow local authorities."
            : row.body || notification.body || "You have a new notification.",
        url: safeRelativeUrl(row.destination_url || getNotificationUrl(notification)),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: notification.id,
    };
}

export function classifyPushError(error: unknown): PushErrorClassification {
    const statusCode =
        typeof error === "object" &&
        error &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : null;

    if (statusCode === 404 || statusCode === 410) {
        return { code: "subscription_invalid", permanent: true, statusCode };
    }
    if (statusCode === 429) {
        return { code: "rate_limited", permanent: false, statusCode };
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
        return { code: "provider_rejected", permanent: true, statusCode };
    }
    return { code: "network_error", permanent: false, statusCode };
}

export async function executeWebPushAttempt({
    subscription,
    payload,
    attempts,
    send = webpush.sendNotification.bind(webpush) as WebPushSender,
}: {
    subscription: PushSubscriptionRow;
    payload: string;
    attempts: number;
    send?: WebPushSender;
}): Promise<WebPushAttemptResult> {
    try {
        const response = await send(
            {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload
        );
        const location = response.headers?.location;
        return {
            status: "sent",
            providerMessageId:
                typeof location === "string" ? location.slice(0, 500) : null,
        };
    } catch (error) {
        const classification = classifyPushError(error);
        if (classification.code === "subscription_invalid") {
            return { status: "invalid", classification };
        }
        if (classification.permanent || attempts >= MAX_PUSH_ATTEMPTS) {
            return { status: "failed", classification };
        }
        return { status: "retry", classification };
    }
}

function identifierHash(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function retryTimestamp(attempts: number) {
    const delayMinutes = Math.min(24 * 60, 5 * 2 ** Math.max(0, attempts - 1));
    return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

async function markOutbox(
    supabase: ReturnType<typeof createServiceRoleClient>,
    outboxId: string,
    status: "sent" | "skipped" | "failed",
    errorCode?: string | null,
    nextAttemptAt?: string | null
) {
    await supabase
        .from("notification_push_outbox")
        .update({
            status,
            last_error: errorCode || null,
            next_attempt_at: nextAttemptAt || null,
            sent_at: status === "sent" ? new Date().toISOString() : null,
            failed_at:
                status === "failed" && !nextAttemptAt
                    ? new Date().toISOString()
                    : null,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", outboxId);
}

async function createOrLoadDeliveries(
    supabase: ReturnType<typeof createServiceRoleClient>,
    row: PushOutboxRow,
    subscriptions: PushSubscriptionRow[]
) {
    const { data: existing, error: existingError } = await supabase
        .from("notification_push_deliveries")
        .select("id,subscription_id,status,attempts,next_attempt_at")
        .eq("push_outbox_id", row.id);
    if (existingError) throw new Error("push_delivery_state_unavailable");

    const bySubscription = new Map<string, PushDeliveryRow>(
        ((existing || []) as PushDeliveryRow[]).flatMap((delivery) =>
            delivery.subscription_id ? [[delivery.subscription_id, delivery]] : []
        )
    );
    const missing = subscriptions.filter(
        (subscription) => !bySubscription.has(subscription.id)
    );

    if (missing.length) {
        const { data: inserted, error: insertError } = await supabase
            .from("notification_push_deliveries")
            .insert(
                missing.map((subscription) => ({
                    push_outbox_id: row.id,
                    notification_id: row.notification_id,
                    subscription_id: subscription.id,
                    user_id: row.user_id,
                    destination_identifier_hash: identifierHash(subscription.endpoint),
                    idempotency_key: `notification-push-${row.notification_id}-${subscription.id}`,
                }))
            )
            .select("id,subscription_id,status,attempts,next_attempt_at");
        if (insertError) throw new Error("push_delivery_state_unavailable");
        for (const delivery of (inserted || []) as PushDeliveryRow[]) {
            if (delivery.subscription_id) bySubscription.set(delivery.subscription_id, delivery);
        }
    }

    return bySubscription;
}

async function updateDelivery(
    supabase: ReturnType<typeof createServiceRoleClient>,
    id: string,
    values: Record<string, unknown>
) {
    const { error } = await supabase
        .from("notification_push_deliveries")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw new Error("push_delivery_state_unavailable");
}

async function sendPushForNotification(row: PushOutboxRow) {
    const supabase = createServiceRoleClient();
    const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .select("id,user_id,type,title,body,metadata")
        .eq("id", row.notification_id)
        .maybeSingle();

    if (notificationError || !notification) {
        await markOutbox(supabase, row.id, "skipped", "notification_missing");
        return { status: "skipped", reason: "missing-notification" };
    }

    const notificationRow = notification as NotificationRow;
    const { data: preference, error: preferenceError } = await supabase
        .from("user_notification_preferences")
        .select("master_enabled,push_enabled")
        .eq("user_id", notificationRow.user_id)
        .eq("notification_type", notificationRow.type)
        .maybeSingle();
    if (preferenceError) throw new Error("push_preference_unavailable");
    if (!isNotificationChannelEnabled(preference, "web_push")) {
        await markOutbox(supabase, row.id, "skipped", "preference_disabled");
        return { status: "skipped", reason: "push-disabled" };
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
        .from("user_push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", notificationRow.user_id)
        .is("revoked_at", null);
    if (subscriptionError) throw new Error("push_subscriptions_unavailable");

    const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[];
    if (!activeSubscriptions.length) {
        await markOutbox(supabase, row.id, "skipped", "no_active_subscriptions");
        return { status: "skipped", reason: "no-subscriptions" };
    }

    const deliveries = await createOrLoadDeliveries(supabase, row, activeSubscriptions);
    const payload = JSON.stringify(buildPushPayload(row, notificationRow));
    let sentCount = 0;
    let retryCount = 0;
    let invalidCount = 0;
    let failedCount = 0;

    for (const subscription of activeSubscriptions) {
        const delivery = deliveries.get(subscription.id);
        if (!delivery) continue;
        if (["sent", "invalid", "failed"].includes(delivery.status)) {
            if (delivery.status === "sent") sentCount += 1;
            if (delivery.status === "failed") failedCount += 1;
            continue;
        }
        if (
            delivery.status === "retry" &&
            delivery.next_attempt_at &&
            new Date(delivery.next_attempt_at).getTime() > Date.now()
        ) {
            retryCount += 1;
            continue;
        }

        const attempts = delivery.attempts + 1;
        await updateDelivery(supabase, delivery.id, {
            status: "processing",
            attempts,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: null,
        });

        const attempt = await executeWebPushAttempt({
            subscription,
            payload,
            attempts,
        });
        if (attempt.status === "sent") {
            await updateDelivery(supabase, delivery.id, {
                status: "sent",
                sent_at: new Date().toISOString(),
                failed_at: null,
                error_code: null,
                provider_message_id: attempt.providerMessageId,
            });
            sentCount += 1;
        } else {
            const { classification } = attempt;
            console.warn("Push delivery failed", {
                notificationType: notificationRow.type,
                code: classification.code,
                statusCode: classification.statusCode,
                permanent: classification.permanent,
            });

            if (attempt.status === "invalid") {
                await supabase
                    .from("user_push_subscriptions")
                    .update({
                        revoked_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", subscription.id)
                    .eq("user_id", notificationRow.user_id);
                await updateDelivery(supabase, delivery.id, {
                    status: "invalid",
                    failed_at: new Date().toISOString(),
                    error_code: classification.code,
                });
                invalidCount += 1;
            } else if (attempt.status === "failed") {
                await updateDelivery(supabase, delivery.id, {
                    status: "failed",
                    failed_at: new Date().toISOString(),
                    error_code: classification.code,
                });
                failedCount += 1;
            } else {
                await updateDelivery(supabase, delivery.id, {
                    status: "retry",
                    next_attempt_at: retryTimestamp(attempts),
                    failed_at: null,
                    error_code: classification.code,
                });
                retryCount += 1;
            }
        }
    }

    if (retryCount > 0) {
        const exhausted = row.attempts >= MAX_PUSH_ATTEMPTS;
        await markOutbox(
            supabase,
            row.id,
            "failed",
            "device_delivery_retry",
            exhausted ? null : retryTimestamp(row.attempts)
        );
        return { status: exhausted ? "failed" : "pending", sentCount };
    }

    const finalStatus = sentCount > 0 ? "sent" : failedCount > 0 ? "failed" : "skipped";
    await markOutbox(
        supabase,
        row.id,
        finalStatus,
        sentCount > 0
            ? null
            : failedCount > 0
              ? "device_delivery_failed"
              : invalidCount > 0
                ? "subscriptions_invalid"
                : "no_delivery"
    );
    return { status: finalStatus, sentCount };
}

export async function processNotificationPushOutbox(limit = 25) {
    configureWebPush();
    const supabase = createServiceRoleClient();
    const { data: outboxRows, error: outboxError } = await supabase.rpc(
        "claim_notification_push_outbox",
        { batch_limit: limit }
    );
    if (outboxError) throw new Error("Could not load push outbox.");

    const results = [];
    for (const row of (outboxRows || []) as PushOutboxRow[]) {
        try {
            results.push({ id: row.id, ...(await sendPushForNotification(row)) });
        } catch {
            const exhausted = row.attempts >= MAX_PUSH_ATTEMPTS;
            await markOutbox(
                supabase,
                row.id,
                "failed",
                "push_processing_failed",
                exhausted ? null : retryTimestamp(row.attempts)
            );
            results.push({
                id: row.id,
                status: exhausted ? "failed" : "pending",
                error: "push_processing_failed",
            });
        }
    }
    return results;
}
