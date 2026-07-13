"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MoreHorizontal, Search, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import Portal from "@/components/Portal";
import {
    COUNTDOWN_UNITS,
    type CountdownUnit,
    getStoredCountdownUnit,
    setCountdownUnit,
} from "@/components/CountdownPreferenceProvider";
import {
    MS_PER_MINUTE,
    MS_PER_SECOND,
    getCountdownDisplay,
} from "@/lib/countdownDisplay";

export type TripCountdownTargetOption = {
    id: string;
    saveId: string;
    saveType: "itinerary_item" | "transportation_item";
    title: string;
    itemType: "transportation" | "activity";
    itemDate: string;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
    categoryLabel?: string | null;
    disabledReason?: string | null;
};

type TripCountdownProps = {
    startDate?: string | null;
    selectedTargetId?: string | null;
    selectedTargetType?: "itinerary_item" | "transportation_item" | null;
    targets?: TripCountdownTargetOption[];
    updateCountdownTargetAction?: (formData: FormData) => Promise<void>;
    tripId?: string;
};

function parseLocalDateTime(dateString?: string | null, timeString?: string | null) {
    if (!dateString) return null;
    return new Date(`${dateString}T${timeString || "00:00"}`);
}

function parseTripStart(dateString?: string | null) {
    return parseLocalDateTime(dateString, "00:00");
}

function formatTargetDate(option: TripCountdownTargetOption) {
    const date = parseLocalDateTime(option.itemDate, option.startTime);
    if (!date) return "Date not set";

    const dateLabel = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    const timeLabel = option.startTime
        ? date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
          })
        : "No time";

    return `${dateLabel} · ${timeLabel}`;
}

function getTargetDate(option: TripCountdownTargetOption | null | undefined) {
    if (!option) return null;
    return parseLocalDateTime(option.itemDate, option.startTime || "00:00");
}

function getDefaultTarget(
    targets: TripCountdownTargetOption[],
    startDate?: string | null
) {
    const tripStart = parseTripStart(startDate);
    const selectableTargets = targets;

    if (selectableTargets.length === 0) return null;
    if (!tripStart) return selectableTargets[0] || null;

    return (
        selectableTargets.find((target) => {
            const targetDate = getTargetDate(target);
            return targetDate ? targetDate.getTime() >= tripStart.getTime() : false;
        }) ||
        selectableTargets[0] ||
        null
    );
}

function getTargetKey(type?: string | null, id?: string | null) {
    if (!type || !id) return "";
    return `${type}:${id}`;
}

function getOptionKey(option: TripCountdownTargetOption) {
    return getTargetKey(option.saveType, option.saveId);
}

function parseTargetKey(value: string) {
    const [type, ...idParts] = value.split(":");
    const id = idParts.join(":");

    if (
        (type === "itinerary_item" || type === "transportation_item") &&
        id
    ) {
        return { type, id };
    }

    return { type: "", id: "" };
}

