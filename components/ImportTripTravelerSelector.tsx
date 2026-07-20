"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { getInitials } from "@/lib/travelers";

export type ImportTravelerOption = {
    type: "user" | "family";
    id: string;
    name: string;
    secondaryLabel?: string | null;
    avatarUrl?: string | null;
};

export type ImportTravelerTrip = {
    id: string;
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    isRecommended: boolean;
    travelers: ImportTravelerOption[];
};

type Selection = {
    userIds: Set<string>;
    familyIds: Set<string>;
    guestNames: string[];
};

type ImportTripTravelerSelectorProps = {
    trips: ImportTravelerTrip[];
    defaultTripId: string;
    inferredTravelerNames: string[];
    currentUserId: string;
    confidenceLabel: "Recommended trip" | "Possible trip" | "Select a trip";
};

function normalizePersonName(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\b(?:mr|mrs|ms|miss|mx|dr)\b/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function getInitialSelection({
    trip,
    inferredTravelerNames,
    currentUserId,
}: {
    trip?: ImportTravelerTrip;
    inferredTravelerNames: string[];
    currentUserId: string;
}): Selection {
    const userIds = new Set<string>();
    const familyIds = new Set<string>();
    const guestNames: string[] = [];
    const matchedKeys = new Set<string>();

    for (const name of inferredTravelerNames) {
        const normalizedName = normalizePersonName(name);
        const match = trip?.travelers.find(
            (traveler) => normalizePersonName(traveler.name) === normalizedName
        );

        if (match) {
            const key = `${match.type}:${match.id}`;
            if (matchedKeys.has(key)) continue;
            matchedKeys.add(key);
            if (match.type === "user") userIds.add(match.id);
            else familyIds.add(match.id);
            continue;
        }

        if (
            normalizedName &&
            !guestNames.some(
                (guestName) => normalizePersonName(guestName) === normalizedName
            )
        ) {
            guestNames.push(name.trim());
        }
    }

    if (inferredTravelerNames.length === 0) {
        const currentUser = trip?.travelers.find(
            (traveler) => traveler.type === "user" && traveler.id === currentUserId
        );
        if (currentUser) userIds.add(currentUser.id);
    }

    return { userIds, familyIds, guestNames };
}

function TravelerAvatar({ traveler }: { traveler: ImportTravelerOption }) {
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200">
            {traveler.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={traveler.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(traveler.name)
            )}
        </span>
    );
}

