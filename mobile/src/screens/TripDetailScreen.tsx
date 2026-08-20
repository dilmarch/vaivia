import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, MapPin, Route } from "lucide-react";
import type {
  MobileItineraryItem,
  MobileTripDetailResponse,
} from "@/lib/mobileApi/contracts";
import { getCategoryLabel } from "@/lib/itineraryCategories";
import { Button } from "@/components/ui/button";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";
import {
  formatMobileDate,
  formatMobileDateRange,
  formatMobileTime,
} from "../lib/formatting";

type TripDetailScreenProps = {
  apiClient: MobileApiClient;
  tripId: string;
  onBack: () => void;
};

function groupItineraryByDate(items: MobileItineraryItem[]) {
  const groups = new Map<string, MobileItineraryItem[]>();
  items.forEach((item) => {
    const entries = groups.get(item.item_date) || [];
    entries.push(item);
    groups.set(item.item_date, entries);
  });
  return Array.from(groups.entries());
}

export function TripDetailScreen({
  apiClient,
  tripId,
  onBack,
}: TripDetailScreenProps) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");

    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load this trip.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  const itineraryGroups = useMemo(
    () => groupItineraryByDate(data?.itinerary || []),
    [data?.itinerary],
  );

  return (
    <main className="mobile-screen text-white">
      <header className="mobile-sticky-header border-b border-white/10 bg-[#0c0115]/90 px-4 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-11 w-11 shrink-0 rounded-full border border-white/10 text-white hover:bg-white/10"
            aria-label="Back to trips"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-300">
              Trip itinerary
            </p>
            <p className="truncate text-base font-black text-white">
              {data?.trip.title || "Loading trip…"}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl pb-[max(2rem,var(--safe-area-bottom))]">
        {isLoading ? (
          <div className="space-y-5 px-5 py-7" role="status" aria-label="Loading itinerary">
            <div className="h-52 animate-pulse rounded-[2rem] bg-white/[0.05] motion-reduce:animate-none" />
            <div className="h-32 animate-pulse rounded-[1.5rem] bg-white/[0.05] motion-reduce:animate-none" />
            <div className="h-32 animate-pulse rounded-[1.5rem] bg-white/[0.05] motion-reduce:animate-none" />
          </div>
        ) : errorMessage || !data ? (
          <div className="px-5 py-8">
            <ScreenMessage
              title="Trip unavailable"
              message={errorMessage || "This trip could not be found."}
              actionLabel="Try again"
              onAction={() => setReloadKey((key) => key + 1)}
            />
          </div>
        ) : (
          <>
            <section className="relative min-h-56 overflow-hidden border-b border-white/10 px-5 py-8">
              {data.trip.cover_image_url ? (
                <span
                  className="absolute inset-0 bg-cover bg-center opacity-35"
                  style={{
                    backgroundImage: `url(${JSON.stringify(data.trip.cover_image_url)})`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-t from-[#0c0115] via-[#0c0115]/80 to-[#0c0115]/45" />
              <div className="relative flex min-h-40 flex-col justify-end">
                <h1 className="text-4xl font-black tracking-tight">{data.trip.title}</h1>
                <p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-200">
                  <MapPin className="h-4 w-4 text-lime-300" />
                  {data.trip.destination || "Destination to be confirmed"}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <CalendarDays className="h-4 w-4" />
                  {formatMobileDateRange(data.trip.start_date, data.trip.end_date)}
                </p>
              </div>
            </section>

            <section className="px-5 py-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime-300 text-slate-950">
                  <Route className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300">
                    Itinerary
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Your plans</h2>
                </div>
              </div>

              {itineraryGroups.length === 0 ? (
                <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/15 p-7 text-center">
                  <CalendarDays className="mx-auto h-7 w-7 text-slate-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-400">
                    No itinerary items have been added yet.
                  </p>
                </div>
              ) : (
                <div className="mt-7 space-y-8">
                  {itineraryGroups.map(([date, items]) => (
                    <section key={date}>
                      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-300">
                        {formatMobileDate(date, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </h3>
                      <div className="mt-3 space-y-3">
                        {items.map((item) => {
                          const startTime = formatMobileTime(item.start_time);
                          const endTime = formatMobileTime(item.end_time);
                          return (
                            <article
                              key={item.id}
                              className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-300">
                                    {getCategoryLabel({ name: item.category })}
                                  </p>
                                  <h4 className="mt-2 text-lg font-black text-white">
                                    {item.title}
                                  </h4>
                                </div>
                                {startTime ? (
                                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-black text-slate-200">
                                    <Clock className="h-3.5 w-3.5 text-lime-300" />
                                    {startTime}
                                    {endTime ? `–${endTime}` : ""}
                                  </span>
                                ) : null}
                              </div>
                              {item.location ? (
                                <p className="mt-3 flex items-start gap-2 text-sm font-semibold leading-5 text-slate-400">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                                  {item.location}
                                </p>
                              ) : null}
                              {item.notes ? (
                                <p className="mt-3 text-sm leading-6 text-slate-400">
                                  {item.notes}
                                </p>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
