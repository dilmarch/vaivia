"use client";

import {
    FoodReactionBarPresentation,
} from "@/components/food/FoodReactionBarPresentation";
import type { FoodReactionSummary, FoodReactionType } from "@/lib/tripFood";

type FoodReactionBarProps = {
    tripId: string;
    foodItemId: string;
    summaries?: FoodReactionSummary[];
    currentUserReaction?: FoodReactionType | null;
    toggleReactionAction: (formData: FormData) => Promise<void>;
};

export default function FoodReactionBar({
    tripId,
    foodItemId,
    summaries = [],
    currentUserReaction,
    toggleReactionAction,
}: FoodReactionBarProps) {
    return (
        <FoodReactionBarPresentation
            summaries={summaries}
            currentUserReaction={currentUserReaction}
            renderReactionAction={(option, action) => (
                    <form action={toggleReactionAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input
                            type="hidden"
                            name="food_item_id"
                            value={foodItemId}
                        />
                        <input type="hidden" name="reaction" value={option.type} />
                        {action}
                    </form>
            )}
        />
    );
}
