"use client";

import Link from "next/link";
import Script from "next/script";
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Minus,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import { useTripCoverImage } from "@/components/TripCoverImage";

export type DashboardTrip = {
    id: string;
    title: string;
    destination?: string | null;
    cover_image_url?: string | null;
    trip_cover_image_url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
};

type TripDashboardClientProps = {
    trips: DashboardTrip[];
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
};

const fallbackAccentColors = [
    "#d7ff2f",
    "#7c3cff",
    "#ff3ca6",
    "#ff7a1a",
    "#00d5ff",
    "#4157ff",
];

const tripCardVariants = [
    {
        mask: "/trip-shape-a.svg?v=wide-20260707",
        transform: "md:translate-y-0",
        daysCircleClass: "left-9 top-7",
        contentClass: "left-12 right-14",
        dateClass: "",
    },
    {
        mask: "/trip-shape-b.svg?v=wide-20260707",
        transform: "md:translate-y-8",
        daysCircleClass: "left-10 top-7",
        contentClass: "left-14 right-12",
        dateClass: "",
    },
    {
        mask: "/trip-shape-c.svg?v=wide-20260707",
        transform: "md:translate-y-2",
        daysCircleClass: "left-9 top-7",
        contentClass: "left-12 right-12",
        dateClass: "",
    },
];

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getEditButtonPosition(index: number) {
    return index % 3 === 1 ? "bottom-9 left-14" : "bottom-10 right-16";
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function stripDestinationFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function startOfWeek(date: Date) {
    return addDays(date, -date.getDay());
}

function startOfMonthGrid(date: Date) {
    return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getUpcomingTrips(trips: DashboardTrip[]) {
    const todayKey = getLocalDateKey(new Date());

    return trips.filter((trip) => {
        const endDate = trip.end_date || trip.start_date;
        return endDate ? endDate >= todayKey : true;
    });
}

function getTripAccent(trips: DashboardTrip[], trip: DashboardTrip) {
    const tripIndex = trips.findIndex((candidate) => candidate.id === trip.id);
    return fallbackAccentColors[
        Math.max(tripIndex, 0) % fallbackAccentColors.length
    ];
}

function parseTripPlainDate(value?: string | null) {
    if (!value) return null;

    const [yearText, monthText, dayText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function formatTripDateRange(startDate?: string | null, endDate?: string | null) {
    const start = parseTripPlainDate(startDate);
    const end = parseTripPlainDate(endDate);
    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
    });

    if (start && end) {
        return `${formatter.format(start)} - ${formatter.format(end)}, ${end.getFullYear()}`;
    }

    if (start) return `${formatter.format(start)}, ${start.getFullYear()}`;
    if (end) return `${formatter.format(end)}, ${end.getFullYear()}`;

    return "Dates coming soon";
}

function getTripDays(startDate?: string | null, endDate?: string | null) {
    const start = parseTripPlainDate(startDate);
    const end = parseTripPlainDate(endDate || startDate);

    if (!start || !end) return 0;

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / millisecondsPerDay) + 1
    );
}

function getPrimaryDestination(trip: DashboardTrip) {
    const destination = parseDestinationList(trip.destination)[0];
    const withoutFlag = stripDestinationFlag(destination || trip.title || "Trip");
    return withoutFlag.split(",")[0]?.trim() || withoutFlag;
}

function getTripDestinationNames(trip: DashboardTrip) {
    const destinations = parseDestinationList(trip.destination)
        .map((destination) => {
            const withoutFlag = stripDestinationFlag(destination);
            return withoutFlag.split(",")[0]?.trim() || withoutFlag;
        })
        .filter(Boolean);

    if (destinations.length > 0) return destinations;

    return [trip.title || "Trip"];
}

function formatDestinationPair(destinations: string[]) {
    return destinations.length > 1 ? destinations.join(" / ") : destinations[0];
}

