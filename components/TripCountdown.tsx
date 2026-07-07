"use client";

import { useEffect, useMemo, useState } from "react";
import {
    type CountdownUnit,
    getStoredCountdownUnit,
} from "@/components/CountdownPreferenceProvider";

type CountdownDisplay = {
    value: string;
    label: string;
    detail: string;
};

type TripCountdownProps = {
    startDate?: string | null;
};

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function parseTripStart(dateString?: string | null) {
    if (!dateString) return null;
    return new Date(`${dateString}T00:00:00`);
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function getUnitLabel(unit: CountdownUnit, value: number, isPast: boolean) {
    if (unit === "weeks") return Math.abs(value) === 1 ? "week" : "weeks";
    if (unit === "hours") return Math.abs(value) === 1 ? "hour" : "hours";
    if (unit === "minutes") return Math.abs(value) === 1 ? "minute" : "minutes";
    if (unit === "seconds") return Math.abs(value) === 1 ? "second" : "seconds";

    if (isPast) return Math.abs(value) === 1 ? "day since departure" : "days since departure";
    return Math.abs(value) === 1 ? "day until departure" : "days until departure";
}

function getDivisor(unit: CountdownUnit) {
    if (unit === "weeks") return MS_PER_WEEK;
    if (unit === "hours") return MS_PER_HOUR;
    if (unit === "minutes") return MS_PER_MINUTE;
    if (unit === "seconds") return MS_PER_SECOND;
    return MS_PER_DAY;
}

function getCountdownDisplay(
    startDate: string | null | undefined,
    unit: CountdownUnit,
    now: Date
): CountdownDisplay {
    const departureDate = parseTripStart(startDate);
    if (!departureDate) {
        return {
            value: "TBD",
            label: "Departure date not set",
            detail: "Add your dates to start the countdown.",
        };
    }

    const differenceMs = departureDate.getTime() - now.getTime();
    const isPast = differenceMs < 0;

    if (Math.abs(differenceMs) < MS_PER_SECOND) {
        return {
            value: "0",
            label: "Departing today",
            detail: "Today is the day.",
        };
    }

    const divisor = getDivisor(unit);
    const rawValue = differenceMs / divisor;
    const value = isPast ? Math.floor(rawValue) : Math.ceil(rawValue);
    const absoluteValue = Math.abs(value);
    const unitLabel = getUnitLabel(unit, absoluteValue, isPast);

    return {
        value: formatNumber(absoluteValue),
        label:
            unit === "days"
                ? unitLabel
                : `${unitLabel} ${isPast ? "since departure" : "until departure"}`,
        detail: isPast
            ? "This trip is already underway."
            : "Your next adventure is getting close.",
    };
}

export default function TripCountdown({ startDate }: TripCountdownProps) {
    const [unit, setUnit] = useState<CountdownUnit>("days");
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        setUnit(getStoredCountdownUnit());

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
    }, []);

    useEffect(() => {
        setNow(new Date());

        const intervalMs =
            unit === "seconds"
                ? MS_PER_SECOND
                : unit === "minutes" || unit === "hours"
                  ? MS_PER_MINUTE
                  : 0;

        if (!intervalMs) return;

        const intervalId = window.setInterval(() => {
            setNow(new Date());
        }, intervalMs);

        return () => window.clearInterval(intervalId);
    }, [unit, startDate]);

    const countdown = useMemo(
        () => getCountdownDisplay(startDate, unit, now),
        [now, startDate, unit]
    );
    const countdownCharacterCount = Math.max(countdown.value.length, 1);
    const countdownFontSize = `clamp(2.75rem, min(30cqw, calc(100cqw / ${countdownCharacterCount * 0.5})), 6rem)`;

    return (
        <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-950/70">
                Countdown
            </p>
            <div className="mt-1 flex min-w-0 flex-col gap-1.5">
                <span className="block min-w-0 [container-type:inline-size]">
                    <span
                        className="block max-w-full whitespace-nowrap font-black leading-none tracking-tight"
                        style={{ fontSize: countdownFontSize }}
                    >
                        {countdown.value}
                    </span>
                </span>
                <span className="text-base font-black uppercase leading-tight tracking-[0.12em]">
                    {countdown.label}
                </span>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-950/70">
                {countdown.detail}
            </p>
        </div>
    );
}
