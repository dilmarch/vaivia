"use client";

import Link from "next/link";
import PlaceActionReviewModal from "@/components/assistant/PlaceActionReviewModal";
import PlaceRecommendationCardsPresentation from "@/components/assistant/PlaceRecommendationCardsPresentation";
import type { AssistantPlaceRecommendation } from "@/lib/ai/places-contract";

export default function PlaceRecommendationCards({
    recommendations,
    tripId,
    conversationId,
    messageId,
}: {
    recommendations: AssistantPlaceRecommendation[];
    tripId?: string;
    conversationId?: string | null;
    messageId?: string;
}) {
    return (
        <PlaceRecommendationCardsPresentation
            recommendations={recommendations}
            tripId={tripId}
            conversationId={conversationId}
            messageId={messageId}
            renderSavedTarget={({ target, label, className }) => (
                <Link href={target.href} className={className}>
                    {label}
                </Link>
            )}
            renderActionReview={(props) => (
                <PlaceActionReviewModal {...props} />
            )}
        />
    );
}
