"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
    BookmarkCheck,
    ChevronDown,
    Clock3,
    ExternalLink,
    MapPin,
    Save,
    Star,
} from "lucide-react";
import PlaceActionReviewModal from "@/components/assistant/PlaceActionReviewModal";
import {
    ASSISTANT_PLACE_ACTION_TYPES,
    getAssistantPlaceActionLabel,
    isGooglePlaceId,
    type AssistantPlaceActionType,
} from "@/lib/ai/place-action-contract";
import type {
    AssistantPlaceRecommendation,
    AssistantPlaceSavedTarget,
} from "@/lib/ai/places-contract";

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
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<{
        recommendation: AssistantPlaceRecommendation;
        actionType: AssistantPlaceActionType;
    } | null>(null);
    const [localSavedTargets, setLocalSavedTargets] = useState<
        Record<string, AssistantPlaceSavedTarget[]>
    >({});
    const saveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
    if (recommendations.length === 0) return null;

    const canAct = Boolean(tripId && conversationId && messageId);

    function savedTargetsFor(recommendation: AssistantPlaceRecommendation) {
        const targets = [
            ...(recommendation.savedTargets || []),
            ...(localSavedTargets[recommendation.placeId] || []),
        ];
        return targets.filter(
            (target, index) =>
                targets.findIndex((candidate) => candidate.type === target.type) ===
                index
        );
    }

    function completeAction(
        recommendation: AssistantPlaceRecommendation,
        target: AssistantPlaceSavedTarget
    ) {
        setLocalSavedTargets((current) => ({
            ...current,
            [recommendation.placeId]: [
                ...(current[recommendation.placeId] || []).filter(
                    (item) => item.type !== target.type
                ),
                target,
            ],
        }));
    }

    function closeAction() {
        const recommendationId = pendingAction?.recommendation.recommendationId;
        setPendingAction(null);
        requestAnimationFrame(() => {
            if (recommendationId) {
                saveButtonRefs.current.get(recommendationId)?.focus();
            }
        });
    }

    return (
        <>
        <section
            className="mt-4 space-y-3 border-t border-white/10 pt-4"
            aria-label="Live place recommendations from Google Maps"
        >
            <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <span>Live place results</span>
                <span className="normal-case tracking-normal text-slate-300">
                    Google Maps
                </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {recommendations.map((place) => {
                    const savedTargets = savedTargetsFor(place);
                    const savedTypes = new Set(
                        savedTargets.map((target) => target.type)
                    );
                    const isAlreadySaved =
                        place.alreadySaved ||
                        savedTypes.has("trip_idea") ||
                        savedTypes.has("trip_food_item");
                    return (
                        <article
                        key={place.recommendationId}
                        className="relative min-w-0 rounded-2xl border border-white/10 bg-slate-950/75 p-4 shadow-lg shadow-black/20"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">
                                    {place.name}
                                </p>
                                <p className="mt-0.5 text-[11px] font-bold text-lime-200">
                                    {place.category}
                                </p>
                            </div>
                            {isAlreadySaved ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-lime-300/10 px-2 py-1 text-[9px] font-black text-lime-200">
                                    <BookmarkCheck className="h-3 w-3" aria-hidden="true" />
                                    Saved
                                </span>
                            ) : null}
                        </div>

                        {savedTargets.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {savedTargets.map((target) => (
                                    <Link
                                        key={target.type}
                                        href={target.href}
                                        className="rounded-full border border-lime-300/20 bg-lime-300/[0.08] px-2.5 py-1 text-[10px] font-black text-lime-200 underline-offset-2 hover:underline"
                                    >
                                        {target.type === "trip_food_item"
                                            ? "Saved to Eat & Drink"
                                            : target.type === "itinerary_item"
                                              ? "Added to itinerary"
                                              : "Saved to Things to Do"}
                                    </Link>
                                ))}
                            </div>
                        ) : null}

                        <p className="mt-3 text-xs leading-5 text-slate-300">
                            {place.matchReason}
                        </p>
                        {place.address ? (
                            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-400">
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>{place.address}</span>
                            </p>
                        ) : null}

                        <dl className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-300">
                            <div className="rounded-full border border-white/10 px-2.5 py-1">
                                <dt className="sr-only">Distance</dt>
                                <dd>{place.distance}</dd>
                            </div>
                            {place.rating !== null ? (
                                <div className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1">
                                    <dt className="sr-only">Rating</dt>
                                    <Star className="h-3 w-3 fill-amber-300 text-amber-300" aria-hidden="true" />
                                    <dd>
                                        {place.rating.toFixed(1)}
                                        {place.userRatingCount !== null
                                            ? ` (${place.userRatingCount.toLocaleString()})`
                                            : ""}
                                    </dd>
                                </div>
                            ) : null}
                            {place.priceLevel ? (
                                <div className="rounded-full border border-white/10 px-2.5 py-1">
                                    <dt className="sr-only">Price level</dt>
                                    <dd>{place.priceLevel}</dd>
                                </div>
                            ) : null}
                        </dl>

                        {place.liveDetailsAvailable === false ? (
                            <p className="mt-3 text-[10px] leading-4 text-amber-200">
                                Live Google Maps details are unavailable. Showing your saved
                                label.
                            </p>
                        ) : place.hoursSummary ? (
                            <p className="mt-3 line-clamp-3 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
                                <Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>{place.hoursSummary}</span>
                            </p>
                        ) : (
                            <p className="mt-3 text-[10px] leading-4 text-slate-500">
                                Verify hours and current details for your visit.
                            </p>
                        )}

                        <a
                            href={place.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-lime-300/25 bg-lime-300/10 px-3 py-2 text-xs font-black text-lime-200 transition hover:bg-lime-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
                            aria-label={`Open ${place.name} in Google Maps`}
                        >
                            View on Google Maps
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>

                        {canAct &&
                        isGooglePlaceId(place.placeId) &&
                        place.liveDetailsAvailable !== false ? (
                            <div className="relative mt-2">
                                <button
                                    ref={(element) => {
                                        if (element) {
                                            saveButtonRefs.current.set(
                                                place.recommendationId,
                                                element
                                            );
                                        } else {
                                            saveButtonRefs.current.delete(
                                                place.recommendationId
                                            );
                                        }
                                    }}
                                    type="button"
                                    aria-haspopup="menu"
                                    aria-expanded={openMenuId === place.recommendationId}
                                    onClick={() =>
                                        setOpenMenuId((current) =>
                                            current === place.recommendationId
                                                ? null
                                                : place.recommendationId
                                        )
                                    }
                                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
                                >
                                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                                    Save
                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                {openMenuId === place.recommendationId ? (
                                    <div
                                        role="menu"
                                        aria-label={`Save ${place.name}`}
                                        onKeyDown={(event) => {
                                            if (event.key === "Escape") {
                                                event.preventDefault();
                                                setOpenMenuId(null);
                                                saveButtonRefs.current
                                                    .get(place.recommendationId)
                                                    ?.focus();
                                                return;
                                            }
                                            if (
                                                event.key !== "ArrowDown" &&
                                                event.key !== "ArrowUp"
                                            ) {
                                                return;
                                            }
                                            event.preventDefault();
                                            const items = Array.from(
                                                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                                    '[role="menuitem"]:not([disabled])'
                                                )
                                            );
                                            const currentIndex = items.indexOf(
                                                document.activeElement as HTMLButtonElement
                                            );
                                            const direction =
                                                event.key === "ArrowDown" ? 1 : -1;
                                            const nextIndex =
                                                currentIndex < 0
                                                    ? direction > 0
                                                        ? 0
                                                        : items.length - 1
                                                    : (currentIndex + direction + items.length) %
                                                      items.length;
                                            items[nextIndex]?.focus();
                                        }}
                                        className="absolute bottom-12 left-0 right-0 z-20 overflow-hidden rounded-xl border border-white/10 bg-[#0a0711] p-1 shadow-2xl shadow-black/50"
                                    >
                                        {ASSISTANT_PLACE_ACTION_TYPES.map((actionType) => {
                                            const target =
                                                actionType === "save_food"
                                                    ? "trip_food_item"
                                                    : actionType === "save_thing_to_do"
                                                      ? "trip_idea"
                                                      : "itinerary_item";
                                            const alreadySaved = savedTypes.has(target);
                                            return (
                                                <button
                                                    key={actionType}
                                                    type="button"
                                                    role="menuitem"
                                                    disabled={alreadySaved}
                                                    onClick={() => {
                                                        setOpenMenuId(null);
                                                        setPendingAction({
                                                            recommendation: place,
                                                            actionType,
                                                        });
                                                    }}
                                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-600"
                                                >
                                                    {getAssistantPlaceActionLabel(actionType)}
                                                    {alreadySaved ? (
                                                        <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        </article>
                    );
                })}
            </div>
            <p className="text-[10px] leading-4 text-slate-500">
                Distances are straight-line estimates, not walking or travel times.
                Verify hours, accessibility, dietary suitability, prices, and current
                status before visiting.
            </p>
        </section>
        {pendingAction && tripId && conversationId && messageId ? (
            <PlaceActionReviewModal
                tripId={tripId}
                conversationId={conversationId}
                messageId={messageId}
                placeId={pendingAction.recommendation.placeId}
                actionType={pendingAction.actionType}
                onClose={closeAction}
                onComplete={(target) =>
                    completeAction(pendingAction.recommendation, target)
                }
            />
        ) : null}
        </>
    );
}
