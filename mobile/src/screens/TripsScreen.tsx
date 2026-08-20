import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, LogOut, MapPin, Plane } from "lucide-react";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import { Button } from "@/components/ui/button";
import { Brand } from "../components/Brand";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";
import { formatMobileDateRange } from "../lib/formatting";

type TripsScreenProps = {
  apiClient: MobileApiClient;
  onSelectTrip: (tripId: string) => void;
  onSignOut: () => Promise<void>;
};

export function TripsScreen({
  apiClient,
  onSelectTrip,
  onSignOut,
}: TripsScreenProps) {
  const [trips, setTrips] = useState<MobileTripSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");

    void apiClient
      .getTrips(controller.signal)
      .then(({ trips: loadedTrips }) => setTrips(loadedTrips))
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
  }, [apiClient, reloadKey]);

  return (
    <main className="mobile-screen text-white">
      <header className="mobile-sticky-header border-b border-white/10 bg-[#0c0115]/90 px-5 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between py-3">
          <Brand compact />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void onSignOut()}
            className="h-11 w-11 rounded-full border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-5 pb-[max(2rem,var(--safe-area-bottom))] pt-7">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
          My trips
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Where to next?</h1>
        <p className="mt-2 text-sm font-semibold text-slate-400">
          Your active VAIVIA trips and itineraries.
        </p>

        <section className="mt-7 space-y-4" aria-live="polite">
          {isLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading trips">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.045] motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : errorMessage ? (
            <ScreenMessage
              title="Trips are unavailable"
              message={errorMessage}
              actionLabel="Try again"
              onAction={() => setReloadKey((key) => key + 1)}
            />
          ) : trips.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <Plane className="mx-auto h-8 w-8 text-lime-300" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-black">No active trips yet</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                Create a trip on vaivia.app and it will appear here.
              </p>
            </div>
          ) : (
            trips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => onSelectTrip(trip.id)}
                className="group relative w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#080511] p-5 text-left shadow-xl shadow-black/20 transition active:scale-[0.99]"
              >
                {trip.cover_image_url ? (
                  <span
                    className="absolute inset-0 bg-cover bg-center opacity-25"
                    style={{ backgroundImage: `url(${JSON.stringify(trip.cover_image_url)})` }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="absolute inset-0 bg-gradient-to-r from-[#080511] via-[#080511]/90 to-[#080511]/55" />
                <span className="relative flex items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-black text-white">
                      {trip.title}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                      <MapPin className="h-4 w-4 shrink-0 text-lime-300" />
                      <span className="truncate">
                        {trip.destination || "Destination to be confirmed"}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      {formatMobileDateRange(trip.start_date, trip.end_date)}
                    </span>
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-lime-300">
                    <ChevronRight className="h-5 w-5" />
                  </span>
                </span>
              </button>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
