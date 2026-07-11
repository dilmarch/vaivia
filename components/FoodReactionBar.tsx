"use client";

import { Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import type {
    FoodReactionSummary,
    FoodReactionType,
} from "@/lib/tripFood";
import type { IdeaReactionProfile } from "@/lib/tripIdeas";

type FoodReactionBarProps = {
    tripId: string;
    foodItemId: string;
    summaries?: FoodReactionSummary[];
    currentUserReaction?: FoodReactionType | null;
    toggleReactionAction: (formData: FormData) => Promise<void>;
};

const REACTION_OPTIONS: Array<{
    type: FoodReactionType;
    label: string;
    valueLabel: string;
    Icon: typeof Heart;
}> = [
    { type: "heart", label: "Heart", valueLabel: "+2", Icon: Heart },
    { type: "thumbs_up", label: "Thumbs up", valueLabel: "+1", Icon: ThumbsUp },
    { type: "thumbs_down", label: "Thumbs down", valueLabel: "-1", Icon: ThumbsDown },
];

function getProfileLabel(profile: IdeaReactionProfile) {
    const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return fullName || profile.username || "Traveler";
}

function getInitials(profile: IdeaReactionProfile) {
    return getProfileLabel(profile)
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
                    className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#0c0115] bg-lime-200 text-[9px] font-black text-slate-950 shadow-sm"
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

export default function FoodReactionBar({
    tripId,
    foodItemId,
    summaries = [],
    currentUserReaction,
    toggleReactionAction,
}: FoodReactionBarProps) {
    const summaryByType = new Map(
        summaries.map((summary) => [summary.reaction, summary])
    );

    return (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {REACTION_OPTIONS.map((option) => {
                const summary = summaryByType.get(option.type);
                const isSelected = currentUserReaction === option.type;
                const count = summary?.count || 0;
                const Icon = option.Icon;

                return (
                    <form key={option.type} action={toggleReactionAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input
                            type="hidden"
                            name="food_item_id"
                            value={foodItemId}
                        />
                        <input type="hidden" name="reaction" value={option.type} />
                        <button
                            type="submit"
                            aria-pressed={isSelected}
                            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] transition duration-300 hover:-translate-y-0.5 ${
                                isSelected
                                    ? "border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)]"
                                    : "border-white/10 bg-white/[0.06] text-slate-200 hover:border-lime-300/50 hover:bg-white/[0.1] hover:text-white"
                            }`}
                            title={`${option.label} (${option.valueLabel})`}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{option.valueLabel}</span>
                            <ReactionAvatarStack profiles={summary?.profiles || []} />
                            <span
                                className={`rounded-full px-1.5 py-0.5 ${
                                    isSelected
                                        ? "bg-slate-950/10 text-slate-950"
                                        : "bg-white/10 text-slate-300"
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