function getWeekTripSegments(
    weekDates: Date[],
    trips: DashboardTrip[]
) {
    const weekStartKey = getLocalDateKey(weekDates[0]);
    const weekEndKey = getLocalDateKey(weekDates[weekDates.length - 1]);

    return trips
        .map((trip) => {
            if (!trip.start_date) return null;

            const tripStartKey = trip.start_date;
            const tripEndKey = trip.end_date || trip.start_date;

            if (tripEndKey < weekStartKey || tripStartKey > weekEndKey) {
                return null;
            }

            const startIndex = weekDates.findIndex((date) => {
                const dateKey = getLocalDateKey(date);
                return dateKey >= tripStartKey && dateKey <= tripEndKey;
            });
            const reversedEndIndex = [...weekDates]
                .reverse()
                .findIndex((date) => {
                    const dateKey = getLocalDateKey(date);
                    return dateKey >= tripStartKey && dateKey <= tripEndKey;
                });

            if (startIndex < 0 || reversedEndIndex < 0) return null;

            const endIndex = weekDates.length - 1 - reversedEndIndex;

            return {
                trip,
                startIndex,
                endIndex,
            };
        })
        .filter(
            (
                segment
            ): segment is {
                trip: DashboardTrip;
                startIndex: number;
                endIndex: number;
            } => Boolean(segment)
        );
}

export function DashboardTripCard({
    trip,
    index,
    isGoogleReady,
    disableHoverTransform = false,
}: {
    trip: DashboardTrip;
    index: number;
    isGoogleReady: boolean;
    disableHoverTransform?: boolean;
}) {
    const coverImageUrl = useTripCoverImage(trip, isGoogleReady);
    const [hasImageLoadError, setHasImageLoadError] = useState(false);
    const destinations = getTripDestinationNames(trip);
    const primaryDestination = destinations[0] ?? getPrimaryDestination(trip);
    const secondLineDestinations = destinations.slice(1, 3);
    const thirdLineDestinations = destinations.slice(3, 5);
    const isLongName = primaryDestination.length > 8;
    const days = getTripDays(trip.start_date, trip.end_date);
    const accent = fallbackAccentColors[index % fallbackAccentColors.length];
    const variant = tripCardVariants[index % tripCardVariants.length];
    const maskStyle = {
        WebkitMaskImage: `url(${variant.mask})`,
        maskImage: `url(${variant.mask})`,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
    };

    useEffect(() => {
        setHasImageLoadError(false);
    }, [coverImageUrl]);

    return (
        <Link
            href={`/trips/${trip.id}`}
            className={`group relative block h-[500px] min-w-[300px] snap-start transition-all duration-500 ease-out md:h-[535px] md:min-w-[330px] lg:h-[560px] lg:min-w-[355px] ${
                disableHoverTransform ? "" : "hover:-translate-y-3 hover:scale-110"
            } ${variant.transform}`}
            style={{
                filter: `drop-shadow(0 28px 70px ${accent}24)`,
            }}
        >
            <div
                className="pointer-events-none absolute inset-0 opacity-90"
                style={{
                    backgroundColor: accent,
                    boxShadow: `0 28px 90px ${accent}2E, inset 0 0 0 1.4px ${accent}88`,
                    ...maskStyle,
                }}
            />

            <div className="absolute inset-px overflow-hidden" style={maskStyle}>
                {coverImageUrl && !hasImageLoadError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={coverImageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover brightness-[0.88] contrast-[1.25] saturate-[1.45] transition duration-700 group-hover:scale-110 group-hover:brightness-100 group-hover:saturate-[1.65]"
                        onError={() => setHasImageLoadError(true)}
                    />
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(circle at 30% 20%, ${accent}66, transparent 36%), linear-gradient(145deg, #17051f, #05050c 58%, #0c0115)`,
                        }}
                    />
                )}

                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.16) 35%, rgba(0,0,0,0.88) 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 opacity-55"
                    style={{
                        background: `radial-gradient(circle at 24% 12%, ${accent}66, transparent 30%), linear-gradient(135deg, ${accent}2F, transparent 52%)`,
                        mixBlendMode: "overlay",
                    }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.55)_100%)]" />
            </div>

            <div
                className={`absolute z-20 flex h-16 w-16 flex-col items-center justify-center rounded-full text-slate-950 shadow-[0_0_34px_rgba(0,0,0,0.28)] transition duration-300 group-hover:scale-110 ${variant.daysCircleClass}`}
                style={{ backgroundColor: accent }}
            >
                <span className="text-xl font-black leading-none">
                    {days || "-"}
                </span>
                <span className="mt-0.5 text-[9px] font-black uppercase leading-none tracking-[0.08em]">
                    Days
                </span>
            </div>

            <div
                className={`absolute bottom-24 z-20 py-6 [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] ${variant.contentClass}`}
            >
                <h3
                    className={`font-black uppercase leading-[0.78] tracking-[-0.08em] ${
                        isLongName
                            ? "text-[3.4rem] md:text-[3.8rem] lg:text-[4.2rem]"
                            : "text-[4.2rem] md:text-[4.8rem] lg:text-[5.3rem]"
                    }`}
                    style={{ color: accent }}
                >
                    {primaryDestination}
                </h3>

                {secondLineDestinations.length > 0 ? (
                    <p
                        className="mt-2 whitespace-nowrap text-[2rem] font-black uppercase leading-none tracking-[-0.06em]"
                        style={{ color: accent }}
                    >
                        {formatDestinationPair(secondLineDestinations)}
                    </p>
                ) : null}

                {thirdLineDestinations.length > 0 ? (
                    <p
                        className="mt-1 whitespace-nowrap text-[2rem] font-black uppercase leading-none tracking-[-0.06em]"
                        style={{ color: accent }}
                    >
                        {formatDestinationPair(thirdLineDestinations)}
                    </p>
                ) : null}

                <p className={`mt-4 text-sm font-bold text-white/95 ${variant.dateClass}`}>
                    {formatTripDateRange(trip.start_date, trip.end_date)}
                </p>
            </div>

        </Link>
    );
}

