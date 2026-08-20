import { useEffect, useState } from "react";
import {
  BudgetFeaturePresentation,
  BudgetLoadingPresentation,
  type BudgetPresentationMode,
} from "@/components/budget/BudgetPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripBudgetScreen({
  apiClient,
  tripId,
}: {
  apiClient: MobileApiClient;
  tripId: string;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [mode, setMode] = useState<BudgetPresentationMode>("budget");
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
          error instanceof Error ? error.message : "Could not load trip budget.",
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
            aria-label="Loading trip budget"
          />
        </header>
        <BudgetLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Budget unavailable"
          message={errorMessage || "This trip budget could not be found."}
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
            pageLabel="Budget"
          />
        </TripHeaderPresentation>
      </header>

      <BudgetFeaturePresentation
        mode={mode}
        data={{
          tripId,
          tripTitle:
            data.trip.title || data.trip.destination || "Untitled trip",
          ...data.budget,
        }}
        actions={{ onModeChange: setMode }}
      />
    </main>
  );
}
