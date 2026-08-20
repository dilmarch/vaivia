import { useEffect, useState } from "react";
import {
  FoodCardPresentation,
  FoodLoadingPresentation,
  FoodPlaceCoverPlaceholder,
  FoodPresentation,
} from "@/components/food/FoodPresentation";
import { FoodReactionBarPresentation } from "@/components/food/FoodReactionBarPresentation";
import TripNotepadComposer from "@/components/TripNotepadComposer";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { FoodItemType } from "@/lib/tripFood";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripFoodScreen({
  apiClient,
  tripId,
}: {
  apiClient: MobileApiClient;
  tripId: string;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<FoodItemType>("place");
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
          error instanceof Error
            ? error.message
            : "Could not load Eat & Drink.",
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
            aria-label="Loading trip food"
          />
        </header>
        <FoodLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data?.food) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Eat & Drink unavailable"
          message={errorMessage || "This trip's food list could not be found."}
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
            pageLabel="Eat & Drink"
          />
        </TripHeaderPresentation>
      </header>

      <FoodPresentation
        activeTab={activeTab}
        items={data.food.items}
        beforeContent={
          <TripNotepadComposer
            tripId={tripId}
            title="Eat & Drink notepad"
            description="Keep food notes together, or make one place or food card for every non-empty line."
            placeholder="Seafood market\nPastéis de nata\nRooftop bar"
            existingNote={data.trip.notes}
            locations={[]}
            cardKind="food"
            readOnly
          />
        }
        renderAddAction={(_label, action) => (
          <fieldset
            disabled
            className="contents"
            title="Adding food is available on web"
          >
            {action}
          </fieldset>
        )}
        renderTab={(tab, label, className) => (
          <button
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={className}
          >
            {label}
          </button>
        )}
        renderCard={(item) => (
          <FoodCardPresentation
            key={item.id}
            item={item}
            cover={
              item.item_type === "place" && item.google_place_id ? (
                <FoodPlaceCoverPlaceholder />
              ) : undefined
            }
            reactionBar={
              <FoodReactionBarPresentation
                summaries={item.reaction_summaries}
                currentUserReaction={item.current_user_reaction}
              />
            }
          />
        )}
      />
    </main>
  );
}
