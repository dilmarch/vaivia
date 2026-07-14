"use client";

import { Lock } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import { COMMON_CURRENCIES } from "@/lib/budget";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";
import type { TripAudienceMode, TripAudienceOption } from "@/lib/tripAudience";
import type { MoveTargetTrip } from "@/lib/tripMove";
import type {
    TransportationTraveler,
    TransportationTravelerOptions,
} from "@/lib/travelers";

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
    travelerOptions?: TransportationTravelerOptions;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
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
        reservation_code?: string | null;
        cost?: number | null;
        currency?: string | null;
        duration?: string | null;
        notes?: string | null;
        is_private?: boolean | null;
        audience_mode?: TripAudienceMode | null;
        audience_selected_options?: TripAudienceOption[];
        travelers?: TransportationTraveler[];
    };
};

export default function TransportationEditForm({
    tripId,
    itemId,
    submitAction,
    onCancel,
    audienceOptions = [],
    currentUserTripMemberId = null,
    moveItemAction,
    moveTargetTrips = [],
    initialItem,
}: TransportationEditFormProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
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
    const [audienceMode, setAudienceMode] = useState<TripAudienceMode>(
        initialItem.audience_mode || "everyone"
    );
    const [costAmount, setCostAmount] = useState(
        initialItem.cost == null ? "" : String(initialItem.cost)
    );
    const duration = getZonedDurationLabel({
        startDate: departureDate,
        startTime: departureTime,
        startTimezone: departureTimezone,
        endDate: arrivalDate,
        endTime: arrivalTime,
        endTimezone: arrivalTimezone,
    });
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);

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
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="duration" value={duration} />

            <TripAudienceSelector
                options={audienceOptions}
                currentUserTripMemberId={currentUserTripMemberId}
                initialAudienceMode={initialItem.audience_mode || "everyone"}
                initialSelectedOptions={initialItem.audience_selected_options || []}
                description="Choose who this itinerary item is for."
                privateSectionId="transportation-edit-private-section"
                onAudienceModeChange={setAudienceMode}
            />

            <label
                id="transportation-edit-private-section"
                className={`flex scroll-mt-24 items-start gap-3 rounded-md border p-4 text-sm transition ${
                    audienceMode === "just_me"
                        ? "border-slate-700 bg-slate-950 text-slate-200 shadow-xl shadow-black/20"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
            >
                <input
                    type="checkbox"
                    name="is_private"
                    defaultChecked={Boolean(initialItem.is_private)}
                    className={`mt-1 h-4 w-4 rounded ${
                        audienceMode === "just_me"
                            ? "border-slate-500 text-lime-300"
                            : "border-slate-300 text-slate-900"
                    }`}
                />
                <span>
                    <span
                        className={`flex items-center gap-2 font-semibold ${
                            audienceMode === "just_me"
                                ? "text-white"
                                : "text-slate-900"
                        }`}
                    >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Private
                    </span>
                    <span
                        className={`mt-1 block text-xs ${
                            audienceMode === "just_me"
                                ? "text-slate-300"
                                : "text-slate-500"
                        }`}
                    >
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

            <div className="grid gap-4 md:grid-cols-4">
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
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Reservation code
                    <input
                        name="reservation_code"
                        defaultValue={initialItem.reservation_code || ""}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Cost
                    <input
                        type="number"
                        name="cost"
                        min="0"
                        step="0.01"
                        value={costAmount}
                        onChange={(event) => setCostAmount(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                    Currency
                    <select
                        name="currency"
                        defaultValue={initialItem.currency || "CAD"}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    >
                        {COMMON_CURRENCIES.map((currency) => (
                            <option key={currency} value={currency}>
                                {currency}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <CostAllocationFields
                amount={costAmount}
                participants={audienceOptions}
                currentUserTripMemberId={currentUserTripMemberId}
                tone="light"
            />

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

            <div className="flex flex-wrap justify-end gap-2">
                {moveItemAction ? (
                    <MoveTripItemButton
                        itemType="transportation"
                        itemId={itemId.replace("transportation:", "")}
                        currentTripId={tripId}
                        targetTrips={moveTargetTrips}
                        moveAction={moveItemAction}
                        itemLabel={
                            initialItem.flight_number ||
                            initialItem.airline_name ||
                            "transportation"
                        }
                        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    />
                ) : null}
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
