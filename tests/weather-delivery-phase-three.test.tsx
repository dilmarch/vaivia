import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "react-email";
import { describe, expect, it, vi } from "vitest";

import { WeatherAlertEmail } from "@/emails/notifications/WeatherAlertEmail";
import {
    buildPushPayload,
    classifyPushError,
    executeWebPushAttempt,
} from "@/lib/pushNotifications";
import {
    dispatchNotificationChannels,
    isNotificationChannelEnabled,
    inAppNotificationChannel,
    type NotificationChannelAdapter,
} from "@/lib/notifications/deliveryChannels";
import { getDefaultNotificationPreference } from "@/lib/notificationTypes";

const root = process.cwd();
const migration = readFileSync(
    resolve(
        root,
        "supabase/migrations/20260806030922_add_weather_delivery_phase_three.sql"
    ),
    "utf8"
);

function source(path: string) {
    return readFileSync(resolve(root, path), "utf8");
}

const notification = {
    id: "notification-1",
    user_id: "user-1",
    type: "weather_alert",
    title: "Severe weather near Hotel Berlin",
    body: "Precise details that must not appear on a lock screen.",
    metadata: { deepLink: "/trips/berlin/assistant?weatherAlert=notification-1" },
};
const outbox = {
    id: "outbox-1",
    notification_id: notification.id,
    user_id: notification.user_id,
    notification_type: notification.type,
    attempts: 1,
    destination_url: "/trips/berlin/assistant?weatherAlert=notification-1",
};

