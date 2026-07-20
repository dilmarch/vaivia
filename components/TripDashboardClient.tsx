"use client";

import Link from "next/link";
import Script from "next/script";
import {
    AlertTriangle,
    Archive,
    CheckCircle2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Hotel,
    Info,
    Pencil,
    Plane,
    Share2,
    Stamp,
    UserRound,
    Wand2,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import PassportStampCard from "@/components/PassportStamp";
import ShareTripModal from "@/components/ShareTripModal";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import { DateRangeInputs } from "@/components/ui/date-range-inputs";
import { useTripCoverImage } from "@/components/TripCoverImage";
import {
    getTripHref,
    getTripItineraryHref,
    sanitizeTripSlugInput,
    slugifyTripTitle,
} from "@/lib/tripRoutes";

export type DashboardTrip = {
    id: string;
    slug?: string | null;
    user_id?: string | null;
    title: string;
    destination?: string | null;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
    trip_cover_image_url?: string | null;
    countdown_target_type?: string | null;
    countdown_target_id?: string | null;
    countdown_target_itinerary_item_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    viewerTripMemberId?: string | null;
    viewerAssignedLegCount?: number;
    viewerStartDate?: string | null;
    viewerEndDate?: string | null;
    archived_at?: string | null;
    archived_reason?: string | null;
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

export type DashboardPassportStamp = {
    id: string;
    countryCode: string;
    countryName: string;
    flagEmoji?: string | null;
    firstVisitYear?: string | null;
    welcomeLabel?: string | null;
    airportCode?: string | null;
    airportCity?: string | null;
    portOfEntryName?: string | null;
};

export type DashboardProfileSummary = {
    name: string;
    username?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
};

export type DashboardWishlistItem = {
    id: string;
    placeLabel: string;
    city?: string | null;
    region?: string | null;
    countryName?: string | null;
    flagEmoji?: string | null;
    status: "in_progress" | "completed";
    completedAt?: string | null;
};

export type DashboardEvent = {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    timezone: string;
    venue: string;
    status: string;
    admissionType: "Ticket" | "RSVP";
};

type TripDashboardClientProps = {
    trips: DashboardTrip[];
    passportStamps: DashboardPassportStamp[];
    profile: DashboardProfileSummary;
    wishlistItems: DashboardWishlistItem[];
    currentUserId?: string | null;
    events: DashboardEvent[];
    canManageEvents: boolean;
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
};

function DashboardEventsWidget({ events, canManageEvents }: { events: DashboardEvent[]; canManageEvents: boolean }) {
    return (
        <section className="rounded-[2rem] border border-white/10 bg-[#080511]/90 p-5 shadow-2xl shadow-black/25 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-[0.3em] text-lime-300">My Events</p><h2 className="mt-2 text-2xl font-black text-white">Next on the guest list</h2></div>
                <div className="flex gap-3"><Link href="/my-events" className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white">View all</Link>{canManageEvents ? <Link href="/organizer/events" className="rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950">Manage events</Link> : null}</div>
            </div>
            {events.length ? <div className="mt-5 grid gap-3 md:grid-cols-3">{events.slice(0, 3).map((event) => <Link key={`${event.admissionType}-${event.id}`} href="/my-events" className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 transition hover:border-lime-300/30"><CalendarDays className="h-5 w-5 text-lime-300" /><h3 className="mt-3 line-clamp-2 text-lg font-black text-white">{event.title}</h3><p className="mt-2 text-xs font-semibold text-slate-400">{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))}</p><p className="mt-1 truncate text-xs font-semibold text-slate-400">{event.venue}</p><span className="mt-3 inline-flex rounded-full bg-lime-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-lime-200">{event.admissionType} · {event.status.replace("_", " ")}</span></Link>)}</div> : <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 p-5"><p className="text-sm font-semibold text-slate-400">No upcoming events yet.</p><Link href="/events" className="mt-3 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950">Browse events</Link></div>}
        </section>
    );
}

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

type TripCardImageTone = "dark" | "light";

function detectImageTone(src: string): Promise<TripCardImageTone> {
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.decoding = "async";

        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", {
                    willReadFrequently: true,
                });

                if (!context) {
                    resolve("dark");
                    return;
                }

                const sampleWidth = 24;
                const sampleHeight = 24;
                canvas.width = sampleWidth;
                canvas.height = sampleHeight;
                context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

                const lowerHalf = context.getImageData(
                    0,
                    Math.floor(sampleHeight * 0.45),
                    sampleWidth,
                    Math.ceil(sampleHeight * 0.55)
                ).data;
                let luminanceTotal = 0;
                let pixelCount = 0;

                for (let index = 0; index < lowerHalf.length; index += 4) {
                    const alpha = lowerHalf[index + 3] / 255;
                    const red = lowerHalf[index] * alpha + 255 * (1 - alpha);
                    const green = lowerHalf[index + 1] * alpha + 255 * (1 - alpha);
                    const blue = lowerHalf[index + 2] * alpha + 255 * (1 - alpha);

                    luminanceTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
                    pixelCount += 1;
                }

                const averageLuminance = pixelCount
                    ? luminanceTotal / pixelCount
                    : 0;
                resolve(averageLuminance > 145 ? "light" : "dark");
            } catch {
                resolve("dark");
            }
        };

        image.onerror = () => resolve("dark");
        image.src = src;
    });
}

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getTripActionClusterPosition(index: number) {
    return index % 3 === 1 ? "bottom-9 left-14" : "bottom-10 right-5";
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
        const displayDateRange = getTripDisplayDateRange(trip);
        const endDate =
            displayDateRange.endDate || displayDateRange.startDate || trip.end_date || trip.start_date;
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

function getTripDisplayDateRange(trip: DashboardTrip) {
    const hasOtherMembers = Boolean(trip.memberProfiles?.length);

    if ((trip.viewerAssignedLegCount || 0) > 0) {
        return {
            startDate: trip.viewerStartDate || null,
            endDate: trip.viewerEndDate || trip.viewerStartDate || null,
            hasAssignedLegs: true,
        };
    }

    if (hasOtherMembers && trip.viewerTripMemberId) {
        return {
            startDate: null,
            endDate: null,
            hasAssignedLegs: false,
        };
    }

    return {
        startDate: trip.start_date || null,
        endDate: trip.end_date || trip.start_date || null,
        hasAssignedLegs: false,
    };
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

function useOpensTripOverviewByDefault() {
    const [opensOverview, setOpensOverview] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 767px)");
        const sync = () => setOpensOverview(mediaQuery.matches);

        sync();
        mediaQuery.addEventListener("change", sync);
        return () => mediaQuery.removeEventListener("change", sync);
    }, []);

    return opensOverview;
}

