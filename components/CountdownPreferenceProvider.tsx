"use client";

import { useEffect } from "react";
import {
    COUNTDOWN_UNITS,
    isCountdownUnit,
    type CountdownUnit,
} from "@/lib/countdownDisplay";

export { COUNTDOWN_UNITS, isCountdownUnit, type CountdownUnit };

export const COUNTDOWN_UNIT_STORAGE_KEY = "vaivia:countdown-unit";

export function getStoredCountdownUnit(fallback: CountdownUnit = "days"): CountdownUnit {
    if (typeof window === "undefined") return fallback;

    const storedValue = window.localStorage.getItem(COUNTDOWN_UNIT_STORAGE_KEY);
    return isCountdownUnit(storedValue) ? storedValue : fallback;
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
