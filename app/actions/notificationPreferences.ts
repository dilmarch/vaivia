"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
    NOTIFICATION_TYPES,
    isKnownNotificationType,
} from "@/lib/notificationTypes";

type PushSubscriptionPayload = {
    endpoint?: string;
    keys?: {
        p256dh?: string;
        auth?: string;
    };
};

export async function saveNotificationPreferences(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "Unauthorized" };

    const inAppTypes = new Set(formData.getAll("in_app").map(String));
    const pushTypes = new Set(formData.getAll("push").map(String));
    const emailTypes = new Set(formData.getAll("email").map(String));
    const now = new Date().toISOString();

    const rows = NOTIFICATION_TYPES.map((notificationType) => ({
        user_id: user.id,
        notification_type: notificationType,
        in_app_enabled: inAppTypes.has(notificationType),
        push_enabled: pushTypes.has(notificationType),
        email_enabled: emailTypes.has(notificationType),
        updated_at: now,
    }));

    const { error } = await (supabase.from as any)(
        "user_notification_preferences"
    ).upsert(rows, {
        onConflict: "user_id,notification_type",
    });

    if (error) {
        console.error("Could not save notification preferences:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return { ok: false, error: "Could not save notification preferences." };
    }

    revalidatePath("/settings");
    revalidatePath("/notifications");

    return { ok: true };
}

export async function savePushSubscription(
    subscription: PushSubscriptionPayload,
    userAgent?: string,
    options?: { enablePushPreferences?: boolean }
) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "Unauthorized" };

    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
        return { ok: false, error: "Missing push subscription details." };
    }

    const now = new Date().toISOString();
    const { error } = await (supabase.from as any)("user_push_subscriptions")
        .upsert(
            {
                user_id: user.id,
                endpoint,
                p256dh,
                auth,
                user_agent: userAgent ? userAgent.slice(0, 500) : null,
                platform: detectSubscriptionPlatform(userAgent),
                revoked_at: null,
                last_seen_at: now,
                updated_at: now,
            },
            { onConflict: "endpoint" }
        );

    if (error) {
        console.error("Could not save push subscription:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return { ok: false, error: "Could not save push subscription." };
    }

    if (options?.enablePushPreferences) {
        const preferenceRows = NOTIFICATION_TYPES.map((notificationType) => ({
            user_id: user.id,
            notification_type: notificationType,
            push_enabled: true,
            updated_at: now,
        }));
        const { error: preferenceError } = await (supabase.from as any)(
            "user_notification_preferences"
        ).upsert(preferenceRows, {
            onConflict: "user_id,notification_type",
        });

        if (preferenceError) {
            console.error("Could not enable push notification preferences:", {
                message: preferenceError.message,
                code: preferenceError.code,
                details: preferenceError.details,
                hint: preferenceError.hint,
            });
            return {
                ok: false,
                error: "Push was enabled for this device, but VAIVIA could not update notification preferences.",
            };
        }
    }

    return { ok: true };
}

export async function revokePushSubscription(endpoint?: string | null) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "Unauthorized" };

    const query = (supabase.from as any)("user_push_subscriptions")
        .update({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

    const { error } = endpoint ? await query.eq("endpoint", endpoint) : await query;

    if (error) {
        console.error("Could not revoke push subscription:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return { ok: false, error: "Could not turn off push on this device." };
    }

    return { ok: true };
}

function detectSubscriptionPlatform(userAgent?: string | null) {
    const value = String(userAgent || "").toLowerCase();
    if (value.includes("iphone") || value.includes("ipad")) return "ios";
    if (value.includes("android")) return "android";
    if (value.includes("windows")) return "windows";
    if (value.includes("mac os")) return "macos";
    return "web";
}

export async function saveSingleNotificationPreference({
    notificationType,
    channel,
    enabled,
}: {
    notificationType: string;
    channel: "in_app" | "push" | "email";
    enabled: boolean;
}) {
    if (!isKnownNotificationType(notificationType)) {
        return { ok: false, error: "Unknown notification type." };
    }

    const formData = new FormData();
    NOTIFICATION_TYPES.forEach((type) => {
        if (type === notificationType && enabled) formData.append(channel, type);
    });

    return saveNotificationPreferences(formData);
}
