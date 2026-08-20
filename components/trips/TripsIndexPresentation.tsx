"use client";

import { useMemo, type ReactNode } from "react";
import {
    getTripDisplayDateRange,
    type TripCardPresentationTrip,
} from "@/components/trips/TripCardPresentation";

export type TripFilter = "upcoming" | "past" | "archive";

export type TripsIndexPresentationTrip = TripCardPresentationTrip & {
    archived_at?: string | null;
};

type TripsIndexPresentationProps<TTrip extends TripsIndexPresentationTrip> = {
    trips: TTrip[];
    filter: TripFilter;
    onFilterChange: (filter: TripFilter) => void;
    renderTrip: (trip: TTrip, index: number) => ReactNode;
    renderCardActions?: (trip: TTrip, index: number) => ReactNode;
    renderCardSupplement?: (trip: TTrip, index: number) => ReactNode;
    contentOverride?: ReactNode;
    contentAriaLive?: "off" | "polite" | "assertive";
};

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function isPastTrip(trip: TripsIndexPresentationTrip, todayKey: string) {
    const displayDateRange = getTripDisplayDateRange(trip);
    const endDate = displayDateRange.endDate || displayDateRange.startDate;
    return Boolean(endDate && endDate < todayKey);
}

export function TripsIndexPresentation<
    TTrip extends TripsIndexPresentationTrip,
>({
    trips,
    filter,
    onFilterChange,
    renderTrip,
    renderCardActions,
    renderCardSupplement,
    contentOverride,
    contentAriaLive,
}: TripsIndexPresentationProps<TTrip>) {
    const todayKey = useMemo(() => getLocalDateKey(new Date()), []);
    const visibleTrips = useMemo(
        () =>
            trips.filter((trip) =>
                filter === "past"
                    ? !trip.archived_at && isPastTrip(trip, todayKey)
                    : filter === "archive"
                      ? Boolean(trip.archived_at)
                      : !trip.archived_at && !isPastTrip(trip, todayKey)
            ),
        [filter, todayKey, trips]
    );

    return (
        <section
            className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a] px-5 py-6 text-white shadow-2xl shadow-black/30 md:px-8 md:py-8"
            aria-live={contentAriaLive}
        >
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_8%,rgba(255,54,190,0.20),transparent_25%),radial-gradient(circle_at_8%_84%,rgba(var(--vaivia-neon-soft-rgb),0.14),transparent_28%),linear-gradient(120deg,rgba(124,60,255,0.14),transparent_42%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_24%,rgba(0,0,0,0.36))]" />
            </div>

            <div className="relative z-10">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.55em] text-lime-200/80">
                            My Trips
                        </p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-6xl">
                            All trips
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                            Browse every trip in your VAIVIA library, then open the
                            itinerary or edit the trip details.
                        </p>
                    </div>

                    <div className="grid w-full max-w-md grid-cols-3 rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-inner shadow-black/20">
                        {(["upcoming", "past", "archive"] as const).map(
                            (option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => onFilterChange(option)}
                                    className={`rounded-full px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
                                        filter === option
                                            ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
                                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                                    }`}
                                    aria-pressed={filter === option}
                                >
                                    {option === "archive" ? "Archive" : option}
                                </button>
                            )
                        )}
                    </div>
                </div>

                {contentOverride !== undefined ? (
                    contentOverride
                ) : visibleTrips.length > 0 ? (
                    <div className="mt-10 flex flex-wrap items-start gap-12 pb-8 md:gap-14 xl:gap-20">
                        {visibleTrips.map((trip, index) => (
                            <div
                                key={trip.id}
                                data-trip-card-shell
                                className="relative transition-all duration-500 ease-out hover:-translate-y-3 hover:scale-110"
                            >
                                {renderTrip(trip, index)}
                                {renderCardActions?.(trip, index)}
                                {renderCardSupplement?.(trip, index)}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-10 rounded-[2rem] border border-dashed border-white/20 bg-white/[0.04] p-8 text-center">
                        <h2 className="text-xl font-black text-white">
                            No {filter} trips
                        </h2>
                        <p className="mt-2 text-sm text-slate-400">
                            {filter === "upcoming"
                                ? "Your upcoming trips will appear here."
                                : filter === "archive"
                                  ? "Archived trips will appear here after you archive them."
                                  : "Past trips will appear here after their return date."}
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
