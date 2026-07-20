"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { findImportedFlightMatch } from "@/lib/importFlightMatching";
import type { EditableImportedFlight } from "@/lib/travelEmailImportReview";

export type ExistingFlightMatchRecord = {
    id: string;
    status?: string | null;
    transport_number?: string | null;
    provider_name?: string | null;
    reservation_code?: string | null;
    baggage_info?: string | null;
    seat_number?: string | null;
    cabin_class?: string | null;
    departure_location?: string | null;
    arrival_location?: string | null;
    departure_date?: string | null;
    departure_time?: string | null;
    arrival_date?: string | null;
    arrival_time?: string | null;
    departure_timezone?: string | null;
    arrival_timezone?: string | null;
    departure_terminal?: string | null;
    arrival_terminal?: string | null;
    cost?: number | null;
    currency?: string | null;
};

type ComparisonRow = {
    label: string;
    existingValue?: string | number | null;
    importedValue?: string | number | null;
    forceBooked?: boolean;
};

function cleanValue(value?: string | number | null) {
    return String(value ?? "").trim();
}

function getComparisonOutcome(row: ComparisonRow) {
    const existing = cleanValue(row.existingValue);
    const imported = cleanValue(row.importedValue);

    if (row.forceBooked && (!existing || existing.toLowerCase() === "planned")) {
        return { label: "Will mark Booked", className: "text-lime-200" };
    }
    if (!existing && imported) {
        return { label: "Will add", className: "text-lime-200" };
    }
    if (existing && imported && existing.toLowerCase() !== imported.toLowerCase()) {
        return { label: "Different · existing kept", className: "text-amber-200" };
    }
    return { label: "Already matches", className: "text-slate-400" };
}

