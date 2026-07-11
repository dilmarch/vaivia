"use client";

import Link from "next/link";
import Script from "next/script";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Hotel,
    Pencil,
    Plane,
    Share2,
    Trash2,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import ShareTripModal from "@/components/ShareTripModal";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import { useTripCoverImage } from "@/components/TripCoverImage";

export type DashboardTrip = {
    id: string;
    user_id?: string | null;
    title: string;
    destination?: string | null;
    cover_image_url?: string | null;
    trip_cover_image_url?: string | null;
    countdown_target_type?: string | null;
    countdown_target_id?: string | null;
    countdown_target_itinerary_item_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
    memberProfiles?: {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
    }[];
    planning?: {
        accommodations?: {
            id: string;
            check_in_date: string | null;
            check_out_date: string | null;
            status?: string | null;
            city?: string | null;
            region?: string | null;
            country?: string | null;
        }[];
        transportation?: {
            id: string;
            departure_location?: string | null;
            arrival_location?: string | null;
            status?: string | null;
            title?: string | null;
            transport_type?: string | null;
        }[];
    };
};

type TripDashboardClientProps = {
    trips: DashboardTrip[];
    currentUserId?: string | null;
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
};

const fallbackAccentColors = [
    "var(--vaivia-neon-soft-solid)",
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

function getMemberDisplayName(
    member: NonNullable<DashboardTrip["memberProfiles"]>[number]
) {
    return (
        [member.first_name, member.last_name].filter(Boolean).join(" ").trim() ||
        member.username ||
        "Trip member"
    );
}

function getMemberInitials(
    member: NonNullable<DashboardTrip["memberProfiles"]>[number]
) {
    const displayName = getMemberDisplayName(member);
    return displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function getPrimaryDestinationFontSize(destination: string) {
    const characterCount = destination.trim().length;

    if (characterCount <= 5) {
        return "clamp(4.2rem, 16vw, 5.3rem)";
    }

    if (characterCount <= 7) {
        return "clamp(3.7rem, 13.5vw, 4.75rem)";
    }

    if (characterCount <= 9) {
        return "clamp(3.05rem, 11vw, 4rem)";
    }

    if (characterCount <= 12) {
        return "clamp(2.55rem, 9vw, 3.35rem)";
    }

    return "clamp(2.15rem, 7.5vw, 2.9rem)";
}

function getPrimaryDestinationLetterSpacing(destination: string) {
    const characterCount = destination.trim().length;

    if (characterCount <= 7) return "-0.08em";
    if (characterCount <= 12) return "-0.055em";
    return "-0.035em";
}

function TripMemberAvatarStack({
    members,
}: {
    members: NonNullable<DashboardTrip["memberProfiles"]>;
}) {
    const visibleMembers = members.slice(0, 4);
    const remainingCount = Math.max(members.length - visibleMembers.length, 0);

    if (members.length === 0) return null;

    return (
        <div
            className="absolute left-[6.85rem] top-8 z-20 flex items-center"
            aria-label={`${members.length} other ${
                members.length === 1 ? "person is" : "people are"
            } going on this trip`}
        >
            {visibleMembers.map((member, memberIndex) => (
                <span
                    key={member.id}
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#0c0115] bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.28)]"
                    style={{
                        marginLeft: memberIndex === 0 ? 0 : -10,
                        zIndex: visibleMembers.length - memberIndex,
                    }}
                    title={getMemberDisplayName(member)}
                >
                    {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={member.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        getMemberInitials(member)
                    )}
                </span>
            ))}
            {remainingCount > 0 ? (
                <span
                    className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0c0115] bg-[var(--vaivia-neon-soft-solid)] text-[10px] font-black text-slate-950 shadow-[0_0_24px_rgba(0,0,0,0.28)]"
                    style={{ marginLeft: -10 }}
                    title={`${remainingCount} more`}
                >
                    +{remainingCount}
                </span>
            ) : null}
        </div>
    );
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
    currentUserId,
    disableHoverTransform = false,
}: {
    trip: DashboardTrip;
    index: number;
    isGoogleReady: boolean;
    currentUserId?: string | null;
    disableHoverTransform?: boolean;
}) {
    const coverImageUrl = useTripCoverImage(trip, isGoogleReady);
    const [hasImageLoadError, setHasImageLoadError] = useState(false);
    const destinations = getTripDestinationNames(trip);
    const primaryDestination = destinations[0] ?? getPrimaryDestination(trip);
    const secondLineDestinations = destinations.slice(1, 3);
    const thirdLineDestinations = destinations.slice(3, 5);
    const days = getTripDays(trip.start_date, trip.end_date);
    const otherMemberProfiles = (trip.memberProfiles || []).filter(
        (member) => member.id !== currentUserId
    );
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

            <TripMemberAvatarStack members={otherMemberProfiles} />

            <div
                className={`absolute bottom-24 z-20 py-6 [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] ${variant.contentClass}`}
            >
                <h3
                    className="max-w-full overflow-visible font-black uppercase leading-[0.78] tracking-[-0.08em]"
                    style={{
                        color: accent,
                        fontSize: getPrimaryDestinationFontSize(primaryDestination),
                        letterSpacing:
                            getPrimaryDestinationLetterSpacing(primaryDestination),
                    }}
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
    currentUserId,
    onEditTrip,
    onShareTrip,
}: {
    trips: DashboardTrip[];
    isGoogleReady: boolean;
    currentUserId?: string | null;
    onEditTrip: (trip: DashboardTrip) => void;
    onShareTrip: (trip: DashboardTrip) => void;
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
                    className="mt-5 inline-block rounded-full bg-lime-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                >
                    Create first trip
                </Link>
            </div>
        );
    }

    return (
        <section className="relative min-h-[620px] w-full overflow-hidden rounded-[2rem] bg-[#03030a] px-6 py-8 text-white md:px-8 md:py-9">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(255,54,190,0.24),transparent_24%),radial-gradient(circle_at_8%_88%,rgba(var(--vaivia-neon-soft-rgb),0.16),transparent_26%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%,rgba(0,0,0,0.3))]" />
            </div>

            <div className="relative z-10">
                <div className="relative z-20 mb-8 flex items-center justify-between gap-4">
                    <p className="text-xs font-bold uppercase tracking-[0.55em] text-white/80">
                        Upcoming Trips
                    </p>

                    <Link
                        href="/trips"
                        className="text-sm font-extrabold text-[var(--vaivia-neon-soft-solid)] transition hover:text-white"
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
                                currentUserId={currentUserId}
                                disableHoverTransform
                            />
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onEditTrip(trip);
                                }}
                                className={`absolute z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950 ${getEditButtonPosition(
                                    index
                                )}`}
                                aria-label={`Edit ${trip.title || "trip"}`}
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onShareTrip(trip);
                                }}
                                className={`absolute z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 text-slate-100 shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-white/15 ${
                                    index % 3 === 1
                                        ? "bottom-9 left-[6.8rem]"
                                        : "bottom-10 right-[7.3rem]"
                                }`}
                                aria-label={`Share ${trip.title || "trip"}`}
                            >
                                <Share2 className="h-4 w-4" aria-hidden="true" />
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
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
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
                        className="h-9 rounded-full bg-lime-300 px-4 text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
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

