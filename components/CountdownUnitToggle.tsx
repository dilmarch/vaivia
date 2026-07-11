"use client";

import { useEffect, useState } from "react";
import {
    COUNTDOWN_UNITS,
    type CountdownUnit,
    getStoredCountdownUnit,
    setCountdownUnit,
} from "@/components/CountdownPreferenceProvider";

type CountdownUnitToggleProps = {
    initialUnit?: CountdownUnit;
    updateAction?: (formData: FormData) => Promise<void>;
};

export default function CountdownUnitToggle({
    initialUnit = "days",
    updateAction,
}: CountdownUnitToggleProps) {
    const [selectedUnit, setSelectedUnit] = useState<CountdownUnit>("days");

    useEffect(() => {
        const storedUnit = getStoredCountdownUnit(initialUnit);
        const nextUnit = storedUnit || initialUnit;
        setSelectedUnit(nextUnit);
        setCountdownUnit(nextUnit);

        function handleCountdownUnitChange(event: Event) {
            const detail = (event as CustomEvent<{ unit?: CountdownUnit }>).detail;
            if (detail?.unit) setSelectedUnit(detail.unit);
        }

        window.addEventListener(
            "vaivia:countdown-unit-change",
            handleCountdownUnitChange
        );
        return () =>
            window.removeEventListener(
                "vaivia:countdown-unit-change",
                handleCountdownUnitChange
            );
    }, [initialUnit]);

    function updateUnit(unit: CountdownUnit) {
        setSelectedUnit(unit);
        setCountdownUnit(unit);

        if (!updateAction) return;

        const formData = new FormData();
        formData.set("countdown_display_mode", unit);
        void updateAction(formData);
    }

    return (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-black text-white">
                        Countdown display
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Choose how VAIVIA displays trip countdowns across the site.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    {COUNTDOWN_UNITS.map((unit) => {
                        const isSelected = selectedUnit === unit.value;

                        return (
                            <button
                                key={unit.value}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => updateUnit(unit.value)}
                                className={`rounded-full px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
                                    isSelected
                                        ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)]"
                                        : "border border-white/10 bg-white/[0.08] text-slate-200 hover:border-lime-300/40 hover:bg-white/[0.14] hover:text-white"
                                }`}
                            >
                                {unit.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
