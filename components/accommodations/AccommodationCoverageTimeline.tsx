import { BedDouble, CalendarDays, Check, Clock3, TriangleAlert } from "lucide-react";
import type { TripAccommodation } from "@/lib/accommodations";
import type { TripAudienceParticipantKind } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

export type AccommodationCoverageTraveler = {
    kind: TripAudienceParticipantKind;
    id: string;
    requiredLegIds?: string[];
    userId?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    secondaryLabel?: string | null;
    isCurrentUser?: boolean;
};

export type AccommodationCoverageParticipant = {
    item_id: string;
    participant_kind?: string | null;
    trip_member_id?: string | null;
    user_id?: string | null;
    invitation_id?: string | null;
    family_member_id?: string | null;
    guest_name?: string | null;
};

export type AccommodationCoverageLeg = {
    id: string;
    startDate?: string | null;
    endDate?: string | null;
    memberIds: string[];
    memberDatesByMemberId?: Record<
        string,
        {
            startDate?: string | null;
            endDate?: string | null;
        }
    >;
};

type CoverageStatus =
    | "booked"
    | "tentative"
    | "missing"
    | "departure"
    | "not_traveling";

type CoverageCell = {
    status: CoverageStatus;
    accommodations: TripAccommodation[];
};

type AccommodationStayBar = {
    accommodation: TripAccommodation;
    startOffset: number;
    endOffset: number;
    lane: number;
};

type MissingCoverageBar = {
    startOffset: number;
    endOffset: number;
};

function parseDateKey(value?: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, amount: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
}

function differenceInUtcDays(start: Date, end: Date) {
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function buildDateRange(startDate?: string | null, endDate?: string | null) {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    if (!start || !end || end.getTime() < start.getTime()) return [];

    const dates: string[] = [];
    for (let date = start; date.getTime() <= end.getTime(); date = addUtcDays(date, 1)) {
        dates.push(toDateKey(date));
    }
    return dates;
}

function buildNightRange(startDate?: string | null, endDate?: string | null) {
    return buildDateRange(startDate, endDate).slice(0, -1);
}

function formatDay(dateKey: string) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
    }).format(date);
}

function formatDate(dateKey: string) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function participantMatchesTraveler(
    participant: AccommodationCoverageParticipant,
    traveler: AccommodationCoverageTraveler
) {
    if (traveler.kind === "member") {
        return (
            participant.trip_member_id === traveler.id ||
            (Boolean(traveler.userId) && participant.user_id === traveler.userId)
        );
    }
    if (traveler.kind === "invitation") {
        return participant.invitation_id === traveler.id;
    }
    if (traveler.kind === "family_member") {
        return participant.family_member_id === traveler.id;
    }
    return participant.guest_name === traveler.displayName;
}

function accommodationIncludesTraveler({
    accommodation,
    traveler,
    participants,
}: {
    accommodation: TripAccommodation;
    traveler: AccommodationCoverageTraveler;
    participants: AccommodationCoverageParticipant[];
}) {
    const audienceMode = accommodation.audience_mode || "everyone";
    if (audienceMode === "everyone") return true;

    const savedParticipants = participants.filter(
        (participant) => participant.item_id === accommodation.id
    );
    if (savedParticipants.some((participant) => participantMatchesTraveler(participant, traveler))) {
        return true;
    }

    if (audienceMode === "just_me") {
        return (
            traveler.isCurrentUser ||
            (Boolean(accommodation.created_by) &&
                accommodation.created_by === traveler.userId)
        );
    }

    return false;
}