type DashboardTask = {
    id: string;
    tripId: string;
    tripTitle: string;
    title: string;
    detail: string;
    href: string;
    type: "accommodation" | "transportation";
};

function normalizeDashboardText(value?: string | null) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function getDateRangeGap(
    tripStartDate?: string | null,
    tripEndDate?: string | null,
    accommodations: NonNullable<DashboardTrip["planning"]>["accommodations"] = []
) {
    const start = parseTripPlainDate(tripStartDate);
    const end = parseTripPlainDate(tripEndDate || tripStartDate);

    if (!start || !end) return null;

    const activeStays = accommodations
        .filter((stay) => stay.status !== "cancelled")
        .map((stay) => ({
            start: parseTripPlainDate(stay.check_in_date),
            end: parseTripPlainDate(stay.check_out_date),
        }))
        .filter(
            (
                stay
            ): stay is {
                start: Date;
                end: Date;
            } => Boolean(stay.start && stay.end)
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (activeStays.length === 0) {
        return { start, end };
    }

    const cursor = new Date(start);

    for (const stay of activeStays) {
        const stayStart = new Date(Math.max(stay.start.getTime(), start.getTime()));
        const stayEnd = new Date(Math.min(stay.end.getTime(), end.getTime()));

        if (stayEnd <= start || stayStart > end) continue;

        if (stayStart > cursor) {
            return { start: cursor, end: addDays(stayStart, -1) };
        }

        if (stayEnd > cursor) {
            cursor.setTime(stayEnd.getTime());
        }

        if (cursor > end) return null;
    }

    if (cursor <= end) {
        return { start: cursor, end };
    }

    return null;
}

function formatTaskDateRange(start: Date, end: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    });

    if (getLocalDateKey(start) === getLocalDateKey(end)) {
        return formatter.format(start);
    }

    return `${formatter.format(start)}-${formatter.format(end)}`;
}