function getDefaultTripOpenHref(trip: DashboardTrip, opensOverview: boolean) {
    return opensOverview ? getTripHref(trip) : getTripItineraryHref(trip);
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
            const displayDateRange = getTripDisplayDateRange(trip);
            if (!displayDateRange.startDate) return null;

            const tripStartKey = displayDateRange.startDate;
            const tripEndKey =
                displayDateRange.endDate || displayDateRange.startDate;

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
    const displayDateRange = getTripDisplayDateRange(trip);
    const days = getTripDays(
        displayDateRange.startDate,
        displayDateRange.endDate
    );
    const [imageTone, setImageTone] = useState<TripCardImageTone>("dark");
    const otherMemberProfiles = (trip.memberProfiles || []).filter(
        (member) => member.id !== currentUserId
    );
    const opensOverview = useOpensTripOverviewByDefault();
    const openTripHref = getDefaultTripOpenHref(trip, opensOverview);
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
        setImageTone("dark");
    }, [coverImageUrl]);

    useEffect(() => {
        let isActive = true;

        if (!coverImageUrl || hasImageLoadError) {
            setImageTone("dark");
            return;
        }

        detectImageTone(coverImageUrl).then((tone) => {
            if (isActive) {
                setImageTone(tone);
            }
        });

        return () => {
            isActive = false;
        };
    }, [coverImageUrl, hasImageLoadError]);

    return (
        <article
            data-image-tone={imageTone}
            className={`vaivia-trip-card group relative block h-[500px] min-w-[300px] snap-start transition-all duration-500 ease-out md:h-[535px] md:min-w-[330px] lg:h-[560px] lg:min-w-[355px] ${
                disableHoverTransform ? "" : "hover:-translate-y-3 hover:scale-110"
            } ${variant.transform}`}
            style={{
                filter: `drop-shadow(0 28px 70px ${accent}24)`,
            }}
        >
            <Link
                href={openTripHref}
                className="absolute inset-0 block"
                aria-label={`Open ${trip.title || "trip"}`}
            >
                <div
                    className="vaivia-trip-card-accent pointer-events-none absolute inset-0 opacity-90"
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
                            className="vaivia-trip-card-image absolute inset-0 h-full w-full object-cover brightness-[0.88] contrast-[1.25] saturate-[1.45] transition duration-700 group-hover:scale-110 group-hover:brightness-100 group-hover:saturate-[1.65]"
                            onError={() => setHasImageLoadError(true)}
                        />
                    ) : (
                        <div
                            className="vaivia-trip-card-fallback-bg absolute inset-0"
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
                        className="vaivia-trip-card-color-wash absolute inset-0 opacity-55"
                        style={{
                            background: `radial-gradient(circle at 24% 12%, ${accent}66, transparent 30%), linear-gradient(135deg, ${accent}2F, transparent 52%)`,
                            mixBlendMode: "overlay",
                        }}
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.55)_100%)]" />
                </div>

                <div
                    className={`vaivia-trip-card-duration absolute z-20 flex h-20 w-20 flex-col items-center justify-center rounded-full text-slate-950 shadow-[0_0_34px_rgba(0,0,0,0.28)] transition duration-300 group-hover:scale-110 sm:h-16 sm:w-16 ${variant.daysCircleClass}`}
                    style={{ backgroundColor: accent }}
                >
                    <span className="text-xl font-black leading-none">
                        {days || "-"}
                    </span>
                    <span className="mt-1 flex flex-col items-center text-[9px] font-black uppercase leading-[0.92] tracking-[0.08em] sm:mt-0.5 sm:text-[8px]">
                        <span>Day</span>
                        <span>Duration</span>
                    </span>
                </div>

                <TripMemberAvatarStack members={otherMemberProfiles} />

                <div
                    className={`vaivia-trip-card-copy absolute bottom-24 z-20 py-6 [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] ${variant.contentClass}`}
                >
                    <h3
                        className="vaivia-trip-card-title max-w-full overflow-visible font-black uppercase leading-[0.78] tracking-[-0.08em]"
                        style={{
                            color: accent,
                            fontSize:
                                getPrimaryDestinationFontSize(primaryDestination),
                            letterSpacing:
                                getPrimaryDestinationLetterSpacing(
                                    primaryDestination
                                ),
                        }}
                    >
                        {primaryDestination}
                    </h3>

                    {secondLineDestinations.length > 0 ? (
                        <p
                            className="vaivia-trip-card-title mt-2 whitespace-nowrap text-[2rem] font-black uppercase leading-none tracking-[-0.06em]"
                            style={{ color: accent }}
                        >
                            {formatDestinationPair(secondLineDestinations)}
                        </p>
                    ) : null}

                    {thirdLineDestinations.length > 0 ? (
                        <p
                            className="vaivia-trip-card-title mt-1 whitespace-nowrap text-[2rem] font-black uppercase leading-none tracking-[-0.06em]"
                            style={{ color: accent }}
                        >
                            {formatDestinationPair(thirdLineDestinations)}
                        </p>
                    ) : null}

                    <p
                        className={`vaivia-trip-card-date mt-4 text-sm font-bold text-white/95 ${variant.dateClass}`}
                    >
                        {displayDateRange.startDate
                            ? formatTripDateRange(
                                  displayDateRange.startDate,
                                  displayDateRange.endDate
                              )
                            : "Add a leg"}
                    </p>
                </div>
            </Link>
        </article>
    );
}

