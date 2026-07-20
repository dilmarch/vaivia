"use client";

import { useMemo, useState } from "react";
import type { SplitMethod } from "@/lib/budget";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

type CostAllocationFieldsProps = {
    amount: string;
    participants: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    initialSplitMethod?: SplitMethod;
    initialSelectedParticipantValues?: string[];
    initialPayerValue?: string | null;
    tone?: "dark" | "light";
};

function parsePositiveAmount(value: string) {
    const parsed = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function participantValue(participant: TripAudienceOption) {
    return `${participant.kind}:${participant.id}`;
}

function isCurrentUserParticipant(
    participant: TripAudienceOption,
    currentUserTripMemberId?: string | null
) {
    return (
        participant.isCurrentUser ||
        (participant.kind === "member" &&
            Boolean(currentUserTripMemberId) &&
            participant.id === currentUserTripMemberId)
    );
}

function getParticipantLabel(
    participant: TripAudienceOption,
    currentUserTripMemberId?: string | null
) {
    return isCurrentUserParticipant(participant, currentUserTripMemberId)
        ? "Me"
        : participant.displayName;
}

function splitInputName(
    prefix: "split_amount" | "split_percentage",
    participant: TripAudienceOption
) {
    return `${prefix}_${participant.kind}_${participant.id}`;
}

function ParticipantAvatar({
    participant,
    label,
}: {
    participant: TripAudienceOption;
    label: string;
}) {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200">
            {participant.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={participant.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(label)
            )}
        </span>
    );
}

const splitMethodOptions: Array<{
    value: SplitMethod;
    label: string;
    description: string;
}> = [
    {
        value: "just_me",
        label: "Just me",
        description: "Paid by you and assigned only to you.",
    },
    {
        value: "equal",
        label: "Equal split",
        description: "Divide evenly between selected people.",
    },
    {
        value: "exact",
        label: "Exact amounts",
        description: "Enter a specific amount for each person.",
    },
    {
        value: "percentage",
        label: "Percentages",
        description: "Assign each person a percentage.",
    },
];

