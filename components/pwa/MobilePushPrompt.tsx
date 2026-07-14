"use client";

import { usePathname } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/actions/notificationPreferences";

type MobilePushPromptProps = {
    vapidPublicKey?: string | null;
};

const PROMPT_KEY = "vaivia:mobile-push-prompt:v1";

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function isLikelyMobileDevice() {
    if (typeof window === "undefined") return false;

    const hasMobileUserAgent =
        /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
            window.navigator.userAgent
        );
    const hasCoarsePointer =
        window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const hasSmallViewport = window.innerWidth <= 840;

    return hasMobileUserAgent || (hasCoarsePointer && hasSmallViewport);
}

async function getReadyServiceWorkerRegistration() {
    const readyRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4500)),
    ]);

    return readyRegistration;
}

export default function MobilePushPrompt({ vapidPublicKey }: MobilePushPromptProps) {
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isAuthRoute = pathname?.startsWith("/auth");

    useEffect(() => {
        if (!vapidPublicKey || isAuthRoute) return;
        if (typeof window === "undefined") return;
        if (window.localStorage.getItem(PROMPT_KEY)) return;
        if (!isLikelyMobileDevice()) return;
        if (
            !("Notification" in window) ||
            !("serviceWorker" in navigator) ||
            !("PushManager" in window)
        ) {
            return;
        }
        if (Notification.permission === "denied") return;

        let isMounted = true;
        const timer = window.setTimeout(async () => {
            try {
                const registration = await getReadyServiceWorkerRegistration();
                if (!registration || !isMounted) return;

                const subscription =
                    await registration.pushManager.getSubscription();
                if (subscription) {
                    window.localStorage.setItem(PROMPT_KEY, "already-enabled");
                    return;
                }

                if (isMounted) setIsVisible(true);
            } catch {
                // The app can still function without push support.
            }
        }, 1400);

        return () => {
            isMounted = false;
            window.clearTimeout(timer);
        };
    }, [isAuthRoute, vapidPublicKey]);

    function dismissPrompt() {
        window.localStorage.setItem(PROMPT_KEY, "dismissed");
        setIsVisible(false);
    }

    async function enablePush() {
        if (!vapidPublicKey) return;

        setIsSubmitting(true);
        setStatusMessage("");

        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                window.localStorage.setItem(PROMPT_KEY, "permission-not-granted");
                setStatusMessage("Push permission was not granted.");
                setIsSubmitting(false);
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
                window.navigator.userAgent,
                { enablePushPreferences: true }
            );

            if (!result.ok) {
                setStatusMessage(result.error || "Could not enable push.");
                setIsSubmitting(false);
                return;
            }

            window.localStorage.setItem(PROMPT_KEY, "enabled");
            setIsVisible(false);
        } catch (error) {
            console.error("Could not enable mobile push notifications:", error);
            setStatusMessage("Could not enable push notifications on this device.");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!isVisible || isAuthRoute) return null;

    return (
        <aside className="fixed bottom-[calc(6.75rem+var(--safe-area-bottom))] left-5 right-5 z-[72] mx-auto max-w-[21rem] overflow-hidden rounded-[1.35rem] border border-lime-300/25 bg-[#090713]/95 text-white shadow-[0_20px_58px_rgba(0,0,0,0.52),0_0_28px_rgba(var(--vaivia-neon-rgb),0.14)] backdrop-blur-2xl md:hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(var(--vaivia-neon-rgb),0.16),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(255,54,190,0.14),transparent_34%)]" />
            <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.26)]">
                            <BellRing className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200">
                                Stay in the loop
                            </p>
                            <h2 className="mt-1.5 text-lg font-black tracking-tight">
                                Turn on push notifications?
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={dismissPrompt}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                        aria-label="Dismiss push notification prompt"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                    Get trip invites, friend requests, passport stamps, and important
                    VAIVIA updates on this phone.
                </p>
                {statusMessage ? (
                    <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-xs font-bold text-slate-300">
                        {statusMessage}
                    </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={dismissPrompt}
                        className="min-h-11 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.12]"
                    >
                        Not now
                    </button>
                    <button
                        type="button"
                        onClick={() => void enablePush()}
                        disabled={isSubmitting}
                        className="min-h-11 flex-1 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70"
                    >
                        {isSubmitting ? "Turning on..." : "Turn on"}
                    </button>
                </div>
            </div>
        </aside>
    );
}
