"use client";

import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";

type BeforeInstallPromptChoice = {
    outcome: "accepted" | "dismissed";
    platform: string;
};

type BeforeInstallPromptEvent = Event & {
    platforms: string[];
    userChoice: Promise<BeforeInstallPromptChoice>;
    prompt: () => Promise<void>;
};

const DISMISS_KEY = "vaivia:pwa-install-dismissed-at:v1";
const VISIT_KEY = "vaivia:pwa-visit-count:v1";
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function isIosSafari() {
    if (typeof window === "undefined") return false;

    const userAgent = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(userAgent);
    const isSafari = /^((?!CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo).)*Safari/i.test(
        userAgent
    );

    return isIosDevice && isSafari;
}

function shouldWaitForCooldown() {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || "0");
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function trackPwaEvent(name: string, detail?: Record<string, string>) {
    window.dispatchEvent(
        new CustomEvent("vaivia:pwa", {
            detail: {
                name,
                ...detail,
            },
        })
    );
}

export default function PwaInstallPrompt() {
    const pathname = usePathname();
    const isStandalone = useStandaloneMode();
    const [installEvent, setInstallEvent] =
        useState<BeforeInstallPromptEvent | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [showIosSteps, setShowIosSteps] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const supportsIosInstructions = useMemo(isIosSafari, []);
    const isAuthRoute = pathname?.startsWith("/auth");

    useEffect(() => {
        function handleBeforeInstallPrompt(event: Event) {
            event.preventDefault();
            setInstallEvent(event as BeforeInstallPromptEvent);
        }

        function handleInstalled() {
            setIsVisible(false);
            setInstallEvent(null);
            trackPwaEvent("app_installed");
        }

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.addEventListener("appinstalled", handleInstalled);

        return () => {
            window.removeEventListener(
                "beforeinstallprompt",
                handleBeforeInstallPrompt
            );
            window.removeEventListener("appinstalled", handleInstalled);
        };
    }, []);

    useEffect(() => {
        if (isStandalone) {
            trackPwaEvent("standalone_launch");
        }
    }, [isStandalone]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isStandalone || isAuthRoute || isDismissed) return;
        if (!installEvent && !supportsIosInstructions) return;
        if (shouldWaitForCooldown()) return;

        const visitCount = Number(window.localStorage.getItem(VISIT_KEY) || "0") + 1;
        window.localStorage.setItem(VISIT_KEY, String(visitCount));

        const hasMeaningfulEngagement =
            visitCount >= 2 ||
            Boolean(
                pathname?.startsWith("/trips") ||
                    pathname?.startsWith("/settings") ||
                    pathname?.startsWith("/notifications")
            );

        if (!hasMeaningfulEngagement) return;

        setIsVisible(true);
        trackPwaEvent("install_prompt_shown", {
            platform: installEvent ? "chromium" : "ios",
        });
    }, [
        installEvent,
        isAuthRoute,
        isDismissed,
        isStandalone,
        pathname,
        supportsIosInstructions,
    ]);

    function dismissPrompt() {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setIsVisible(false);
        setIsDismissed(true);
        trackPwaEvent("install_prompt_dismissed");
    }

    async function handleInstall() {
        if (!installEvent) {
            setShowIosSteps(true);
            trackPwaEvent("install_instructions_opened", { platform: "ios" });
            return;
        }

        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        trackPwaEvent(
            choice.outcome === "accepted"
                ? "install_prompt_accepted"
                : "install_prompt_dismissed",
            { platform: "chromium" }
        );
        setInstallEvent(null);
        setIsVisible(false);
    }

    if (!isVisible || isStandalone || isAuthRoute) return null;

    return (
        <aside className="fixed bottom-[calc(6.75rem+var(--safe-area-bottom))] left-4 right-4 z-[70] mx-auto max-w-sm overflow-hidden rounded-[1.75rem] border border-lime-300/25 bg-[#090713]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_34px_rgba(var(--vaivia-neon-rgb),0.16)] backdrop-blur-2xl md:bottom-6 md:left-auto md:right-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(var(--vaivia-neon-rgb),0.16),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(255,54,190,0.14),transparent_34%)]" />
            <div className="relative p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            Install VAIVIA
                        </p>
                        <h2 className="mt-2 text-xl font-black tracking-tight">
                            Add VAIVIA to your Home Screen
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={dismissPrompt}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                        aria-label="Dismiss install prompt"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                    Add VAIVIA to your Home Screen for quicker access and an
                    app-style experience.
                </p>

                {showIosSteps ? (
                    <ol className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-slate-100">
                        <li className="flex gap-2">
                            <span className="text-lime-200">1.</span>
                            Tap the Safari Share button.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-lime-200">2.</span>
                            Select Add to Home Screen.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-lime-200">3.</span>
                            Confirm Add.
                        </li>
                    </ol>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleInstall}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
                    >
                        {installEvent ? (
                            <Download className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Share className="h-4 w-4" aria-hidden="true" />
                        )}
                        {installEvent ? "Install VAIVIA" : "Show me how"}
                    </button>
                    <button
                        type="button"
                        onClick={dismissPrompt}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-slate-100 transition hover:bg-white/[0.12]"
                    >
                        Not now
                    </button>
                </div>
            </div>
        </aside>
    );
}
