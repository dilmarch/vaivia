"use client";

import { useEffect } from "react";

export const PINK_MODE_STORAGE_KEY = "vaivia:pink-mode";

export function setPinkModeEnabled(enabled: boolean) {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.pinkMode = enabled ? "true" : "false";
    window.localStorage.setItem(PINK_MODE_STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(
        new CustomEvent("vaivia:pink-mode-change", { detail: { enabled } })
    );
}

export function getStoredPinkMode() {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PINK_MODE_STORAGE_KEY) === "true";
}

export default function PinkModeProvider() {
    useEffect(() => {
        const enabled = getStoredPinkMode();
        document.documentElement.dataset.pinkMode = enabled ? "true" : "false";
    }, []);

    return null;
}
