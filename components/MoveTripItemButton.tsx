"use client";

import { MoveRight, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import type { MoveTargetTrip } from "@/lib/tripMove";

type MoveTripItemButtonProps = {
    itemType: "itinerary" | "transportation" | "accommodation" | "idea" | "food";
    itemId: string;
    currentTripId: string;
    targetTrips: MoveTargetTrip[];
    moveAction: (formData: FormData) => Promise<void>;
    itemLabel?: string;
    className?: string;
};

export default function MoveTripItemButton({
    itemType,
    itemId,
    currentTripId,
    targetTrips,
    moveAction,
    itemLabel = "this item",
    className,
}: MoveTripItemButtonProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [targetTripId, setTargetTripId] = useState(targetTrips[0]?.id || "");
    const queryString = searchParams.toString();
    const returnPath = queryString ? `${pathname}?${queryString}` : pathname;

    if (targetTrips.length === 0) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={
                    className ||
                    "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                }
            >
                <MoveRight className="h-4 w-4" aria-hidden="true" />
                MOVE
            </button>

            {isOpen ? (
                <AnimatedModal onClose={() => setIsOpen(false)} panelClassName="max-w-lg">
                    {({ requestClose }) => (
                        <div className="p-6 text-white">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                        Move item
                                    </p>
                                    <h2 className="mt-2 text-3xl font-black">
                                        Move to another trip
                                    </h2>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                        Choose where to move {itemLabel}. This keeps the
                                        item details and removes trip-specific participant
                                        selections.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="rounded-full border border-white/10 bg-white/[0.06] p-2 text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                                    aria-label="Close move modal"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </div>

                            <form action={moveAction} className="mt-6 space-y-5">
                                <input
                                    type="hidden"
                                    name="current_trip_id"
                                    value={currentTripId}
                                />
                                <input type="hidden" name="item_id" value={itemId} />
                                <input type="hidden" name="item_type" value={itemType} />
                                <input
                                    type="hidden"
                                    name="return_path"
                                    value={returnPath}
                                />

                                <label className="block text-sm font-black text-white">
                                    Destination trip
                                    <select
                                        name="target_trip_id"
                                        value={targetTripId}
                                        onChange={(event) =>
                                            setTargetTripId(event.target.value)
                                        }
                                        required
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none [color-scheme:dark] focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                    >
                                        {targetTrips.map((trip) => (
                                            <option
                                                key={trip.id}
                                                value={trip.id}
                                                className="bg-slate-950 text-white"
                                            >
                                                {trip.title}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                                    >
                                        <MoveRight
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                        Move item
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </AnimatedModal>
            ) : null}
        </>
    );
}
