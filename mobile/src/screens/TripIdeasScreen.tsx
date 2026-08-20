import { useEffect, useState } from "react";
import { IdeaReactionBarPresentation } from "@/components/ideas/IdeaReactionBarPresentation";
import {
  TripIdeaCardPresentation,
  TripIdeaPlaceCoverPlaceholder,
} from "@/components/ideas/TripIdeaCardPresentation";
import {
  TripIdeasLoadingPresentation,
  TripIdeasPresentation,
} from "@/components/ideas/TripIdeasPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripIdeasScreen({
  apiClient,
  tripId,
}: {
  apiClient: MobileApiClient;
  tripId: string;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");
    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load trip ideas.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip ideas"
          />
        </header>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TripIdeasLoadingPresentation />
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Ideas unavailable"
          message={errorMessage || "These trip ideas could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={data.trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
        >
          <TripHeaderTitlePresentation
            tripTitle={data.trip.title || "Untitled trip"}
            pageLabel="Trip Ideas"
          />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TripIdeasPresentation
          ideas={data.ideas}
          renderIdeaCard={(idea) => (
            <TripIdeaCardPresentation
              key={idea.id}
              idea={idea}
              cover={
                idea.google_place_id ? <TripIdeaPlaceCoverPlaceholder /> : null
              }
              editDisabled
              addToItineraryDisabled
              reactionBar={
                <IdeaReactionBarPresentation
                  summaries={idea.reaction_summaries}
                  currentUserReaction={idea.current_user_reaction}
                />
              }
            />
          )}
        />
      </div>
    </main>
  );
}
