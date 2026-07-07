"use client";

import { useEffect } from "react";

export type CountdownUnit = "days" | "weeks" | "hours" | "minutes" | "seconds";

export const COUNTDOWN_UNIT_STORAGE_KEY = "vaivia:countdown-unit";

export const COUNTDOWN_UNITS: Array<{ value: CountdownUnit; label: string }> = [
    { value: "days", label: "Days" },
    { value: "weeks", label: "Weeks" },
    { value: "hours", label: "Hours" },
    { value: "minutes", label: "Minutes" },
    { value: "seconds", label: "Seconds" },
];

export function isCountdownUnit(value: string | null): value is CountdownUnit {
    return (
        value === "days" ||
        value === "weeks" ||
        value === "hours" ||
        value === "minutes" ||
        value === "seconds"
    );
}

export function getStoredCountdownUnit(): CountdownUnit {
    if (typeof window === "undefined") return "days";

    const storedValue = window.localStorage.getItem(COUNTDOWN_UNIT_STORAGE_KEY);
    return isCountdownUnit(storedValue) ? storedValue : "days";
}

export function setCountdownUnit(unit: CountdownUnit) {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(COUNTDOWN_UNIT_STORAGE_KEY, unit);
    window.dispatchEvent(
        new CustomEvent("vaivia:countdown-unit-change", { detail: { unit } })
    );
}

export default function CountdownPreferenceProvider() {
    useEffect(() => {
        const unit = getStoredCountdownUnit();
        window.dispatchEvent(
            new CustomEvent("vaivia:countdown-unit-change", { detail: { unit } })
        );
    }, []);

    return null;
}
