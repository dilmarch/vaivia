"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import { getInitials } from "@/lib/travelers";
import { sortTripLegLocations } from "@/lib/tripLegLocationOrdering";

export type TripLegLocation = {
    id: string;
    source: "destination" | "manual" | "accommodation";
    persistedLegId?: string | null;
    googlePlaceId?: string | null;
    name: string;
    cityName?: string | null;
    countryCode?: string | null;
    countryName?: string | null;
    iconEmoji?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    memberIds?: string[];
};

export type TripLegMemberOption = {
    id: string;
    displayName: string;
    username?: string | null;
    avatarUrl?: string | null;
};

type TripLegLocationLineProps = {
    tripId: string;
    revalidatePathname?: string;
    locations: TripLegLocation[];
    memberOptions: TripLegMemberOption[];
    upsertLegAction: (formData: FormData) => Promise<void>;
    deleteLegAction: (formData: FormData) => Promise<void>;
    children?: ReactNode;
};

function getFlagEmoji(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";

    return normalized
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

const TRIP_LEG_PLACE_TYPES = ["(regions)"];

function getPlaceComponent(
    place: google.maps.places.PlaceResult,
    type: string,
    nameType: "long_name" | "short_name" = "long_name"
) {
    return (
        place.address_components?.find((component) =>
            component.types.includes(type)
        )?.[nameType] || ""
    );
}

function getTripLegPlaceLabel(place: google.maps.places.PlaceResult) {
    return place.name || place.formatted_address || "";
}

function getTripLegPlaceCity(place: google.maps.places.PlaceResult) {
    return (
        getPlaceComponent(place, "locality") ||
        getPlaceComponent(place, "postal_town") ||
        getPlaceComponent(place, "administrative_area_level_2")
    );
}

function formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (!startDate && !endDate) return "Click to Add Dates";
    if (startDate && endDate) return `${startDate} - ${endDate}`;
    return startDate || endDate || "Dates not set";
}

function getLocationKey(location: TripLegLocation) {
    return `${location.source}:${location.id}`;
}

function getInitialSelectedMemberIds(
    location: TripLegLocation,
    memberOptions: TripLegMemberOption[]
) {
    const hasExplicitSavedSelection =
        location.source === "manual" || Boolean(location.persistedLegId);

    if (hasExplicitSavedSelection) {
        return location.memberIds || [];
    }

    return location.memberIds?.length
        ? location.memberIds
        : memberOptions.map((member) => member.id);
}

function LocationTile({
    location,
    onClick,
}: {
    location: TripLegLocation;
    onClick: () => void;
}) {
    const icon =
        location.iconEmoji ||
        getFlagEmoji(location.countryCode) ||
        "📍";
    const secondaryLabel = formatDateRange(location.startDate, location.endDate);

    return (
        <button
            type="button"
            onClick={onClick}
            className="group/leg relative flex h-30 w-24 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-3 py-3 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/35 hover:bg-white/[0.1] sm:h-32 sm:w-28"
            aria-label={`Edit ${location.name}`}
        >
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-950/70 text-2xl ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] sm:h-12 sm:w-12 sm:text-3xl">
                <span
                    className="vaivia-flag-emoji transition duration-200 group-hover/leg:scale-110 group-hover/leg:blur-[1.5px] group-hover/leg:opacity-35 group-focus-visible/leg:scale-110 group-focus-visible/leg:blur-[1.5px] group-focus-visible/leg:opacity-35"
                    aria-hidden="true"
                >
                    {icon}
                </span>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover/leg:opacity-100 group-focus-visible/leg:opacity-100">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-lime-300/35 bg-slate-950/80 text-lime-200 shadow-xl shadow-black/30">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                </span>
            </div>

            <div className="min-w-0 text-center leading-tight">
                <div className="line-clamp-2 text-sm font-black text-white">
                    {location.cityName || location.name}
                </div>
                {secondaryLabel ? (
                    <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-400">
                        {secondaryLabel}
                    </div>
                ) : null}
            </div>
        </button>
    );
}

function AddLegTile({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group/leg relative flex h-30 w-24 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-lime-300/25 bg-lime-300/10 px-3 py-3 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/45 hover:bg-lime-300/15 sm:h-32 sm:w-28"
            aria-label="Add leg to your trip"
        >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-lime-300/35 bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)] transition group-hover/leg:bg-lime-200 sm:h-12 sm:w-12">
                <Plus className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 text-center text-sm font-black leading-tight text-lime-100">
                Add leg to your trip
            </span>
        </button>
    );
}