export function TripQuickInfoPanel({
    trip,
    onClose,
}: {
    trip: DashboardTrip;
    onClose: () => void;
}) {
    const destinations = getTripDestinationNames(trip);
    const primaryDestination = destinations[0] ?? getPrimaryDestination(trip);
    const transportationSummary = getTripTransportationSummary(trip);
    const accommodationSummary = getTripAccommodationSummary(trip);
    const displayDateRange = getTripDisplayDateRange(trip);
    const opensOverview = useOpensTripOverviewByDefault();
    const openTripHref = getDefaultTripOpenHref(trip, opensOverview);

    return (
        <div className="mt-4 w-[300px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/85 text-white shadow-2xl shadow-black/40 backdrop-blur-xl md:w-[330px] lg:w-[355px]">
            <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200">
                            Quick info
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-lg font-black leading-tight">
                            {trip.title || primaryDestination}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-300">
                            {displayDateRange.startDate
                                ? formatTripDateRange(
                                      displayDateRange.startDate,
                                      displayDateRange.endDate
                                  )
                                : "Add a leg"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                        aria-label={`Close quick info for ${trip.title || "trip"}`}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="grid gap-3">
                    <TripSummaryRow
                        icon={<Plane className="h-4 w-4" aria-hidden="true" />}
                        label="Transport"
                        value={transportationSummary}
                    />
                    <TripSummaryRow
                        icon={<Hotel className="h-4 w-4" aria-hidden="true" />}
                        label="Hotels"
                        value={accommodationSummary}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
                    >
                        Close
                    </button>
                    <Link
                        href={openTripHref}
                        className="rounded-full bg-lime-300 px-3 py-2 text-center text-xs font-black text-slate-950 transition hover:bg-lime-200"
                    >
                        Visit trip
                    </Link>
                </div>
            </div>
        </div>
    );
}

function TripSummaryRow({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-2 text-lime-200">
                {icon}
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                    {label}
                </p>
            </div>
            <p className="mt-2 line-clamp-3 text-sm font-bold leading-5 text-white">
                {value}
            </p>
        </div>
    );
}

function titleCase(value: string) {
    return value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPlacePair(start?: string | null, end?: string | null) {
    const departure = start?.trim();
    const arrival = end?.trim();

    if (departure && arrival) return `${departure} > ${arrival}`;
    return departure || arrival || "";
}

function getTripTransportationSummary(trip: DashboardTrip) {
    const items = trip.planning?.transportation || [];
    const bookedItems = items.filter((item) =>
        /book|confirm|ticket/i.test(item.status || "")
    );
    const priorityItems = bookedItems.length > 0 ? bookedItems : items;

    if (priorityItems.length === 0) return "No transport saved yet.";

    return priorityItems
        .slice(0, 2)
        .map((item) => {
            const type = titleCase(item.transport_type || "Transport");
            const route = formatPlacePair(
                item.departure_location,
                item.arrival_location
            );
            const status = item.status ? ` (${titleCase(item.status)})` : "";
            return `${type}${route ? `: ${route}` : ""}${status}`;
        })
        .join(" • ");
}

function getTripAccommodationSummary(trip: DashboardTrip) {
    const stays = trip.planning?.accommodations || [];
    const bookedStays = stays.filter((stay) =>
        /book|confirm|reserved/i.test(stay.status || "")
    );
    const priorityStays = bookedStays.length > 0 ? bookedStays : stays;

    if (priorityStays.length === 0) return "No hotels saved yet.";

    return priorityStays
        .slice(0, 2)
        .map((stay) => {
            const place = [stay.city, stay.region, stay.country]
                .filter(Boolean)
                .join(", ");
            const dateRange =
                stay.check_in_date || stay.check_out_date
                    ? formatTripDateRange(stay.check_in_date, stay.check_out_date)
                    : "";
            const status = stay.status ? ` (${titleCase(stay.status)})` : "";
            return `${place || "Stay"}${dateRange ? `, ${dateRange}` : ""}${status}`;
        })
        .join(" • ");
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
    const [summaryTripId, setSummaryTripId] = useState<string | null>(null);

    useEffect(() => {
        if (!summaryTripId) return;

        function closeOnOutsideClick(event: MouseEvent) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("[data-trip-card-shell]")) return;
            setSummaryTripId(null);
        }

        document.addEventListener("mousedown", closeOnOutsideClick);

        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [summaryTripId]);

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
        <section
            data-vaivia-mobile-tour-target="home-trips-widget"
            className="relative min-h-[620px] w-full overflow-hidden rounded-[2rem] bg-[#03030a] px-6 py-8 text-white md:px-8 md:py-9"
        >
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
                            data-trip-card-shell
                            className="relative transition-all duration-500 ease-out hover:-translate-y-3 hover:scale-110"
                        >
                            <DashboardTripCard
                                trip={trip}
                                index={index}
                                isGoogleReady={isGoogleReady}
                                currentUserId={currentUserId}
                                disableHoverTransform
                            />
                            <div
                                className={`absolute z-30 flex items-center gap-2 ${getTripActionClusterPosition(
                                    index
                                )}`}
                            >
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onEditTrip(trip);
                                    }}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                                    aria-label={`Edit ${trip.title || "trip"}`}
                                >
                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setSummaryTripId((current) =>
                                            current === trip.id ? null : trip.id
                                        );
                                    }}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                                    aria-label={`Show quick info for ${trip.title || "trip"}`}
                                    aria-pressed={summaryTripId === trip.id}
                                >
                                    <Info className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onShareTrip(trip);
                                    }}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                                    aria-label={`Share ${trip.title || "trip"}`}
                                >
                                    <Share2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            {summaryTripId === trip.id ? (
                                <TripQuickInfoPanel
                                    trip={trip}
                                    onClose={() => setSummaryTripId(null)}
                                />
                            ) : null}
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
    const opensOverview = useOpensTripOverviewByDefault();

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
        <section
            data-vaivia-mobile-tour-target="home-calendar"
            className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
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
                                            href={getDefaultTripOpenHref(
                                                segment.trip,
                                                opensOverview
                                            )}
                                            className="absolute z-10 flex h-5 items-center truncate px-2 text-[10px] font-black uppercase leading-none text-slate-950 shadow-[0_0_16px_rgba(0,0,0,0.20)] transition hover:brightness-110"
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

