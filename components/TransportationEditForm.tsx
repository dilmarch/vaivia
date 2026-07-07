"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";

const TRANSPORTATION_STATUS_OPTIONS = [
    { value: "planned", label: "Planned" },
    { value: "booked", label: "Booked" },
    { value: "confirmed", label: "Confirmed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "completed", label: "Completed" },
] as const;

function getTransportationFormStatus(status?: string | null) {
    return TRANSPORTATION_STATUS_OPTIONS.some((option) => option.value === status)
        ? status ?? "planned"
        : "planned";
}

type TransportationEditFormProps = {
    tripId: string;
    itemId: string;
    submitAction: (formData: FormData) => Promise<void>;
    onCancel?: () => void;
    initialItem: {
        status?: string | null;
        item_date?: string | null;
        end_date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        departure_location?: string | null;
        arrival_location?: string | null;
        departure_timezone?: string | null;
        arrival_timezone?: string | null;
        departure_terminal?: string | null;
        arrival_terminal?: string | null;
        flight_number?: string | null;
        airline_name?: string | null;
        airline_code?: string | null;
        duration?: string | null;
        notes?: string | null;
        is_private?: boolean | null;
    };
};

export default function TransportationEditForm({
    tripId,
    itemId,
    submitAction,
    onCancel,
    initialItem,
}: TransportationEditFormProps) {
    const [departureLocation, setDepartureLocation] = useState(
        initialItem.departure_location || ""
    );
    const [arrivalLocation, setArrivalLocation] = useState(
        initialItem.arrival_location || ""
    );
    const [departureTerminal, setDepartureTerminal] = useState(
        initialItem.departure_terminal || ""
    );
    const [arrivalTerminal, setArrivalTerminal] = useState(
        initialItem.arrival_terminal || ""
    );
    const [departureTimezone, setDepartureTimezone] = useState(
        initialItem.departure_timezone || ""
    );
    const [arrivalTimezone, setArrivalTimezone] = useState(
        initialItem.arrival_timezone || ""
    );
    const [departureDate, setDepartureDate] = useState(initialItem.item_date || "");
    const [departureTime, setDepartureTime] = useState(initialItem.start_time || "");
    const [arrivalDate, setArrivalDate] = useState(initialItem.end_date || "");
    const [arrivalTime, setArrivalTime] = useState(initialItem.end_time || "");
    const duration = getZonedDurationLabel({
        startDate: departureDate,
        startTime: departureTime,
        startTimezone: departureTimezone,
        endDate: arrivalDate,
        endTime: arrivalTime,
        endTimezone: arrivalTimezone,
    });

    function swapDepartureAndArrival() {
        setDepartureLocation(arrivalLocation);
        setArrivalLocation(departureLocation);
        setDepartureTerminal(arrivalTerminal);
        setArrivalTerminal(departureTerminal);
        setDepartureTimezone(arrivalTimezone);
        setArrivalTimezone(departureTimezone);
    }

    return (
        <form action={submitAction} className="space-y-5 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="trip_id" value={tripId} />
            <input type="hidden" name="item_id" value={itemId} />
            <input type="hidden" name="duration" value={duration} />

            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <input
                    type="checkbox"
                    name="is_private"
                    defaultChecked={Boolean(initialItem.is_private)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Private
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                        Mark this transportation as visible only to you when trip sharing is enabled.
                    </span>
                </span>
            </label>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={swapDepartureAndArrival}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                    Swap departure and arrival
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Departure airport
                    <input
                        name="departure_location"
                        value={departureLocation}
                        onChange={(event) => setDepartureLocation(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Arrival airport
                    <input
                        name="arrival_location"
                        value={arrivalLocation}
                        onChange={(event) => setArrivalLocation(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Departure terminal
                    <input
                        name="departure_terminal"
                        value={departureTerminal}
                        onChange={(event) => setDepartureTerminal(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Arrival terminal
                    <input
                        name="arrival_terminal"
                        value={arrivalTerminal}
                        onChange={(event) => setArrivalTerminal(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Depart date
                    <input
                        name="item_date"
                        type="date"
                        value={departureDate}
                        onChange={(event) => setDepartureDate(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Depart time
                    <input
                        name="start_time"
                        type="time"
                        value={departureTime}
                        onChange={(event) => setDepartureTime(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Arrive date
                    <input
                        name="end_date"
                        type="date"
                        value={arrivalDate}
                        onChange={(event) => setArrivalDate(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Arrive time
                    <input
                        name="end_time"
                        type="time"
                        value={arrivalTime}
                        onChange={(event) => setArrivalTime(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Departure time zone
                    <input
                        name="departure_timezone"
                        value={departureTimezone}
                        onChange={(event) => setDepartureTimezone(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Arrival time zone
                    <input
                        name="arrival_timezone"
                        value={arrivalTimezone}
                        onChange={(event) => setArrivalTimezone(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Flight number
                    <input
                        name="flight_number"
                        defaultValue={initialItem.flight_number || ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Airline
                    <input
                        name="airline_name"
                        defaultValue={initialItem.airline_name || ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Airline code
                    <input
                        name="airline_code"
                        defaultValue={initialItem.airline_code || ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
            </div>

            <label className="block space-y-1 text-sm font-medium text-slate-700">
                Notes
                <textarea
                    name="notes"
                    rows={6}
                    defaultValue={initialItem.notes || ""}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
            </label>

            <select
                name="status"
                defaultValue={getTransportationFormStatus(initialItem.status)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            >
                {TRANSPORTATION_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>

            <div className="flex justify-end gap-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                    Save changes
                </button>
            </div>
        </form>
    );
}
