"use client";

import { BookmarkCheck, Clock3, ExternalLink, MapPin, Star } from "lucide-react";
import type { AssistantPlaceRecommendation } from "@/lib/ai/places-contract";

export default function PlaceRecommendationCards({
    recommendations,
}: {
    recommendations: AssistantPlaceRecommendation[];
}) {
    if (recommendations.length === 0) return null;

    return (
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
                {recommendations.map((place) => (
                    <article
                        key={place.recommendationId}
                        className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/75 p-4 shadow-lg shadow-black/20"
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
                            {place.alreadySaved ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-lime-300/10 px-2 py-1 text-[9px] font-black text-lime-200">
                                    <BookmarkCheck className="h-3 w-3" aria-hidden="true" />
                                    Saved
                                </span>
                            ) : null}
                        </div>

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

                        {place.hoursSummary ? (
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
                    </article>
                ))}
            </div>
            <p className="text-[10px] leading-4 text-slate-500">
                Distances are straight-line estimates, not walking or travel times.
                Verify hours, accessibility, dietary suitability, prices, and current
                status before visiting.
            </p>
        </section>
    );
}
