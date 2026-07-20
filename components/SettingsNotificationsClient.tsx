"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bell, Mail, MonitorSmartphone } from "lucide-react";
import {
    revokePushSubscription,
    saveNotificationPreferences,
    savePushSubscription,
} from "@/app/actions/notificationPreferences";
import {
    CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS,
    getDefaultNotificationPreference,
    type NotificationPreference,
} from "@/lib/notificationTypes";

type SettingsNotificationsClientProps = {
    preferences: NotificationPreference[];
    vapidPublicKey?: string | null;
};

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function getPushSupportLabel({
    isSupported,
    permission,
    isSubscribed,
    isConfigured,
}: {
    isSupported: boolean;
    permission: NotificationPermission | "unknown";
    isSubscribed: boolean;
    isConfigured: boolean;
}) {
    if (!isConfigured) return "Push is not configured on this deployment yet.";
    if (!isSupported) return "This browser does not support web push.";
    if (permission === "denied") return "Push permission is blocked in this browser.";
    if (isSubscribed) return "Push is enabled on this device.";
    return "Push is available on this device.";
}

export default function SettingsNotificationsClient({
    preferences,
    vapidPublicKey,
}: SettingsNotificationsClientProps) {
    const initialSelections = useMemo(() => {
        const preferencesByType = new Map(
            preferences.map((preference) => [
                preference.notificationType,
                preference,
            ])
        );

        return {
            in_app: new Set<string>(
                CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS.filter(
                    (option) =>
                        preferencesByType.get(option.type)?.inAppEnabled ??
                        getDefaultNotificationPreference(option.type).inAppEnabled
                ).map((option) => option.type)
            ),
            push: new Set<string>(
                CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS.filter(
                    (option) =>
                        preferencesByType.get(option.type)?.pushEnabled ??
                        getDefaultNotificationPreference(option.type).pushEnabled
                ).map((option) => option.type)
            ),
            email: new Set<string>(
                CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS.filter(
                    (option) =>
                        preferencesByType.get(option.type)?.emailEnabled ??
                        getDefaultNotificationPreference(option.type).emailEnabled
                ).map((option) => option.type)
            ),
        };
    }, [preferences]);
    const [permission, setPermission] = useState<NotificationPermission | "unknown">(
        "unknown"
    );
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const [selectedInAppTypes, setSelectedInAppTypes] = useState(
        () => initialSelections.in_app
    );
    const [selectedPushTypes, setSelectedPushTypes] = useState(
        () => initialSelections.push
    );
    const [selectedEmailTypes, setSelectedEmailTypes] = useState(
        () => initialSelections.email
    );
    const isConfigured = Boolean(vapidPublicKey);
    const allNotificationTypes = useMemo(
        () =>
            CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS.map(
                (option) => option.type
            ),
        []
    );
    const channelSelections = {
        in_app: selectedInAppTypes,
        push: selectedPushTypes,
        email: selectedEmailTypes,
    };
    const channelSetters = {
        in_app: setSelectedInAppTypes,
        push: setSelectedPushTypes,
        email: setSelectedEmailTypes,
    };
    const channelControls = [
        {
            key: "in_app" as const,
            label: "In-app",
            icon: Bell,
        },
        {
            key: "push" as const,
            label: "Push",
            icon: MonitorSmartphone,
        },
        {
            key: "email" as const,
            label: "Email",
            icon: Mail,
        },
    ];

    useEffect(() => {
        setSelectedInAppTypes(initialSelections.in_app);
        setSelectedPushTypes(initialSelections.push);
        setSelectedEmailTypes(initialSelections.email);
    }, [initialSelections]);

    function setChannelValue(
        channel: keyof typeof channelSelections,
        notificationType: string,
        checked: boolean
    ) {
        channelSetters[channel]((current) => {
            const next = new Set(current);
            if (checked) {
                next.add(notificationType);
            } else {
                next.delete(notificationType);
            }
            return next;
        });
    }

    function toggleChannelAll(channel: keyof typeof channelSelections) {
        const current = channelSelections[channel];
        const shouldSelectAll = current.size !== allNotificationTypes.length;
        channelSetters[channel](
            shouldSelectAll ? new Set(allNotificationTypes) : new Set()
        );
    }

    useEffect(() => {
        const supported =
            typeof window !== "undefined" &&
            "Notification" in window &&
            "serviceWorker" in navigator &&
            "PushManager" in window;

        setIsSupported(supported);
        setPermission(
            typeof Notification === "undefined" ? "unknown" : Notification.permission
        );

        if (!supported) return;

        navigator.serviceWorker.ready
            .then((registration) => registration.pushManager.getSubscription())
            .then((subscription) => {
                setIsSubscribed(Boolean(subscription));
            })
            .catch(() => undefined);
    }, []);

    async function enablePush() {
        if (!isSupported || !vapidPublicKey) return;

        setStatusMessage("");

        try {
            const nextPermission = await Notification.requestPermission();
            setPermission(nextPermission);

            if (nextPermission !== "granted") {
                setStatusMessage("Push permission was not granted.");
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            const existingSubscription =
                await registration.pushManager.getSubscription();
            const subscription =
                existingSubscription ||
                (await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
                }));

            const result = await savePushSubscription(
                subscription.toJSON(),
                navigator.userAgent
            );

            if (!result.ok) {
                setStatusMessage(result.error || "Could not enable push.");
                return;
            }

            setIsSubscribed(true);
            setStatusMessage("Push notifications are enabled on this device.");
        } catch (error) {
            console.error("Could not enable push notifications:", error);
            setStatusMessage("Could not enable push notifications on this device.");
        }
    }

    async function disablePush() {
        if (!isSupported) return;

        setStatusMessage("");

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            const endpoint = subscription?.endpoint || null;
            if (subscription) await subscription.unsubscribe();
            const result = await revokePushSubscription(endpoint);

            if (!result.ok) {
                setStatusMessage(result.error || "Could not turn off push.");
                return;
            }

            setIsSubscribed(false);
            setStatusMessage("Push notifications are off for this device.");
        } catch (error) {
            console.error("Could not disable push notifications:", error);
            setStatusMessage("Could not turn off push notifications on this device.");
        }
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                            Push
                        </p>
                        <h2 className="mt-2 text-2xl font-black text-white">
                            This device
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                            {getPushSupportLabel({
                                isSupported,
                                permission,
                                isSubscribed,
                                isConfigured,
                            })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (isSubscribed) {
                                void disablePush();
                            } else {
                                void enablePush();
                            }
                        }}
                        disabled={
                            !isConfigured ||
                            !isSupported ||
                            permission === "denied" ||
                            isPending
                        }
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                        <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                        {isSubscribed ? "Turn off push" : "Enable push"}
                    </button>
                </div>
                {statusMessage ? (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm font-bold text-slate-300">
                        {statusMessage}
                    </p>
                ) : null}
            </section>

            <form
                action={(formData) => {
                    startTransition(async () => {
                        const result = await saveNotificationPreferences(formData);
                        setStatusMessage(
                            result.ok
                                ? "Notification preferences saved."
                                : result.error || "Could not save preferences."
                        );
                    });
                }}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5"
            >
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                            Channels
                        </p>
                        <h2 className="mt-2 text-2xl font-black text-white">
                            Notification types
                        </h2>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
                            Choose how VAIVIA contacts you for each notification.
                        </p>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-2 text-center text-xs font-black uppercase tracking-[0.12em] text-lime-200 md:w-72">
                        {channelControls.map((channel) => {
                            const Icon = channel.icon;
                            const isAllSelected =
                                channelSelections[channel.key].size ===
                                allNotificationTypes.length;

                            return (
                                <button
                                    key={channel.key}
                                    type="button"
                                    onClick={() => toggleChannelAll(channel.key)}
                                    className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 transition ${
                                        isAllSelected
                                            ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                            : "border-white/10 bg-white/[0.04] text-lime-100 hover:border-lime-300/30 hover:bg-white/[0.08]"
                                    }`}
                                    aria-pressed={isAllSelected}
                                    aria-label={`${
                                        isAllSelected ? "Clear all" : "Select all"
                                    } ${channel.label} notifications`}
                                >
                                    <span className="flex items-center gap-1">
                                        <Icon
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                        />
                                        {channel.label}
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-[0.1em]">
                                        {isAllSelected ? "Clear all" : "Select all"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    {CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS.map((option) => {
                        return (
                            <div
                                key={option.type}
                                className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4 md:grid-cols-[1fr_18rem]"
                            >
                                <div>
                                    <p className="text-sm font-black text-white">
                                        {option.label}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                                        {option.description}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <label className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2 text-xs font-black text-slate-200">
                                        <input
                                            type="checkbox"
                                            name="in_app"
                                            value={option.type}
                                            checked={selectedInAppTypes.has(
                                                option.type
                                            )}
                                            onChange={(event) =>
                                                setChannelValue(
                                                    "in_app",
                                                    option.type,
                                                    event.target.checked
                                                )
                                            }
                                            className="h-4 w-4 accent-lime-300"
                                        />
                                        <Bell className="h-4 w-4 md:hidden" />
                                        <span className="hidden md:inline">On</span>
                                    </label>
                                    <label className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2 text-xs font-black text-slate-200">
                                        <input
                                            type="checkbox"
                                            name="push"
                                            value={option.type}
                                            checked={selectedPushTypes.has(
                                                option.type
                                            )}
                                            onChange={(event) =>
                                                setChannelValue(
                                                    "push",
                                                    option.type,
                                                    event.target.checked
                                                )
                                            }
                                            className="h-4 w-4 accent-lime-300"
                                        />
                                        <MonitorSmartphone className="h-4 w-4 md:hidden" />
                                        <span className="hidden md:inline">On</span>
                                    </label>
                                    <label className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2 text-xs font-black text-slate-200">
                                        <input
                                            type="checkbox"
                                            name="email"
                                            value={option.type}
                                            checked={selectedEmailTypes.has(
                                                option.type
                                            )}
                                            onChange={(event) =>
                                                setChannelValue(
                                                    "email",
                                                    option.type,
                                                    event.target.checked
                                                )
                                            }
                                            className="h-4 w-4 accent-lime-300"
                                        />
                                        <Mail className="h-4 w-4 md:hidden" />
                                        <span className="hidden md:inline">On</span>
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70"
                    >
                        Save notification settings
                    </button>
                </div>
            </form>
        </div>
    );
}