type DashboardDateGap = {
    start: Date;
    end: Date;
};

function getDateRangeGaps(
    tripStartDate?: string | null,
    tripEndDate?: string | null,
    accommodations: NonNullable<DashboardTrip["planning"]>["accommodations"] = []
): DashboardDateGap[] {
    const start = parseTripPlainDate(tripStartDate);
    const returnDate = parseTripPlainDate(tripEndDate || tripStartDate);

    if (!start || !returnDate || returnDate <= start) return [];

    const lastRequiredNight = addDays(returnDate, -1);

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
        return [{ start, end: lastRequiredNight }];
    }

    const cursor = new Date(start);
    const gaps: DashboardDateGap[] = [];

    for (const stay of activeStays) {
        const stayStart = new Date(Math.max(stay.start.getTime(), start.getTime()));
        const stayEnd = new Date(Math.min(stay.end.getTime(), returnDate.getTime()));

        if (stayEnd <= start || stayStart >= returnDate) continue;

        if (stayStart > cursor) {
            gaps.push({
                start: new Date(cursor),
                end: addDays(stayStart, -1),
            });
        }

        if (stayEnd > cursor) {
            cursor.setTime(stayEnd.getTime());
        }

        if (cursor >= returnDate) return gaps;
    }

    if (cursor < returnDate) {
        gaps.push({ start: new Date(cursor), end: lastRequiredNight });
    }

    return gaps;
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

