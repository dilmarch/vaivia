"use client";

import { useEffect } from "react";

export const PINK_MODE_STORAGE_KEY = "vaivia:pink-mode";
export const VAIVIA_THEME_STORAGE_KEY = "vaivia:theme-mode";
export type VaiviaThemeMode =
    | "dark"
    | "pink"
    | "greyscale"
    | "brat"
    | "pride"
    | "light";

const THEME_MODES = new Set<VaiviaThemeMode>([
    "dark",
    "pink",
    "greyscale",
    "brat",
    "pride",
    "light",
]);

export function isVaiviaThemeMode(value: unknown): value is VaiviaThemeMode {
    return typeof value === "string" && THEME_MODES.has(value as VaiviaThemeMode);
}

export function setPinkModeEnabled(enabled: boolean) {
    setVaiviaThemeMode(enabled ? "pink" : "dark");
}

export function getStoredPinkMode() {
    return getStoredVaiviaThemeMode() === "pink";
}

export function setVaiviaThemeMode(mode: VaiviaThemeMode) {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.vaiviaTheme = mode;
    document.documentElement.dataset.pinkMode = mode === "pink" ? "true" : "false";
    window.localStorage.setItem(VAIVIA_THEME_STORAGE_KEY, mode);
    window.localStorage.setItem(PINK_MODE_STORAGE_KEY, mode === "pink" ? "true" : "false");
    window.dispatchEvent(
        new CustomEvent("vaivia:theme-mode-change", { detail: { mode } })
    );
    window.dispatchEvent(
        new CustomEvent("vaivia:pink-mode-change", {
            detail: { enabled: mode === "pink" },
        })
    );
}

export function getStoredVaiviaThemeMode(): VaiviaThemeMode {
    if (typeof window === "undefined") return "dark";

    const storedMode = window.localStorage.getItem(VAIVIA_THEME_STORAGE_KEY);
    if (isVaiviaThemeMode(storedMode)) return storedMode;

    return window.localStorage.getItem(PINK_MODE_STORAGE_KEY) === "true"
        ? "pink"
        : "dark";
}

export default function PinkModeProvider() {
    useEffect(() => {
        const mode = getStoredVaiviaThemeMode();
        document.documentElement.dataset.vaiviaTheme = mode;
        document.documentElement.dataset.pinkMode = mode === "pink" ? "true" : "false";
    }, []);

    return null;
}