function getMissingTransportationDestinations(trip: DashboardTrip) {
    const destinations = getTripDestinationNames(trip);
    const transportationText = (trip.planning?.transportation || [])
        .filter((item) => item.status !== "cancelled")
        .map((item) =>
            [
                item.title,
                item.departure_location,
                item.arrival_location,
                item.transport_type,
            ].join(" ")
        )
        .join(" ")
        .toLowerCase();
    const normalizedTransportationText = normalizeDashboardText(transportationText);

    return destinations.filter((destination) => {
        const normalizedDestination = normalizeDashboardText(destination);
        if (!normalizedDestination) return false;

        return !normalizedTransportationText.includes(normalizedDestination);
    });
}

function getDashboardTasks(trips: DashboardTrip[]) {
    const upcomingTrips = getUpcomingTrips(trips);
    const tasks: DashboardTask[] = [];

    upcomingTrips.forEach((trip) => {
        const tripTitle = trip.title || getPrimaryDestination(trip);
        const accommodations = trip.planning?.accommodations || [];
        const accommodationGap = getDateRangeGap(
            trip.start_date,
            trip.end_date,
            accommodations
        );

        if (accommodationGap) {
            tasks.push({
                id: `${trip.id}-accommodation-gap`,
                tripId: trip.id,
                tripTitle,
                type: "accommodation",
                title:
                    accommodations.length === 0
                        ? "Add accommodations"
                        : "Finish accommodation coverage",
                detail:
                    accommodations.length === 0
                        ? `${tripTitle} has no accommodations added yet.`
                        : `You still need somewhere to stay for ${formatTaskDateRange(
                              accommodationGap.start,
                              accommodationGap.end
                          )}.`,
                href: `/trips/${trip.id}/accommodations`,
            });
        }

        getMissingTransportationDestinations(trip)
            .slice(0, 3)
            .forEach((destination) => {
                tasks.push({
                    id: `${trip.id}-transportation-${destination}`,
                    tripId: trip.id,
                    tripTitle,
                    type: "transportation",
                    title: `No transportation booked to ${destination}`,
                    detail: `Add flight, train, car, or transfer details for ${tripTitle}.`,
                    href: `/trips/${trip.id}?tab=journey`,
                });
            });
    });

    return tasks.slice(0, 8);
}

function DashboardTaskList({ trips }: { trips: DashboardTrip[] }) {
    const tasks = useMemo(() => getDashboardTasks(trips), [trips]);

    return (
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">
                        Tasks
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                        Planning checklist
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Gaps disappear here once they are handled.
                    </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-lime-300/20 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.12)]">
                    {tasks.length}
                </div>
            </div>

            {tasks.length === 0 ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]">
                            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-white">
                                No planning gaps found
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                                Your upcoming trips have the basics covered.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map((task) => {
                        const Icon =
                            task.type === "accommodation" ? Hotel : Plane;

                        return (
                            <Link
                                key={task.id}
                                href={task.href}
                                className="group flex gap-3 rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/[0.08]"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-lime-200 transition group-hover:border-lime-300/40 group-hover:bg-lime-300 group-hover:text-slate-950">
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-black text-white">
                                        {task.title}
                                    </span>
                                    <span className="mt-1 block text-sm leading-5 text-slate-400">
                                        {task.detail}
                                    </span>
                                    <span className="mt-2 block truncate text-xs font-bold uppercase tracking-[0.16em] text-lime-200/80">
                                        {task.tripTitle}
                                    </span>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

export default function TripDashboardClient({
    trips,
    currentUserId,
    updateTripAction,
    deleteTripAction,
}: TripDashboardClientProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [selectedTrip, setSelectedTrip] = useState<DashboardTrip | null>(null);
    const [shareTrip, setShareTrip] = useState<DashboardTrip | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    function closeModal() {
        setSelectedTrip(null);
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        setShowDeleteWarning(false);
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
                    currentUserId={currentUserId}
                    onEditTrip={openEditModal}
                    onShareTrip={setShareTrip}
                />
                <div className="grid gap-6 lg:grid-cols-2">
                    <DashboardMonthCalendar trips={trips} />
                    <DashboardTaskList trips={trips} />
                </div>
            </div>

            <ShareTripModal
                tripId={shareTrip?.id || ""}
                tripTitle={shareTrip?.title}
                open={Boolean(shareTrip)}
                onOpenChange={(open) => {
                    if (!open) setShareTrip(null);
                }}
            />

            {selectedTrip && (
                <AnimatedModal
                    onClose={closeModal}
                    onRequestClose={(close) => {
                        if (hasUnsavedChanges) {
                            setShowCloseWarning(true);
                            return;
                        }
                        close();
                    }}
                    panelClassName="max-w-2xl"
                    labelledBy="edit-trip-title"
                >
                    {({ requestClose }) => (
                        <>
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
                                onClick={() => {
                                    if (hasUnsavedChanges) {
                                        setShowCloseWarning(true);
                                        return;
                                    }
                                    requestClose();
                                }}
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
                        </>
                    )}
                </AnimatedModal>
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