function getCoverageCell({
    dateKey,
    requiresStay,
    isDepartureDay,
    traveler,
    accommodations,
    participants,
}: {
    dateKey: string;
    requiresStay: boolean;
    isDepartureDay: boolean;
    traveler: AccommodationCoverageTraveler;
    accommodations: TripAccommodation[];
    participants: AccommodationCoverageParticipant[];
}): CoverageCell {
    if (!requiresStay && !isDepartureDay) {
        return { status: "not_traveling", accommodations: [] };
    }
    if (isDepartureDay) return { status: "departure", accommodations: [] };

    const matching = accommodations.filter(
        (accommodation) =>
            accommodation.status !== "cancelled" &&
            accommodation.check_in_date <= dateKey &&
            accommodation.check_out_date > dateKey &&
            accommodationIncludesTraveler({ accommodation, traveler, participants })
    );
    const booked = matching.filter((accommodation) => accommodation.status === "booked");

    if (booked.length > 0) return { status: "booked", accommodations: booked };
    if (matching.length > 0) return { status: "tentative", accommodations: matching };
    return { status: "missing", accommodations: [] };
}

function buildAccommodationStayBars({
    dateKeys,
    traveler,
    accommodations,
    participants,
}: {
    dateKeys: string[];
    traveler: AccommodationCoverageTraveler;
    accommodations: TripAccommodation[];
    participants: AccommodationCoverageParticipant[];
}) {
    const timelineStart = parseDateKey(dateKeys[0]);
    if (!timelineStart || dateKeys.length === 0) return [];

    const laneEndOffsets: number[] = [];
    return accommodations
        .filter(
            (accommodation) =>
                accommodation.status !== "cancelled" &&
                accommodationIncludesTraveler({
                    accommodation,
                    traveler,
                    participants,
                })
        )
        .map((accommodation) => {
            const checkIn = parseDateKey(accommodation.check_in_date);
            const checkOut = parseDateKey(accommodation.check_out_date);
            if (!checkIn || !checkOut || checkOut <= checkIn) return null;

            // A stay visually starts halfway through check-in day and ends
            // halfway through check-out day, matching typical hotel occupancy.
            const rawStartOffset =
                differenceInUtcDays(timelineStart, checkIn) + 0.5;
            const rawEndOffset =
                differenceInUtcDays(timelineStart, checkOut) + 0.5;
            const startOffset = Math.max(0, rawStartOffset);
            const endOffset = Math.min(dateKeys.length, rawEndOffset);
            if (endOffset <= startOffset) return null;

            return {
                accommodation,
                startOffset,
                endOffset,
                lane: 0,
            } satisfies AccommodationStayBar;
        })
        .filter((bar): bar is AccommodationStayBar => Boolean(bar))
        .sort(
            (left, right) =>
                left.startOffset - right.startOffset ||
                left.endOffset - right.endOffset
        )
        .map((bar) => {
            const availableLane = laneEndOffsets.findIndex(
                (endOffset) => bar.startOffset >= endOffset
            );
            const lane = availableLane === -1 ? laneEndOffsets.length : availableLane;
            laneEndOffsets[lane] = bar.endOffset;
            return { ...bar, lane };
        });
}

function buildMissingCoverageBars(cells: CoverageCell[]) {
    const bars: MissingCoverageBar[] = [];
    let missingStartIndex: number | null = null;

    cells.forEach((cell, index) => {
        if (cell.status === "missing") {
            if (missingStartIndex === null) missingStartIndex = index;
            return;
        }

        if (missingStartIndex !== null) {
            bars.push({
                startOffset: missingStartIndex + 0.5,
                endOffset: index + 0.5,
            });
            missingStartIndex = null;
        }
    });

    if (missingStartIndex !== null) {
        bars.push({
            startOffset: missingStartIndex + 0.5,
            endOffset: cells.length,
        });
    }

    return bars;
}

function TravelerAvatar({ traveler }: { traveler: AccommodationCoverageTraveler }) {
    return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-900 text-xs font-black uppercase text-lime-200">
            {traveler.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={traveler.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(traveler.displayName)
            )}
        </span>
    );
}

