"use client";

import {
    useEffect,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import {
    getTripAccentColor,
    getTripDurationDays,
} from "@/lib/tripPresentation";

export type TripCardMember = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
};

export type TripCardPresentationTrip = {
    id: string;
    title: string;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    viewerTripMemberId?: string | null;
    viewerAssignedLegCount?: number;
    viewerStartDate?: string | null;
    viewerEndDate?: string | null;
    memberProfiles?: TripCardMember[];
};

type TripCardImageTone = "dark" | "light";

type TripCardActionRenderProps = {
    children: ReactNode;
    className: string;
    ariaLabel: string;
};

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
] as const;

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

                    luminanceTotal +=
                        0.2126 * red + 0.7152 * green + 0.0722 * blue;
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

function getMemberDisplayName(member: TripCardMember) {
    return (
        [member.first_name, member.last_name].filter(Boolean).join(" ").trim() ||
        member.username ||
        "Trip member"
    );
}

function getMemberInitials(member: TripCardMember) {
    return getMemberDisplayName(member)
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function TripMemberAvatarStack({ members }: { members: TripCardMember[] }) {
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

export function parseTripPlainDate(value?: string | null) {
    if (!value) return null;

    const [yearText, monthText, dayText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

export function formatTripDateRange(
    startDate?: string | null,
    endDate?: string | null
) {
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

export function getTripDisplayDateRange(trip: TripCardPresentationTrip) {
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

export function getPrimaryDestination(trip: TripCardPresentationTrip) {
    const destination = parseDestinationList(trip.destination)[0];
    const withoutFlag = stripDestinationFlag(
        destination || trip.title || "Trip"
    );
    return withoutFlag.split(",")[0]?.trim() || withoutFlag;
}

export function getTripDestinationNames(trip: TripCardPresentationTrip) {
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

function getPrimaryDestinationFontSize(destination: string) {
    const characterCount = destination.trim().length;

    if (characterCount <= 5) return "clamp(4.2rem, 16vw, 5.3rem)";
    if (characterCount <= 7) return "clamp(3.7rem, 13.5vw, 4.75rem)";
    if (characterCount <= 9) return "clamp(3.05rem, 11vw, 4rem)";
    if (characterCount <= 12) return "clamp(2.55rem, 9vw, 3.35rem)";

    return "clamp(2.15rem, 7.5vw, 2.9rem)";
}

function getPrimaryDestinationLetterSpacing(destination: string) {
    const characterCount = destination.trim().length;

    if (characterCount <= 7) return "-0.08em";
    if (characterCount <= 12) return "-0.055em";
    return "-0.035em";
}

function prefixAssetUrl(url: string, assetBaseUrl: string) {
    return assetBaseUrl ? `${assetBaseUrl}${url}` : url;
}

export function TripCardPresentation({
    trip,
    index,
    coverImageUrl,
    renderAction,
    memberProfiles = trip.memberProfiles || [],
    disableHoverTransform = false,
    assetBaseUrl = "",
}: {
    trip: TripCardPresentationTrip;
    index: number;
    coverImageUrl?: string | null;
    renderAction: (props: TripCardActionRenderProps) => ReactNode;
    memberProfiles?: TripCardMember[];
    disableHoverTransform?: boolean;
    assetBaseUrl?: string;
}) {
    const [hasImageLoadError, setHasImageLoadError] = useState(false);
    const [imageTone, setImageTone] = useState<TripCardImageTone>("dark");
    const destinations = getTripDestinationNames(trip);
    const primaryDestination = destinations[0] ?? getPrimaryDestination(trip);
    const secondLineDestinations = destinations.slice(1, 3);
    const thirdLineDestinations = destinations.slice(3, 5);
    const displayDateRange = getTripDisplayDateRange(trip);
    const days = getTripDurationDays(
        displayDateRange.startDate,
        displayDateRange.endDate
    );
    const accent = getTripAccentColor(index);
    const variant = tripCardVariants[index % tripCardVariants.length];
    const maskUrl = prefixAssetUrl(variant.mask, assetBaseUrl);
    const maskStyle: CSSProperties = {
        WebkitMaskImage: `url(${maskUrl})`,
        maskImage: `url(${maskUrl})`,
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
            if (isActive) setImageTone(tone);
        });

        return () => {
            isActive = false;
        };
    }, [coverImageUrl, hasImageLoadError]);

    const visualContent = (
        <>
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

            <TripMemberAvatarStack members={memberProfiles} />

            <div
                className={`vaivia-trip-card-copy absolute bottom-24 z-20 py-6 [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] ${variant.contentClass}`}
            >
                <h3
                    className="vaivia-trip-card-title max-w-full overflow-visible font-black uppercase leading-[0.78] tracking-[-0.08em]"
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
        </>
    );

    return (
        <article
            data-image-tone={imageTone}
            className={`vaivia-trip-card group relative block h-[500px] min-w-[300px] snap-start transition-all duration-500 ease-out md:h-[535px] md:min-w-[330px] lg:h-[560px] lg:min-w-[355px] ${
                disableHoverTransform ? "" : "hover:-translate-y-3 hover:scale-110"
            } ${variant.transform}`}
            style={{ filter: `drop-shadow(0 28px 70px ${accent}24)` }}
        >
            {renderAction({
                children: visualContent,
                className: "absolute inset-0 block",
                ariaLabel: `Open ${trip.title || "trip"}`,
            })}
        </article>
    );
}
