"use client";

import { useEffect } from "react";

export const PINK_MODE_STORAGE_KEY = "vaivia:pink-mode";
export const VAIVIA_THEME_STORAGE_KEY = "vaivia:theme-mode";
export const VAIVIA_THEME_USER_STORAGE_PREFIX = "vaivia:theme-mode:";
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

type SetVaiviaThemeModeOptions = {
    source?: "sync" | "user";
    userId?: string | null;
};

function getThemeStorageKey(userId?: string | null) {
    return userId ? `${VAIVIA_THEME_USER_STORAGE_PREFIX}${userId}` : null;
}

export function clearGlobalVaiviaThemeStorage() {
    if (typeof window === "undefined") return;

    window.localStorage.removeItem(VAIVIA_THEME_STORAGE_KEY);
    window.localStorage.removeItem(PINK_MODE_STORAGE_KEY);
}

export function setVaiviaThemeMode(
    mode: VaiviaThemeMode,
    options: SetVaiviaThemeModeOptions = {}
) {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.vaiviaTheme = mode;
    document.documentElement.dataset.pinkMode = mode === "pink" ? "true" : "false";
    const userStorageKey = getThemeStorageKey(options.userId);
    if (userStorageKey) window.localStorage.setItem(userStorageKey, mode);
    if (!options.userId) {
        window.localStorage.setItem(VAIVIA_THEME_STORAGE_KEY, mode);
        window.localStorage.setItem(PINK_MODE_STORAGE_KEY, mode === "pink" ? "true" : "false");
    }
    window.dispatchEvent(
        new CustomEvent("vaivia:theme-mode-change", {
            detail: { mode, source: options.source || "user" },
        })
    );
    window.dispatchEvent(
        new CustomEvent("vaivia:pink-mode-change", {
            detail: { enabled: mode === "pink" },
        })
    );
}

export function syncVaiviaThemeMode(
    mode?: VaiviaThemeMode | null,
    userId?: string | null
) {
    if (!isVaiviaThemeMode(mode)) return;
    setVaiviaThemeMode(mode, { source: "sync", userId });
}

export function getStoredVaiviaThemeMode(userId?: string | null): VaiviaThemeMode {
    if (typeof window === "undefined") return "dark";

    const userStorageKey = getThemeStorageKey(userId);
    const storedUserMode = userStorageKey
        ? window.localStorage.getItem(userStorageKey)
        : null;
    if (isVaiviaThemeMode(storedUserMode)) return storedUserMode;

    const storedMode = window.localStorage.getItem(VAIVIA_THEME_STORAGE_KEY);
    if (isVaiviaThemeMode(storedMode)) return storedMode;

    return window.localStorage.getItem(PINK_MODE_STORAGE_KEY) === "true"
        ? "pink"
        : "dark";
}

export default function PinkModeProvider() {
    useEffect(() => {
        setVaiviaThemeMode(getStoredVaiviaThemeMode(), { source: "sync" });
    }, []);

    return null;
}