export default function CostAllocationFields({
    amount,
    participants,
    currentUserTripMemberId = null,
    initialSplitMethod = "just_me",
    initialSelectedParticipantValues = [],
    initialPayerValue = null,
    tone = "dark",
}: CostAllocationFieldsProps) {
    const [splitMethod, setSplitMethod] =
        useState<SplitMethod>(initialSplitMethod);
    const hasAmount = parsePositiveAmount(amount) > 0;
    const options = useMemo(
        () =>
            participants.filter((participant) =>
                ["member", "invitation", "family_member"].includes(participant.kind)
            ),
        [participants]
    );
    const defaultPayer =
        options.find(
            (participant) =>
                participant.kind === "member" &&
                participant.id === currentUserTripMemberId
        ) || options.find((participant) => participant.isCurrentUser) || options[0];
    const currentParticipant =
        options.find((participant) =>
            isCurrentUserParticipant(participant, currentUserTripMemberId)
        ) || defaultPayer;
    const currentParticipantValue = currentParticipant
        ? participantValue(currentParticipant)
        : "";
    const [selectedPayer, setSelectedPayer] = useState(
        initialPayerValue &&
            options.some(
                (participant) => participantValue(participant) === initialPayerValue
            )
            ? initialPayerValue
            : defaultPayer
              ? participantValue(defaultPayer)
              : ""
    );
    const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
        () => {
            const availableValues = new Set(options.map(participantValue));
            const savedValues = initialSelectedParticipantValues.filter((value) =>
                availableValues.has(value)
            );

            if (initialSplitMethod === "just_me") {
                return new Set(currentParticipantValue ? [currentParticipantValue] : []);
            }

            return new Set(
                savedValues.length > 0
                    ? savedValues
                    : options.map(participantValue)
            );
        }
    );

    function chooseSplitMethod(nextSplitMethod: SplitMethod) {
        setSplitMethod(nextSplitMethod);

        if (nextSplitMethod === "equal") {
            setSelectedParticipants(new Set(options.map(participantValue)));
        } else if (nextSplitMethod === "just_me") {
            setSelectedParticipants(
                new Set(currentParticipantValue ? [currentParticipantValue] : [])
            );
        }
    }

    function toggleParticipant(value: string, isChecked: boolean) {
        setSelectedParticipants((current) => {
            const next = new Set(current);
            if (isChecked) next.add(value);
            else next.delete(value);
            return next;
        });
    }

    if (!hasAmount) return null;

    const isDark = tone === "dark";
    const panelClass = isDark
        ? "border-white/10 bg-white/[0.06] text-white"
        : "border-slate-200 bg-slate-50 text-slate-950";
    const labelClass = isDark
        ? "text-lime-200/80"
        : "text-slate-600";
    const inputClass = isDark
        ? "border-white/10 bg-white/[0.08] text-white [color-scheme:dark]"
        : "border-slate-300 bg-white text-slate-900";
    const rowClass = isDark
        ? "border-white/10 bg-slate-950/50 text-white"
        : "border-slate-200 bg-white text-slate-900";

    if (options.length === 0) {
        return (
            <div className={`rounded-2xl border p-4 text-sm font-semibold ${panelClass}`}>
                Add trip members first to split this cost automatically.
            </div>
        );
    }

    return (
        <section className={`rounded-2xl border p-4 ${panelClass}`}>
            <div>
                <p className="text-sm font-black">Add to budget</p>
                <p className={`mt-1 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    This cost will use your reporting currency and saved exchange rates.
                </p>
            </div>

            <div className="mt-4 space-y-4">
                <div className="space-y-2">
                    <span className={`text-xs font-black uppercase tracking-[0.18em] ${labelClass}`}>
                        Paid by
                    </span>
                    <input type="hidden" name="paid_by" value={selectedPayer} />
                    <div className="flex flex-wrap gap-2">
                        {options.map((participant) => {
                            const label = getParticipantLabel(
                                participant,
                                currentUserTripMemberId
                            );

                            return (
                                <button
                                    key={participantValue(participant)}
                                    type="button"
                                    onClick={() =>
                                        setSelectedPayer(participantValue(participant))
                                    }
                                    className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-left text-sm font-black transition ${
                                        selectedPayer === participantValue(participant)
                                            ? "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                            : isDark
                                              ? "border-white/10 bg-slate-950/50 text-white hover:border-lime-300/30 hover:bg-white/[0.1]"
                                              : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-100"
                                    }`}
                                >
                                    <ParticipantAvatar
                                        participant={participant}
                                        label={label}
                                    />
                                    <span className="max-w-40 truncate">
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-3">
                    <span className={`text-xs font-black uppercase tracking-[0.18em] ${labelClass}`}>
                        Split
                    </span>
                    <input type="hidden" name="split_method" value={splitMethod} />
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {splitMethodOptions.map((option) => {
                            const isSelected = splitMethod === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => chooseSplitMethod(option.value)}
                                    aria-pressed={isSelected}
                                    className={`rounded-2xl border px-3 py-2 text-left transition ${
                                        isSelected
                                            ? "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                            : isDark
                                              ? "border-white/10 bg-slate-950/50 text-white hover:border-lime-300/30 hover:bg-white/[0.1]"
                                              : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-100"
                                    }`}
                                >
                                    <span className="block text-xs font-black">
                                        {option.label}
                                    </span>
                                    <span
                                        className={`mt-1 block text-[11px] font-semibold leading-4 ${
                                            isSelected
                                                ? "text-slate-950/70"
                                                : isDark
                                                  ? "text-slate-400"
                                                  : "text-slate-500"
                                        }`}
                                    >
                                        {option.description}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                        {splitMethod === "just_me" && currentParticipant ? (
                            <input
                                type="hidden"
                                name="included_participants"
                                value={participantValue(currentParticipant)}
                            />
                        ) : null}
                        {options.map((participant) => {
                            const value = participantValue(participant);
                            const label = getParticipantLabel(
                                participant,
                                currentUserTripMemberId
                            );
                            const isCurrentUser = isCurrentUserParticipant(
                                participant,
                                currentUserTripMemberId
                            );
                            const isLockedToCurrentUser =
                                splitMethod === "just_me" && isCurrentUser;

                            return (
                                <label
                                    key={value}
                                    className={`grid grid-cols-[auto_auto_1fr_7rem] items-center gap-3 rounded-2xl border p-3 ${
                                        splitMethod === "just_me" && !isCurrentUser
                                            ? `${rowClass} opacity-45`
                                            : rowClass
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        name={
                                            splitMethod === "just_me"
                                                ? undefined
                                                : "included_participants"
                                        }
                                        value={value}
                                        checked={selectedParticipants.has(value)}
                                        onChange={(event) =>
                                            toggleParticipant(
                                                value,
                                                event.target.checked
                                            )
                                        }
                                        disabled={splitMethod === "just_me"}
                                        className="h-4 w-4 accent-lime-300"
                                    />
                                    <ParticipantAvatar
                                        participant={participant}
                                        label={label}
                                    />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black">
                                            {label}
                                        </span>
                                        {participant.secondaryLabel ? (
                                            <span
                                                className={`block truncate text-xs font-semibold ${
                                                    isDark
                                                        ? "text-slate-400"
                                                        : "text-slate-500"
                                                }`}
                                            >
                                                {participant.secondaryLabel}
                                            </span>
                                        ) : null}
                                    </span>
                                    {splitMethod === "just_me" ? (
                                        <span
                                            className={`text-right text-xs font-black uppercase ${
                                                isLockedToCurrentUser
                                                    ? "text-lime-200"
                                                    : isDark
                                                      ? "text-slate-500"
                                                      : "text-slate-400"
                                            }`}
                                        >
                                            {isLockedToCurrentUser ? "Full" : "0"}
                                        </span>
                                    ) : splitMethod === "exact" ? (
                                        <input
                                            name={splitInputName(
                                                "split_amount",
                                                participant
                                            )}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            className={`rounded-xl border px-3 py-2 text-right text-xs font-bold outline-none ${inputClass}`}
                                        />
                                    ) : splitMethod === "percentage" ? (
                                        <input
                                            name={splitInputName(
                                                "split_percentage",
                                                participant
                                            )}
                                            inputMode="decimal"
                                            placeholder="%"
                                            className={`rounded-xl border px-3 py-2 text-right text-xs font-bold outline-none ${inputClass}`}
                                        />
                                    ) : (
                                        <span
                                            className={`text-right text-xs font-black uppercase ${
                                                isDark
                                                    ? "text-slate-400"
                                                    : "text-slate-500"
                                            }`}
                                        >
                                            Equal
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