function formatTaskDateRanges(gaps: DashboardDateGap[]) {
    const labels = gaps.map((gap) => formatTaskDateRange(gap.start, gap.end));

    if (labels.length <= 1) return labels[0] || "";
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

    return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
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
        const displayDateRange = getTripDisplayDateRange(trip);
        const accommodationGaps = getDateRangeGaps(
            displayDateRange.startDate,
            displayDateRange.endDate,
            accommodations
        );

        if (accommodationGaps.length > 0) {
            tasks.push({
                id: `${trip.id}-accommodation-gap`,
                tripId: trip.id,
                tripTitle,
                type: "accommodation",
                title:
                    accommodations.length === 0
                        ? "Add stays"
                        : "Finish stay coverage",
                detail:
                    accommodations.length === 0
                        ? `${tripTitle} has no stays added yet. You need somewhere to stay for ${formatTaskDateRanges(
                              accommodationGaps
                          )}.`
                        : `You still need somewhere to stay for ${formatTaskDateRanges(
                              accommodationGaps
                          )}.`,
                href: getTripHref(trip, "/accommodations"),
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
                    href: getTripHref(trip, "?tab=journey"),
                });
            });
    });

    return tasks.slice(0, 8);
}

function DashboardTaskList({ trips }: { trips: DashboardTrip[] }) {
    const tasks = useMemo(() => getDashboardTasks(trips), [trips]);

    return (
        <section
            data-vaivia-mobile-tour-target="home-tasks"
            className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
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

function DashboardPassportStampsWidget({
    passportStamps,
}: {
    passportStamps: DashboardPassportStamp[];
}) {
    const recentStamps = passportStamps.slice(0, 4);
    const visibleStampCountLabel = passportStamps.length >= 4 ? "a few" : recentStamps.length;

    return (
        <section className="flex h-full w-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">
                        Passport stamps
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                        Places visited
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Add all the places you have visited and keep them close.
                    </p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]">
                    <Stamp className="h-5 w-5" aria-hidden="true" />
                </span>
            </div>

            {recentStamps.length > 0 ? (
                <div className="flex flex-1 flex-col">
                    <div className="mt-5 grid flex-1 grid-cols-2 content-center justify-items-center gap-3">
                        {recentStamps.map((stamp, index) => (
                            <div
                                key={stamp.id}
                                className={index > 1 ? "hidden xl:block" : ""}
                            >
                                <PassportStampCard
                                    countryName={stamp.countryName}
                                    countryCode={stamp.countryCode}
                                    flagEmoji={stamp.flagEmoji}
                                    firstVisitYear={stamp.firstVisitYear}
                                    welcomeLabel={stamp.welcomeLabel}
                                    airportCode={stamp.airportCode}
                                    airportCity={stamp.airportCity}
                                    portOfEntryLabel={stamp.portOfEntryName}
                                    size="sm"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                        <p className="text-xs font-semibold text-slate-400">
                            Showing {visibleStampCountLabel} from your passport wall.
                        </p>
                        <Link
                            href="/profile#passport-stamps"
                            className="inline-flex items-center self-center rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                        >
                            See all passports
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="mt-5 rounded-[1.5rem] border border-lime-300/20 bg-lime-300/[0.08] p-4">
                    <p className="text-sm font-black text-lime-100">
                        Your passport wall is waiting.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                        Start with one country, city, or port of entry and VAIVIA
                        will keep your stamps together on your profile.
                    </p>
                    <Link
                        href="/profile#passport-stamps"
                        className="mt-4 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                    >
                        Add passport stamps
                    </Link>
                </div>
            )}
        </section>
    );
}

function DashboardProfileWidget({
    profile,
    passportCount,
    wishlistCount,
}: {
    profile: DashboardProfileSummary;
    passportCount: number;
    wishlistCount: number;
}) {
    const initials = profile.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-lime-300/25 bg-slate-950 text-lg font-black text-lime-200 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.16)]">
                        {profile.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={profile.avatarUrl}
                                alt=""
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            initials || "V"
                        )}
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">
                            Profile
                        </p>
                        <h2 className="mt-2 truncate text-2xl font-black text-white">
                            {profile.name}
                        </h2>
                        <p className="mt-1 truncate text-sm text-slate-400">
                            {profile.username ? `@${profile.username}` : profile.email}
                        </p>
                    </div>
                </div>
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)] sm:flex">
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4">
                    <p className="text-2xl font-black text-white">{passportCount}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        Passport stamps
                    </p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4">
                    <p className="text-2xl font-black text-white">{wishlistCount}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        Wishlist places
                    </p>
                </div>
            </div>

            <Link
                href="/profile"
                className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-lime-300 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
            >
                Open profile
            </Link>
        </section>
    );
}

