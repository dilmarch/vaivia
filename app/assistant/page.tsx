import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, CalendarDays, MapPin, Plus } from "lucide-react";
import { loadActiveMemberTrips, type SharedTrip } from "@/lib/sharedTrips";
import { createClient } from "@/lib/supabase/server";
import { getTripHref } from "@/lib/tripRoutes";

export const metadata: Metadata = {
    title: "Choose a trip for the VAIVIA assistant",
};

const TRIP_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
});

function localDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDate(value: string | null) {
    if (!value) return null;
    return TRIP_DATE_FORMATTER.format(new Date(`${value}T12:00:00Z`));
}

function formatTripDates(trip: SharedTrip) {
    const start = formatDate(trip.start_date);
    const end = formatDate(trip.end_date);

    if (start && end && start !== end) return `${start} – ${end}`;
    return start || end || "Dates not set";
}

function sortTripsForAssistant(trips: SharedTrip[]) {
    const today = localDateKey(new Date());

    return [...trips].sort((left, right) => {
        const leftPast = Boolean(left.end_date && left.end_date < today);
        const rightPast = Boolean(right.end_date && right.end_date < today);
        if (leftPast !== rightPast) return leftPast ? 1 : -1;

        const leftDate = left.start_date || left.end_date || "9999-12-31";
        const rightDate = right.start_date || right.end_date || "9999-12-31";
        return leftPast
            ? rightDate.localeCompare(leftDate)
            : leftDate.localeCompare(rightDate);
    });
}

function tripTimingLabel(trip: SharedTrip) {
    const today = localDateKey(new Date());
    if (trip.end_date && trip.end_date < today) return "Past trip";
    if (trip.start_date && trip.start_date > today) return "Upcoming";
    if (trip.start_date || trip.end_date) return "Current trip";
    return "Flexible dates";
}

export default async function AssistantTripPickerPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { trips, error } = await loadActiveMemberTrips(supabase, user.id);
    const availableTrips = error ? [] : sortTripsForAssistant(trips || []);

    return (
        <main className="min-h-screen px-4 pb-28 pt-24 text-white sm:px-6 md:pb-12 md:pl-32 md:pr-8 md:pt-12">
            <section className="mx-auto max-w-6xl">
                <div className="overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#050712]/90 shadow-2xl shadow-black/35 backdrop-blur-xl">
                    <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.16),transparent_38%),#080b16] px-6 py-8 sm:px-9 sm:py-10">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">
                                    VAIVIA travel assistant
                                </p>
                                <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">
                                    Which trip are we talking about?
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                                    Choose a trip so the assistant uses the right itinerary,
                                    accommodations, ideas, and other saved trip details.
                                </p>
                            </div>
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.18)]">
                                <Bot className="h-8 w-8" aria-hidden="true" />
                            </div>
                        </div>
                    </header>

                    <div className="p-5 sm:p-8">
                        {error ? (
                            <div role="alert" className="rounded-3xl border border-red-300/20 bg-red-950/30 p-6 text-sm font-bold text-red-100">
                                Your trips could not be loaded right now. Please refresh and try
                                again.
                            </div>
                        ) : availableTrips.length > 0 ? (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {availableTrips.map((trip) => (
                                    <Link
                                        key={trip.id}
                                        href={getTripHref(trip, "/assistant")}
                                        aria-label={`Open the VAIVIA assistant for ${trip.title || trip.destination || "this trip"}`}
                                        className="group flex min-h-52 flex-col justify-between rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-lime-300/40 hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-lime-300/55"
                                    >
                                        <div>
                                            <span className="inline-flex rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-200">
                                                {tripTimingLabel(trip)}
                                            </span>
                                            <h2 className="mt-4 text-2xl font-black text-white">
                                                {trip.title || trip.destination || "Untitled trip"}
                                            </h2>
                                            {trip.destination ? (
                                                <p className="mt-2 flex items-start gap-2 text-sm font-bold text-slate-300">
                                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" aria-hidden="true" />
                                                    <span>{trip.destination}</span>
                                                </p>
                                            ) : null}
                                            <p className="mt-2 flex items-start gap-2 text-sm text-slate-400">
                                                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" aria-hidden="true" />
                                                <span>{formatTripDates(trip)}</span>
                                            </p>
                                        </div>
                                        <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-lime-200 transition group-hover:gap-3">
                                            Open assistant
                                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[1.75rem] border border-dashed border-lime-300/25 bg-lime-300/[0.06] px-6 py-12 text-center">
                                <Bot className="mx-auto h-10 w-10 text-lime-300" aria-hidden="true" />
                                <h2 className="mt-4 text-2xl font-black text-white">
                                    Create a trip first
                                </h2>
                                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-300">
                                    The assistant is trip-specific, so it needs a trip with saved
                                    details before you can start a conversation.
                                </p>
                                <Link
                                    href="/trips/new"
                                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Create a trip
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}
