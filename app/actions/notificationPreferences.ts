"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
    NOTIFICATION_TYPES,
    WEATHER_NOTIFICATION_TYPE,
    getDefaultNotificationPreference,
    isKnownNotificationType,
    isRequiredNotificationType,
} from "@/lib/notificationTypes";
import type { Database } from "@/src/types/supabase";

type NotificationPreferencesClient = Pick<SupabaseClient<Database>, "from">;

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
    const weatherMasterEnabled = formData.get("weather_master") === "on";
    const weatherInAppEnabled = formData.get("weather_in_app") === "on";
    const weatherEmailEnabled = formData.get("weather_email") === "on";
    const weatherPushRequested = formData.get("weather_push") === "on";
    const now = new Date().toISOString();
    const database = supabase as NotificationPreferencesClient;
    let weatherPushEnabled = false;

    if (weatherPushRequested) {
        const { count, error: subscriptionError } = await supabase
            .from("user_push_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .is("revoked_at", null);
        if (subscriptionError) {
            return { ok: false, error: "Could not verify your push devices." };
        }
        if (!count) {
            return {
                ok: false,
                error: "Enable push on at least one device before turning on weather push alerts.",
            };
        }
        weatherPushEnabled = true;
    }

    const rows = NOTIFICATION_TYPES.map((notificationType) => {
        const requiredPreference = getDefaultNotificationPreference(
            notificationType
        );

        return {
            user_id: user.id,
            notification_type: notificationType,
            master_enabled:
                notificationType === WEATHER_NOTIFICATION_TYPE
                    ? weatherMasterEnabled
                    : true,
            in_app_enabled: isRequiredNotificationType(notificationType)
                ? requiredPreference.inAppEnabled
                : notificationType === WEATHER_NOTIFICATION_TYPE
                  ? weatherInAppEnabled
                  : inAppTypes.has(notificationType),
            push_enabled: isRequiredNotificationType(notificationType)
                ? requiredPreference.pushEnabled
                : notificationType === WEATHER_NOTIFICATION_TYPE
                  ? weatherPushEnabled
                  : pushTypes.has(notificationType),
            email_enabled: isRequiredNotificationType(notificationType)
                ? requiredPreference.emailEnabled
                : notificationType === WEATHER_NOTIFICATION_TYPE
                  ? weatherEmailEnabled
                  : emailTypes.has(notificationType),
            updated_at: now,
        };
    });

    const { error } = await database.from("user_notification_preferences").upsert(rows, {
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
    const database = supabase as NotificationPreferencesClient;
    const { error } = await database
        .from("user_push_subscriptions")
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
            // Device enrollment enables existing general push categories but
            // never silently opts the user into weather push.
            push_enabled: notificationType !== WEATHER_NOTIFICATION_TYPE,
            updated_at: now,
        }));
        const { error: preferenceError } = await database
            .from("user_notification_preferences")
            .upsert(preferenceRows, {
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

    const database = supabase as NotificationPreferencesClient;
    const query = database
        .from("user_push_subscriptions")
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

export async function revokePushSubscriptionById(subscriptionId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Unauthorized" };

    const id = subscriptionId.trim();
    if (!id) return { ok: false, error: "Missing device identifier." };
    const { error } = await supabase
        .from("user_push_subscriptions")
        .update({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);
    if (error) return { ok: false, error: "Could not remove this push device." };

    revalidatePath("/settings");
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

    if (isRequiredNotificationType(notificationType) && !enabled) {
        return { ok: false, error: "This notification is required." };
    }

    const formData = new FormData();
    NOTIFICATION_TYPES.forEach((type) => {
        if (type === notificationType && enabled) formData.append(channel, type);
    });

    return saveNotificationPreferences(formData);
}