describe("Phase 3 weather notification delivery", () => {
    it("keeps weather email and push explicitly opted out by default", () => {
        expect(getDefaultNotificationPreference("weather_alert")).toMatchObject({
            masterEnabled: true,
            inAppEnabled: true,
            emailEnabled: false,
            pushEnabled: false,
        });
    });

    it("enforces email opt-out, push opt-out, and the weather master switch", () => {
        expect(
            isNotificationChannelEnabled(
                { master_enabled: true, email_enabled: false },
                "email"
            )
        ).toBe(false);
        expect(
            isNotificationChannelEnabled(
                { master_enabled: true, push_enabled: false },
                "web_push"
            )
        ).toBe(false);
        expect(
            isNotificationChannelEnabled(
                { master_enabled: false, email_enabled: true, push_enabled: true },
                "email"
            )
        ).toBe(false);
        expect(
            isNotificationChannelEnabled(
                { master_enabled: true, email_enabled: true },
                "email"
            )
        ).toBe(true);
    });

    it("renders the concise weather email with trip context, links, attribution, and safety copy", async () => {
        const html = await render(
            <WeatherAlertEmail
                appUrl="https://vaivia.app"
                tripName="Berlin break"
                location="Berlin"
                eventWindow="Thursday 14:00 to 20:00"
                eventTitle="Severe thunderstorm warning"
                relevance="It may affect saved plans."
                sourceName="Weather Authority"
                sourceUrl="https://weather.example/alert"
                actionUrl="https://vaivia.app/trips/berlin/assistant?weatherAlert=1"
            />
        );
        expect(html).toContain("Berlin break");
        expect(html).toContain("Thursday 14:00 to 20:00");
        expect(html).toContain("Review plans");
        expect(html).toContain("Source: Includes weather data from Google");
        expect(html).toContain("follow local authorities");
        expect(html).toContain("/settings?section=notifications");
    });

    it("uses lock-screen-safe copy while retaining the exact owned deep link", () => {
        const payload = buildPushPayload(outbox, notification);
        expect(payload.title).toBe("Weather alert for your trip");
        expect(payload.body).not.toContain("Hotel Berlin");
        expect(payload.body).not.toContain("Precise details");
        expect(payload.url).toBe(outbox.destination_url);
    });

    it("falls back from unsafe push URLs to the notifications page", () => {
        expect(
            buildPushPayload(
                { ...outbox, destination_url: "https://evil.example/" },
                notification
            ).url
        ).toBe("/notifications");
        expect(
            buildPushPayload({ ...outbox, destination_url: "//evil.example" }, notification)
                .url
        ).toBe("/notifications");
    });

    it("deactivates expired 404/410 subscriptions and retries transient failures", () => {
        expect(classifyPushError({ statusCode: 404 })).toMatchObject({
            code: "subscription_invalid",
            permanent: true,
        });
        expect(classifyPushError({ statusCode: 410 })).toMatchObject({
            code: "subscription_invalid",
            permanent: true,
        });
        expect(classifyPushError({ statusCode: 503 })).toMatchObject({
            code: "network_error",
            permanent: false,
        });
        expect(source("lib/pushNotifications.ts")).toContain("revoked_at: new Date().toISOString()");
    });

    it("sends successfully to one or multiple independent subscriptions", async () => {
        const send = vi.fn().mockResolvedValue({ headers: { location: "push-message-1" } });
        const subscriptions = ["one", "two"].map((id) => ({
            id,
            endpoint: `https://push.example/${id}`,
            p256dh: `key-${id}`,
            auth: `auth-${id}`,
        }));
        const results = await Promise.all(
            subscriptions.map((subscription) =>
                executeWebPushAttempt({
                    subscription,
                    payload: "{}",
                    attempts: 1,
                    send,
                })
            )
        );
        expect(send).toHaveBeenCalledTimes(2);
        expect(results).toEqual([
            { status: "sent", providerMessageId: "push-message-1" },
            { status: "sent", providerMessageId: "push-message-1" },
        ]);
    });

    it("bounds transient delivery attempts and makes invalid endpoints permanent", async () => {
        const subscription = {
            id: "one",
            endpoint: "https://push.example/one",
            p256dh: "key",
            auth: "auth",
        };
        const transientSend = vi.fn().mockRejectedValue({ statusCode: 503 });
        await expect(
            executeWebPushAttempt({
                subscription,
                payload: "{}",
                attempts: 1,
                send: transientSend,
            })
        ).resolves.toMatchObject({ status: "retry" });
        await expect(
            executeWebPushAttempt({
                subscription,
                payload: "{}",
                attempts: 5,
                send: transientSend,
            })
        ).resolves.toMatchObject({ status: "failed" });
        await expect(
            executeWebPushAttempt({
                subscription,
                payload: "{}",
                attempts: 1,
                send: vi.fn().mockRejectedValue({ statusCode: 410 }),
            })
        ).resolves.toMatchObject({ status: "invalid" });
    });

    it("isolates a failed delivery channel from a successful one", async () => {
        const adapters: NotificationChannelAdapter<{ status: string }>[] = [
            {
                channel: "email",
                delivery: "queued",
                process: vi.fn().mockRejectedValue(new Error("resend unavailable")),
            },
            {
                channel: "web_push",
                delivery: "queued",
                process: vi.fn().mockResolvedValue([{ status: "sent" }]),
            },
        ];
        const results = await dispatchNotificationChannels(adapters, 25);
        expect(results[0].error).toBeInstanceOf(Error);
        expect(results[1]).toMatchObject({
            channel: "web_push",
            results: [{ status: "sent" }],
            error: null,
        });
    });

    it("creates one canonical notification and idempotent channel outboxes", () => {
        expect(inAppNotificationChannel).toEqual({
            channel: "in_app",
            delivery: "canonical",
        });
        expect(migration).toContain("on conflict (notification_id) do nothing");
        expect(migration).toContain("notification_email_outbox_idempotency_key_idx");
        expect(migration).toContain("notification_push_outbox_idempotency_key_idx");
        expect(migration).toContain("unique (push_outbox_id, subscription_id)");
    });

    it("enforces master and per-channel preferences before enqueueing", () => {
        expect(migration).toContain("coalesce(preferences.master_enabled, true) = true");
        expect(migration).toContain("preferences.email_enabled = true");
        expect(migration).toContain("preferences.push_enabled = true");
        const emailProcessor = source("lib/emailNotifications.tsx");
        const pushProcessor = source("lib/pushNotifications.ts");
        expect(emailProcessor).toContain('select("master_enabled,email_enabled")');
        expect(pushProcessor).toContain('select("master_enabled,push_enabled")');
    });

    it("requires an owned active subscription before weather push can be saved", () => {
        const actions = source("app/actions/notificationPreferences.ts");
        expect(actions).toContain('.eq("user_id", user.id)');
        expect(actions).toContain('.is("revoked_at", null)');
        expect(actions).toContain("if (!count)");
    });

    it("keeps subscription secrets owner-RLS protected and delivery records service-only", () => {
        const baseline = source(
            "supabase/migrations/20260716000000_production_baseline.sql"
        );
        expect(baseline).toContain(
            'CREATE POLICY "Users can view their push subscriptions"'
        );
        expect(baseline).toContain('("user_id" = ( SELECT "auth"."uid"()');
        expect(migration).toContain(
            "revoke all on table public.notification_push_deliveries from public, anon, authenticated"
        );
        expect(migration).toContain(
            "grant all on table public.notification_push_deliveries to service_role"
        );
        expect(migration).not.toContain("endpoint text");
        expect(migration).not.toContain("p256dh text");
    });

    it("restricts queue claim functions to the service role", () => {
        expect(migration).toContain(
            "revoke all on function public.claim_notification_email_outbox(integer)"
        );
        expect(migration).toContain(
            "grant execute on function public.claim_notification_push_outbox(integer) to service_role"
        );
    });

    it("requests notification permission only inside explicit enable handlers", () => {
        const settings = source("components/SettingsNotificationsClient.tsx");
        const prompt = source("components/pwa/MobilePushPrompt.tsx");
        expect(settings.indexOf("async function enablePush()"))
            .toBeLessThan(settings.indexOf("Notification.requestPermission()"));
        expect(prompt.indexOf("async function enablePush()"))
            .toBeLessThan(prompt.indexOf("Notification.requestPermission()"));
    });

    it("documents iOS Home Screen installation and gracefully feature-detects push", () => {
        const settings = source("components/SettingsNotificationsClient.tsx");
        expect(settings).toContain("add VAIVIA to your Home Screen");
        expect(settings).toContain('"Notification" in window');
        expect(settings).toContain('"serviceWorker" in navigator');
        expect(settings).toContain('"PushManager" in window');
    });

    it("preserves existing service-worker caching and uses safe same-origin click navigation", () => {
        const worker = source("public/sw.js");
        expect(worker).toContain('self.addEventListener("install"');
        expect(worker).toContain('self.addEventListener("activate"');
        expect(worker).toContain('self.addEventListener("fetch"');
        expect(worker).toContain('self.addEventListener("push"');
        expect(worker).toContain("requestedUrl.origin === self.location.origin");
        expect(worker).toContain(".navigate(targetUrl.toString())");
        expect(worker).toContain("self.clients.openWindow(targetUrl.toString())");
    });

    it("uses the required canonical VAPID environment names with migration fallbacks", () => {
        const env = source(".env.example");
        const push = source("lib/pushNotifications.ts");
        expect(env).toContain("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=");
        expect(env).toContain("WEB_PUSH_VAPID_PRIVATE_KEY=");
        expect(env).toContain("WEB_PUSH_SUBJECT=mailto:support@vaivia.app");
        expect(push).toContain("process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    });

    it("uses bounded exponential retries and sanitized error codes", () => {
        const push = source("lib/pushNotifications.ts");
        const email = source("lib/emailNotifications.tsx");
        expect(push).toContain("MAX_PUSH_ATTEMPTS = 5");
        expect(push).toContain("5 * 2 **");
        expect(email).toContain("sanitizeEmailErrorCode");
        expect(email).not.toContain("last_error: message.slice");
    });
});
