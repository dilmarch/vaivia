"use client";

import { Check, Users, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type {
    TripAudienceMode,
    TripAudienceOption,
} from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

type TripAudienceSelectorProps = {
    options: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    initialAudienceMode?: TripAudienceMode | null;
    initialSelectedOptions?: TripAudienceOption[];
    description?: string;
    privateSectionId?: string;
    onAudienceModeChange?: (mode: TripAudienceMode) => void;
};

function optionKey(option: Pick<TripAudienceOption, "kind" | "id">) {
    return `${option.kind}:${option.id}`;
}

function AudienceAvatar({ option }: { option: TripAudienceOption }) {
    return (
        <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[10px] font-black uppercase ${
                option.status === "invited"
                    ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                    : "border-white/15 bg-slate-950 text-lime-200"
            }`}
        >
            {option.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={option.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
                getInitials(option.displayName)
            )}
        </span>
    );
}

export default function TripAudienceSelector({
    options,
    currentUserTripMemberId,
    initialAudienceMode = "everyone",
    initialSelectedOptions = [],
    description = "Choose who should see this item when trip sharing is enabled.",
    onAudienceModeChange,
}: TripAudienceSelectorProps) {
    const defaultMode = initialAudienceMode || "everyone";
    const [audienceMode, setAudienceMode] = useState<TripAudienceMode>(defaultMode);
    const currentUserKey = currentUserTripMemberId
        ? `member:${currentUserTripMemberId}`
        : "";
    const [selectedKeys, setSelectedKeys] = useState(() => {
        if (defaultMode === "just_me" && currentUserKey) {
            return new Set([currentUserKey]);
        }

        return new Set(initialSelectedOptions.map(optionKey));
    });
    const selectedOptions = useMemo(() => {
        if (audienceMode === "everyone") return [];
        return options.filter((option) => selectedKeys.has(optionKey(option)));
    }, [audienceMode, options, selectedKeys]);
    const hasTripAudienceChoices = options.some(
        (option) => !(option.kind === "member" && option.isCurrentUser)
    );

    function setMode(nextMode: TripAudienceMode) {
        setAudienceMode(nextMode);
        onAudienceModeChange?.(nextMode);
        if (nextMode === "just_me" && currentUserKey) {
            setSelectedKeys(new Set([currentUserKey]));
        }
    }

    function toggleOption(option: TripAudienceOption) {
        if (audienceMode === "just_me") return;

        setSelectedKeys((current) => {
            const next = new Set(current);
            const key = optionKey(option);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    if (!hasTripAudienceChoices) {
        return <input type="hidden" name="audience_mode" value="everyone" />;
    }

    return (
        <section className="rounded-2xl border border-slate-700/70 bg-slate-950 p-4 text-white shadow-xl shadow-black/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-black text-white">Who is this for?</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
                        {description}
                    </p>
                </div>
            </div>

            <input type="hidden" name="audience_mode" value={audienceMode} />
            {selectedOptions.map((option) => (
                <span key={optionKey(option)}>
                    {option.kind === "member" ? (
                        <input type="hidden" name="audience_member_ids" value={option.id} />
                    ) : null}
                    {option.kind === "invitation" ? (
                        <input
                            type="hidden"
                            name="audience_invitation_ids"
                            value={option.id}
                        />
                    ) : null}
                    {option.kind === "family_member" ? (
                        <input
                            type="hidden"
                            name="audience_family_member_ids"
                            value={option.id}
                        />
                    ) : null}
                </span>
            ))}

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                    { value: "everyone", label: "Everyone", icon: Users },
                    { value: "just_me", label: "Just me", icon: UserRoundCheck },
                    { value: "custom", label: "Custom", icon: Users },
                ].map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value as TripAudienceMode)}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-black transition ${
                            audienceMode === value
                                ? "border-lime-300/40 bg-lime-300 text-slate-950"
                                : "border-slate-700 bg-slate-900 text-slate-100 hover:border-lime-300/30 hover:bg-slate-800"
                        }`}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </div>

            {audienceMode === "just_me" ? (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-semibold text-slate-200">
                    Only you are selected. Want to mark this private too?
                </div>
            ) : null}

            {audienceMode === "custom" ? (
                <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {options.length > 0 ? (
                            options.map((option) => {
                                const isSelected = selectedKeys.has(optionKey(option));
                                return (
                                    <button
                                        key={optionKey(option)}
                                        type="button"
                                        onClick={() => toggleOption(option)}
                                        className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold transition ${
                                            isSelected
                                                ? "border-lime-300/40 bg-lime-300 text-slate-950"
                                                : "border-slate-700 bg-slate-900 text-slate-100 hover:border-lime-300/30 hover:bg-slate-800"
                                        }`}
                                    >
                                        <AudienceAvatar option={option} />
                                        <span>
                                            {option.displayName}
                                            {option.status === "invited" ? (
                                                <span className="ml-1 text-xs opacity-70">
                                                    invited
                                                </span>
                                            ) : null}
                                        </span>
                                        {isSelected ? (
                                            <Check
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sm text-slate-400">
                                No trip members or invited people yet.
                            </p>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