function FlightComparison({
    existing,
    imported,
}: {
    existing: ExistingFlightMatchRecord;
    imported: EditableImportedFlight;
}) {
    const rows: ComparisonRow[] = [
        {
            label: "Status",
            existingValue: existing.status,
            importedValue: "booked",
            forceBooked: true,
        },
        {
            label: "Airline",
            existingValue: existing.provider_name,
            importedValue: imported.airlineName,
        },
        {
            label: "Flight number",
            existingValue: existing.transport_number,
            importedValue: imported.flightNumber,
        },
        {
            label: "Departure airport",
            existingValue: existing.departure_location,
            importedValue: imported.departureLocation,
        },
        {
            label: "Departure",
            existingValue: [existing.departure_date, existing.departure_time]
                .filter(Boolean)
                .join(" · "),
            importedValue: [imported.departureDate, imported.departureTime]
                .filter(Boolean)
                .join(" · "),
        },
        {
            label: "Departure time zone",
            existingValue: existing.departure_timezone,
            importedValue: imported.departureTimezone,
        },
        {
            label: "Arrival airport",
            existingValue: existing.arrival_location,
            importedValue: imported.arrivalLocation,
        },
        {
            label: "Arrival",
            existingValue: [existing.arrival_date, existing.arrival_time]
                .filter(Boolean)
                .join(" · "),
            importedValue: [imported.arrivalDate, imported.arrivalTime]
                .filter(Boolean)
                .join(" · "),
        },
        {
            label: "Arrival time zone",
            existingValue: existing.arrival_timezone,
            importedValue: imported.arrivalTimezone,
        },
        {
            label: "Reservation code",
            existingValue: existing.reservation_code,
            importedValue: imported.reservationCode,
        },
        {
            label: "Seat",
            existingValue: existing.seat_number,
            importedValue: imported.seatNumber,
        },
        {
            label: "Cabin",
            existingValue: existing.cabin_class,
            importedValue: imported.cabinClass,
        },
        {
            label: "Luggage",
            existingValue: existing.baggage_info,
            importedValue: imported.luggageRequirements,
        },
        {
            label: "Cost",
            existingValue:
                existing.cost == null
                    ? ""
                    : `${existing.cost} ${existing.currency || ""}`.trim(),
            importedValue: imported.cost
                ? `${imported.cost} ${imported.currency || ""}`.trim()
                : "",
        },
    ];

    return (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <span>Field</span>
                <span>Already in trip</span>
                <span>From import</span>
            </div>
            {rows.map((row) => {
                const outcome = getComparisonOutcome(row);
                return (
                    <div
                        key={row.label}
                        className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-white/[0.06] px-3 py-2 text-xs last:border-b-0"
                    >
                        <span className="font-black text-slate-300">
                            {row.label}
                            <span className={`mt-0.5 block text-[9px] ${outcome.className}`}>
                                {outcome.label}
                            </span>
                        </span>
                        <span className="break-words text-slate-300">
                            {cleanValue(row.existingValue) || "—"}
                        </span>
                        <span className="break-words text-white">
                            {cleanValue(row.importedValue) || "—"}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export default function ImportFlightMatchReview({
    itemId,
    importedFlight,
    flightRecordsByTrip,
    defaultTripId,
    tripHrefsById,
}: {
    itemId: string;
    importedFlight: EditableImportedFlight;
    flightRecordsByTrip: Record<string, ExistingFlightMatchRecord[]>;
    defaultTripId: string;
    tripHrefsById: Record<string, string>;
}) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [tripId, setTripId] = useState(defaultTripId);
    const [matchAction, setMatchAction] = useState<"merge" | "separate">("merge");
    const [draftFlight, setDraftFlight] = useState(importedFlight);
    const duplicateRecord = findImportedFlightMatch(
        flightRecordsByTrip[tripId] || [],
        draftFlight
    );

    useEffect(() => {
        const form = rootRef.current?.closest("form");
        if (!form) return;

        function getValue(name: string, fallback: string) {
            const control = form?.elements.namedItem(name);
            return control instanceof HTMLInputElement ||
                control instanceof HTMLTextAreaElement ||
                control instanceof HTMLSelectElement
                ? control.value
                : fallback;
        }

        function syncDraftFlight(event?: Event) {
            const target = event?.target;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement
            ) {
                if (!target.name.startsWith(`${itemId}:`)) return;
            }

            setDraftFlight((current) => ({
                ...current,
                airlineName: getValue(
                    `${itemId}:leg_0_airline_name`,
                    current.airlineName
                ),
                flightNumber: getValue(
                    `${itemId}:leg_0_flight_number`,
                    current.flightNumber
                ),
                departureLocation: getValue(
                    `${itemId}:leg_0_departure_location`,
                    current.departureLocation
                ),
                departureDate: getValue(
                    `${itemId}:leg_0_departure_date`,
                    current.departureDate
                ),
                departureTime: getValue(
                    `${itemId}:leg_0_departure_time`,
                    current.departureTime
                ),
                arrivalLocation: getValue(
                    `${itemId}:leg_0_arrival_location`,
                    current.arrivalLocation
                ),
                arrivalDate: getValue(
                    `${itemId}:leg_0_arrival_date`,
                    current.arrivalDate
                ),
                arrivalTime: getValue(
                    `${itemId}:leg_0_arrival_time`,
                    current.arrivalTime
                ),
                departureTimezone: getValue(
                    `${itemId}:leg_0_departure_timezone`,
                    current.departureTimezone
                ),
                arrivalTimezone: getValue(
                    `${itemId}:leg_0_arrival_timezone`,
                    current.arrivalTimezone
                ),
                reservationCode: getValue(
                    `${itemId}:reservationCode`,
                    current.reservationCode
                ),
                seatNumber: getValue(`${itemId}:seatNumber`, current.seatNumber),
                cabinClass: getValue(`${itemId}:cabinClass`, current.cabinClass),
                luggageRequirements: getValue(
                    `${itemId}:luggageRequirements`,
                    current.luggageRequirements
                ),
                cost: getValue(`${itemId}:cost`, current.cost),
                currency: getValue(`${itemId}:currency`, current.currency),
                status: getValue(`${itemId}:status`, current.status),
            }));
        }

        syncDraftFlight();
        form.addEventListener("input", syncDraftFlight);
        form.addEventListener("change", syncDraftFlight);
        return () => {
            form.removeEventListener("input", syncDraftFlight);
            form.removeEventListener("change", syncDraftFlight);
        };
    }, [importedFlight, itemId]);

    useEffect(() => {
        function handleTripChange(event: Event) {
            const nextTripId = (event as CustomEvent<{ tripId?: string }>).detail
                ?.tripId;
            if (!nextTripId) return;
            setTripId(nextTripId);
            setMatchAction("merge");
        }

        window.addEventListener("vaivia:import-trip-change", handleTripChange);
        return () =>
            window.removeEventListener("vaivia:import-trip-change", handleTripChange);
    }, []);

    useEffect(() => {
        setMatchAction("merge");
    }, [duplicateRecord?.id]);

    if (!duplicateRecord) {
        return (
            <div ref={rootRef}>
                <input
                    type="hidden"
                    name={`match_action_${itemId}`}
                    value="create"
                />
            </div>
        );
    }

    return (
        <div ref={rootRef}>
            <section className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
                <p className="text-sm font-black text-amber-100">
                    Possible duplicate found
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/80">
                    Compare the saved flight with this confirmation. Merging fills
                    missing details, keeps conflicting saved values, and changes
                    Planned to Booked.
                </p>

                <FlightComparison existing={duplicateRecord} imported={draftFlight} />

                <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
                    <legend className="sr-only">
                        How should VAIVIA handle this match?
                    </legend>
                    <label
                        className={`rounded-xl border p-3 transition ${
                            matchAction === "merge"
                                ? "border-lime-200/50 bg-lime-300/15"
                                : "border-white/10 bg-black/20"
                        }`}
                    >
                        <span className="flex items-start gap-2">
                            <input
                                type="radio"
                                name={`match_action_${itemId}`}
                                value="merge"
                                checked={matchAction === "merge"}
                                onChange={() => setMatchAction("merge")}
                                className="mt-0.5 h-4 w-4 accent-lime-300"
                            />
                            <span>
                                <span className="block text-sm font-black text-white">
                                    Merge with existing
                                </span>
                                <span className="mt-1 block text-xs text-slate-300">
                                    Recommended · one complete flight record
                                </span>
                            </span>
                        </span>
                    </label>
                    <label
                        className={`rounded-xl border p-3 transition ${
                            matchAction === "separate"
                                ? "border-lime-200/50 bg-lime-300/15"
                                : "border-white/10 bg-black/20"
                        }`}
                    >
                        <span className="flex items-start gap-2">
                            <input
                                type="radio"
                                name={`match_action_${itemId}`}
                                value="separate"
                                checked={matchAction === "separate"}
                                onChange={() => setMatchAction("separate")}
                                className="mt-0.5 h-4 w-4 accent-lime-300"
                            />
                            <span>
                                <span className="block text-sm font-black text-white">
                                    Add separately
                                </span>
                                <span className="mt-1 block text-xs text-slate-300">
                                    Keep both flight records
                                </span>
                            </span>
                        </span>
                    </label>
                </fieldset>

                {tripHrefsById[tripId] ? (
                    <Link
                        href={tripHrefsById[tripId]}
                        className="mt-3 inline-flex rounded-full border border-amber-200/30 px-3 py-1 text-xs font-black text-amber-100 transition hover:bg-amber-300/10"
                    >
                        Open existing flight
                    </Link>
                ) : null}
            </section>
        </div>
    );
}
