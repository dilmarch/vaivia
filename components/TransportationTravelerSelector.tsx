"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type {
    TransportationTraveler,
    TransportationTravelerOptions,
} from "@/lib/travelers";
import { getInitials } from "@/lib/travelers";

type TransportationTravelerSelectorProps = {
    options: TransportationTravelerOptions;
    initialTravelers?: TransportationTraveler[];
};

function TravelerAvatar({ traveler }: { traveler: TransportationTraveler }) {
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200">
            {traveler.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={traveler.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
                getInitials(traveler.name)
            )}
        </span>
    );
}

function travelerKey(type: string, id?: string | null, name?: string | null) {
    return `${type}:${id || name || ""}`;
}

export default function TransportationTravelerSelector({
    options,
    initialTravelers = [],
}: TransportationTravelerSelectorProps) {
    const [selectedUserIds, setSelectedUserIds] = useState(
        () =>
            new Set(
                initialTravelers
                    .filter((traveler) => traveler.type === "user" && traveler.user_id)
                    .map((traveler) => traveler.user_id as string)
            )
    );
    const [selectedFamilyIds, setSelectedFamilyIds] = useState(
        () =>
            new Set(
                initialTravelers
                    .filter(
                        (traveler) =>
                            traveler.type === "family" && traveler.family_member_id
                    )
                    .map((traveler) => traveler.family_member_id as string)
            )
    );
    const [guestInput, setGuestInput] = useState("");
    const [guestNames, setGuestNames] = useState(
        () =>
            initialTravelers
                .filter((traveler) => traveler.type === "guest" && traveler.guest_name)
                .map((traveler) => traveler.guest_name as string)
    );

    const selectedTravelers = useMemo(() => {
        const userTravelers = options.users.filter(
            (traveler) => traveler.user_id && selectedUserIds.has(traveler.user_id)
        );
        const familyTravelers = options.familyMembers.filter(
            (traveler) =>
                traveler.family_member_id &&
                selectedFamilyIds.has(traveler.family_member_id)
        );
        const guestTravelers = guestNames.map(
            (name): TransportationTraveler => ({
                type: "guest",
                guest_name: name,
                name,
            })
        );

        return [...userTravelers, ...familyTravelers, ...guestTravelers];
    }, [guestNames, options.familyMembers, options.users, selectedFamilyIds, selectedUserIds]);

    function toggleUser(id: string) {
        setSelectedUserIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleFamily(id: string) {
        setSelectedFamilyIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function addGuest() {
        const name = guestInput.trim();
        if (!name) return;
        setGuestNames((current) =>
            current.some((guest) => guest.toLowerCase() === name.toLowerCase())
                ? current
                : [...current, name]
        );
        setGuestInput("");
    }

    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white">
            <p className="text-sm font-black text-white">
                Who is this transportation for?
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                Select trip members, saved family members, or add a one-off guest name.
            </p>

            {selectedTravelers.map((traveler) => (
                <span key={travelerKey(traveler.type, traveler.user_id || traveler.family_member_id, traveler.guest_name)}>
                    {traveler.user_id ? (
                        <input type="hidden" name="traveler_user_ids" value={traveler.user_id} />
                    ) : null}
                    {traveler.family_member_id ? (
                        <input
                            type="hidden"
                            name="traveler_family_member_ids"
                            value={traveler.family_member_id}
                        />
                    ) : null}
                    {traveler.guest_name ? (
                        <input
                            type="hidden"
                            name="traveler_guest_names"
                            value={traveler.guest_name}
                        />
                    ) : null}
                </span>
            ))}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-lime-200/80">
                        Trip members
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {options.users.length > 0 ? (
                            options.users.map((traveler) => {
                                const id = traveler.user_id || "";
                                const isSelected = selectedUserIds.has(id);
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggleUser(id)}
                                        className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold transition ${
                                            isSelected
                                                ? "border-lime-300/40 bg-lime-300 text-slate-950"
                                                : "border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]"
                                        }`}
                                    >
                                        <TravelerAvatar traveler={traveler} />
                                        {traveler.name}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sm text-slate-400">No trip members yet.</p>
                        )}
                    </div>
                </div>

                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-lime-200/80">
                        Family members
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {options.familyMembers.length > 0 ? (
                            options.familyMembers.map((traveler) => {
                                const id = traveler.family_member_id || "";
                                const isSelected = selectedFamilyIds.has(id);
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggleFamily(id)}
                                        className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-bold transition ${
                                            isSelected
                                                ? "border-lime-300/40 bg-lime-300 text-slate-950"
                                                : "border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]"
                                        }`}
                                    >
                                        <TravelerAvatar traveler={traveler} />
                                        {traveler.name}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sm text-slate-400">
                                No family members yet. Add family members in Settings so
                                they can be selected for trips and transportation.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-wide text-lime-200/80">
                    One-off guests
                </p>
                <div className="mt-2 flex gap-2">
                    <input
                        value={guestInput}
                        onChange={(event) => setGuestInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addGuest();
                            }
                        }}
                        placeholder="Add guest name, e.g. Mom, Luca, Aunt Sarah"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/50"
                    />
                    <button
                        type="button"
                        onClick={addGuest}
                        className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add
                    </button>
                </div>
                {guestNames.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {guestNames.map((name) => (
                            <button
                                key={name}
                                type="button"
                                onClick={() =>
                                    setGuestNames((current) =>
                                        current.filter((guest) => guest !== name)
                                    )
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] py-1.5 pl-1.5 pr-3 text-sm font-bold text-slate-100"
                            >
                                <TravelerAvatar
                                    traveler={{ type: "guest", guest_name: name, name }}
                                />
                                {name}
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}