function MemberButton({
    member,
    selected,
    onToggle,
}: {
    member: TripLegMemberOption;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold transition ${
                selected
                    ? "border-lime-300/40 bg-lime-300 text-slate-950"
                    : "border-white/10 bg-white/[0.08] text-slate-100 hover:border-lime-300/30 hover:bg-white/[0.14]"
            }`}
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200">
                {member.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    getInitials(member.displayName)
                )}
            </span>
            <span>{member.displayName}</span>
            {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
    );
}

export default function TripLegLocationLine({
    tripId,
    revalidatePathname,
    locations,
    memberOptions,
    upsertLegAction,
    deleteLegAction,
    children,
}: TripLegLocationLineProps) {
    const router = useRouter();
    const sortedLocations = useMemo(
        () => sortTripLegLocations(locations),
        [locations]
    );
    const accommodationLocations = useMemo(
        () => locations.filter((location) => location.source === "accommodation"),
        [locations]
    );
    const [isOpen, setIsOpen] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
        null
    );
    const [isAddingLeg, setIsAddingLeg] = useState(false);
    const [addLegPlace, setAddLegPlace] = useState({
        name: "",
        googlePlaceId: "",
        cityName: "",
        countryCode: "",
        iconEmoji: "",
    });
    const [addLegError, setAddLegError] = useState("");
    const [actionError, setActionError] = useState("");
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
        () => new Set(memberOptions.map((member) => member.id))
    );
    const [isPending, startTransition] = useTransition();

    const selectedLocation =
        locations.find((location) => getLocationKey(location) === selectedLocationId) ||
        null;

    function openEditor(location: TripLegLocation) {
        setIsAddingLeg(false);
        setActionError("");
        setAddLegError("");
        setSelectedLocationId(getLocationKey(location));
        setSelectedMemberIds(
            new Set(getInitialSelectedMemberIds(location, memberOptions))
        );
        setIsOpen(true);
    }

    function openAddLeg() {
        setSelectedLocationId(null);
        setIsAddingLeg(true);
        setAddLegPlace({
            name: "",
            googlePlaceId: "",
            cityName: "",
            countryCode: "",
            iconEmoji: "",
        });
        setAddLegError("");
        setActionError("");
        setSelectedMemberIds(new Set(memberOptions.map((member) => member.id)));
        setIsOpen(true);
    }

    function toggleMember(memberId: string) {
        setSelectedMemberIds((current) => {
            const next = new Set(current);
            if (next.has(memberId)) next.delete(memberId);
            else next.add(memberId);
            return next;
        });
    }

    function runAction(action: (formData: FormData) => Promise<void>, formData: FormData) {
        startTransition(async () => {
            setActionError("");

            try {
                await action(formData);
                router.refresh();
                setIsOpen(false);
            } catch (error) {
                console.error("Could not save trip leg:", error);
                setActionError(
                    error instanceof Error
                        ? error.message
                        : "Could not save this trip leg. Please try again."
                );
            }
        });
    }

    function runFormAction(
        action: (formData: FormData) => Promise<void>,
        form: HTMLFormElement | null
    ) {
        if (!form) return;
        if (!form.reportValidity()) return;
        runAction(action, new FormData(form));
    }

    function handleAddLegSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;

        if (!form.reportValidity()) return;

        if (!addLegPlace.googlePlaceId) {
            setAddLegError("Choose the destination from the Google location list.");
            return;
        }

        runAction(upsertLegAction, new FormData(form));
    }

    function handleEditLegSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        runFormAction(upsertLegAction, event.currentTarget);
    }

    if (locations.length === 0 && !children) {
        return (
            <p className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-slate-300">
                Add destinations in Edit trip to manage destination days.
            </p>
        );
    }

    function renderModal() {
        return (
            <AnimatedModal
                onClose={() => setIsOpen(false)}
                panelClassName="max-w-3xl"
                labelledBy="trip-leg-editor-title"
            >
                {({ requestClose }) => (
                    <div className="space-y-7 p-6 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                    Trip legs
                                </p>
                                <h2
                                    id="trip-leg-editor-title"
                                    className="mt-2 text-3xl font-black text-white"
                                >
                                    Destination days
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                                    Accommodation dates are used first. Add manual
                                    destination days for planning gaps and choose which
                                    trip mates are joining each leg.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                aria-label="Close destination editor"
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>

                        {accommodationLocations.length > 0 ? (
                            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 sm:p-6">
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                                    From accommodations
                                </p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {accommodationLocations.map((location) => (
                                        <div
                                            key={getLocationKey(location)}
                                            className="rounded-xl border border-white/10 bg-slate-950/70 p-3"
                                        >
                                            <p className="font-black text-white">
                                                {location.cityName || location.name}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                                {formatDateRange(
                                                    location.startDate,
                                                    location.endDate
                                                )}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {actionError ? (
                            <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                {actionError}
                            </p>
                        ) : null}

                        {isAddingLeg ? (
                            <form
                                onSubmit={handleAddLegSubmit}
                                className="space-y-5 rounded-2xl border border-lime-300/20 bg-slate-950/80 p-5 sm:p-6"
                            >
                                <input type="hidden" name="trip_id" value={tripId} />
                                <input
                                    type="hidden"
                                    name="require_google_place_id"
                                    value="true"
                                />
                                <input
                                    type="hidden"
                                    name="revalidate_path"
                                    value={revalidatePathname || ""}
                                />
                                {Array.from(selectedMemberIds).map((memberId) => (
                                    <input
                                        key={memberId}
                                        type="hidden"
                                        name="trip_member_ids"
                                        value={memberId}
                                    />
                                ))}

                                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Add leg to your trip
                                    </p>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                        Add a destination, dates, and who is joining
                                        this part of the trip.
                                    </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block sm:col-span-2">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Destination
                                        </span>
                                        <PlaceAutocompleteInput
                                            name="name"
                                            value={addLegPlace.name}
                                            onInputChange={(value) => {
                                                setAddLegError("");
                                                setAddLegPlace({
                                                    name: value,
                                                    googlePlaceId: "",
                                                    cityName: "",
                                                    countryCode: "",
                                                    iconEmoji: "",
                                                });
                                            }}
                                            onPlaceSelect={(place) => {
                                                const countryCode = getPlaceComponent(
                                                    place,
                                                    "country",
                                                    "short_name"
                                                ).toUpperCase();
                                                setAddLegError("");
                                                setAddLegPlace({
                                                    name: getTripLegPlaceLabel(place),
                                                    googlePlaceId: place.place_id || "",
                                                    cityName: getTripLegPlaceCity(place),
                                                    countryCode,
                                                    iconEmoji: getFlagEmoji(countryCode),
                                                });
                                            }}
                                            required
                                            placeholder="Choose a city, region, province, state, or country..."
                                            types={TRIP_LEG_PLACE_TYPES}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                        />
                                        <input
                                            type="hidden"
                                            name="google_place_id"
                                            value={addLegPlace.googlePlaceId}
                                        />
                                        <input
                                            type="hidden"
                                            name="city_name"
                                            value={addLegPlace.cityName}
                                        />
                                        <input
                                            type="hidden"
                                            name="country_code"
                                            value={addLegPlace.countryCode}
                                        />
                                        <input
                                            type="hidden"
                                            name="icon_emoji"
                                            value={addLegPlace.iconEmoji}
                                        />
                                        <p className="mt-2 text-xs font-semibold text-slate-500">
                                            Choose the destination from the Google location
                                            list so VAIVIA can save the place correctly.
                                        </p>
                                        {addLegError ? (
                                            <p className="mt-2 text-xs font-bold text-red-200">
                                                {addLegError}
                                            </p>
                                        ) : null}
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Start date
                                        </span>
                                        <input
                                            name="start_date"
                                            type="date"
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            End date
                                        </span>
                                        <input
                                            name="end_date"
                                            type="date"
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        />
                                    </label>
                                </div>

                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Going on this leg
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {memberOptions.length > 0 ? (
                                            memberOptions.map((member) => (
                                                <MemberButton
                                                    key={member.id}
                                                    member={member}
                                                    selected={selectedMemberIds.has(
                                                        member.id
                                                    )}
                                                    onToggle={() => toggleMember(member.id)}
                                                />
                                            ))
                                        ) : (
                                            <p className="text-sm font-semibold text-slate-400">
                                                No active trip members are available yet.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end border-t border-white/10 pt-4">
                                    <button
                                        type="submit"
                                        className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:opacity-60"
                                        disabled={isPending}
                                    >
                                        {isPending ? "Saving..." : "Save leg"}
                                    </button>
                                </div>
                            </form>
                        ) : selectedLocation ? (
                            <form
                                onSubmit={handleEditLegSubmit}
                                className="space-y-5 rounded-2xl border border-lime-300/20 bg-slate-950/80 p-5 sm:p-6"
                            >
                                <input type="hidden" name="trip_id" value={tripId} />
                                <input
                                    type="hidden"
                                    name="revalidate_path"
                                    value={revalidatePathname || ""}
                                />
                                <input
                                    type="hidden"
                                    name="trip_leg_id"
                                    value={
                                        selectedLocation.persistedLegId ||
                                        (selectedLocation.source === "manual"
                                            ? selectedLocation.id
                                            : "")
                                    }
                                />
                                <input
                                    type="hidden"
                                    name="name"
                                    value={selectedLocation.name}
                                />
                                <input
                                    type="hidden"
                                    name="city_name"
                                    value={selectedLocation.cityName || ""}
                                />
                                <input
                                    type="hidden"
                                    name="country_code"
                                    value={selectedLocation.countryCode || ""}
                                />
                                <input
                                    type="hidden"
                                    name="icon_emoji"
                                    value={selectedLocation.iconEmoji || ""}
                                />
                                {Array.from(selectedMemberIds).map((memberId) => (
                                    <input
                                        key={memberId}
                                        type="hidden"
                                        name="trip_member_ids"
                                        value={memberId}
                                    />
                                ))}

                                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Destination
                                    </p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-3xl ring-1 ring-lime-300/25">
                                            {selectedLocation.iconEmoji ||
                                                getFlagEmoji(selectedLocation.countryCode) ||
                                                "📍"}
                                        </span>
                                        <div>
                                            <p className="text-lg font-black text-white">
                                                {selectedLocation.cityName ||
                                                    selectedLocation.name}
                                            </p>
                                            {selectedLocation.countryName ||
                                            selectedLocation.countryCode ? (
                                                <p className="text-sm font-semibold text-slate-400">
                                                    {selectedLocation.countryName ||
                                                        selectedLocation.countryCode}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">
                                        Add or change destinations from Edit trip. This
                                        panel only sets dates and trip mates for the
                                        selected destination.
                                    </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Start date
                                        </span>
                                        <input
                                            name="start_date"
                                            type="date"
                                            defaultValue={selectedLocation?.startDate || ""}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            End date
                                        </span>
                                        <input
                                            name="end_date"
                                            type="date"
                                            defaultValue={selectedLocation?.endDate || ""}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        />
                                    </label>
                                </div>

                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Going on this leg
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {memberOptions.length > 0 ? (
                                            memberOptions.map((member) => (
                                                <MemberButton
                                                    key={member.id}
                                                    member={member}
                                                    selected={selectedMemberIds.has(
                                                        member.id
                                                    )}
                                                    onToggle={() => toggleMember(member.id)}
                                                />
                                            ))
                                        ) : (
                                            <p className="text-sm font-semibold text-slate-400">
                                                No active trip members are available yet.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                                    {selectedLocation ? (
                                        <button
                                            type="button"
                                            onClick={(event) =>
                                                runFormAction(
                                                    deleteLegAction,
                                                    event.currentTarget.form
                                                )
                                            }
                                            className="inline-flex items-center gap-2 rounded-full border border-red-300/25 bg-red-400/10 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-400/20"
                                            disabled={
                                                isPending ||
                                                !(
                                                    selectedLocation.persistedLegId ||
                                                    selectedLocation.source === "manual"
                                                )
                                            }
                                        >
                                            <Trash2
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            Clear dates
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                    <button
                                        type="submit"
                                        className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:opacity-60"
                                        disabled={isPending}
                                    >
                                        {isPending ? "Saving..." : "Save leg"}
                                    </button>
                                </div>
                            </form>
                        ) : null}
                    </div>
                )}
            </AnimatedModal>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                {sortedLocations.map((location) => (
                    <LocationTile
                        key={getLocationKey(location)}
                        location={location}
                        onClick={() => openEditor(location)}
                    />
                ))}
                <AddLegTile onClick={openAddLeg} />
                {children}
            </div>
            {isOpen ? renderModal() : null}
        </>
    );
}
