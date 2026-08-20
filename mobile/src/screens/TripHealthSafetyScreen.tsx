import { useEffect, useState } from "react";
import HealthSafetyAdvisories, {
  HealthSafetyHeroSummaryPresentation,
  HealthSafetyLoadingPresentation,
} from "@/components/health/HealthSafetyAdvisories";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripHealthSafetyScreen({
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
          error instanceof Error
            ? error.message
            : "Could not load Health & Safety.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  if (isLoading) {
    return (
      <main className="vaivia-page-bg min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip Health & Safety"
          />
        </header>
        <HealthSafetyLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data?.healthSafety) {
    return (
      <main className="vaivia-page-bg min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Health & Safety unavailable"
          message={
            errorMessage || "This trip's Health & Safety guidance could not be found."
          }
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  return (
    <main className="vaivia-page-bg min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={data.trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
        >
          <TripHeaderTitlePresentation
            tripTitle={data.trip.title || "Untitled trip"}
            pageLabel="Health & Safety"
          />
        </TripHeaderPresentation>

        <div className="mx-auto max-w-7xl p-5 sm:p-7">
          <div className="hidden sm:block">
            <div className="flex flex-wrap items-center gap-4">
              <HealthSafetyHeroSummaryPresentation />
            </div>
          </div>
          {data.trip.notes ? (
            <p className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-sm font-medium leading-6 text-slate-300">
              {data.trip.notes}
            </p>
          ) : null}
        </div>
      </header>

      <HealthSafetyAdvisories
        destinations={data.healthSafety.destinations}
        advisoryResult={data.healthSafety.advisoryResult}
      />
    </main>
  );
}
