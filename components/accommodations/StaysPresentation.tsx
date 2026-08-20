"use client";

import {
    BedDouble,
    ExternalLink,
    Hotel,
    Lock,
    MapPin,
    Pencil,
    Plus,
    Trash2,
    MapPinned,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/budget";
import {
    getAccommodationStatusLabel,
    getAccommodationTypeLabel,
    type TripAccommodation,
} from "@/lib/accommodations";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

export type AccommodationAudienceParticipant = {
    item_id: string;
    participant_kind?: string | null;
    trip_member_id?: string | null;
    user_id?: string | null;
    invitation_id?: string | null;
    family_member_id?: string | null;
    guest_name?: string | null;
};

type StayActionProps = {
    className: string;
    "aria-label": string;
    children: ReactNode;
};

export const staySecondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

function formatDisplayDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatDisplayTime(value?: string | null) {
    if (!value) return "";
    const [hourText, minuteText] = value.split(":");
    const date = new Date();
    date.setHours(Number(hourText), Number(minuteText), 0, 0);
    return new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function participantMatchesOption(
    participant: AccommodationAudienceParticipant,
    option: TripAudienceOption,
) {
    if (option.kind === "member") {
        return participant.trip_member_id === option.id;
    }
    if (option.kind === "invitation") {
        return participant.invitation_id === option.id;
    }
    if (option.kind === "family_member") {
        return participant.family_member_id === option.id;
    }
    return participant.guest_name === option.displayName;
}

export function getAccommodationAudienceOptions({
    accommodation,
    options,
    participants,
    currentUserTripMemberId,
}: {
    accommodation: TripAccommodation;
    options: TripAudienceOption[];
    participants: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
}) {
    const audienceMode = accommodation.audience_mode || "everyone";
    if (audienceMode === "everyone") return options;

    const selectedOptions = options.filter((option) =>
        participants.some((participant) => participantMatchesOption(participant, option)),
    );
    if (selectedOptions.length > 0 || audienceMode === "custom") {
        return selectedOptions;
    }

    return currentUserTripMemberId
        ? options.filter(
              (option) => option.kind === "member" && option.id === currentUserTripMemberId,
          )
        : options.filter((option) => option.kind === "member" && option.isCurrentUser);
}

function AccommodationAudienceAvatars({
    accommodation,
    options,
    participants,
    currentUserTripMemberId,
}: {
    accommodation: TripAccommodation;
    options: TripAudienceOption[];
    participants: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
}) {
    const selectedOptions = getAccommodationAudienceOptions({
        accommodation,
        options,
        participants,
        currentUserTripMemberId,
    });
    const guestNames = participants
        .filter(
            (participant) =>
                participant.participant_kind === "guest" && Boolean(participant.guest_name),
        )
        .map((participant) => participant.guest_name as string);
    const people = [
        ...selectedOptions.map((option) => ({
            key: `${option.kind}:${option.id}`,
            displayName: option.displayName,
            avatarUrl: option.avatarUrl || null,
            isInvited: option.status === "invited",
        })),
        ...guestNames.map((displayName) => ({
            key: `guest:${displayName}`,
            displayName,
            avatarUrl: null,
            isInvited: false,
        })),
    ].filter(
        (person, index, allPeople) =>
            allPeople.findIndex((candidate) => candidate.key === person.key) === index,
    );

    if (people.length === 0) return null;

    const visiblePeople = people.slice(0, 5);
    const extraCount = people.length - visiblePeople.length;
    const names = people.map((person) => person.displayName).join(", ");

    return (
        <div
            className="ml-auto flex shrink-0 items-center -space-x-2"
            role="group"
            aria-label={`Booked for ${names}`}
        >
            {visiblePeople.map((person) => (
                <span
                    key={person.key}
                    title={person.displayName}
                    className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#03030a] text-[10px] font-black uppercase shadow-lg ${
                        person.isInvited
                            ? "bg-amber-300 text-slate-950"
                            : "bg-slate-800 text-lime-200"
                    }`}
                >
                    {person.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        getInitials(person.displayName)
                    )}
                </span>
            ))}
            {extraCount > 0 ? (
                <span
                    className="relative flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-[#03030a] bg-lime-300 px-1.5 text-[10px] font-black text-slate-950 shadow-lg"
                    title={`${extraCount} more travelers`}
                >
                    +{extraCount}
                </span>
            ) : null}
        </div>
    );
}

export function StayCoverPlaceholderPresentation() {
    return (
        <div className="relative h-44 overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.2),transparent_52%),linear-gradient(135deg,#172033,#03030a_70%)]">
            <div className="absolute inset-0 flex items-center justify-center">
                <Hotel className="h-10 w-10 text-lime-200/35" aria-hidden="true" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10" />
        </div>
    );
}

export function StayCardPresentation({
    accommodation,
    audienceOptions = [],
    audienceParticipants = [],
    currentUserTripMemberId = null,
    cover,
    onEdit,
    onDelete,
    googleMapsEnabled = true,
}: {
    accommodation: TripAccommodation;
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    cover?: ReactNode;
    onEdit?: () => void;
    onDelete?: () => void;
    googleMapsEnabled?: boolean;
}) {
    const isCancelled = accommodation.status === "cancelled";
    const checkInWindow =
        accommodation.check_in_time_start || accommodation.check_in_time_end
            ? ` between ${[
                  formatDisplayTime(accommodation.check_in_time_start),
                  formatDisplayTime(accommodation.check_in_time_end),
              ]
                  .filter(Boolean)
                  .join(" and ")}`
            : "";

    return (
        <article
            data-stay-card={accommodation.id}
            className={`overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#03030a]/90 text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:border-lime-300/25 ${
                isCancelled ? "opacity-60" : ""
            }`}
        >
            {cover || <StayCoverPlaceholderPresentation />}
            <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-2xl font-black tracking-tight">
                                {accommodation.hotel_name}
                            </h3>
                            {accommodation.is_private ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-xs font-black uppercase tracking-wide text-lime-200">
                                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                    Private
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 text-sm font-bold text-slate-300">
                            {getAccommodationStatusLabel(accommodation.status)} ·{" "}
                            {getAccommodationTypeLabel(accommodation.accommodation_type)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onEdit}
                            disabled={!onEdit}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/40 hover:text-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={
                                onEdit
                                    ? `Edit ${accommodation.hotel_name}`
                                    : `Edit ${accommodation.hotel_name} unavailable`
                            }
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={!onDelete}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={
                                onDelete
                                    ? `Delete ${accommodation.hotel_name}`
                                    : `Delete ${accommodation.hotel_name} unavailable`
                            }
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {accommodation.address ? (
                    <p className="mt-4 flex gap-2 text-sm font-semibold text-slate-300">
                        <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                            aria-hidden="true"
                        />
                        <span>{accommodation.address}</span>
                    </p>
                ) : null}

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Check-in
                        </p>
                        <p className="mt-1 text-lg font-black">
                            {formatDisplayDate(accommodation.check_in_date)}
                        </p>
                        {checkInWindow ? (
                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                {checkInWindow.trim()}
                            </p>
                        ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Check-out
                        </p>
                        <p className="mt-1 text-lg font-black">
                            {formatDisplayDate(accommodation.check_out_date)}
                        </p>
                        {accommodation.check_out_time ? (
                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                {formatDisplayTime(accommodation.check_out_time)}
                            </p>
                        ) : null}
                    </div>
                </div>

                {accommodation.free_cancellation_ends_on ? (
                    <div className="mt-4 rounded-2xl border border-lime-300/25 bg-lime-300/10 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Free cancellation ends
                        </p>
                        <p className="mt-1 text-sm font-black text-lime-100">
                            {formatDisplayDate(accommodation.free_cancellation_ends_on)}
                        </p>
                    </div>
                ) : null}

                {accommodation.notes ? (
                    <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-slate-300">
                        {accommodation.notes}
                    </p>
                ) : null}

                {accommodation.cost ? (
                    <p className="mt-4 inline-flex rounded-full border border-lime-300/30 bg-lime-300/15 px-3 py-1 text-sm font-black text-lime-100">
                        {formatCurrency(
                            Number(accommodation.cost),
                            accommodation.currency || "CAD",
                        )}
                    </p>
                ) : null}

                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                        {accommodation.website ? (
                            <a
                                href={addVaiviaUtmAttribution(accommodation.website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={staySecondaryButtonClass}
                            >
                                Website
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                        ) : null}
                        {accommodation.google_maps_url ? (
                            googleMapsEnabled ? (
                                <a
                                    href={accommodation.google_maps_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={staySecondaryButtonClass}
                                >
                                    Open in Google Maps
                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    disabled
                                    className={staySecondaryButtonClass}
                                    aria-label="Open in Google Maps unavailable"
                                >
                                    Open in Google Maps
                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )
                        ) : null}
                    </div>
                    <AccommodationAudienceAvatars
                        accommodation={accommodation}
                        options={audienceOptions}
                        participants={audienceParticipants}
                        currentUserTripMemberId={currentUserTripMemberId}
                    />
                </div>
            </div>
        </article>
    );
}

export function StaysPresentation({
    accommodations,
    audienceOptions = [],
    audienceParticipants = [],
    currentUserTripMemberId = null,
    onAddStay,
    onEditStay,
    onDeleteStay,
    renderCover,
    googleMapsEnabled = true,
}: {
    accommodations: TripAccommodation[];
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    onAddStay?: () => void;
    onEditStay?: (accommodation: TripAccommodation) => void;
    onDeleteStay?: (accommodation: TripAccommodation) => void;
    renderCover?: (accommodation: TripAccommodation) => ReactNode;
    googleMapsEnabled?: boolean;
}) {
    const sortedAccommodations = [...accommodations].sort((left, right) => {
        const dateSort = left.check_in_date.localeCompare(right.check_in_date);
        if (dateSort !== 0) return dateSort;
        return (left.created_at || "").localeCompare(right.created_at || "");
    });
    const participantsByItemId = new Map<string, AccommodationAudienceParticipant[]>();
    audienceParticipants.forEach((participant) => {
        const current = participantsByItemId.get(participant.item_id) || [];
        current.push(participant);
        participantsByItemId.set(participant.item_id, current);
    });

    return (
        <section
            data-stays-presentation="stays"
            className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-5 text-white shadow-2xl shadow-black/30 md:p-7"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
                        Places to stay
                    </p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                        Stays
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onAddStay}
                    disabled={!onAddStay}
                    className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={onAddStay ? "Add stay" : "Add stay unavailable"}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add stay
                </button>
            </div>

            {sortedAccommodations.length === 0 ? (
                <div className="mt-8 rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.05] p-8 text-center">
                    <h3 className="text-xl font-black">No stays yet.</h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                        Add hotels, rentals, hostels, or places you’re staying so they’re easy
                        to find during your trip.
                    </p>
                </div>
            ) : (
                <div className="mt-8 grid gap-4 xl:grid-cols-2">
                    {sortedAccommodations.map((accommodation) => (
                        <StayCardPresentation
                            key={accommodation.id}
                            accommodation={accommodation}
                            audienceOptions={audienceOptions}
                            audienceParticipants={
                                participantsByItemId.get(accommodation.id) || []
                            }
                            currentUserTripMemberId={currentUserTripMemberId}
                            cover={renderCover?.(accommodation)}
                            onEdit={
                                onEditStay ? () => onEditStay(accommodation) : undefined
                            }
                            onDelete={
                                onDeleteStay ? () => onDeleteStay(accommodation) : undefined
                            }
                            googleMapsEnabled={googleMapsEnabled}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

export function StaysLoadingPresentation() {
    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
            <div className="h-24 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
            <div className="h-80 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
            <div className="h-96 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
        </div>
    );
}

export type StayViewTab = "stays" | "planning";

const stayViewTabs = [
    {
        id: "stays",
        label: "Planned Stays",
        description: "Coverage and booking details",
    },
    {
        id: "planning",
        label: "Compare Stays",
        description: "Compare stays with your plans",
    },
] as const;

export function AccommodationPageTabsPresentation({
    activeTab,
    renderTab,
}: {
    activeTab: StayViewTab;
    renderTab: (
        tab: (typeof stayViewTabs)[number],
        props: StayActionProps,
    ) => ReactNode;
}) {
    return (
        <nav
            aria-label="Stay views"
            className="grid gap-2 rounded-[1.5rem] border border-white/10 bg-[#03030a] p-2 text-white shadow-2xl shadow-black/20 sm:inline-grid sm:grid-cols-2"
        >
            {stayViewTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.id === "stays" ? BedDouble : MapPinned;
                return renderTab(tab, {
                    "aria-label": `${tab.label}: ${tab.description}`,
                    className: `flex items-center gap-3 rounded-[1.05rem] px-4 py-3 text-left transition sm:min-w-56 ${
                        isActive
                            ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.2)]"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`,
                    children: (
                        <>
                            <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                                    isActive
                                        ? "border-black/10 bg-black/10"
                                        : "border-white/10 bg-white/[0.06]"
                                }`}
                            >
                                <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span>
                                <span className="block text-sm font-black uppercase tracking-[0.12em]">
                                    {tab.label}
                                </span>
                                <span
                                    className={`mt-0.5 block text-xs font-semibold ${
                                        isActive ? "text-slate-800" : "text-slate-500"
                                    }`}
                                >
                                    {tab.description}
                                </span>
                            </span>
                        </>
                    ),
                });
            })}
        </nav>
    );
}
