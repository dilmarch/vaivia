"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Download, ExternalLink, Share, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
const INSTALLED_KEY = "vaivia:pwa-installed:v1";
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

function hasKnownInstall() {
    return window.localStorage.getItem(INSTALLED_KEY) === "true";
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
    const [showOpenAppPill, setShowOpenAppPill] = useState(false);
    const [showIosSteps, setShowIosSteps] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const supportsIosInstructions = useMemo(isIosSafari, []);
    const isAuthRoute = pathname?.startsWith("/auth");
    const initialPathnameRef = useRef(pathname);

    useEffect(() => {
        function handleBeforeInstallPrompt(event: Event) {
            event.preventDefault();
            setInstallEvent(event as BeforeInstallPromptEvent);
        }

        function handleInstalled() {
            window.localStorage.setItem(INSTALLED_KEY, "true");
            setIsVisible(false);
            setShowOpenAppPill(false);
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
            window.localStorage.setItem(INSTALLED_KEY, "true");
            trackPwaEvent("standalone_launch");
        }
    }, [isStandalone]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isStandalone || isAuthRoute || isDismissed) return;
        if (hasKnownInstall()) return;
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

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isStandalone || isAuthRoute) return;
        if (pathname !== initialPathnameRef.current) {
            setShowOpenAppPill(false);
            return;
        }
        if (!hasKnownInstall()) return;

        const timer = window.setTimeout(() => {
            setShowOpenAppPill(true);
        }, 900);

        return () => window.clearTimeout(timer);
    }, [isAuthRoute, isStandalone, pathname]);

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
        if (choice.outcome === "accepted") {
            window.localStorage.setItem(INSTALLED_KEY, "true");
        }
        setInstallEvent(null);
        setIsVisible(false);
    }

    if (showOpenAppPill && !isStandalone && !isAuthRoute) {
        return (
            <div className="fixed bottom-[calc(6.35rem+var(--safe-area-bottom))] left-1/2 z-[70] -translate-x-1/2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
                <Link
                    href="/"
                    onClick={() => setShowOpenAppPill(false)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-slate-950/85 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-lime-100 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-lime-300/35 hover:bg-slate-900"
                >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Go to app
                </Link>
            </div>
        );
    }

    if (!isVisible || isStandalone || isAuthRoute) return null;

    return (
        <aside className="fixed bottom-[calc(6.75rem+var(--safe-area-bottom))] left-5 right-5 z-[70] mx-auto max-w-[20rem] overflow-hidden rounded-[1.35rem] border border-lime-300/25 bg-[#090713]/95 text-white shadow-[0_20px_58px_rgba(0,0,0,0.52),0_0_28px_rgba(var(--vaivia-neon-rgb),0.14)] backdrop-blur-2xl md:bottom-6 md:left-auto md:right-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(var(--vaivia-neon-rgb),0.16),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(255,54,190,0.14),transparent_34%)]" />
            <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200">
                            Install VAIVIA
                        </p>
                        <h2 className="mt-1.5 text-lg font-black tracking-tight">
                            Add to Home Screen
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={dismissPrompt}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                        aria-label="Dismiss install prompt"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">
                    Get quicker access and an app-style experience.
                </p>

                {showIosSteps ? (
                    <ol className="mt-3 space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-xs font-bold text-slate-100">
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

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleInstall}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
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
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.12]"
                    >
                        Not now
                    </button>
                </div>
            </div>
        </aside>
    );
}
