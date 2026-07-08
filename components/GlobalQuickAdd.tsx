"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createAccommodation } from "@/app/actions/accommodations";
import { AccommodationCreateModal } from "@/components/accommodations/AccommodationManager";

type QuickAddTrip = {
    id: string;
    title: string | null;
};

type GlobalQuickAddProps = {
    trips: QuickAddTrip[];
};

type TripAction =
    | "transportation"
    | "accommodation"
    | "food"
    | "scheduled"
    | "idea";

const tripActionLabels: Record<TripAction, string> = {
    transportation: "Add transportation",
    accommodation: "Add accommodation",
    food: "Add food or restaurant",
    scheduled: "Add scheduled activity/event",
    idea: "Add activity idea",
};

function getCurrentTripId(pathname: string | null) {
    const match = pathname?.match(/^\/trips\/([^/?#]+)/);
    const tripId = match?.[1];

    if (!tripId || tripId === "new") return null;
    return decodeURIComponent(tripId);
}

function getTripLabel(trip: QuickAddTrip) {
    return trip.title?.trim() || "Untitled trip";
}

export default function GlobalQuickAdd({ trips }: GlobalQuickAddProps) {
    const pathname = usePathname();
    const currentTripId = getCurrentTripId(pathname);
    const [isOpen, setIsOpen] = useState(false);
    const [tripPickerAction, setTripPickerAction] = useState<TripAction | null>(
        null
    );
    const [accommodationTripId, setAccommodationTripId] = useState<string | null>(
        null
    );
    const quickAddRef = useRef<HTMLDivElement | null>(null);
    const currentTrip = useMemo(
        () => trips.find((trip) => trip.id === currentTripId) || null,
        [currentTripId, trips]
    );
    const isMainTripDetailRoute =
        currentTripId && pathname === `/trips/${encodeURIComponent(currentTripId)}`;

    useEffect(() => {
        if (!isOpen) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                quickAddRef.current &&
                !quickAddRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setTripPickerAction(null);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [isOpen]);

    function openTripAction(action: TripAction) {
        if (action === "accommodation" && currentTripId) {
            setAccommodationTripId(currentTripId);
            setIsOpen(false);
            setTripPickerAction(null);
            return;
        }

        setTripPickerAction(action);
    }

    function getTripActionHref(tripId: string, action: TripAction) {
        if (action === "accommodation") return null;
        if (action === "idea") return `/trips/${tripId}?tab=ideas`;
        if (action === "transportation") return `/trips/${tripId}?tab=journey`;
        return `/trips/${tripId}`;
    }

    const quickAddBubbleClass =
        "animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200";

    if (isMainTripDetailRoute) return null;

    return (
        <>
            {accommodationTripId ? (
                <AccommodationCreateModal
                    tripId={accommodationTripId}
                    createAction={createAccommodation}
                    onClose={() => setAccommodationTripId(null)}
                />
            ) : null}

            <div
                ref={quickAddRef}
                className="fixed bottom-6 right-6 z-40 flex flex-col items-end"
            >
                {isOpen && (
                    <div className="mb-3 flex flex-col items-end gap-2">
                        {tripPickerAction ? (
                            <div className="w-72 rounded-[24px] border border-lime-300/20 bg-[#0c0115]/90 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                                <button
                                    type="button"
                                    onClick={() => setTripPickerAction(null)}
                                    className="mb-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-lime-100 transition hover:bg-lime-300/20"
                                >
                                    Back
                                </button>
                                <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-lime-200">
                                    Choose a trip
                                </p>
                                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                                    {trips.length > 0 ? (
                                        trips.map((trip, index) => {
                                            const href = getTripActionHref(
                                                trip.id,
                                                tripPickerAction
                                            );

                                            if (!href) {
                                                return (
                                                    <button
                                                        key={trip.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setAccommodationTripId(trip.id);
                                                            setIsOpen(false);
                                                            setTripPickerAction(null);
                                                        }}
                                                        className={quickAddBubbleClass}
                                                        style={{
                                                            animationDelay: `${index * 34}ms`,
                                                        }}
                                                    >
                                                        {getTripLabel(trip)}
                                                    </button>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={trip.id}
                                                    href={href}
                                                    className={quickAddBubbleClass}
                                                    style={{
                                                        animationDelay: `${index * 34}ms`,
                                                    }}
                                                >
                                                    {getTripLabel(trip)}
                                                </Link>
                                            );
                                        })
                                    ) : (
                                        <p className="px-3 py-2 text-sm text-slate-400">
                                            Create a trip first.
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        <Link
                            href="/trips/new"
                            className={quickAddBubbleClass}
                            style={{ animationDelay: "0ms" }}
                        >
                            Add trip
                        </Link>
                        {(Object.keys(tripActionLabels) as TripAction[]).map(
                            (action, index) => (
                                <button
                                    key={action}
                                    type="button"
                                    onClick={() => openTripAction(action)}
                                    className={quickAddBubbleClass}
                                    style={{
                                        animationDelay: `${(index + 1) * 34}ms`,
                                    }}
                                >
                                    {tripActionLabels[action]}
                                </button>
                            )
                        )}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
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

                {currentTrip ? (
                    <p className="mt-2 max-w-44 truncate rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-bold text-slate-300 shadow-xl shadow-black/20 backdrop-blur-xl">
                        {getTripLabel(currentTrip)}
                    </p>
                ) : null}
            </div>
        </>
    );
}