export default function TripCountdown({
    startDate,
    selectedTargetId,
    selectedTargetType,
    targets = [],
    updateCountdownTargetAction,
    tripId,
}: TripCountdownProps) {
    const [unit, setUnit] = useState<CountdownUnit>("days");
    const [now, setNow] = useState(() => new Date());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [pendingUnit, setPendingUnit] = useState<CountdownUnit>("days");
    const [pendingTargetId, setPendingTargetId] = useState("");
    const [isPending, startTransition] = useTransition();

    const sortedTargets = useMemo(
        () =>
            [...targets].sort((a, b) => {
                const dateSort = `${a.itemDate}T${a.startTime || "99:99"}`.localeCompare(
                    `${b.itemDate}T${b.startTime || "99:99"}`
                );
                if (dateSort !== 0) return dateSort;
                return a.title.localeCompare(b.title);
            }),
        [targets]
    );
    const defaultTarget = useMemo(
        () => getDefaultTarget(sortedTargets, startDate),
        [sortedTargets, startDate]
    );
    const selectedTarget = useMemo(() => {
        const selectedKey = getTargetKey(selectedTargetType, selectedTargetId);
        if (selectedKey) {
            const savedTarget = sortedTargets.find(
                (target) => getOptionKey(target) === selectedKey
            );
            if (savedTarget) return savedTarget;
        }

        return defaultTarget;
    }, [defaultTarget, selectedTargetId, selectedTargetType, sortedTargets]);
    const targetDate = useMemo(() => {
        if (selectedTarget) return getTargetDate(selectedTarget);
        return parseTripStart(startDate);
    }, [selectedTarget, startDate]);
    const filteredTargets = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return sortedTargets;

        return sortedTargets.filter((target) =>
            [
                target.title,
                target.location,
                target.categoryLabel,
                formatTargetDate(target),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
    }, [searchQuery, sortedTargets]);
    const groupedTargets = {
        transportation: filteredTargets.filter(
            (target) => target.itemType === "transportation"
        ),
        activity: filteredTargets.filter((target) => target.itemType === "activity"),
    };

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
                : unit === "mixed"
                ? MS_PER_SECOND
                : unit === "minutes" || unit === "hours"
                  ? MS_PER_MINUTE
                  : 0;

        if (!intervalMs) return;

        const intervalId = window.setInterval(() => {
            setNow(new Date());
        }, intervalMs);

        return () => window.clearInterval(intervalId);
    }, [unit, targetDate]);

    const countdown = useMemo(
        () => getCountdownDisplay(targetDate, unit, now),
        [now, targetDate, unit]
    );
    const countdownLines = countdown.lines?.length ? countdown.lines : null;
    const countdownCharacterCount = Math.max(
        ...(countdownLines || [countdown.value]).map((line) => line.length),
        1
    );
    const countdownFontSize =
        unit === "mixed"
            ? `clamp(1.45rem, min(18cqw, calc(100cqw / ${countdownCharacterCount * 0.58})), 2.8rem)`
            : `clamp(2.5rem, min(28cqw, calc(100cqw / ${countdownCharacterCount * 0.86})), 6rem)`;

    function openSettings() {
        setPendingUnit(unit);
        setPendingTargetId(getTargetKey(selectedTargetType, selectedTargetId));
        setSearchQuery("");
        setIsModalOpen(true);
    }

    function saveSettings(formData: FormData) {
        setCountdownUnit(pendingUnit);

        if (!updateCountdownTargetAction || !tripId) {
            setIsModalOpen(false);
            return;
        }

        formData.set("trip_id", tripId);
        const parsedTarget = parseTargetKey(pendingTargetId);
        formData.set("countdown_target_type", parsedTarget.type);
        formData.set("countdown_target_id", parsedTarget.id);
        formData.set(
            "countdown_target_itinerary_item_id",
            parsedTarget.type === "itinerary_item" ? parsedTarget.id : ""
        );

        startTransition(async () => {
            await updateCountdownTargetAction(formData);
            setIsModalOpen(false);
        });
    }

    function renderTargetGroup(
        label: string,
        groupTargets: TripCountdownTargetOption[]
    ) {
        return (
            <section className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {label}
                </p>
                {groupTargets.length > 0 ? (
                    <div className="space-y-2">
                        {groupTargets.map((target) => {
                            const targetKey = getOptionKey(target);
                            const isSelected = pendingTargetId === targetKey;

                            return (
                                <button
                                    key={target.id}
                                    type="button"
                                    onClick={() => setPendingTargetId(targetKey)}
                                    className={`w-full rounded-2xl border p-3 text-left transition ${
                                        isSelected
                                            ? "border-lime-300 bg-lime-300/15 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.14)]"
                                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                                    } cursor-pointer`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-slate-950">
                                                {target.title}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                {formatTargetDate(target)}
                                                {target.location
                                                    ? ` · ${target.location}`
                                                    : ""}
                                            </p>
                                            {target.disabledReason ? (
                                                <p className="mt-1 text-xs font-semibold text-amber-700">
                                                    {target.disabledReason}
                                                </p>
                                            ) : null}
                                        </div>
                                        {isSelected ? (
                                            <span className="rounded-full bg-lime-300 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950">
                                                Selected
                                            </span>
                                        ) : null}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                        No matching {label.toLowerCase()}.
                    </p>
                )}
            </section>
        );
    }

    return (
        <div className="vaivia-trip-countdown group/countdown relative">
            <button
                type="button"
                onClick={openSettings}
                className="absolute right-0 top-0 rounded-full border border-slate-950/10 bg-slate-950/5 p-2 text-slate-950/70 opacity-0 transition hover:bg-slate-950/10 hover:text-slate-950 group-hover/countdown:opacity-100 focus:opacity-100"
                aria-label="Countdown options"
                title="Countdown options"
            >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-950/70">
                Countdown
            </p>
            <div className="mt-1 flex min-w-0 flex-col gap-1.5">
                <span className="block w-full min-w-0 max-w-full pr-4 [container-type:inline-size]">
                    {countdownLines ? (
                        <span className="block space-y-0.5">
                            {countdownLines.map((line, index) => {
                                const displayLine =
                                    countdownLines.length > 1 &&
                                    index === countdownLines.length - 2
                                        ? `${line} &`
                                        : line;

                                return (
                                    <span
                                        key={`${line}-${index}`}
                                        className="block max-w-full whitespace-nowrap font-black leading-[0.92] tracking-[-0.045em]"
                                        style={{ fontSize: countdownFontSize }}
                                    >
                                        {displayLine}
                                    </span>
                                );
                            })}
                        </span>
                    ) : (
                        <span
                            className="block max-w-full whitespace-nowrap font-black leading-none tracking-[-0.06em]"
                            style={{ fontSize: countdownFontSize }}
                        >
                            {countdown.value}
                        </span>
                    )}
                </span>
                <span className="text-base font-black uppercase leading-tight tracking-[0.12em]">
                    {countdown.label}
                </span>
            </div>

            {isModalOpen ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => setIsModalOpen(false)}
                        panelClassName="max-w-2xl"
                        labelledBy="countdown-settings-title"
                    >
                        {({ requestClose }) => (
                            <>
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div>
                                    <p className="vaivia-modal-eyebrow">
                                        Countdown
                                    </p>
                                    <h2
                                        id="countdown-settings-title"
                                        className="vaivia-modal-title"
                                    >
                                        Countdown options
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="vaivia-modal-close"
                                    aria-label="Close countdown options"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>

                            <form action={saveSettings} className="vaivia-modal-body space-y-6 pb-0">
                                <input type="hidden" name="trip_id" value={tripId || ""} />
                                <input
                                    type="hidden"
                                    name="countdown_target_itinerary_item_id"
                                    value={
                                        parseTargetKey(pendingTargetId).type ===
                                        "itinerary_item"
                                            ? parseTargetKey(pendingTargetId).id
                                            : ""
                                    }
                                />
                                <input
                                    type="hidden"
                                    name="countdown_target_type"
                                    value={parseTargetKey(pendingTargetId).type}
                                />
                                <input
                                    type="hidden"
                                    name="countdown_target_id"
                                    value={parseTargetKey(pendingTargetId).id}
                                />

                                <section>
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                                        Display as
                                    </h3>
                                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                        {COUNTDOWN_UNITS.map((unitOption) => {
                                            const isSelected =
                                                pendingUnit === unitOption.value;

                                            return (
                                                <button
                                                    key={unitOption.value}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() =>
                                                        setPendingUnit(unitOption.value)
                                                    }
                                                    className={`rounded-full px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
                                                        isSelected
                                                            ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)]"
                                                            : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {unitOption.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                                                Count down to
                                            </h3>
                                            <p className="mt-1 text-sm font-semibold text-slate-600">
                                                Choose a specific itinerary item, or use
                                                the default first event of the trip.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setPendingTargetId("")}
                                            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                                        >
                                            Use default
                                        </button>
                                    </div>

                                    <label className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2">
                                        <Search
                                            className="h-4 w-4 text-slate-400"
                                            aria-hidden="true"
                                        />
                                        <input
                                            value={searchQuery}
                                            onChange={(event) =>
                                                setSearchQuery(event.target.value)
                                            }
                                            placeholder="Search itinerary items"
                                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                                            autoComplete="off"
                                            data-form-type="other"
                                            data-lpignore="true"
                                            data-1p-ignore="true"
                                        />
                                    </label>

                                    <div className="mt-4 max-h-[22rem] space-y-5 overflow-y-auto pb-4 pr-1">
                                        {renderTargetGroup(
                                            "Transportation",
                                            groupedTargets.transportation
                                        )}
                                        {renderTargetGroup(
                                            "Activity",
                                            groupedTargets.activity
                                        )}
                                    </div>
                                </section>

                                <div className="vaivia-modal-footer sticky bottom-0 z-10 -mx-6 vaivia-modal-actions">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="vaivia-modal-button-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isPending}
                                        className="vaivia-modal-button-primary"
                                    >
                                        {isPending ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </form>
                            </>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
        </div>
    );
}
