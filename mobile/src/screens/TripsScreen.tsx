import { useEffect, useState, type CSSProperties } from "react";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import {
  TripsIndexPresentation,
  type TripFilter,
} from "@/components/trips/TripsIndexPresentation";
import { MobileTripCard } from "../components/MobileTripCard";
import type { MobileApiClient } from "../lib/apiClient";

type TripsScreenProps = {
  apiClient: MobileApiClient;
  onSelectTrip: (tripId: string) => void;
  onSignOut: () => Promise<void>;
  onTripsLoaded?: (trips: MobileTripSummary[]) => void;
};

export function TripsScreen({
  apiClient,
  onSelectTrip,
  onTripsLoaded,
}: TripsScreenProps) {
  const [trips, setTrips] = useState<MobileTripSummary[]>([]);
  const [filter, setFilter] = useState<TripFilter>("upcoming");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");

    void apiClient
      .getTrips(controller.signal)
      .then(({ trips: loadedTrips }) => {
        setTrips(loadedTrips);
        onTripsLoaded?.(loadedTrips);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load your trips.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, onTripsLoaded, reloadKey]);

  const contentOverride = isLoading ? (
    <div
      className="mt-10 flex flex-wrap items-start gap-12 pb-8 md:gap-14 xl:gap-20"
      role="status"
      aria-label="Loading trips"
    >
      {["a", "b", "c"].map((variant) => {
        const maskUrl = `./trip-shape-${variant}.svg?v=wide-20260707`;
        const maskStyle = {
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        } as CSSProperties;

        return (
          <div
            key={variant}
            className="h-[500px] min-w-[300px] animate-pulse bg-white/[0.07] motion-reduce:animate-none md:h-[535px] md:min-w-[330px] lg:h-[560px] lg:min-w-[355px]"
            style={maskStyle}
          />
        );
      })}
    </div>
  ) : errorMessage ? (
    <div className="mt-10 rounded-[2rem] border border-dashed border-white/20 bg-white/[0.04] p-8 text-center">
      <h2 className="text-xl font-black text-white">Trips are unavailable</h2>
      <p className="mt-2 text-sm text-slate-400">{errorMessage}</p>
      <button
        type="button"
        onClick={() => setReloadKey((key) => key + 1)}
        className="mt-5 rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950"
      >
        Try again
      </button>
    </div>
  ) : undefined;

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-16 pt-24 text-white md:px-8 md:pt-28">
      <TripsIndexPresentation
        trips={trips}
        filter={filter}
        onFilterChange={setFilter}
        contentOverride={contentOverride}
        contentAriaLive="polite"
        renderTrip={(trip, index) => (
          <MobileTripCard
            trip={trip}
            index={index}
            onOpen={() => onSelectTrip(trip.id)}
          />
        )}
      />
    </main>
  );
}
