"use client";

import { useEffect } from "react";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";

export default function ServiceWorkerRegistration() {
    useStandaloneMode();

    useEffect(() => {
        if (
            process.env.NODE_ENV !== "production" ||
            !("serviceWorker" in navigator)
        ) {
            return;
        }

        let shouldRegister = true;

        async function registerServiceWorker() {
            if (!shouldRegister) return;

            try {
                await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                });
            } catch {
                // Intentionally quiet in production; the app remains network-first.
            }
        }

        window.addEventListener("load", registerServiceWorker, { once: true });

        return () => {
            shouldRegister = false;
            window.removeEventListener("load", registerServiceWorker);
        };
    }, []);

    return null;
}