function DashboardWishlistWidget({
    wishlistItems,
}: {
    wishlistItems: DashboardWishlistItem[];
}) {
    const inProgressItems = wishlistItems.filter(
        (item) => item.status === "in_progress"
    );
    const completedItems = wishlistItems.filter((item) => item.status === "completed");
    const visibleItems = inProgressItems.slice(0, 4);

    return (
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">
                        Travel wishlist
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                        Places calling
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Keep dream destinations close to the trips you are planning.
                    </p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]">
                    <Wand2 className="h-5 w-5" aria-hidden="true" />
                </span>
            </div>

            {visibleItems.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {visibleItems.map((item) => (
                        <Link
                            key={item.id}
                            href="/profile#bucket-list"
                            className="group flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-[#03030a]/70 p-3 transition hover:border-lime-300/30 hover:bg-white/[0.08]"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lime-300/20 bg-lime-300/10 text-2xl">
                                {item.flagEmoji || "✦"}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-black text-white">
                                    {item.placeLabel}
                                </span>
                                <span className="mt-1 block truncate text-xs font-semibold text-slate-400">
                                    {[item.city, item.region, item.countryName]
                                        .filter(Boolean)
                                        .join(", ") || "Wishlist place"}
                                </span>
                            </span>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="mt-5 rounded-[1.5rem] border border-lime-300/20 bg-lime-300/[0.08] p-4">
                    <p className="text-sm font-black text-lime-100">
                        Your future map is wide open.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                        Add cities, regions, or countries you want to visit and
                        VAIVIA will keep them on your profile.
                    </p>
                </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold text-slate-400">
                    {inProgressItems.length} in progress · {completedItems.length} completed
                </p>
                <Link
                    href="/profile#bucket-list"
                    className="inline-flex items-center rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                >
                    See wishlist
                </Link>
            </div>
        </section>
    );
}

export default function TripDashboardClient({
    trips,
    passportStamps,
    profile,
    wishlistItems,
    currentUserId,
    events,
    canManageEvents,
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
                <DashboardEventsWidget events={events} canManageEvents={canManageEvents} />
                <div className="grid gap-6 lg:grid-cols-3">
                    <DashboardMonthCalendar trips={trips} />
                    <DashboardTaskList trips={trips} />
                    <DashboardPassportStampsWidget passportStamps={passportStamps} />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                    <DashboardProfileWidget
                        profile={profile}
                        passportCount={passportStamps.length}
                        wishlistCount={wishlistItems.length}
                    />
                    <DashboardWishlistWidget wishlistItems={wishlistItems} />
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

                            <div>
                                <label
                                    htmlFor="tripEditSlug"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Trip link
                                </label>
                                <div className="mt-2 flex rounded-xl border border-slate-300 bg-slate-50 focus-within:border-slate-500">
                                    <span className="shrink-0 rounded-l-xl border-r border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
                                        trips/
                                    </span>
                                    <input
                                        id="tripEditSlug"
                                        name="slug"
                                        type="text"
                                        required
                                        defaultValue={
                                            selectedTrip.slug ||
                                            slugifyTripTitle(selectedTrip.title)
                                        }
                                        onChange={(event) => {
                                            event.currentTarget.value = sanitizeTripSlugInput(
                                                event.currentTarget.value
                                            );
                                        }}
                                        className="min-w-0 flex-1 rounded-r-xl bg-white px-4 py-2 text-slate-900 outline-none"
                                        {...travelInputProps()}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                    Changing this updates the URL for everyone on this trip.
                                </p>
                            </div>

                            <TripDestinationPicker
                                inputId="tripEditDestination"
                                tripId={selectedTrip.id}
                                initialDestination={selectedTrip.destination}
                                initialCoverImageUrl={
                                    selectedTrip.cover_image_url ||
                                    selectedTrip.trip_cover_image_url
                                }
                                initialCoverImageSource={
                                    selectedTrip.cover_image_source || null
                                }
                                initialCoverImageStoragePath={
                                    selectedTrip.cover_image_storage_path || null
                                }
                                initialCoverImageUnsplashId={
                                    selectedTrip.cover_image_unsplash_id || null
                                }
                                onChange={() => setHasUnsavedChanges(true)}
                            />

                            <DateRangeInputs
                                key={selectedTrip.id}
                                startName="start_date"
                                endName="end_date"
                                startLabel="Start date"
                                endLabel="End date"
                                initialStartDate={selectedTrip.start_date}
                                initialEndDate={selectedTrip.end_date}
                                startId="tripEditStartDate"
                                endId="tripEditEndDate"
                                className="grid gap-5 md:grid-cols-2"
                                inputClassName="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />

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
                                {!selectedTrip.user_id ||
                                selectedTrip.user_id === currentUserId ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteWarning(true)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
                                    >
                                        <Archive
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                        Archive
                                    </button>
                                ) : (
                                    <span />
                                )}

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
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
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
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
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
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <Archive className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="delete-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Archive this trip?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This moves the trip out of your active lists and
                                    into Archive. Nothing inside the trip will be deleted.
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
                                    className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-400 sm:w-auto"
                                >
                                    Archive trip
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
