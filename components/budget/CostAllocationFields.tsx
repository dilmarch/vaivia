"use client";

import { useMemo, useState } from "react";
import type { SplitMethod } from "@/lib/budget";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

type CostAllocationFieldsProps = {
    amount: string;
    participants: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    tone?: "dark" | "light";
};

function parsePositiveAmount(value: string) {
    const parsed = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function participantValue(participant: TripAudienceOption) {
    return `${participant.kind}:${participant.id}`;
}

function splitInputName(
    prefix: "split_amount" | "split_percentage",
    participant: TripAudienceOption
) {
    return `${prefix}_${participant.kind}_${participant.id}`;
}

function ParticipantAvatar({ participant }: { participant: TripAudienceOption }) {
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
                getInitials(participant.displayName)
            )}
        </span>
    );
}

export default function CostAllocationFields({
    amount,
    participants,
    currentUserTripMemberId = null,
    tone = "dark",
}: CostAllocationFieldsProps) {
    const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
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
    const [selectedPayer, setSelectedPayer] = useState(
        defaultPayer ? participantValue(defaultPayer) : ""
    );

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

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                    <span className={`text-xs font-black uppercase tracking-[0.18em] ${labelClass}`}>
                        Paid by
                    </span>
                    <input type="hidden" name="paid_by" value={selectedPayer} />
                    <div className="flex flex-wrap gap-2">
                        {options.map((participant) => (
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
                                <ParticipantAvatar participant={participant} />
                                <span className="max-w-40 truncate">
                                    {participant.displayName}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <label className="space-y-2">
                    <span className={`text-xs font-black uppercase tracking-[0.18em] ${labelClass}`}>
                        Split
                    </span>
                    <select
                        name="split_method"
                        value={splitMethod}
                        onChange={(event) =>
                            setSplitMethod(event.target.value as SplitMethod)
                        }
                        className={`w-full rounded-xl border px-3 py-2 text-sm font-bold outline-none ${inputClass}`}
                    >
                        <option
                            value="equal"
                            className={isDark ? "bg-slate-950 text-white" : "bg-white text-slate-900"}
                        >
                            Equal split
                        </option>
                        <option
                            value="exact"
                            className={isDark ? "bg-slate-950 text-white" : "bg-white text-slate-900"}
                        >
                            Exact amounts
                        </option>
                        <option
                            value="percentage"
                            className={isDark ? "bg-slate-950 text-white" : "bg-white text-slate-900"}
                        >
                            Percentages
                        </option>
                    </select>
                </label>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
                {options.map((participant) => {
                    const value = participantValue(participant);

                    return (
                        <label
                            key={value}
                            className={`grid grid-cols-[auto_auto_1fr_7rem] items-center gap-3 rounded-2xl border p-3 ${rowClass}`}
                        >
                            <input
                                type="checkbox"
                                name="included_participants"
                                value={value}
                                defaultChecked
                                className="h-4 w-4 accent-lime-300"
                            />
                            <ParticipantAvatar participant={participant} />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-black">
                                    {participant.displayName}
                                </span>
                                {participant.secondaryLabel ? (
                                    <span
                                        className={`block truncate text-xs font-semibold ${
                                            isDark ? "text-slate-400" : "text-slate-500"
                                        }`}
                                    >
                                        {participant.secondaryLabel}
                                    </span>
                                ) : null}
                            </span>
                            {splitMethod === "exact" ? (
                                <input
                                    name={splitInputName("split_amount", participant)}
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    className={`rounded-xl border px-3 py-2 text-right text-xs font-bold outline-none ${inputClass}`}
                                />
                            ) : splitMethod === "percentage" ? (
                                <input
                                    name={splitInputName("split_percentage", participant)}
                                    inputMode="decimal"
                                    placeholder="%"
                                    className={`rounded-xl border px-3 py-2 text-right text-xs font-bold outline-none ${inputClass}`}
                                />
                            ) : (
                                <span className={`text-right text-xs font-black uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                    Equal
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
        </section>
    );
}
