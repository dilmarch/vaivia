"use client";

import Link from "next/link";
import PlaceActionReviewModal from "@/components/assistant/PlaceActionReviewModal";
import TripAssistantPresentation from "@/components/assistant/TripAssistantPresentation";

export default function TripAssistant({
    tripId,
    tripTitle,
    initialPrompt,
    initialContextLabel,
}: {
    tripId: string;
    tripTitle: string;
    initialPrompt?: string;
    initialContextLabel?: string;
}) {
    return (
        <TripAssistantPresentation
            tripId={tripId}
            tripTitle={tripTitle}
            initialPrompt={initialPrompt}
            initialContextLabel={initialContextLabel}
            renderPrivacyLink={(className) => (
                <Link href="/terms" className={className}>
                    VAIVIA privacy notice
                </Link>
            )}
            renderSavedTarget={({ target, label, className }) => (
                <Link href={target.href} className={className}>
                    {label}
                </Link>
            )}
            renderPlaceActionReview={(props) => (
                <PlaceActionReviewModal {...props} />
            )}
        />
    );
}
