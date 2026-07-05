"use client";

import type {
    IdeaReactionProfile,
    IdeaReactionSummary,
    IdeaReactionType,
} from "@/lib/tripIdeas";

type IdeaReactionBarProps = {
    tripId: string;
    ideaId: string;
    summaries?: IdeaReactionSummary[];
    currentUserReaction?: IdeaReactionType | null;
    toggleReactionAction: (formData: FormData) => Promise<void>;
    compact?: boolean;
};

const REACTION_OPTIONS: Array<{
    type: IdeaReactionType;
    label: string;
    symbol: string;
    valueLabel: string;
}> = [
    { type: "heart", label: "Heart", symbol: "♥", valueLabel: "+2" },
    { type: "thumbs_up", label: "Thumbs up", symbol: "👍", valueLabel: "+1" },
    { type: "thumbs_down", label: "Thumbs down", symbol: "👎", valueLabel: "-1" },
];

function getProfileLabel(profile: IdeaReactionProfile) {
    const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return fullName || profile.username || "Traveler";
}

function getInitials(profile: IdeaReactionProfile) {
    const label = getProfileLabel(profile);
    return label
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
}

function ReactionAvatarStack({
    profiles,
}: {
    profiles: IdeaReactionProfile[];
}) {
    if (profiles.length === 0) return null;

    return (
        <span className="flex items-center">
            {profiles.slice(0, 3).map((profile, index) => (
                <span
                    key={`${profile.user_id}-${index}`}
                    className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-white bg-slate-200 text-[9px] font-bold text-slate-600 shadow-sm"
                    style={{ marginLeft: index === 0 ? 0 : -12 }}
                    title={getProfileLabel(profile)}
                >
                    {profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={profile.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        getInitials(profile)
                    )}
                </span>
            ))}
        </span>
    );
}

export default function IdeaReactionBar({
    tripId,
    ideaId,
    summaries = [],
    currentUserReaction,
    toggleReactionAction,
    compact = false,
}: IdeaReactionBarProps) {
    const summaryByType = new Map(
        summaries.map((summary) => [summary.reaction, summary])
    );

    return (
        <div
            className={`flex flex-wrap gap-2 border-t border-slate-200 ${
                compact ? "mt-3 pt-3" : "mt-4 pt-4"
            }`}
        >
            {REACTION_OPTIONS.map((option) => {
                const summary = summaryByType.get(option.type);
                const isSelected = currentUserReaction === option.type;
                const count = summary?.count || 0;

                return (
                    <form key={option.type} action={toggleReactionAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="idea_id" value={ideaId} />
                        <input type="hidden" name="reaction" value={option.type} />
                        <button
                            type="submit"
                            aria-pressed={isSelected}
                            className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                                isSelected
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            title={`${option.label} (${option.valueLabel})`}
                        >
                            <span aria-hidden="true">{option.symbol}</span>
                            <span>{option.valueLabel}</span>
                            <ReactionAvatarStack profiles={summary?.profiles || []} />
                            <span
                                className={`rounded px-1.5 py-0.5 ${
                                    isSelected
                                        ? "bg-white/15 text-white"
                                        : "bg-slate-100 text-slate-600"
                                }`}
                            >
                                {count}
                            </span>
                        </button>
                    </form>
                );
            })}
        </div>
    );
}
