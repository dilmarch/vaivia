export type CountdownUnit =
    | "days"
    | "weeks"
    | "hours"
    | "minutes"
    | "seconds"
    | "mixed";

export type CountdownDisplay = {
    value: string;
    label: string;
    lines?: string[];
};

export const COUNTDOWN_UNITS: Array<{ value: CountdownUnit; label: string }> = [
    { value: "days", label: "Days" },
    { value: "weeks", label: "Weeks" },
    { value: "hours", label: "Hours" },
    { value: "minutes", label: "Minutes" },
    { value: "seconds", label: "Seconds" },
    { value: "mixed", label: "Mixed" },
];

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

export function isCountdownUnit(value: string | null): value is CountdownUnit {
    return (
        value === "days" ||
        value === "weeks" ||
        value === "hours" ||
        value === "minutes" ||
        value === "seconds" ||
        value === "mixed"
    );
}

export function formatCountdownNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function getUnitLabel(unit: Exclude<CountdownUnit, "mixed">, value: number) {
    if (unit === "weeks") return Math.abs(value) === 1 ? "week" : "weeks";
    if (unit === "hours") return Math.abs(value) === 1 ? "hour" : "hours";
    if (unit === "minutes") return Math.abs(value) === 1 ? "minute" : "minutes";
    if (unit === "seconds") return Math.abs(value) === 1 ? "second" : "seconds";

    return Math.abs(value) === 1 ? "day" : "days";
}

function getDivisor(unit: Exclude<CountdownUnit, "mixed">) {
    if (unit === "weeks") return MS_PER_WEEK;
    if (unit === "hours") return MS_PER_HOUR;
    if (unit === "minutes") return MS_PER_MINUTE;
    if (unit === "seconds") return MS_PER_SECOND;
    return MS_PER_DAY;
}

function getMixedCountdownParts(differenceMs: number) {
    let remainingMs = Math.abs(differenceMs);
    const weeks = Math.floor(remainingMs / MS_PER_WEEK);
    remainingMs -= weeks * MS_PER_WEEK;
    const days = Math.floor(remainingMs / MS_PER_DAY);
    remainingMs -= days * MS_PER_DAY;
    const hours = Math.floor(remainingMs / MS_PER_HOUR);
    remainingMs -= hours * MS_PER_HOUR;
    const minutes = Math.floor(remainingMs / MS_PER_MINUTE);
    remainingMs -= minutes * MS_PER_MINUTE;
    const seconds = Math.floor(remainingMs / MS_PER_SECOND);

    return [
        { value: weeks, unit: weeks === 1 ? "week" : "weeks" },
        { value: days, unit: days === 1 ? "day" : "days" },
        { value: hours, unit: hours === 1 ? "hour" : "hours" },
        { value: minutes, unit: minutes === 1 ? "minute" : "minutes" },
        { value: seconds, unit: seconds === 1 ? "second" : "seconds" },
    ].filter((part, index, parts) => part.value > 0 || index === parts.length - 1);
}

export function getCountdownDisplay(
    targetDate: Date | null,
    unit: CountdownUnit,
    now: Date
): CountdownDisplay {
    if (!targetDate) {
        return {
            value: "TBD",
            label: "Countdown target",
        };
    }

    const differenceMs = targetDate.getTime() - now.getTime();
    const isPast = differenceMs < 0;

    if (Math.abs(differenceMs) < MS_PER_SECOND) {
        return {
            value: "0",
            label: "It begins now",
        };
    }

    if (unit === "mixed") {
        const lines = getMixedCountdownParts(differenceMs).map(
            (part) => `${formatCountdownNumber(part.value)} ${part.unit}`
        );

        return {
            value: lines.join(", "),
            lines,
            label: isPast ? "since it began" : "until it begins",
        };
    }

    const divisor = getDivisor(unit);
    const rawValue = differenceMs / divisor;
    const value = isPast ? Math.floor(rawValue) : Math.ceil(rawValue);
    const absoluteValue = Math.abs(value);
    const unitLabel = getUnitLabel(unit, absoluteValue);

    return {
        value: formatCountdownNumber(absoluteValue),
        label: `${unitLabel} ${isPast ? "since it began" : "until it begins"}`,
    };
}