function CoverageDayCell({ cell }: { cell: CoverageCell }) {
    if (cell.status === "not_traveling") {
        return (
            <div className="flex min-h-[76px] items-center justify-center border-b border-r border-white/10 bg-slate-950/35 px-3 py-2 text-center">
                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">
                    Not on leg
                </span>
            </div>
        );
    }

    if (cell.status === "departure") {
        return (
            <div className="min-h-[76px] border-b border-r border-white/10 bg-slate-900/45" />
        );
    }

    if (cell.status === "missing") {
        return (
            <div className="min-h-[76px] border-b border-r border-white/10 bg-red-950/20" />
        );
    }

    const isBooked = cell.status === "booked";

    return (
        <div
            className={`min-h-[76px] border-b border-r border-white/10 ${
                isBooked ? "bg-lime-300/[0.05]" : "bg-amber-300/[0.05]"
            }`}
        />
    );
}

function AccommodationStayBars({
    bars,
    dateCount,
}: {
    bars: AccommodationStayBar[];
    dateCount: number;
}) {
    return (
        <div className="pointer-events-none absolute inset-0 z-10">
            {bars.map(({ accommodation, startOffset, endOffset, lane }) => {
                const isBooked = accommodation.status === "booked";
                const statusLabel = isBooked ? "Booked" : "Tentative";
                const dateLabel = `${formatDate(
                    accommodation.check_in_date
                )} – ${formatDate(accommodation.check_out_date)}`;

                return (
                    <div
                        key={accommodation.id}
                        role="img"
                        aria-label={`${statusLabel} at ${accommodation.hotel_name}, ${dateLabel}`}
                        title={`${accommodation.hotel_name} · ${dateLabel}`}
                        className={`absolute flex h-11 min-w-0 items-center gap-2 overflow-hidden rounded-full border px-3 shadow-lg ${
                            isBooked
                                ? "border-lime-300/45 bg-lime-300 text-slate-950 shadow-lime-950/30"
                                : "border-amber-300/45 bg-amber-300 text-slate-950 shadow-amber-950/30"
                        }`}
                        style={{
                            left: `${(startOffset / dateCount) * 100}%`,
                            width: `${((endOffset - startOffset) / dateCount) * 100}%`,
                            top: 16 + lane * 48,
                        }}
                    >
                        {isBooked ? (
                            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                            <Clock3
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                            />
                        )}
                        <span className="min-w-0 truncate text-xs font-black">
                            {accommodation.hotel_name}
                        </span>
                        <span className="hidden shrink-0 text-[10px] font-black uppercase tracking-[0.08em] opacity-70 sm:inline">
                            {statusLabel}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function MissingCoverageBars({
    bars,
    dateCount,
}: {
    bars: MissingCoverageBar[];
    dateCount: number;
}) {
    return (
        <div className="pointer-events-none absolute inset-0 z-10">
            {bars.map(({ startOffset, endOffset }) => (
                <div
                    key={`${startOffset}:${endOffset}`}
                    role="img"
                    aria-label="Not booked"
                    className="vaivia-stay-coverage-missing absolute top-4 flex h-11 min-w-0 items-center gap-2 overflow-hidden rounded-full border border-dashed border-red-300/45 bg-red-950 px-3 text-white shadow-lg shadow-red-950/30"
                    style={{
                        left: `${(startOffset / dateCount) * 100}%`,
                        width: `${((endOffset - startOffset) / dateCount) * 100}%`,
                    }}
                >
                    <TriangleAlert
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-xs font-black uppercase tracking-[0.08em]">
                        Not booked
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function AccommodationCoverageTimeline({
    tripStartDate,
    tripEndDate,
    travelers,
    accommodations,
    participants,
    legs,
}: {
    tripStartDate?: string | null;
    tripEndDate?: string | null;
    travelers: AccommodationCoverageTraveler[];
    accommodations: TripAccommodation[];
    participants: AccommodationCoverageParticipant[];
    legs: AccommodationCoverageLeg[];
}) {
    const fallbackStartDate = accommodations
        .map((accommodation) => accommodation.check_in_date)
        .sort()[0];
    const fallbackEndDate = accommodations
        .map((accommodation) => accommodation.check_out_date)
        .sort()
        .at(-1);
    const datedLegs = legs.filter(
        (leg) =>
            parseDateKey(leg.startDate) &&
            parseDateKey(leg.endDate) &&
            String(leg.endDate) >= String(leg.startDate)
    );
    const earliestLegDate = datedLegs
        .map((leg) => leg.startDate as string)
        .sort()[0];
    const latestLegDate = datedLegs
        .map((leg) => leg.endDate as string)
        .sort()
        .at(-1);
    const dateKeys = buildDateRange(
        earliestLegDate || tripStartDate || fallbackStartDate,
        latestLegDate || tripEndDate || fallbackEndDate
    );

    if (dateKeys.length === 0) {
        return (
            <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-5 text-white shadow-2xl shadow-black/30 md:p-7">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
                    Stay coverage
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                    Add trip dates to see the stay timeline
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-400">
                    Once the trip has a start and return date, each traveler’s booked nights will appear here.
                </p>
            </section>
        );
    }

    const fallbackNightKeys = dateKeys.slice(0, -1);
    const fallbackDepartureDate = dateKeys.at(-1);
    const dayColumnWidth = 142;
    const travelerColumnWidth = 224;
    const minGridWidth = travelerColumnWidth + dayColumnWidth * dateKeys.length;
    const dateColumns = `repeat(${dateKeys.length}, minmax(${dayColumnWidth}px, 1fr))`;

    return (
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 text-white shadow-2xl shadow-black/30">
            <div className="p-5 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
                            Stay coverage
                        </p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                            Who has a place to stay?
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-400">
                            Each traveler’s required nights come from the trip legs they’re joining. Stay nights run from check-in up to, but not including, check-out.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.08em]">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-lime-100">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Booked
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-amber-100">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Tentative
                        </span>
                        <span className="vaivia-stay-coverage-missing inline-flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-500/10 px-3 py-1.5 text-white">
                            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Not booked
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-600/30 bg-slate-800/30 px-3 py-1.5 text-slate-400">
                            Not on leg
                        </span>
                    </div>
                </div>
            </div>

            {travelers.length === 0 ? (
                <div className="mx-5 mb-5 rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.04] p-7 text-center md:mx-7 md:mb-7">
                    <BedDouble className="mx-auto h-6 w-6 text-lime-200" aria-hidden="true" />
                    <p className="mt-3 text-sm font-bold text-slate-300">
                        Add trip members to compare stay coverage.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto border-t border-white/10">
                    <div
                        className="grid"
                        style={{
                            minWidth: minGridWidth,
                            gridTemplateColumns: `${travelerColumnWidth}px ${dateColumns}`,
                        }}
                    >
                        <div className="vaivia-stay-coverage-column-header sticky left-0 z-20 flex items-center gap-2 border-b border-r border-white/10 bg-slate-950/95 px-4 py-3">
                            <CalendarDays className="h-4 w-4 text-lime-200" aria-hidden="true" />
                            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                                Travelers
                            </span>
                        </div>
                        {dateKeys.map((dateKey, index) => (
                            <div
                                key={dateKey}
                                className={`vaivia-stay-coverage-date-header border-b border-r border-white/10 px-3 py-3 text-center ${
                                    index === dateKeys.length - 1
                                        ? "bg-slate-900/95"
                                        : "bg-slate-950/95"
                                }`}
                            >
                                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                                    {formatDay(dateKey)}
                                </p>
                                <p className="mt-1 text-sm font-black text-lime-200">
                                    {formatDate(dateKey)}
                                </p>
                            </div>
                        ))}

                        {travelers.map((traveler) => {
                            const usesMemberLegMembership =
                                traveler.kind === "member" && datedLegs.length > 0;
                            const usesInvitationLegMembership =
                                traveler.kind === "invitation" &&
                                traveler.requiredLegIds !== undefined;
                            const usesLegMembership =
                                usesMemberLegMembership ||
                                usesInvitationLegMembership;
                            const requiredLegIds = new Set(
                                traveler.requiredLegIds || []
                            );
                            const travelerLegs = usesMemberLegMembership
                                ? datedLegs.filter((leg) =>
                                      leg.memberIds.includes(traveler.id)
                                  )
                                : usesInvitationLegMembership
                                  ? datedLegs.filter((leg) =>
                                        requiredLegIds.has(leg.id)
                                    )
                                  : [];
                            const requiredNightKeys = new Set<string>();
                            const departureDateKeys = new Set<string>();

                            if (usesLegMembership) {
                                travelerLegs.forEach((leg) => {
                                    const memberDates = usesMemberLegMembership
                                        ? leg.memberDatesByMemberId?.[traveler.id]
                                        : undefined;
                                    const startDate =
                                        memberDates?.startDate || leg.startDate;
                                    const endDate = memberDates?.endDate || leg.endDate;

                                    buildNightRange(startDate, endDate).forEach(
                                        (dateKey) => requiredNightKeys.add(dateKey)
                                    );
                                    if (parseDateKey(endDate)) {
                                        departureDateKeys.add(endDate as string);
                                    }
                                });
                            } else {
                                fallbackNightKeys.forEach((dateKey) =>
                                    requiredNightKeys.add(dateKey)
                                );
                                if (fallbackDepartureDate) {
                                    departureDateKeys.add(fallbackDepartureDate);
                                }
                            }

                            const cells = dateKeys.map((dateKey) =>
                                getCoverageCell({
                                    dateKey,
                                    requiresStay: requiredNightKeys.has(dateKey),
                                    isDepartureDay:
                                        !requiredNightKeys.has(dateKey) &&
                                        departureDateKeys.has(dateKey),
                                    traveler,
                                    accommodations,
                                    participants,
                                })
                            );
                            const stayBars = buildAccommodationStayBars({
                                dateKeys,
                                traveler,
                                accommodations,
                                participants,
                            });
                            const missingCoverageBars =
                                buildMissingCoverageBars(cells);
                            const laneCount =
                                stayBars.length > 0
                                    ? Math.max(...stayBars.map((bar) => bar.lane)) + 1
                                    : 0;
                            const rowHeight = Math.max(
                                76,
                                32 + laneCount * 48
                            );
                            const totalNights = requiredNightKeys.size;
                            const bookedNights = cells.filter(
                                (cell) => cell.status === "booked"
                            ).length;
                            const hasCompleteCoverage =
                                totalNights > 0 && bookedNights === totalNights;

                            return (
                                <div key={`${traveler.kind}:${traveler.id}`} className="contents">
                                    <div
                                        className="vaivia-stay-coverage-column-header sticky left-0 z-10 flex min-h-[76px] items-center gap-3 border-b border-r border-white/10 bg-slate-950/95 px-4 py-2"
                                        style={{ minHeight: rowHeight }}
                                    >
                                        <TravelerAvatar traveler={traveler} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-black text-white">
                                                {traveler.displayName}
                                                {traveler.isCurrentUser ? " (you)" : ""}
                                            </p>
                                            <p className="truncate text-[11px] font-semibold text-slate-400">
                                                {traveler.secondaryLabel || "Trip traveler"}
                                            </p>
                                            <span
                                                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                                                    totalNights === 0
                                                        ? "bg-slate-800/70 text-slate-400"
                                                        : hasCompleteCoverage
                                                          ? "bg-lime-300/15 text-lime-100"
                                                          : "bg-red-500/10 text-red-100"
                                                }`}
                                            >
                                                {totalNights === 0
                                                    ? "No leg nights"
                                                    : `${bookedNights}/${totalNights} nights booked`}
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        className="relative grid"
                                        style={{
                                            gridColumn: `2 / span ${dateKeys.length}`,
                                            gridTemplateColumns: dateColumns,
                                            minHeight: rowHeight,
                                        }}
                                    >
                                        {cells.map((cell, index) => (
                                            <CoverageDayCell
                                                key={`${traveler.kind}:${traveler.id}:${dateKeys[index]}`}
                                                cell={cell}
                                            />
                                        ))}
                                        <AccommodationStayBars
                                            bars={stayBars}
                                            dateCount={dateKeys.length}
                                        />
                                        <MissingCoverageBars
                                            bars={missingCoverageBars}
                                            dateCount={dateKeys.length}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