function TripsGrid({
    trips,
    isGoogleReady,
    onEditTrip,
}: {
    trips: DashboardTrip[];
    isGoogleReady: boolean;
    onEditTrip: (trip: DashboardTrip) => void;
}) {
    if (trips.length === 0) {
        return (
            <div className="rounded-[2rem] border border-dashed border-white/20 bg-white/[0.03] p-8 text-center">
                <h3 className="text-lg font-medium text-white">No trips yet</h3>
                <p className="mt-2 text-sm text-slate-400">
                    Create your first VAIVIA trip to start planning.
                </p>
                <Link
                    href="/trips/new"
                    className="mt-5 inline-block rounded-full bg-lime-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                >
                    Create first trip
                </Link>
            </div>
        );
    }

    return (
        <section className="relative min-h-[620px] w-full overflow-hidden rounded-[2rem] bg-[#03030a] px-6 py-8 text-white md:px-8 md:py-9">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(255,54,190,0.24),transparent_24%),radial-gradient(circle_at_8%_88%,rgba(212,255,47,0.16),transparent_26%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%,rgba(0,0,0,0.3))]" />
            </div>

            <div className="relative z-10">
                <div className="relative z-20 mb-8 flex items-center justify-between gap-4">
                    <p className="text-xs font-bold uppercase tracking-[0.55em] text-white/80">
                        Upcoming Trips
                    </p>

                    <Link
                        href="/trips"
                        className="text-sm font-extrabold text-[#d7ff2f] transition hover:text-white"
                    >
                        See all trips →
                    </Link>
                </div>

                <div className="your-trips-scroll relative z-10 flex snap-x snap-mandatory items-start gap-12 overflow-x-auto px-2 pb-10 pt-6 [scrollbar-width:none] md:gap-14 md:overflow-visible xl:gap-20">
                    {trips.slice(0, 3).map((trip, index) => (
                        <div
                            key={trip.id}
                            className="relative transition-all duration-500 ease-out hover:-translate-y-3 hover:scale-110"
                        >
                            <DashboardTripCard
                                trip={trip}
                                index={index}
                                isGoogleReady={isGoogleReady}
                                disableHoverTransform
                            />
                            <button
                                type="button"
                                onClick={() => onEditTrip(trip)}
                                className={`absolute z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950 ${getEditButtonPosition(
                                    index
                                )}`}
                                aria-label={`Edit ${trip.title || "trip"}`}
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function DashboardMonthCalendar({ trips }: { trips: DashboardTrip[] }) {
    const [anchorDate, setAnchorDate] = useState(
        () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    );
    const upcomingTrips = useMemo(() => getUpcomingTrips(trips), [trips]);
    const todayKey = getLocalDateKey(new Date());

    const visibleDates = useMemo(() => {
        const monthGridStart = startOfMonthGrid(anchorDate);
        return Array.from({ length: 42 }, (_, index) =>
            addDays(monthGridStart, index)
        );
    }, [anchorDate]);
    const visibleWeeks = useMemo(
        () =>
            Array.from({ length: 6 }, (_, weekIndex) =>
                visibleDates.slice(weekIndex * 7, weekIndex * 7 + 7)
            ),
        [visibleDates]
    );

    function shiftBackward() {
        setAnchorDate(
            new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
        );
    }

    function shiftForward() {
        setAnchorDate(
            new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
        );
    }

    function returnToThisMonth() {
        const today = new Date();
        setAnchorDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }

    return (
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl lg:w-1/2">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">
                        Calendar
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                        {anchorDate.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                        })}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Upcoming trips by date
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={shiftBackward}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                        aria-label="Previous month"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={returnToThisMonth}
                        className="h-9 rounded-full bg-lime-300 px-4 text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(190,242,100,0.18)] transition hover:bg-lime-200"
                    >
                        This month
                    </button>
                    <button
                        type="button"
                        onClick={shiftForward}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                        aria-label="Next month"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                <div className="grid grid-cols-7 gap-px">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div
                        key={day}
                        className="bg-white/[0.05] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400"
                    >
                        {day}
                    </div>
                ))}
                </div>

                <div className="space-y-px">
                    {visibleWeeks.map((weekDates, weekIndex) => {
                        const segments = getWeekTripSegments(
                            weekDates,
                            upcomingTrips
                        );
                        const visibleSegments = segments.slice(0, 3);
                        const hiddenSegmentCount = Math.max(
                            0,
                            segments.length - visibleSegments.length
                        );

                        return (
                            <div
                                key={getLocalDateKey(weekDates[0])}
                                className="relative grid min-h-28 grid-cols-7 gap-px bg-white/10"
                            >
                                {weekDates.map((date) => {
                                    const dateKey = getLocalDateKey(date);
                                    const isCurrentMonth =
                                        date.getMonth() === anchorDate.getMonth();
                                    const isToday = dateKey === todayKey;

                                    return (
                                        <div
                                            key={dateKey}
                                            className={`bg-[#12051c] p-2 ${
                                                !isCurrentMonth ? "opacity-35" : ""
                                            }`}
                                        >
                                            <p
                                                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                                    isToday
                                                        ? "bg-lime-300 text-slate-950"
                                                        : "text-slate-300"
                                                }`}
                                            >
                                                {date.getDate()}
                                            </p>
                                        </div>
                                    );
                                })}

                                {visibleSegments.map((segment, segmentIndex) => {
                                    const accent = getTripAccent(
                                        trips,
                                        segment.trip
                                    );
                                    const leftPercent =
                                        (segment.startIndex / 7) * 100;
                                    const widthPercent =
                                        ((segment.endIndex -
                                            segment.startIndex +
                                            1) /
                                            7) *
                                        100;

                                    return (
                                        <Link
                                            key={`${segment.trip.id}-${weekIndex}`}
                                            href={`/trips/${segment.trip.id}`}
                                            className="absolute z-10 h-5 truncate px-2 text-[10px] font-black uppercase leading-5 text-slate-950 shadow-[0_0_16px_rgba(0,0,0,0.20)] transition hover:brightness-110"
                                            style={{
                                                left: `${leftPercent}%`,
                                                top: `${34 + segmentIndex * 23}px`,
                                                width: `${widthPercent}%`,
                                                backgroundColor: accent,
                                                borderRadius: "9999px",
                                            }}
                                            title={segment.trip.title}
                                        >
                                            {segment.trip.title}
                                        </Link>
                                    );
                                })}

                                {hiddenSegmentCount > 0 ? (
                                    <p className="absolute bottom-2 left-2 text-[10px] font-semibold text-slate-400">
                                        +{hiddenSegmentCount} more
                                    </p>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function QuickAddFan({ trips }: { trips: DashboardTrip[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [showTripPicker, setShowTripPicker] = useState(false);
    const [tripPickerLabel, setTripPickerLabel] = useState(
        "Choose a trip to add this item"
    );
    const quickAddRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                quickAddRef.current &&
                !quickAddRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setShowTripPicker(false);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [isOpen]);

    function openTripPicker(label: string) {
        setTripPickerLabel(label);
        setShowTripPicker(true);
    }

    const quickAddBubbleClass =
        "animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200";

    return (
        <div
            ref={quickAddRef}
            className="fixed bottom-6 right-6 z-40 flex flex-col items-end"
        >
            {isOpen && (
                <div className="mb-3 flex flex-col items-end gap-2">
                    {showTripPicker && (
                        <div className="w-72 rounded-[24px] border border-lime-300/20 bg-[#0c0115]/90 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                            <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-lime-200">
                                {tripPickerLabel}
                            </p>
                            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                                {trips.length > 0 ? (
                                    trips.map((trip, index) => (
                                        <Link
                                            key={trip.id}
                                            href={`/trips/${trip.id}`}
                                            className={quickAddBubbleClass}
                                            style={{
                                                animationDelay: `${index * 34}ms`,
                                            }}
                                        >
                                            {trip.title}
                                        </Link>
                                    ))
                                ) : (
                                    <p className="px-3 py-2 text-sm text-slate-400">
                                        Create a trip first.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <Link
                        href="/trips/new"
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "0ms" }}
                    >
                        Add trip
                    </Link>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for transportation")}
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "34ms" }}
                    >
                        Add transportation
                    </button>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for accommodation")}
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "68ms" }}
                    >
                        Add accommodation
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            openTripPicker("Choose a trip for food or restaurant")
                        }
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "102ms" }}
                    >
                        Add food or restaurant
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            openTripPicker("Choose a trip for scheduled activity/event")
                        }
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "136ms" }}
                    >
                        Add scheduled activity/event
                    </button>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for activity idea")}
                        className={quickAddBubbleClass}
                        style={{ animationDelay: "170ms" }}
                    >
                        Add activity idea
                    </button>
                </div>
            )}

            <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
                aria-label={isOpen ? "Close quick add menu" : "Open quick add menu"}
                aria-expanded={isOpen}
            >
                <span
                    className={`grid place-items-center transition-transform duration-300 ${
                        isOpen ? "-rotate-180" : "rotate-0"
                    }`}
                >
                    {isOpen ? (
                        <Minus className="h-6 w-6" aria-hidden="true" />
                    ) : (
                        <Plus className="h-6 w-6" aria-hidden="true" />
                    )}
                </span>
            </button>
        </div>
    );
}

export default function TripDashboardClient({
    trips,
    updateTripAction,
    deleteTripAction,
}: TripDashboardClientProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [selectedTrip, setSelectedTrip] = useState<DashboardTrip | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    useEffect(() => {
        if (!selectedTrip) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                requestCloseModal();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    });

    function closeModal() {
        setSelectedTrip(null);
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        setShowDeleteWarning(false);
    }

    function requestCloseModal() {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        closeModal();
    }

    function openEditModal(trip: DashboardTrip) {
        setSelectedTrip(trip);
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        setShowDeleteWarning(false);
    }

    function discardChangesAndClose() {
        closeModal();
    }

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <div className="space-y-8">
                <TripsGrid
                    trips={trips}
                    isGoogleReady={isGoogleReady}
                    onEditTrip={openEditModal}
                />
                <DashboardMonthCalendar trips={trips} />
            </div>

            <QuickAddFan trips={trips} />

            {selectedTrip && (
                <div
                    className="vaivia-modal-backdrop"
                    onClick={requestCloseModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="edit-trip-title"
                        className="vaivia-modal-panel max-w-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">
                                    Trip settings
                                </p>
                                <h2
                                    id="edit-trip-title"
                                    className="vaivia-modal-title"
                                >
                                    Edit trip
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={requestCloseModal}
                                className="vaivia-modal-close"
                                aria-label="Close edit trip"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form
                            ref={formRef}
                            action={updateTripAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className="vaivia-modal-body space-y-5"
                        >
                            <input type="hidden" name="trip_id" value={selectedTrip.id} />

                            <div>
                                <label
                                    htmlFor="tripEditTitle"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Trip title
                                </label>
                                <input
                                    id="tripEditTitle"
                                    name="title"
                                    type="text"
                                    required
                                    defaultValue={selectedTrip.title}
                                    placeholder="Berlin & Asia 2026"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    {...travelInputProps()}
                                />
                            </div>

                            <TripDestinationPicker
                                inputId="tripEditDestination"
                                tripId={selectedTrip.id}
                                initialDestination={selectedTrip.destination}
                                initialCoverImageUrl={
                                    selectedTrip.cover_image_url ||
                                    selectedTrip.trip_cover_image_url
                                }
                                onChange={() => setHasUnsavedChanges(true)}
                            />

                            <div className="grid gap-5 md:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="tripEditStartDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        Start date
                                    </label>
                                    <input
                                        id="tripEditStartDate"
                                        name="start_date"
                                        type="date"
                                        defaultValue={selectedTrip.start_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...travelInputProps()}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="tripEditEndDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        End date
                                    </label>
                                    <input
                                        id="tripEditEndDate"
                                        name="end_date"
                                        type="date"
                                        defaultValue={selectedTrip.end_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...travelInputProps()}
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="tripEditNotes"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Notes
                                </label>
                                <textarea
                                    id="tripEditNotes"
                                    name="notes"
                                    rows={4}
                                    defaultValue={selectedTrip.notes || ""}
                                    placeholder="Anything important about this trip..."
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteWarning(true)}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Delete
                                </button>

                                <button
                                    type="submit"
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCloseWarning && selectedTrip && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="unsaved-trip-title"
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="unsaved-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Save changes before leaving?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    You have unsaved changes in this trip.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowCloseWarning(false)}
                                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={discardChangesAndClose}
                                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => formRef.current?.requestSubmit()}
                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteWarning && selectedTrip && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowDeleteWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-trip-title"
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                                <Trash2 className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="delete-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Delete this trip?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This will delete the trip and its itinerary items. This
                                    cannot be undone.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowDeleteWarning(false)}
                                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <form action={deleteTripAction}>
                                <input
                                    type="hidden"
                                    name="trip_id"
                                    value={selectedTrip.id}
                                />
                                <button
                                    type="submit"
                                    className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 sm:w-auto"
                                >
                                    Delete trip
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
