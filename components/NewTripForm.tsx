"use client";

import {
    useActionState,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import {
    BedDouble,
    Bus,
    CalendarClock,
    Check,
    ChevronLeft,
    GripVertical,
    Lightbulb,
    Lock,
    Minus,
    Plane,
    Plus,
    Train,
    UsersRound,
} from "lucide-react";

import AnimatedModal from "@/components/AnimatedModal";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import {
    getAirlineNameFromCode,
    inferAirlineCodeFromFlightNumber,
} from "@/lib/airline";
import { COMMON_CURRENCIES } from "@/lib/budget";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";
import { sanitizeTripSlugInput, slugifyTripTitle } from "@/lib/tripRoutes";

export type CreateTripFormState = {
    error?: string | null;
    fieldErrors?: {
        title?: string;
        slug?: string;
    };
    values?: {
        title?: string;
        slug?: string;
    };
    createdTrip?: {
        id: string;
        slug: string;
        href: string;
        currentUserTripMemberId?: string | null;
    };
    savedSetupStep?: WizardStep | null;
};

export type NewTripInviteOption = {
    id: string;
    name: string;
    secondaryLabel?: string | null;
    avatarUrl?: string | null;
    identifier?: string | null;
};

type NewTripFormProps = {
    action: (
        state: CreateTripFormState,
        formData: FormData
    ) => Promise<CreateTripFormState>;
    nextTripNumber: number;
    isOnboarding?: boolean;
    inviteOptions?: {
        friends: NewTripInviteOption[];
        familyMembers: NewTripInviteOption[];
    };
    currentUser?: {
        displayName: string;
        username?: string | null;
        avatarUrl?: string | null;
    };
};

type PlannedItem =
    | "none"
    | "flights"
    | "train"
    | "bus"
    | "accommodations"
    | "event";

type ActivityPlanningChoice = "scheduled" | "idea";

type WizardStep =
    | "basics"
    | "dates"
    | "planned"
    | "flight"
    | "train"
    | "bus"
    | "accommodations"
    | "activityChoice"
    | "scheduled"
    | "idea";

const initialState: CreateTripFormState = {
    error: null,
    fieldErrors: {},
    values: {},
};

const MAX_MATRIX_DESTINATIONS = 6;
const MATRIX_PLACE_TYPES = ["(regions)"];

function createEmptyMatrixDestination() {
    return {
        destination: "",
        placeId: "",
        arrivalDate: "",
    };
}

type SelectedDestination = {
    label: string;
    placeId?: string | null;
};

function areSelectedDestinationsEqual(
    left: SelectedDestination[],
    right: SelectedDestination[]
) {
    if (left.length !== right.length) return false;

    return left.every((destination, index) => {
        const other = right[index];
        return (
            destination.label === other.label &&
            (destination.placeId || "") === (other.placeId || "")
        );
    });
}

function getDateDiffDays(startDate: string, endDate: string) {
    if (!startDate || !endDate) return null;

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    return Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
}

function formatDuration(days: number | null) {
    if (days == null) return "Auto";
    return `${days} day${days === 1 ? "" : "s"}`;
}

function getMatrixPlaceLabel(place: google.maps.places.PlaceResult) {
    return place.name || place.formatted_address || "";
}

type SetupFlightLeg = {
    departureLocation: string;
    departurePlaceId: string;
    departureDate: string;
    departureTime: string;
    departureTimezone: string;
    arrivalLocation: string;
    arrivalPlaceId: string;
    arrivalDate: string;
    arrivalTime: string;
    arrivalTimezone: string;
    departureTerminal: string;
    arrivalTerminal: string;
    flightNumber: string;
    airlineName: string;
};

function createEmptySetupFlightLeg(defaultDate = ""): SetupFlightLeg {
    return {
        departureLocation: "",
        departurePlaceId: "",
        departureDate: defaultDate,
        departureTime: "",
        departureTimezone: "",
        arrivalLocation: "",
        arrivalPlaceId: "",
        arrivalDate: defaultDate,
        arrivalTime: "",
        arrivalTimezone: "",
        departureTerminal: "",
        arrivalTerminal: "",
        flightNumber: "",
        airlineName: "",
    };
}

function normalizeFlightNumberInput(value: string) {
    return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function getPlaceCoordinates(place: google.maps.places.PlaceResult) {
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();

    return typeof lat === "number" && typeof lng === "number"
        ? { lat, lng }
        : null;
}

function getSetupFlightDurationLabel(leg: SetupFlightLeg) {
    return getZonedDurationLabel({
        startDate: leg.departureDate,
        startTime: leg.departureTime,
        startTimezone: leg.departureTimezone,
        endDate: leg.arrivalDate,
        endTime: leg.arrivalTime,
        endTimezone: leg.arrivalTimezone,
    });
}

function SetupFlightFields({
    inputClass,
    labelClass,
    defaultDate,
    audienceOptions,
    currentUserTripMemberId,
}: {
    inputClass: string;
    labelClass: string;
    defaultDate: string;
    audienceOptions: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
}) {
    const [isPrivate, setIsPrivate] = useState(false);
    const [connectionCount, setConnectionCount] = useState(0);
    const [flightLegs, setFlightLegs] = useState<SetupFlightLeg[]>(() => [
        createEmptySetupFlightLeg(defaultDate),
    ]);
    const [costAmount, setCostAmount] = useState("");

    useEffect(() => {
        const nextLegCount = connectionCount + 1;
        setFlightLegs((currentLegs) => {
            if (currentLegs.length === nextLegCount) return currentLegs;
            if (currentLegs.length > nextLegCount) {
                return currentLegs.slice(0, nextLegCount);
            }

            return [
                ...currentLegs,
                ...Array.from(
                    { length: nextLegCount - currentLegs.length },
                    () => createEmptySetupFlightLeg(defaultDate)
                ),
            ];
        });
    }, [connectionCount, defaultDate]);

    function updateLeg(index: number, field: keyof SetupFlightLeg, value: string) {
        setFlightLegs((currentLegs) =>
            currentLegs.map((leg, legIndex) => {
                if (legIndex !== index) return leg;

                const nextLeg = { ...leg, [field]: value };
                if (
                    field === "departureDate" &&
                    (!leg.arrivalDate || leg.arrivalDate === leg.departureDate)
                ) {
                    nextLeg.arrivalDate = value;
                }
                if (field === "flightNumber") {
                    const airlineCode = inferAirlineCodeFromFlightNumber(value);
                    nextLeg.airlineName = getAirlineNameFromCode(airlineCode);
                }

                return nextLeg;
            })
        );
    }

    async function resolveLegTimezone({
        index,
        field,
        lat,
        lng,
        date,
    }: {
        index: number;
        field: "departureTimezone" | "arrivalTimezone";
        lat: number;
        lng: number;
        date?: string;
    }) {
        try {
            const response = await fetch("/api/timezone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat, lng, date: date || undefined }),
            });
            const data: { timeZoneId?: string } = await response.json();
            if (data.timeZoneId) updateLeg(index, field, data.timeZoneId);
        } catch {
            // Manual timezone entry remains available.
        }
    }

    const firstLeg = flightLegs[0] || createEmptySetupFlightLeg(defaultDate);
    const lastLeg = flightLegs.at(-1) || firstLeg;
    const firstFlightNumber = normalizeFlightNumberInput(firstLeg.flightNumber);
    const firstAirlineCode = inferAirlineCodeFromFlightNumber(firstFlightNumber);
    const totalDuration = getZonedDurationLabel({
        startDate: firstLeg.departureDate,
        startTime: firstLeg.departureTime,
        startTimezone: firstLeg.departureTimezone,
        endDate: lastLeg.arrivalDate,
        endTime: lastLeg.arrivalTime,
        endTimezone: lastLeg.arrivalTimezone,
    });

    return (
        <div className="space-y-5 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
            <input type="hidden" name="setup_save_flight" value="true" />
            <input type="hidden" name="transportation_mode" value="airplane" />
            <input type="hidden" name="flight_leg_count" value={flightLegs.length} />
            <input type="hidden" name="airline_code" value={firstAirlineCode} />
            <input type="hidden" name="duration" value={totalDuration} />
            <input type="hidden" name="item_date" value={firstLeg.departureDate} />
            <input type="hidden" name="start_time" value={firstLeg.departureTime} />
            <input type="hidden" name="end_date" value={lastLeg.arrivalDate} />
            <input type="hidden" name="end_time" value={lastLeg.arrivalTime} />
            <input
                type="hidden"
                name="departure_location"
                value={firstLeg.departureLocation}
            />
            <input
                type="hidden"
                name="arrival_location"
                value={lastLeg.arrivalLocation}
            />
            <input
                type="hidden"
                name="departure_timezone"
                value={firstLeg.departureTimezone}
            />
            <input
                type="hidden"
                name="arrival_timezone"
                value={lastLeg.arrivalTimezone}
            />
            <input
                type="hidden"
                name="departure_terminal"
                value={firstLeg.departureTerminal}
            />
            <input
                type="hidden"
                name="arrival_terminal"
                value={lastLeg.arrivalTerminal}
            />
            <input type="hidden" name="airline_name" value={firstLeg.airlineName} />
            <input type="hidden" name="flight_number" value={firstFlightNumber} />

            <label
                className={`flex items-start gap-3 rounded-2xl border p-4 text-sm transition ${
                    isPrivate
                        ? "border-lime-300/30 bg-slate-950 text-white"
                        : "border-white/10 bg-slate-950/50 text-slate-200"
                }`}
            >
                <input
                    type="checkbox"
                    name="is_private"
                    checked={isPrivate}
                    onChange={(event) => setIsPrivate(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-lime-300"
                />
                <span>
                    <span className="flex items-center gap-2 font-black text-white">
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Private
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-400">
                        Mark this transportation as visible only to you when trip
                        sharing is enabled.
                    </span>
                </span>
            </label>

            <div>
                <p className={labelClass}>Select mode of transportation</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <span className="rounded-2xl border border-lime-300 bg-lime-300 px-3 py-2 text-sm font-black text-slate-950">
                        <span className="mr-2">✈️</span>
                        Airplane
                    </span>
                    {["🚆 Train", "🚌 Bus", "🚊 Tram", "⛴️ Ferry", "🚕 Taxi"].map(
                        (label) => (
                            <span
                                key={label}
                                className="rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm font-black text-slate-500"
                                aria-disabled="true"
                            >
                                {label}
                            </span>
                        )
                    )}
                </div>
            </div>

            <div>
                <p className={labelClass}>Is this flight direct?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {[
                        { label: "Direct", value: 0 },
                        { label: "1 connection", value: 1 },
                        { label: "2 connections", value: 2 },
                        { label: "3 connections", value: 3 },
                        { label: "4 connections", value: 4 },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setConnectionCount(option.value)}
                            className={`rounded-2xl border px-3 py-2 text-sm font-black transition ${
                                connectionCount === option.value
                                    ? "border-lime-300 bg-lime-300 text-slate-950"
                                    : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                {flightLegs.map((leg, index) => {
                    const legFlightNumber = normalizeFlightNumberInput(
                        leg.flightNumber
                    );
                    const legAirlineCode =
                        inferAirlineCodeFromFlightNumber(legFlightNumber);
                    const legDuration = getSetupFlightDurationLabel(leg);

                    return (
                        <fieldset
                            key={index}
                            className="space-y-4 rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-4"
                        >
                            <legend className="px-1 text-sm font-black text-lime-100">
                                Flight leg {index + 1}
                            </legend>

                            <input
                                type="hidden"
                                name={`leg_${index}_duration`}
                                value={legDuration}
                            />
                            <input
                                type="hidden"
                                name={`leg_${index}_airline_code`}
                                value={legAirlineCode}
                            />
                            <input
                                type="hidden"
                                name={`leg_${index}_flight_number`}
                                value={legFlightNumber}
                            />
                            <input
                                type="hidden"
                                name={`leg_${index}_departure_google_place_id`}
                                value={leg.departurePlaceId}
                            />
                            <input
                                type="hidden"
                                name={`leg_${index}_arrival_google_place_id`}
                                value={leg.arrivalPlaceId}
                            />

                            <div className="grid gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className={labelClass}>
                                        Departure airport, code, or city
                                    </span>
                                    <PlaceAutocompleteInput
                                        name={`leg_${index}_departure_location`}
                                        value={leg.departureLocation}
                                        onInputChange={(value) => {
                                            updateLeg(
                                                index,
                                                "departureLocation",
                                                value
                                            );
                                            updateLeg(index, "departurePlaceId", "");
                                        }}
                                        onPlaceSelect={(place) => {
                                            updateLeg(
                                                index,
                                                "departureLocation",
                                                getMatrixPlaceLabel(place)
                                            );
                                            updateLeg(
                                                index,
                                                "departurePlaceId",
                                                place.place_id || ""
                                            );
                                            const coordinates =
                                                getPlaceCoordinates(place);
                                            if (coordinates) {
                                                void resolveLegTimezone({
                                                    index,
                                                    field: "departureTimezone",
                                                    lat: coordinates.lat,
                                                    lng: coordinates.lng,
                                                    date: leg.departureDate,
                                                });
                                            }
                                        }}
                                        placeholder="Departure airport, code, or city"
                                        types={["airport"]}
                                        required
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>
                                        Arrival airport, code, or city
                                    </span>
                                    <PlaceAutocompleteInput
                                        name={`leg_${index}_arrival_location`}
                                        value={leg.arrivalLocation}
                                        onInputChange={(value) => {
                                            updateLeg(index, "arrivalLocation", value);
                                            updateLeg(index, "arrivalPlaceId", "");
                                        }}
                                        onPlaceSelect={(place) => {
                                            updateLeg(
                                                index,
                                                "arrivalLocation",
                                                getMatrixPlaceLabel(place)
                                            );
                                            updateLeg(
                                                index,
                                                "arrivalPlaceId",
                                                place.place_id || ""
                                            );
                                            const coordinates =
                                                getPlaceCoordinates(place);
                                            if (coordinates) {
                                                void resolveLegTimezone({
                                                    index,
                                                    field: "arrivalTimezone",
                                                    lat: coordinates.lat,
                                                    lng: coordinates.lng,
                                                    date: leg.arrivalDate,
                                                });
                                            }
                                        }}
                                        placeholder="Arrival airport, code, or city"
                                        types={["airport"]}
                                        required
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className={labelClass}>
                                        Departure date
                                    </span>
                                    <input
                                        name={`leg_${index}_departure_date`}
                                        type="date"
                                        required
                                        value={leg.departureDate}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "departureDate",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>
                                        Departure time
                                    </span>
                                    <input
                                        name={`leg_${index}_departure_time`}
                                        type="time"
                                        required
                                        value={leg.departureTime}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "departureTime",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>Arrival date</span>
                                    <input
                                        name={`leg_${index}_arrival_date`}
                                        type="date"
                                        required
                                        value={leg.arrivalDate}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "arrivalDate",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>Arrival time</span>
                                    <input
                                        name={`leg_${index}_arrival_time`}
                                        type="time"
                                        required
                                        value={leg.arrivalTime}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "arrivalTime",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <label className="block">
                                    <span className={labelClass}>
                                        Departure time zone
                                    </span>
                                    <input
                                        name={`leg_${index}_departure_timezone`}
                                        value={leg.departureTimezone}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "departureTimezone",
                                                event.target.value
                                            )
                                        }
                                        placeholder="America/St_Johns"
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>
                                        Arrival time zone
                                    </span>
                                    <input
                                        name={`leg_${index}_arrival_timezone`}
                                        value={leg.arrivalTimezone}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "arrivalTimezone",
                                                event.target.value
                                            )
                                        }
                                        placeholder="America/Toronto"
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <div className="grid gap-3 md:grid-cols-4">
                                <label className="block">
                                    <span className={labelClass}>
                                        Departure terminal
                                    </span>
                                    <input
                                        name={`leg_${index}_departure_terminal`}
                                        value={leg.departureTerminal}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "departureTerminal",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>Arrival terminal</span>
                                    <input
                                        name={`leg_${index}_arrival_terminal`}
                                        value={leg.arrivalTerminal}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "arrivalTerminal",
                                                event.target.value
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>Flight number</span>
                                    <input
                                        value={leg.flightNumber}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "flightNumber",
                                                event.target.value.toUpperCase()
                                            )
                                        }
                                        placeholder="AC692"
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>Airline</span>
                                    <input
                                        name={`leg_${index}_airline_name`}
                                        value={leg.airlineName}
                                        onChange={(event) =>
                                            updateLeg(
                                                index,
                                                "airlineName",
                                                event.target.value
                                            )
                                        }
                                        placeholder={
                                            legAirlineCode
                                                ? `Airline (${legAirlineCode})`
                                                : "Airline"
                                        }
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            {legDuration ? (
                                <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-300">
                                    Calculated flight duration: {legDuration}
                                </p>
                            ) : null}
                        </fieldset>
                    );
                })}
            </div>

            <label className="block">
                <span className={labelClass}>Reservation code / booking reference</span>
                <input
                    name="reservation_code"
                    placeholder="Reservation code / booking reference"
                    className={inputClass}
                />
            </label>

            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <label className="block">
                    <span className={labelClass}>Cost</span>
                    <input
                        type="number"
                        name="cost"
                        min="0"
                        step="0.01"
                        value={costAmount}
                        onChange={(event) => setCostAmount(event.target.value)}
                        placeholder="Cost"
                        className={inputClass}
                    />
                </label>
                <label className="block">
                    <span className={labelClass}>Currency</span>
                    <select name="currency" defaultValue="CAD" className={inputClass}>
                        {COMMON_CURRENCIES.map((currency) => (
                            <option key={currency} value={currency}>
                                {currency}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {audienceOptions.length > 0 ? (
                <CostAllocationFields
                    amount={costAmount}
                    participants={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                    tone="dark"
                />
            ) : (
                <input type="hidden" name="split_method" value="just_me" />
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className={labelClass}>VISA requirements</span>
                    <textarea
                        name="visa_requirements"
                        rows={4}
                        placeholder="VISA requirements"
                        className={inputClass}
                    />
                </label>
                <label className="block">
                    <span className={labelClass}>Luggage requirements</span>
                    <textarea
                        name="luggage_requirements"
                        rows={4}
                        placeholder="Luggage requirements"
                        className={inputClass}
                    />
                </label>
            </div>

            {totalDuration ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-300">
                    Total duration: {totalDuration}
                </div>
            ) : null}

            <label className="block">
                <span className={labelClass}>Status</span>
                <select name="status" defaultValue="planned" className={inputClass}>
                    {[
                        ["planned", "Planned"],
                        ["booked", "Booked"],
                        ["confirmed", "Confirmed"],
                        ["cancelled", "Cancelled"],
                        ["completed", "Completed"],
                    ].map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

const plannedOptions: Array<{
    id: PlannedItem;
    label: string;
    icon: typeof Plane;
}> = [
    { id: "none", label: "No", icon: Check },
    { id: "flights", label: "Flights", icon: Plane },
    { id: "train", label: "Train", icon: Train },
    { id: "bus", label: "Bus", icon: Bus },
    { id: "accommodations", label: "Accommodations", icon: BedDouble },
    { id: "event", label: "Event / itinerary item", icon: CalendarClock },
];

function getStepTitle(step: WizardStep) {
    switch (step) {
        case "basics":
            return "Where are you going?";
        case "dates":
            return "Dates";
        case "planned":
            return "Do you have anything planned yet?";
        case "flight":
            return "Add flight details";
        case "train":
            return "Add train details";
        case "bus":
            return "Add bus details";
        case "accommodations":
            return "Add accommodations";
        case "activityChoice":
            return "Activities";
        case "scheduled":
            return "Add scheduled activity";
        case "idea":
            return "Add activity idea";
    }
}

function SimpleField({
    label,
    name,
    placeholder,
    type = "text",
}: {
    label: string;
    name: string;
    placeholder?: string;
    type?: string;
}) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
            </span>
            <input
                name={name}
                type={type}
                placeholder={placeholder}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
            />
        </label>
    );
}

function InviteAvatar({ option }: { option: NewTripInviteOption }) {
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200">
            {option.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={option.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(option.name)
            )}
        </span>
    );
}

export default function NewTripForm({
    action,
    nextTripNumber,
    isOnboarding = false,
    inviteOptions = { friends: [], familyMembers: [] },
    currentUser = { displayName: "Me" },
}: NewTripFormProps) {
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(action, initialState);
    const formRef = useRef<HTMLFormElement | null>(null);
    const createModeInputRef = useRef<HTMLInputElement | null>(null);
    const [title, setTitle] = useState(state.values?.title || "");
    const [slug, setSlug] = useState(
        state.values?.slug || slugifyTripTitle("", nextTripNumber)
    );
    const [isSlugManual, setIsSlugManual] = useState(false);
    const [dateMode, setDateMode] = useState<"known" | "thinking">("thinking");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [plannedItems, setPlannedItems] = useState<Set<PlannedItem>>(
        () => new Set(["none"])
    );
    const [activityChoices, setActivityChoices] = useState<
        Set<ActivityPlanningChoice>
    >(() => new Set());
    const [goingDestinations, setGoingDestinations] = useState<
        SelectedDestination[]
    >([]);
    const [startDestination, setStartDestination] = useState("");
    const [startDestinationPlaceId, setStartDestinationPlaceId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [nextDestinations, setNextDestinations] = useState<
        ReturnType<typeof createEmptyMatrixDestination>[]
    >([]);
    const [returnDestination, setReturnDestination] = useState("");
    const [returnDestinationPlaceId, setReturnDestinationPlaceId] = useState("");
    const [isReturnDestinationManual, setIsReturnDestinationManual] =
        useState(false);
    const [returnDate, setReturnDate] = useState("");
    const [draggedMatrixDestinationIndex, setDraggedMatrixDestinationIndex] =
        useState<number | null>(null);
    const [selectedFriendInviteIds, setSelectedFriendInviteIds] = useState<
        Set<string>
    >(() => new Set());
    const [selectedFamilyInviteIds, setSelectedFamilyInviteIds] = useState<
        Set<string>
    >(() => new Set());
    const [createdTrip, setCreatedTrip] = useState<
        CreateTripFormState["createdTrip"] | null
    >(null);
    const [backgroundCreateState, setBackgroundCreateState] =
        useState<CreateTripFormState>(initialState);
    const [isCreatingTripInBackground, setIsCreatingTripInBackground] =
        useState(false);
    const [isSavingSetupFlight, setIsSavingSetupFlight] = useState(false);

    useEffect(() => {
        if (isSlugManual) return;
        setSlug(slugifyTripTitle(title, nextTripNumber));
    }, [isSlugManual, nextTripNumber, title]);

    useEffect(() => {
        if (isReturnDestinationManual) return;
        setReturnDestination(startDestination);
        setReturnDestinationPlaceId(startDestinationPlaceId);
    }, [isReturnDestinationManual, startDestination, startDestinationPlaceId]);

    useEffect(() => {
        setNextDestinations((current) =>
            goingDestinations.map((destination) => {
                const existingRow = current.find(
                    (row) => row.destination === destination.label
                );

                return {
                    destination: destination.label,
                    placeId: destination.placeId || existingRow?.placeId || "",
                    arrivalDate: existingRow?.arrivalDate || "",
                };
            })
        );
    }, [goingDestinations]);

    const handleSelectedDestinationsChange = useCallback(
        (destinations: SelectedDestination[]) => {
            setGoingDestinations((current) =>
                areSelectedDestinationsEqual(current, destinations)
                    ? current
                    : destinations
            );
        },
        []
    );

    const steps = useMemo<WizardStep[]>(() => {
        const selected = plannedItems;
        const nextSteps: WizardStep[] = ["basics", "dates", "planned"];

        if (selected.has("flights")) nextSteps.push("flight");
        if (selected.has("train")) nextSteps.push("train");
        if (selected.has("bus")) nextSteps.push("bus");
        if (selected.has("accommodations")) nextSteps.push("accommodations");
        if (selected.has("event")) nextSteps.push("activityChoice");
        if (activityChoices.has("scheduled")) nextSteps.push("scheduled");
        if (activityChoices.has("idea")) nextSteps.push("idea");

        return nextSteps;
    }, [activityChoices, plannedItems]);
    const currentStep = steps[Math.min(currentIndex, steps.length - 1)] || "basics";
    const isLastStep = currentIndex >= steps.length - 1;
    const setupAudienceOptions = useMemo<TripAudienceOption[]>(() => {
        const options: TripAudienceOption[] = [];

        if (createdTrip?.currentUserTripMemberId) {
            options.push({
                kind: "member",
                id: createdTrip.currentUserTripMemberId,
                displayName: currentUser.displayName || "Me",
                avatarUrl: currentUser.avatarUrl || null,
                secondaryLabel: currentUser.username ? `@${currentUser.username}` : null,
                status: "accepted",
                isCurrentUser: true,
            });
        }

        selectedFamilyInviteIds.forEach((familyMemberId) => {
            const familyMember = inviteOptions.familyMembers.find(
                (member) => member.id === familyMemberId
            );
            if (!familyMember) return;

            options.push({
                kind: "family_member",
                id: familyMember.id,
                displayName: familyMember.name,
                avatarUrl: familyMember.avatarUrl || null,
                secondaryLabel: familyMember.secondaryLabel || "Family member",
                status: "family_member",
            });
        });

        return options;
    }, [
        createdTrip?.currentUserTripMemberId,
        currentUser.avatarUrl,
        currentUser.displayName,
        currentUser.username,
        inviteOptions.familyMembers,
        selectedFamilyInviteIds,
    ]);
    const matrixDates = useMemo(
        () => [
            startDate,
            ...nextDestinations.map((row) => row.arrivalDate),
            returnDate,
        ],
        [nextDestinations, returnDate, startDate]
    );
    const totalDuration = getDateDiffDays(startDate, returnDate);

    useEffect(() => {
        setCurrentIndex((index) => Math.min(index, steps.length - 1));
    }, [steps.length]);

    function updateNextDestination(
        index: number,
        key: "destination" | "arrivalDate" | "placeId",
        value: string
    ) {
        setNextDestinations((current) =>
            current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, [key]: value } : row
            )
        );
    }

    function insertNextDestination(afterIndex: number) {
        setNextDestinations((current) => {
            if (current.length >= MAX_MATRIX_DESTINATIONS) return current;
            const next = [...current];
            next.splice(afterIndex + 1, 0, createEmptyMatrixDestination());
            return next;
        });
    }

    function removeNextDestination(index: number) {
        setNextDestinations((current) =>
            current.filter((_, rowIndex) => rowIndex !== index)
        );
    }

    function reorderNextDestination(fromIndex: number, toIndex: number) {
        setNextDestinations((current) => {
            if (
                fromIndex === toIndex ||
                fromIndex < 0 ||
                toIndex < 0 ||
                fromIndex >= current.length ||
                toIndex >= current.length
            ) {
                return current;
            }

            const next = [...current];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    }

    function togglePlannedItem(item: PlannedItem) {
        setPlannedItems((current) => {
            const next = new Set(current);

            if (item === "none") {
                return new Set(["none"]);
            }

            next.delete("none");
            if (next.has(item)) next.delete(item);
            else next.add(item);

            return next.size > 0 ? next : new Set(["none"]);
        });
    }

    function toggleActivityChoice(choice: ActivityPlanningChoice) {
        setActivityChoices((current) => {
            const next = new Set(current);
            if (next.has(choice)) next.delete(choice);
            else next.add(choice);
            return next;
        });
    }

    function toggleFriendInvite(friendId: string) {
        setSelectedFriendInviteIds((current) => {
            const next = new Set(current);
            if (next.has(friendId)) next.delete(friendId);
            else next.add(friendId);
            return next;
        });
    }

    function toggleFamilyInvite(familyMemberId: string) {
        setSelectedFamilyInviteIds((current) => {
            const next = new Set(current);
            if (next.has(familyMemberId)) next.delete(familyMemberId);
            else next.add(familyMemberId);
            return next;
        });
    }

    function goNext() {
        setCurrentIndex((index) => Math.min(index + 1, steps.length - 1));
    }

    function goBack() {
        setCurrentIndex((index) => Math.max(0, index - 1));
    }

    async function createTripInBackgroundThenContinue() {
        if (createdTrip) {
            goNext();
            return;
        }

        const form = formRef.current;
        if (!form) return;
        if (!form.reportValidity()) return;

        setIsCreatingTripInBackground(true);
        setBackgroundCreateState(initialState);

        try {
            const formData = new FormData(form);
            formData.set("create_mode", "background");
            const result = await action(initialState, formData);

            if (result.createdTrip) {
                setCreatedTrip(result.createdTrip);
                setBackgroundCreateState(initialState);
                goNext();
                return;
            }

            setBackgroundCreateState(result);
        } catch (error) {
            console.error("Could not create trip before planning steps:", error);
            setBackgroundCreateState({
                error: "Could not create trip. Please try again.",
            });
        } finally {
            setIsCreatingTripInBackground(false);
        }
    }

    async function saveSetupFlightThenContinue() {
        const form = formRef.current;
        if (!createdTrip?.id || !form) return;
        if (!form.reportValidity()) return;

        setIsSavingSetupFlight(true);
        setBackgroundCreateState(initialState);

        try {
            const formData = new FormData(form);
            formData.set("create_mode", "save_setup_flight");
            formData.set("created_trip_id", createdTrip.id);
            const result = await action(initialState, formData);

            if (result.error || result.fieldErrors?.title || result.fieldErrors?.slug) {
                setBackgroundCreateState(result);
                return;
            }

            if (result.createdTrip) {
                setCreatedTrip(result.createdTrip);
            }

            setBackgroundCreateState(initialState);

            if (isLastStep) {
                router.push(result.createdTrip?.href || createdTrip.href);
                return;
            }

            goNext();
        } catch (error) {
            console.error("Could not save setup flight:", error);
            setBackgroundCreateState({
                error: "Could not save the flight details.",
            });
        } finally {
            setIsSavingSetupFlight(false);
        }
    }

    function handleNext() {
        if (currentStep === "basics" && !formRef.current?.reportValidity()) {
            return;
        }

        if (currentStep === "dates") {
            void createTripInBackgroundThenContinue();
            return;
        }

        if (currentStep === "flight" && createdTrip) {
            void saveSetupFlightThenContinue();
            return;
        }

        goNext();
    }

    function handleGoToTrip() {
        if (createdTrip?.href && currentStep === "flight") {
            void saveSetupFlightThenContinue();
            return;
        }

        if (createdTrip?.href) {
            router.push(createdTrip.href);
        }
    }

    const inputClass =
        "mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50";
    const labelClass =
        "text-xs font-black uppercase tracking-[0.16em] text-slate-500";
    const formError =
        state.error ||
        backgroundCreateState.error ||
        state.fieldErrors?.title ||
        backgroundCreateState.fieldErrors?.title ||
        state.fieldErrors?.slug ||
        backgroundCreateState.fieldErrors?.slug ||
        null;
    const isBusy =
        isPending || isCreatingTripInBackground || isSavingSetupFlight;

    return (
        <AnimatedModal
            onClose={() => router.push(isOnboarding ? "/" : "/")}
            panelClassName="max-w-5xl overflow-hidden"
            labelledBy="addTripWizardTitle"
        >
            {({ requestClose }) => (
                <form ref={formRef} action={formAction}>
                    <input
                        ref={createModeInputRef}
                        type="hidden"
                        name="create_mode"
                        defaultValue=""
                    />
                    <input
                        type="hidden"
                        name="created_trip_id"
                        value={createdTrip?.id || ""}
                    />
                    <input
                        type="hidden"
                        name="slug_was_manual"
                        value={isSlugManual ? "true" : "false"}
                    />
                    <input
                        type="hidden"
                        name="date_mode_state"
                        value={dateMode}
                    />
                    <input
                        type="hidden"
                        name="matrix_start_destination_state"
                        value={startDestination}
                    />
                    <input
                        type="hidden"
                        name="matrix_start_place_id_state"
                        value={startDestinationPlaceId}
                    />
                    <input
                        type="hidden"
                        name="matrix_start_date_state"
                        value={startDate}
                    />
                    <input
                        type="hidden"
                        name="matrix_return_destination_state"
                        value={returnDestination}
                    />
                    <input
                        type="hidden"
                        name="matrix_return_place_id_state"
                        value={returnDestinationPlaceId}
                    />
                    <input
                        type="hidden"
                        name="matrix_return_date_state"
                        value={returnDate}
                    />
                    {nextDestinations.map((row, index) => (
                        <span key={`matrix-state-${index}`} className="hidden">
                            <input
                                type="hidden"
                                name={`matrix_next_destination_state_${index}`}
                                value={row.destination}
                            />
                            <input
                                type="hidden"
                                name={`matrix_next_place_id_state_${index}`}
                                value={row.placeId}
                            />
                            <input
                                type="hidden"
                                name={`matrix_next_arrival_date_state_${index}`}
                                value={row.arrivalDate}
                            />
                        </span>
                    ))}
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">
                                Add trip · {currentIndex + 1} of {steps.length}
                            </p>
                            <h2 id="addTripWizardTitle" className="vaivia-modal-title">
                                {getStepTitle(currentStep)}
                            </h2>
                            <p className="vaivia-modal-subtitle">
                                Start with what you know. You can adjust details later.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close add trip"
                        >
                            ×
                        </button>
                    </div>

                    <div className="vaivia-modal-body space-y-5">
                        {formError ? (
                            <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                {formError}
                            </p>
                        ) : null}

                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-10">
                            {steps.map((step, index) => (
                                <span
                                    key={`${step}-${index}`}
                                    className={`h-2 rounded-full ${
                                        index <= currentIndex
                                            ? "bg-lime-300"
                                            : "bg-white/10"
                                    }`}
                                />
                            ))}
                        </div>

                        <div
                            className={currentStep === "basics" ? "space-y-5" : "hidden"}
                            aria-hidden={currentStep !== "basics"}
                        >
                                <label className="block">
                                    <span className={labelClass}>
                                        Where are you leaving from?
                                    </span>
                                    <PlaceAutocompleteInput
                                        name="trip_origin"
                                        value={startDestination}
                                        onInputChange={(value) => {
                                            setStartDestination(value);
                                            setStartDestinationPlaceId("");
                                        }}
                                        onPlaceSelect={(place) => {
                                            setStartDestination(
                                                getMatrixPlaceLabel(place)
                                            );
                                            setStartDestinationPlaceId(
                                                place.place_id || ""
                                            );
                                        }}
                                        placeholder="Search one city, airport region, province/state, or country..."
                                        types={MATRIX_PLACE_TYPES}
                                        className={inputClass}
                                    />
                                    <input
                                        type="hidden"
                                        name="trip_origin_place_id"
                                        value={startDestinationPlaceId}
                                    />
                                    <p className="mt-2 text-xs font-semibold text-slate-500">
                                        Enter one Google-validated place. VAIVIA will
                                        use this as your start and return destination.
                                    </p>
                                </label>

                                <TripDestinationPicker
                                    inputId="tripCreateDestination"
                                    label="Where are you going?"
                                    placeholder="Add as many Google-validated destinations as you want..."
                                    initialDestinations={goingDestinations}
                                    onDestinationsChange={
                                        handleSelectedDestinationsChange
                                    }
                                />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="block">
                                        <span className={labelClass}>Trip name</span>
                                        <input
                                            id="title"
                                            name="title"
                                            type="text"
                                            required
                                            placeholder="Berlin & Asia 2026"
                                            value={title}
                                            onChange={(event) =>
                                                setTitle(event.target.value)
                                            }
                                            className={inputClass}
                                        />
                                        {state.fieldErrors?.title ? (
                                            <p className="mt-2 text-sm font-semibold text-red-200">
                                                {state.fieldErrors.title}
                                            </p>
                                        ) : null}
                                    </label>

                                    <label className="block">
                                        <span className={labelClass}>Slug</span>
                                        <div className="mt-2 flex rounded-2xl border border-white/10 bg-slate-950/70 focus-within:border-lime-300/50">
                                            <span className="shrink-0 rounded-l-2xl border-r border-white/10 px-4 py-3 text-sm font-black text-slate-500">
                                                trips/
                                            </span>
                                            <input
                                                id="slug"
                                                name="slug"
                                                type="text"
                                                required
                                                value={slug}
                                                onChange={(event) => {
                                                    setIsSlugManual(true);
                                                    setSlug(
                                                        sanitizeTripSlugInput(
                                                            event.target.value
                                                        )
                                                    );
                                                }}
                                                className="min-w-0 flex-1 rounded-r-2xl bg-transparent px-4 py-3 text-sm font-bold text-white outline-none"
                                            />
                                        </div>
                                        {state.fieldErrors?.slug ? (
                                            <p className="mt-2 text-sm font-semibold text-red-200">
                                                {state.fieldErrors.slug}
                                            </p>
                                        ) : null}
                                    </label>
                                </div>

                                <label className="block">
                                    <span className={labelClass}>
                                        Invite people (optional)
                                    </span>
                                    <input
                                        name="initial_invites"
                                        type="text"
                                        placeholder="Email or username, separated by commas"
                                        className={inputClass}
                                    />
                                </label>

                                {inviteOptions.friends.length > 0 ||
                                inviteOptions.familyMembers.length > 0 ? (
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                                        <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-200">
                                            Quick select
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            Tap friends to invite them. Tap family
                                            members to add them to Going.
                                        </p>

                                        {inviteOptions.friends.length > 0 ? (
                                            <div className="mt-4">
                                                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                                    Friends
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {inviteOptions.friends.map(
                                                        (friend) => {
                                                            const selected =
                                                                selectedFriendInviteIds.has(
                                                                    friend.id
                                                                );
                                                            const disabled =
                                                                !friend.identifier;

                                                            return (
                                                                <button
                                                                    key={friend.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleFriendInvite(
                                                                            friend.id
                                                                        )
                                                                    }
                                                                    disabled={disabled}
                                                                    className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                                                        selected
                                                                            ? "border-lime-300/50 bg-lime-300 text-slate-950"
                                                                            : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                                    }`}
                                                                >
                                                                    <InviteAvatar
                                                                        option={friend}
                                                                    />
                                                                    <span>
                                                                        {friend.name}
                                                                    </span>
                                                                </button>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {inviteOptions.familyMembers.length > 0 ? (
                                            <div className="mt-4">
                                                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                                    Family members
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {inviteOptions.familyMembers.map(
                                                        (member) => {
                                                            const selected =
                                                                selectedFamilyInviteIds.has(
                                                                    member.id
                                                                );

                                                            return (
                                                                <button
                                                                    key={member.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleFamilyInvite(
                                                                            member.id
                                                                        )
                                                                    }
                                                                    className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-black transition ${
                                                                        selected
                                                                            ? "border-lime-300/50 bg-lime-300 text-slate-950"
                                                                            : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                                    }`}
                                                                >
                                                                    <InviteAvatar
                                                                        option={member}
                                                                    />
                                                                    <span>
                                                                        {member.name}
                                                                    </span>
                                                                </button>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {inviteOptions.friends.map((friend) =>
                                            selectedFriendInviteIds.has(friend.id) &&
                                            friend.identifier ? (
                                                <input
                                                    key={friend.id}
                                                    type="hidden"
                                                    name="initial_invites"
                                                    value={friend.identifier}
                                                />
                                            ) : null
                                        )}
                                        {Array.from(selectedFamilyInviteIds).map(
                                            (familyMemberId) => (
                                                <input
                                                    key={familyMemberId}
                                                    type="hidden"
                                                    name="initial_family_member_ids"
                                                    value={familyMemberId}
                                                />
                                            )
                                        )}
                                    </div>
                                ) : null}

                                <label className="block">
                                    <span className={labelClass}>Notes</span>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        rows={4}
                                        placeholder="Anything important about this trip..."
                                        className={inputClass}
                                    />
                                </label>
                        </div>

                        <div
                            className={currentStep === "dates" ? "space-y-5" : "hidden"}
                            aria-hidden={currentStep !== "dates"}
                        >
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                        {
                                            value: "known",
                                            title: "I know my dates",
                                            text: "Add your dates and destinations now.",
                                        },
                                        {
                                            value: "thinking",
                                            title: "I'm still thinking",
                                            text: "VAIVIA is the perfect tool to plan your trip even if some details are still unknown.",
                                        },
                                    ].map((option) => (
                                        <label
                                            key={option.value}
                                            className={`cursor-pointer rounded-[1.5rem] border p-5 transition ${
                                                dateMode === option.value
                                                    ? "border-lime-300 bg-lime-300 text-slate-950"
                                                    : "border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="date_mode"
                                                value={option.value}
                                                checked={dateMode === option.value}
                                                onChange={() =>
                                                    setDateMode(
                                                        option.value as
                                                            | "known"
                                                            | "thinking"
                                                    )
                                                }
                                                className="sr-only"
                                            />
                                            <span className="block text-lg font-black">
                                                {option.title}
                                            </span>
                                            <span className="mt-2 block text-sm font-semibold">
                                                {option.text}
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                {dateMode === "known" ? (
                                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                                        <p className="text-sm font-black uppercase tracking-[0.16em] text-lime-200">
                                            Date & destination matrix
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            Don&apos;t worry, you can change these later.
                                        </p>
                                        <div className="mt-4 space-y-3">
                                            <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/55 p-3 md:grid-cols-[1.2fr_0.8fr_0.65fr_auto] md:items-end">
                                                <label className="block">
                                                    <span className={labelClass}>
                                                        Start destination
                                                    </span>
                                                    <PlaceAutocompleteInput
                                                        name="matrix_start_destination"
                                                        value={startDestination}
                                                        onInputChange={(value) => {
                                                            setStartDestination(value);
                                                            setStartDestinationPlaceId("");
                                                        }}
                                                        onPlaceSelect={(place) => {
                                                            setStartDestination(
                                                                getMatrixPlaceLabel(place)
                                                            );
                                                            setStartDestinationPlaceId(
                                                                place.place_id || ""
                                                            );
                                                        }}
                                                        placeholder="Toronto, Berlin, Taiwan..."
                                                        types={MATRIX_PLACE_TYPES}
                                                        className={inputClass}
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="matrix_start_place_id"
                                                        value={startDestinationPlaceId}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className={labelClass}>
                                                        Start date
                                                    </span>
                                                    <input
                                                        name="matrix_start_date"
                                                        type="date"
                                                        value={startDate}
                                                        onChange={(event) =>
                                                            setStartDate(
                                                                event.target.value
                                                            )
                                                        }
                                                        className={inputClass}
                                                    />
                                                </label>
                                                <div>
                                                    <span className={labelClass}>
                                                        Duration
                                                    </span>
                                                    <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-300">
                                                        {formatDuration(
                                                            getDateDiffDays(
                                                                startDate,
                                                                matrixDates[1] || ""
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        insertNextDestination(-1)
                                                    }
                                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-slate-950 transition hover:bg-lime-200 disabled:opacity-40"
                                                    disabled={
                                                        nextDestinations.length >=
                                                        MAX_MATRIX_DESTINATIONS
                                                    }
                                                    aria-label="Add another destination"
                                                >
                                                    <Plus className="h-5 w-5" />
                                                </button>
                                            </div>

                                            {nextDestinations.map((row, index) => (
                                                <div
                                                    key={index}
                                                    draggable
                                                    onDragStart={() =>
                                                        setDraggedMatrixDestinationIndex(
                                                            index
                                                        )
                                                    }
                                                    onDragOver={(event) =>
                                                        event.preventDefault()
                                                    }
                                                    onDrop={() => {
                                                        if (
                                                            draggedMatrixDestinationIndex ==
                                                            null
                                                        ) {
                                                            return;
                                                        }
                                                        reorderNextDestination(
                                                            draggedMatrixDestinationIndex,
                                                            index
                                                        );
                                                        setDraggedMatrixDestinationIndex(
                                                            null
                                                        );
                                                    }}
                                                    onDragEnd={() =>
                                                        setDraggedMatrixDestinationIndex(
                                                            null
                                                        )
                                                    }
                                                    className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/55 p-3 md:grid-cols-[1.2fr_0.8fr_0.65fr_auto] md:items-end"
                                                >
                                                    <label className="block">
                                                        <span className="flex items-center gap-2">
                                                            <span className={labelClass}>
                                                                Next destination
                                                            </span>
                                                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                                                <GripVertical
                                                                    className="h-3.5 w-3.5"
                                                                    aria-hidden="true"
                                                                />
                                                                Drag
                                                            </span>
                                                        </span>
                                                        <PlaceAutocompleteInput
                                                            name={`matrix_next_destination_${index}`}
                                                            value={row.destination}
                                                            onInputChange={(value) => {
                                                                updateNextDestination(
                                                                    index,
                                                                    "destination",
                                                                    value
                                                                );
                                                                updateNextDestination(
                                                                    index,
                                                                    "placeId",
                                                                    ""
                                                                );
                                                            }}
                                                            onPlaceSelect={(place) => {
                                                                updateNextDestination(
                                                                    index,
                                                                    "destination",
                                                                    getMatrixPlaceLabel(
                                                                        place
                                                                    )
                                                                );
                                                                updateNextDestination(
                                                                    index,
                                                                    "placeId",
                                                                    place.place_id || ""
                                                                );
                                                            }}
                                                            placeholder="Berlin, Taipei..."
                                                            types={MATRIX_PLACE_TYPES}
                                                            className={inputClass}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name={`matrix_next_place_id_${index}`}
                                                            value={row.placeId}
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className={labelClass}>
                                                            Date of arrival
                                                        </span>
                                                        <input
                                                            name={`matrix_next_arrival_date_${index}`}
                                                            type="date"
                                                            value={row.arrivalDate}
                                                            onChange={(event) =>
                                                                updateNextDestination(
                                                                    index,
                                                                    "arrivalDate",
                                                                    event.target.value
                                                                )
                                                            }
                                                            className={inputClass}
                                                        />
                                                    </label>
                                                    <div>
                                                        <span className={labelClass}>
                                                            Stay duration
                                                        </span>
                                                        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-300">
                                                            {formatDuration(
                                                                getDateDiffDays(
                                                                    row.arrivalDate,
                                                                    matrixDates[
                                                                        index + 2
                                                                    ] || ""
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                insertNextDestination(
                                                                    index
                                                                )
                                                            }
                                                            className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-slate-950 transition hover:bg-lime-200 disabled:opacity-40"
                                                            disabled={
                                                                nextDestinations.length >=
                                                                MAX_MATRIX_DESTINATIONS
                                                            }
                                                            aria-label="Add destination below"
                                                        >
                                                            <Plus className="h-5 w-5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                removeNextDestination(
                                                                    index
                                                                )
                                                            }
                                                            className="flex h-11 w-11 items-center justify-center rounded-full border border-red-300/30 bg-red-400/10 text-red-100 transition hover:bg-red-400/20"
                                                            aria-label="Remove destination"
                                                        >
                                                            <Minus className="h-5 w-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/55 p-3 md:grid-cols-2 md:items-end">
                                                <label className="block">
                                                    <span className={labelClass}>
                                                        Return destination
                                                    </span>
                                                    <PlaceAutocompleteInput
                                                        name="matrix_return_destination"
                                                        value={returnDestination}
                                                        onInputChange={(value) => {
                                                            setIsReturnDestinationManual(
                                                                true
                                                            );
                                                            setReturnDestination(value);
                                                            setReturnDestinationPlaceId(
                                                                ""
                                                            );
                                                        }}
                                                        onPlaceSelect={(place) => {
                                                            setIsReturnDestinationManual(
                                                                true
                                                            );
                                                            setReturnDestination(
                                                                getMatrixPlaceLabel(place)
                                                            );
                                                            setReturnDestinationPlaceId(
                                                                place.place_id || ""
                                                            );
                                                        }}
                                                        placeholder="Auto-populated from start"
                                                        types={MATRIX_PLACE_TYPES}
                                                        className={inputClass}
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="matrix_return_place_id"
                                                        value={returnDestinationPlaceId}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className={labelClass}>
                                                        Date of arrival
                                                    </span>
                                                    <input
                                                        name="matrix_return_date"
                                                        type="date"
                                                        value={returnDate}
                                                        onChange={(event) =>
                                                            setReturnDate(
                                                                event.target.value
                                                            )
                                                        }
                                                        className={inputClass}
                                                    />
                                                </label>
                                            </div>
                                            <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100">
                                                Total duration:{" "}
                                                {formatDuration(totalDuration)}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                        </div>

                        {currentStep === "planned" ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {plannedOptions.map((option) => {
                                    const Icon = option.icon;
                                    const selected = plannedItems.has(option.id);

                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => togglePlannedItem(option.id)}
                                            className={`flex min-h-24 items-center gap-3 rounded-[1.5rem] border p-4 text-left transition ${
                                                selected
                                                    ? "border-lime-300 bg-lime-300 text-slate-950"
                                                    : "border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                                            }`}
                                        >
                                            <Icon className="h-5 w-5 shrink-0" />
                                            <span className="text-base font-black">
                                                {option.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}

                        {currentStep === "flight" ? (
                            <SetupFlightFields
                                inputClass={inputClass}
                                labelClass={labelClass}
                                defaultDate={startDate}
                                audienceOptions={setupAudienceOptions}
                                currentUserTripMemberId={
                                    createdTrip?.currentUserTripMemberId || null
                                }
                            />
                        ) : null}

                        {["train", "bus"].includes(currentStep) ? (
                            <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <SimpleField
                                        label="Departure"
                                        name={`${currentStep}_departure`}
                                        placeholder="Airport, station, or city"
                                    />
                                    <SimpleField
                                        label="Arrival"
                                        name={`${currentStep}_arrival`}
                                        placeholder="Airport, station, or city"
                                    />
                                    <SimpleField
                                        label="Date"
                                        name={`${currentStep}_date`}
                                        type="date"
                                    />
                                    <SimpleField
                                        label="Time"
                                        name={`${currentStep}_time`}
                                        type="time"
                                    />
                                    <SimpleField
                                        label={
                                            currentStep === "flight"
                                                ? "Flight number"
                                                : "Confirmation or route"
                                        }
                                        name={`${currentStep}_reference`}
                                        placeholder={
                                            currentStep === "flight"
                                                ? "AC123"
                                                : "Optional"
                                        }
                                    />
                                    <SimpleField
                                        label="Status"
                                        name={`${currentStep}_status`}
                                        placeholder="Planned, booked, tentative..."
                                    />
                                </div>
                                <p className="text-xs font-semibold text-slate-400">
                                    These details help shape your trip setup. You can
                                    refine transportation after the trip is created.
                                </p>
                            </div>
                        ) : null}

                        {currentStep === "accommodations" ? (
                            <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <SimpleField
                                        label="Accommodation name"
                                        name="setup_accommodation_name"
                                        placeholder="Hotel, apartment, hostel..."
                                    />
                                    <SimpleField
                                        label="City"
                                        name="setup_accommodation_city"
                                        placeholder="Where are you staying?"
                                    />
                                    <SimpleField
                                        label="Check-in"
                                        name="setup_accommodation_check_in"
                                        type="date"
                                    />
                                    <SimpleField
                                        label="Check-out"
                                        name="setup_accommodation_check_out"
                                        type="date"
                                    />
                                </div>
                            </div>
                        ) : null}

                        {currentStep === "activityChoice" ? (
                            <div className="space-y-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                        {
                                            id: "scheduled" as const,
                                            title: "Add Scheduled Activity / Event",
                                            body: "Do you have anything at a specific time?",
                                            icon: CalendarClock,
                                        },
                                        {
                                            id: "idea" as const,
                                            title: "Add Idea",
                                            body: "Have ideas of what you want to do? These don't need a date or time and can be quick-added later.",
                                            icon: Lightbulb,
                                        },
                                    ].map((option) => {
                                        const Icon = option.icon;
                                        const selected = activityChoices.has(
                                            option.id
                                        );
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() =>
                                                    toggleActivityChoice(option.id)
                                                }
                                                className={`rounded-[1.5rem] border p-5 text-left transition ${
                                                    selected
                                                        ? "border-lime-300 bg-lime-300 text-slate-950"
                                                        : "border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                                                }`}
                                            >
                                                <Icon className="h-5 w-5" />
                                                <span className="mt-3 block text-lg font-black">
                                                    {option.title}
                                                </span>
                                                <span className="mt-2 block text-sm font-semibold">
                                                    {option.body}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                                    <UsersRound
                                        className="mr-2 inline h-4 w-4"
                                        aria-hidden="true"
                                    />
                                    Did you know group trip members can vote on ideas
                                    to help the group decide what everyone wants to do?
                                </div>
                            </div>
                        ) : null}

                        {currentStep === "scheduled" ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <SimpleField
                                    label="Activity or event"
                                    name="setup_scheduled_title"
                                    placeholder="Dinner reservation, museum tour..."
                                />
                                <SimpleField
                                    label="Location"
                                    name="setup_scheduled_location"
                                    placeholder="Where is it?"
                                />
                                <SimpleField
                                    label="Date"
                                    name="setup_scheduled_date"
                                    type="date"
                                />
                                <SimpleField
                                    label="Time"
                                    name="setup_scheduled_time"
                                    type="time"
                                />
                            </div>
                        ) : null}

                        {currentStep === "idea" ? (
                            <div className="space-y-4">
                                <SimpleField
                                    label="Idea"
                                    name="setup_idea_title"
                                    placeholder="What do you want to do?"
                                />
                                <label className="block">
                                    <span className={labelClass}>Notes</span>
                                    <textarea
                                        name="setup_idea_notes"
                                        rows={4}
                                        placeholder="Why does this sound fun?"
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                        ) : null}
                    </div>

                    <div className="vaivia-modal-footer flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={goBack}
                            disabled={
                                currentIndex === 0 ||
                                isPending ||
                                isCreatingTripInBackground ||
                                isSavingSetupFlight
                            }
                            className="vaivia-modal-button-secondary inline-flex items-center gap-2 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                        </button>

                        <div className="flex flex-wrap justify-end gap-3">
                            {currentStep === "activityChoice" ? (
                                <button
                                    type="button"
                                    onClick={goNext}
                                    className="vaivia-modal-button-secondary"
                                >
                                    Maybe later - skip
                                </button>
                            ) : null}

                            {isLastStep || currentStep === "flight" ? (
                                <button
                                    type={createdTrip ? "button" : "submit"}
                                    onClick={createdTrip ? handleGoToTrip : undefined}
                                    disabled={isBusy}
                                    className="vaivia-modal-button-primary"
                                >
                                    {currentStep === "flight"
                                        ? isSavingSetupFlight
                                            ? "Adding flight..."
                                            : "Add flight"
                                        : isPending
                                          ? "Creating..."
                                          : "Go to Trip"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={isBusy}
                                    className="vaivia-modal-button-primary"
                                >
                                    {isCreatingTripInBackground
                                        ? "Creating trip..."
                                        : "Next"}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            )}
        </AnimatedModal>
    );
}
