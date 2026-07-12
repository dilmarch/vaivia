"use client";

import { useEffect, useMemo, useState } from "react";
import {
    type CountdownUnit,
    getStoredCountdownUnit,
} from "@/components/CountdownPreferenceProvider";
import {
    MS_PER_MINUTE,
    MS_PER_SECOND,
    getCountdownDisplay,
} from "@/lib/countdownDisplay";

type DashboardCountdownWidgetProps = {
    target?: {
        tripTitle: string;
        targetTitle: string;
        targetDateIso: string;
    } | null;
    initialUnit?: CountdownUnit;
};

export default function DashboardCountdownWidget({
    target,
    initialUnit = "days",
}: DashboardCountdownWidgetProps) {
    const [unit, setUnit] = useState<CountdownUnit>(initialUnit);
    const [now, setNow] = useState(() => new Date());
    const targetDate = useMemo(
        () => (target?.targetDateIso ? new Date(target.targetDateIso) : null),
        [target?.targetDateIso]
    );
    const countdown = useMemo(
        () => getCountdownDisplay(targetDate, unit, now),
        [now, targetDate, unit]
    );

    useEffect(() => {
        setUnit(getStoredCountdownUnit(initialUnit));

        function handleCountdownUnitChange(event: Event) {
            const detail = (event as CustomEvent<{ unit?: CountdownUnit }>).detail;
            if (detail?.unit) setUnit(detail.unit);
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

    useEffect(() => {
        setNow(new Date());
        const intervalMs =
            unit === "seconds" || unit === "mixed"
                ? MS_PER_SECOND
                : MS_PER_MINUTE;
        const intervalId = window.setInterval(() => setNow(new Date()), intervalMs);
        return () => window.clearInterval(intervalId);
    }, [unit]);

    if (!target) return null;

    return (
        <aside className="vaivia-dashboard-countdown-widget rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4 text-white shadow-2xl shadow-black/35 backdrop-blur-xl md:min-w-72">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200">
                Next countdown
            </p>
            <p className="mt-2 truncate text-sm font-black text-white">
                {target.tripTitle}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                {target.targetTitle}
            </p>
            <div className="mt-3">
                {countdown.lines?.length ? (
                    <div className="space-y-0.5 text-lime-300">
                        {countdown.lines.map((line, index) => {
                            const displayLine =
                                countdown.lines &&
                                countdown.lines.length > 1 &&
                                index === countdown.lines.length - 2
                                    ? `${line} &`
                                    : line;

                            return (
                                <p
                                    key={`${line}-${index}`}
                                    className="text-2xl font-black leading-none tracking-tight"
                                >
                                    {displayLine}
                                </p>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-5xl font-black leading-none tracking-tight text-lime-300">
                        {countdown.value}
                    </p>
                )}
                <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                    {countdown.label}
                </p>
            </div>
        </aside>
    );
}