export default function ImportTripTravelerSelector({
    trips,
    defaultTripId,
    inferredTravelerNames,
    currentUserId,
    confidenceLabel,
}: ImportTripTravelerSelectorProps) {
    const [tripId, setTripId] = useState(defaultTripId);
    const selectedTrip = trips.find((trip) => trip.id === tripId) || trips[0];
    const [selection, setSelection] = useState(() =>
        getInitialSelection({
            trip: trips.find((trip) => trip.id === defaultTripId) || trips[0],
            inferredTravelerNames,
            currentUserId,
        })
    );
    const [guestInput, setGuestInput] = useState("");

    function selectTrip(nextTripId: string) {
        const nextTrip = trips.find((trip) => trip.id === nextTripId);
        setTripId(nextTripId);
        setSelection(
            getInitialSelection({
                trip: nextTrip,
                inferredTravelerNames,
                currentUserId,
            })
        );
        setGuestInput("");
        window.dispatchEvent(
            new CustomEvent("vaivia:import-trip-change", {
                detail: { tripId: nextTripId },
            })
        );
    }

    function toggleTraveler(traveler: ImportTravelerOption) {
        setSelection((current) => {
            const next = {
                userIds: new Set(current.userIds),
                familyIds: new Set(current.familyIds),
                guestNames: current.guestNames,
            };
            const ids = traveler.type === "user" ? next.userIds : next.familyIds;
            if (ids.has(traveler.id)) ids.delete(traveler.id);
            else ids.add(traveler.id);
            return next;
        });
    }

    function addGuest() {
        const name = guestInput.trim();
        if (!name) return;

        setSelection((current) => ({
            ...current,
            guestNames: current.guestNames.some(
                (guest) => normalizePersonName(guest) === normalizePersonName(name)
            )
                ? current.guestNames
                : [...current.guestNames, name],
        }));
        setGuestInput("");
    }

    const selectedCount =
        selection.userIds.size +
        selection.familyIds.size +
        selection.guestNames.length;

    return (
        <section className="space-y-4 rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-4">
            <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                    {confidenceLabel}
                </span>
                {trips.length ? (
                    <select
                        name="trip_id"
                        value={selectedTrip?.id || ""}
                        onChange={(event) => selectTrip(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none focus:border-lime-300/50"
                    >
                        {trips.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                                {trip.title}
                                {trip.isRecommended ? " · Recommended" : ""}
                                {trip.startDate ? ` · ${trip.startDate}` : ""}
                                {trip.endDate ? ` - ${trip.endDate}` : ""}
                            </option>
                        ))}
                    </select>
                ) : null}
            </label>

            {trips.length ? (
                <div className="border-t border-lime-100/15 pt-4">
                    <p className="text-sm font-black text-lime-50">
                        Who is this import for?
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-lime-50/75">
                        Passenger names found in the confirmation are selected when they
                        match a trip member. Review the selection before adding.
                    </p>

                    {Array.from(selection.userIds).map((id) => (
                        <input key={`user:${id}`} type="hidden" name="traveler_user_ids" value={id} />
                    ))}
                    {Array.from(selection.familyIds).map((id) => (
                        <input
                            key={`family:${id}`}
                            type="hidden"
                            name="traveler_family_member_ids"
                            value={id}
                        />
                    ))}
                    {selection.guestNames.map((name) => (
                        <input key={`guest:${name}`} type="hidden" name="traveler_guest_names" value={name} />
                    ))}

                    <div className="mt-3 flex flex-wrap gap-2">
                        {selectedTrip?.travelers.map((traveler) => {
                            const selected =
                                traveler.type === "user"
                                    ? selection.userIds.has(traveler.id)
                                    : selection.familyIds.has(traveler.id);
                            return (
                                <button
                                    key={`${traveler.type}:${traveler.id}`}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => toggleTraveler(traveler)}
                                    className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold transition ${
                                        selected
                                            ? "border-lime-200/50 bg-lime-300 text-slate-950"
                                            : "border-white/10 bg-slate-950/70 text-slate-100 hover:bg-slate-900"
                                    }`}
                                >
                                    <TravelerAvatar traveler={traveler} />
                                    <span>
                                        {traveler.name}
                                        {traveler.secondaryLabel ? (
                                            <span className="ml-1 text-xs opacity-70">
                                                {traveler.secondaryLabel}
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {selection.guestNames.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {selection.guestNames.map((name) => (
                                <span
                                    key={name}
                                    className="inline-flex items-center gap-2 rounded-full border border-lime-200/40 bg-lime-300 px-3 py-2 text-sm font-black text-slate-950"
                                >
                                    {name}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelection((current) => ({
                                                ...current,
                                                guestNames: current.guestNames.filter(
                                                    (guest) => guest !== name
                                                ),
                                            }))
                                        }
                                        aria-label={`Remove ${name}`}
                                        className="rounded-full p-0.5 hover:bg-black/10"
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : null}

                    <div className="mt-3 flex gap-2">
                        <input
                            value={guestInput}
                            onChange={(event) => setGuestInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    addGuest();
                                }
                            }}
                            placeholder="Add another passenger"
                            maxLength={120}
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/50"
                        />
                        <button
                            type="button"
                            onClick={addGuest}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-black text-lime-200"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add
                        </button>
                    </div>

                    {selectedCount === 0 ? (
                        <p className="mt-3 text-xs font-black text-amber-100">
                            Select at least one traveler before adding this import.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
