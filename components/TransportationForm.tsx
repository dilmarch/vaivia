"use client";

import { AlertTriangle, GripVertical, Lock, Plus, Trash2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
    type FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    getAirlineLogoUrl,
    getAirlineNameFromCode,
    inferAirlineCodeFromFlightNumber,
} from "@/lib/airline";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";
import type { TransportationTravelerOptions } from "@/lib/travelers";
import type { TripAudienceOption } from "@/lib/tripAudience";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import Portal from "@/components/Portal";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { COMMON_CURRENCIES } from "@/lib/budget";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";

type TransportationFormProps = {
    tripId: string;
    submitAction: (formData: FormData) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
    defaultDate?: string;
    initialItem?: TransportationFormInitialValues | null;
    submitLabel?: string;
    travelerOptions?: TransportationTravelerOptions;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
};

export type FlightLeg = {
    departureLocation: string;
    departurePlaceId?: string;
    departureDate: string;
    departureTime: string;
    departureTimezone: string;
    arrivalLocation: string;
    arrivalPlaceId?: string;
    arrivalDate: string;
    arrivalTime: string;
    arrivalTimezone: string;
    departureTerminal: string;
    arrivalTerminal: string;
    flightNumber: string;
    airlineName: string;
};

export type TransportationFormInitialValues = {
    mode?: string | null;
    status?: string | null;
    reservationCode?: string | null;
    cost?: number | null;
    currency?: string | null;
    visaRequirements?: string | null;
    luggageRequirements?: string | null;
    preferredRideProvider?: string | null;
    routeStops?: Array<{ label: string }>;
    isPrivate?: boolean | null;
    audienceMode?: "everyone" | "custom" | "just_me" | null;
    audienceSelectedOptions?: TripAudienceOption[];
    flightLegs?: FlightLeg[];
};

const MODES = [
    { value: "airplane", label: "Airplane", emoji: "✈️", disabled: false },
    { value: "train", label: "Train", emoji: "🚆", disabled: false },
    { value: "subway", label: "Metro / Subway", emoji: "🚇", disabled: false },
    { value: "bus", label: "Bus", emoji: "🚌", disabled: false },
    { value: "tram", label: "Tram", emoji: "🚊", disabled: false },
    { value: "ferry", label: "Ferry", emoji: "⛴️", disabled: false },
    { value: "taxi", label: "Taxi", emoji: "🚕", disabled: false },
    { value: "car", label: "Car", emoji: "🚗", disabled: false },
    { value: "bicycle", label: "Bicycle", emoji: "🚲", disabled: true },
];

const TRANSPORTATION_STATUS_OPTIONS = [
    { value: "planned", label: "Planned" },
    { value: "booked", label: "Booked" },
    { value: "confirmed", label: "Confirmed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "completed", label: "Completed" },
] as const;

const PASSWORD_MANAGER_IGNORE_PROPS = {
    autoComplete: "off",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
};

function createEmptyLeg(defaultDate = ""): FlightLeg {
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

function normalizeInitialLegs(
    initialItem: TransportationFormInitialValues | null | undefined,
    defaultDate: string
) {
    const legs = initialItem?.flightLegs?.length
        ? initialItem.flightLegs
        : [createEmptyLeg(defaultDate)];

    return legs.map((leg) => ({
        ...createEmptyLeg(defaultDate),
        ...leg,
        departureDate: leg.departureDate || defaultDate,
        arrivalDate: leg.arrivalDate || leg.departureDate || defaultDate,
    }));
}

function normalizeInitialRouteStops(
    initialItem: TransportationFormInitialValues | null | undefined
) {
    const savedStops = initialItem?.routeStops
        ?.map((stop) => stop.label.trim())
        .filter(Boolean);

    if (savedStops?.length) {
        return savedStops.map((label) => ({ label, placeId: "" }));
    }

    const fallbackStops = [
        initialItem?.flightLegs?.[0]?.departureLocation,
        initialItem?.flightLegs?.at(-1)?.arrivalLocation,
    ]
        .map((label) => label?.trim() || "")
        .filter(Boolean);

    if (fallbackStops.length >= 2) {
        return fallbackStops.map((label) => ({ label, placeId: "" }));
    }

    return [
        { label: "", placeId: "" },
        { label: "", placeId: "" },
    ];
}

function getGooglePlaceLabel(
    place: google.maps.places.PlaceResult,
    fallback: string
) {
    return place.name || place.formatted_address || fallback;
}

function getInitialMode(initialItem?: TransportationFormInitialValues | null) {
    return initialItem?.mode || "";
}

function getInitialConnectionCount(
    initialItem: TransportationFormInitialValues | null | undefined,
    mode: string
) {
    if (mode !== "airplane" || !initialItem?.flightLegs?.length) return null;
    return Math.max(initialItem.flightLegs.length - 1, 0);
}

function getDurationLabel(
    startDate: string,
    startTime: string,
    startTimezone: string,
    endDate: string,
    endTime: string,
    endTimezone: string
) {
    return getZonedDurationLabel({
        startDate,
        startTime,
        startTimezone,
        endDate,
        endTime,
        endTimezone,
    });
}

function getLegDuration(leg: FlightLeg) {
    return getDurationLabel(
        leg.departureDate,
        leg.departureTime,
        leg.departureTimezone,
        leg.arrivalDate,
        leg.arrivalTime,
        leg.arrivalTimezone
    );
}

function normalizeFlightNumberInput(value: string) {
    return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function isValidIsoDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [yearText, monthText, dayText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!year || month < 1 || month > 12 || day < 1) return false;

    const maxDay = new Date(year, month, 0).getDate();
    return day <= maxDay;
}

function DatePickerField({
    name,
    value,
    onChange,
    label,
    required = false,
}: {
    name: string;
    value: string;
    onChange: (value: string) => void;
    label: string;
    required?: boolean;
}) {
    const datePickerValue = isValidIsoDate(value) ? value : "";

    function handleDatePickerChange(nextValue: string) {
        if (nextValue === "" || isValidIsoDate(nextValue)) {
            onChange(nextValue);
        }
    }

    return (
        <div className="rounded-xl border border-slate-300 px-3 py-2">
            <input type="hidden" name={name} value={value || ""} />
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                </p>
                <DateInput
                    aria-label={`Choose ${label.toLowerCase()}`}
                    required={required}
                    value={datePickerValue}
                    onChange={(event) => handleDatePickerChange(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700"
                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                />
            </div>
        </div>
    );
}

export default function TransportationForm({
    tripId,
    submitAction,
    isOpen,
    onClose,
    defaultDate = "",
    initialItem = null,
    submitLabel = "Save",
    audienceOptions = [],
    currentUserTripMemberId = null,
}: TransportationFormProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialMode = getInitialMode(initialItem);
    const [mode, setMode] = useState(initialMode);
    const [audienceMode, setAudienceMode] = useState(
        initialItem?.audienceMode || "everyone"
    );
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [costAmount, setCostAmount] = useState(
        initialItem?.cost == null ? "" : String(initialItem.cost)
    );
    const [isClosing, setIsClosing] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [locationValidationError, setLocationValidationError] = useState("");
    const [connectionCount, setConnectionCount] = useState<number | null>(() =>
        getInitialConnectionCount(initialItem, initialMode)
    );
    const [flightLegs, setFlightLegs] = useState<FlightLeg[]>(() =>
        normalizeInitialLegs(initialItem, defaultDate)
    );
    const [routeStops, setRouteStops] = useState(() =>
        normalizeInitialRouteStops(initialItem)
    );
    const previousIsOpenRef = useRef(isOpen);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const airportCoordinateRefs = useRef<
        Array<{
            departure?: { lat: number; lng: number };
            arrival?: { lat: number; lng: number };
        }>
    >([]);

    const firstLeg = flightLegs[0] || createEmptyLeg(defaultDate);
    const lastLeg = flightLegs.at(-1) || firstLeg;
    const firstFlightNumber = normalizeFlightNumberInput(firstLeg.flightNumber);
    const firstAirlineCode = inferAirlineCodeFromFlightNumber(firstFlightNumber);
    const logoUrl = useMemo(
        () => getAirlineLogoUrl(firstAirlineCode),
        [firstAirlineCode]
    );
    const totalDuration = getDurationLabel(
        firstLeg.departureDate,
        firstLeg.departureTime,
        firstLeg.departureTimezone,
        lastLeg.arrivalDate,
        lastLeg.arrivalTime,
        lastLeg.arrivalTimezone
    );
    const hasSelectedMode = Boolean(mode);
    const hasSelectedFlightStructure =
        mode === "airplane" && connectionCount !== null;
    const shouldShowDetails =
        hasSelectedMode && (mode !== "airplane" || hasSelectedFlightStructure);
    const isTaxiOrCarMode = mode === "taxi" || mode === "car";
    const visibleRouteStops =
        routeStops.length >= 2
            ? routeStops
            : [
                  { label: "", placeId: "" },
                  { label: "", placeId: "" },
              ];
    const firstRouteStop = visibleRouteStops[0]?.label || "";
    const lastRouteStop = visibleRouteStops.at(-1)?.label || "";
    const effectiveDepartureLocation = isTaxiOrCarMode
        ? firstRouteStop
        : firstLeg.departureLocation;
    const effectiveArrivalLocation = isTaxiOrCarMode
        ? lastRouteStop
        : lastLeg.arrivalLocation;
    const effectiveDeparturePlaceId = isTaxiOrCarMode
        ? visibleRouteStops[0]?.placeId || ""
        : firstLeg.departurePlaceId || "";
    const effectiveArrivalPlaceId = isTaxiOrCarMode
        ? visibleRouteStops.at(-1)?.placeId || ""
        : lastLeg.arrivalPlaceId || "";
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);

    useEffect(() => {
        if (!isOpen || previousIsOpenRef.current === isOpen) {
            previousIsOpenRef.current = isOpen;
            return;
        }

        const nextMode = getInitialMode(initialItem);
        setMode(nextMode);
        setAudienceMode(initialItem?.audienceMode || "everyone");
        setConnectionCount(getInitialConnectionCount(initialItem, nextMode));
        setFlightLegs(normalizeInitialLegs(initialItem, defaultDate));
        setRouteStops(normalizeInitialRouteStops(initialItem));
        airportCoordinateRefs.current = [];
        setHasUnsavedChanges(false);
        setIsClosing(false);
        setShowCloseWarning(false);
        setLocationValidationError("");
        previousIsOpenRef.current = isOpen;
    }, [defaultDate, initialItem, isOpen]);

    useEffect(() => {
        if (connectionCount === null) return;

        const nextLegCount = connectionCount + 1;
        setFlightLegs((currentLegs) => {
            if (currentLegs.length === nextLegCount) return currentLegs;
            if (currentLegs.length > nextLegCount) return currentLegs.slice(0, nextLegCount);

            return [
                ...currentLegs,
                ...Array.from({ length: nextLegCount - currentLegs.length }, () =>
                    createEmptyLeg(defaultDate)
                ),
            ];
        });
    }, [connectionCount, defaultDate]);

    function updateLeg(index: number, field: keyof FlightLeg, value: string) {
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
                    const nextAirlineCode = inferAirlineCodeFromFlightNumber(value);
                    const nextAirlineName = getAirlineNameFromCode(nextAirlineCode);
                    nextLeg.airlineName = nextAirlineName;
                }

                return nextLeg;
            })
        );

        if (field === "departureDate" || field === "arrivalDate") {
            const coordinateKey = field === "departureDate" ? "departure" : "arrival";
            const timezoneKey =
                field === "departureDate" ? "departureTimezone" : "arrivalTimezone";
            const coordinates = airportCoordinateRefs.current[index]?.[coordinateKey];

            if (coordinates) {
                void resolveLegTimezone({
                    index,
                    timezoneKey,
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    date: value,
                });
            }
        }
    }

    async function resolveLegTimezone({
        index,
        timezoneKey,
        lat,
        lng,
        date,
    }: {
        index: number;
        timezoneKey: "departureTimezone" | "arrivalTimezone";
        lat: number;
        lng: number;
        date?: string;
    }) {
        try {
            const response = await fetch("/api/timezone", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    lat,
                    lng,
                    date: date || undefined,
                }),
            });
            const data: { timeZoneId?: string } = await response.json();
            if (data.timeZoneId) {
                updateLeg(index, timezoneKey, data.timeZoneId);
            }
        } catch {
            // Manual time zone entry remains available.
        }
    }

    const closeWithAnimation = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            setIsClosing(false);
            onClose();
        }, 160);
    }, [isClosing, onClose]);

    const requestClose = useCallback(() => {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        closeWithAnimation();
    }, [closeWithAnimation, hasUnsavedChanges]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") requestClose();
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [isOpen, requestClose]);

    if (!isOpen) return null;

    function modeLabel() {
        return MODES.find((option) => option.value === mode)?.label || "Transportation";
    }

    const selectedMode = MODES.find((option) => option.value === mode);

    function selectMode(nextMode: string) {
        setMode(nextMode);
        setConnectionCount(null);
        setFlightLegs([createEmptyLeg(defaultDate)]);
        setRouteStops((currentStops) =>
            currentStops.length >= 2
                ? currentStops
                : [
                      { label: "", placeId: "" },
                      { label: "", placeId: "" },
                  ]
        );
        airportCoordinateRefs.current = [];
        setLocationValidationError("");
        setHasUnsavedChanges(true);
    }

    function updateRouteStop(index: number, label: string, placeId = "") {
        setRouteStops((currentStops) =>
            currentStops.map((stop, stopIndex) =>
                stopIndex === index ? { ...stop, label, placeId } : stop
            )
        );
    }

    function addRouteStop() {
        setRouteStops((currentStops) => {
            const nextStops = [...currentStops];
            nextStops.splice(Math.max(1, nextStops.length - 1), 0, {
                label: "",
                placeId: "",
            });
            return nextStops;
        });
        setHasUnsavedChanges(true);
    }

    function removeRouteStop(index: number) {
        setRouteStops((currentStops) => {
            if (currentStops.length <= 2) return currentStops;
            return currentStops.filter((_, stopIndex) => stopIndex !== index);
        });
        setHasUnsavedChanges(true);
    }

    function moveRouteStop(fromIndex: number, toIndex: number) {
        setRouteStops((currentStops) => {
            if (toIndex < 0 || toIndex >= currentStops.length) return currentStops;
            const nextStops = [...currentStops];
            const [movedStop] = nextStops.splice(fromIndex, 1);
            nextStops.splice(toIndex, 0, movedStop);
            return nextStops;
        });
        setHasUnsavedChanges(true);
    }

    function validateGoogleLocations(event: FormEvent<HTMLFormElement>) {
        const hasUnvalidatedLocation =
            mode === "airplane"
                ? flightLegs.some(
                      (leg) =>
                          !leg.departurePlaceId || !leg.arrivalPlaceId
                  )
                : !effectiveDeparturePlaceId || !effectiveArrivalPlaceId;

        if (!hasUnvalidatedLocation) {
            setLocationValidationError("");
            return;
        }

        event.preventDefault();
        setLocationValidationError(
            "Choose both departure and arrival locations from the Google suggestions."
        );
    }

    return (
        <>
            <Portal>
            <div
                className="vaivia-modal-backdrop"
                data-vaivia-modal-state={isClosing ? "closing" : "open"}
                onClick={requestClose}
            >
                <aside
                    className="vaivia-modal-panel max-w-4xl"
                    data-vaivia-modal-state={isClosing ? "closing" : "open"}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="vaivia-modal-header flex min-h-32 items-center gap-4">
                        <div className="vaivia-transport-light-card flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/90 text-3xl text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.12)]">
                            {mode === "airplane" && logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={logoUrl}
                                    alt={`${
                                        firstLeg.airlineName || firstAirlineCode || "Airline"
                                    } logo`}
                                    className="h-12 w-12 object-contain"
                                    onError={(event) => {
                                        event.currentTarget.style.display = "none";
                                    }}
                                />
                            ) : selectedMode ? (
                                <span aria-hidden="true">{selectedMode.emoji}</span>
                            ) : (
                                <span aria-hidden="true">🛵</span>
                            )}
                        </div>
                        <div className="flex-1">
                            <p className="vaivia-modal-eyebrow">
                                {initialItem ? "Duplicate transportation" : "Add transportation"}
                            </p>
                            <h2 className="vaivia-modal-title">
                                {modeLabel()}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close transportation form"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <form
                        action={submitAction}
                        className="vaivia-modal-body space-y-5"
                        onChange={() => setHasUnsavedChanges(true)}
                        onSubmit={validateGoogleLocations}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="transportation_mode" value={mode} />
                        <input type="hidden" name="flight_leg_count" value={flightLegs.length} />
                        <input
                            type="hidden"
                            name="airline_code"
                            value={firstAirlineCode}
                        />
                        <input type="hidden" name="duration" value={totalDuration} />
                        <input type="hidden" name="item_date" value={firstLeg.departureDate} />
                        <input type="hidden" name="start_time" value={firstLeg.departureTime} />
                        <input type="hidden" name="end_date" value={lastLeg.arrivalDate} />
                        <input type="hidden" name="end_time" value={lastLeg.arrivalTime} />
                        <input
                            type="hidden"
                            name="departure_location"
                            value={effectiveDepartureLocation}
                        />
                        <input
                            type="hidden"
                            name="arrival_location"
                            value={effectiveArrivalLocation}
                        />
                        <input
                            type="hidden"
                            name="departure_google_place_id"
                            value={effectiveDeparturePlaceId}
                        />
                        <input
                            type="hidden"
                            name="arrival_google_place_id"
                            value={effectiveArrivalPlaceId}
                        />
                        {visibleRouteStops.map((stop, index) => (
                            <input
                                key={`route-stop-hidden-${index}`}
                                type="hidden"
                                name={`route_stop_${index}`}
                                value={stop.label}
                            />
                        ))}
                        <input
                            type="hidden"
                            name="route_stop_count"
                            value={visibleRouteStops.length}
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
                        <input type="hidden" name="airline_name" value={firstLeg.airlineName} />
                        <input
                            type="hidden"
                            name="flight_number"
                            value={firstFlightNumber}
                        />

                        <TripAudienceSelector
                            options={audienceOptions}
                            currentUserTripMemberId={currentUserTripMemberId}
                            initialAudienceMode={initialItem?.audienceMode || "everyone"}
                            initialSelectedOptions={
                                initialItem?.audienceSelectedOptions || []
                            }
                            description="Choose who this itinerary item is for."
                            privateSectionId="transportation-private-section"
                            onAudienceModeChange={setAudienceMode}
                        />

                        <label
                            id="transportation-private-section"
                            className={`flex scroll-mt-24 items-start gap-3 rounded-xl border p-4 text-sm transition ${
                                audienceMode === "just_me"
                                    ? "border-slate-700 bg-slate-950 text-slate-200 shadow-xl shadow-black/20"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                        >
                            <input
                                type="checkbox"
                                name="is_private"
                                defaultChecked={Boolean(initialItem?.isPrivate)}
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

                        <div>
                            <p className="block text-sm font-medium text-slate-700">
                                Select mode of transportation
                            </p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                {MODES.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={option.disabled}
                                        onClick={() => selectMode(option.value)}
                                        className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition ${
                                            mode === option.value
                                                ? "border-slate-900 bg-slate-900 text-white"
                                                : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                        } disabled:cursor-not-allowed disabled:opacity-45`}
                                    >
                                        <span className="mr-2">{option.emoji}</span>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {mode === "airplane" && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <p className="text-sm font-medium text-slate-700">
                                    Is this flight direct?
                                </p>
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
                                            onClick={() => {
                                                setConnectionCount(option.value);
                                                setHasUnsavedChanges(true);
                                            }}
                                            className={`rounded-md border px-3 py-2 text-sm font-medium ${
                                                connectionCount === option.value
                                                    ? "border-slate-900 bg-slate-900 text-white"
                                                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {shouldShowDetails && mode === "airplane" ? (
                            <div className="space-y-4">
                                {flightLegs.map((leg, index) => {
                                    const legFlightNumber = normalizeFlightNumberInput(
                                        leg.flightNumber
                                    );
                                    const legAirlineCode =
                                        inferAirlineCodeFromFlightNumber(legFlightNumber);
                                    const legDuration = getLegDuration(leg);

                                    return (
                                        <fieldset
                                            key={index}
                                            className="space-y-4 rounded-md border border-slate-200 p-4"
                                        >
                                            <legend className="px-1 text-sm font-semibold text-slate-800">
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
                                                value={leg.departurePlaceId || ""}
                                            />
                                            <input
                                                type="hidden"
                                                name={`leg_${index}_arrival_google_place_id`}
                                                value={leg.arrivalPlaceId || ""}
                                            />

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <PlaceAutocompleteInput
                                                    id={`flightLeg${index}DepartureAirport`}
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
                                                            getGooglePlaceLabel(
                                                                place,
                                                                leg.departureLocation
                                                            )
                                                        );
                                                        updateLeg(
                                                            index,
                                                            "departurePlaceId",
                                                            place.place_id || ""
                                                        );
                                                        const lat =
                                                            place.geometry?.location?.lat();
                                                        const lng =
                                                            place.geometry?.location?.lng();
                                                        if (
                                                            typeof lat === "number" &&
                                                            typeof lng === "number"
                                                        ) {
                                                            airportCoordinateRefs.current[
                                                                index
                                                            ] = {
                                                                ...airportCoordinateRefs
                                                                    .current[index],
                                                                departure: { lat, lng },
                                                            };
                                                            void resolveLegTimezone({
                                                                index,
                                                                timezoneKey:
                                                                    "departureTimezone",
                                                                lat,
                                                                lng,
                                                                date: leg.departureDate,
                                                            });
                                                        }
                                                    }}
                                                    placeholder="Departure airport, code, or city"
                                                    types={["airport"]}
                                                    required
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
                                                <PlaceAutocompleteInput
                                                    id={`flightLeg${index}ArrivalAirport`}
                                                    name={`leg_${index}_arrival_location`}
                                                    value={leg.arrivalLocation}
                                                    onInputChange={(value) => {
                                                        updateLeg(
                                                            index,
                                                            "arrivalLocation",
                                                            value
                                                        );
                                                        updateLeg(index, "arrivalPlaceId", "");
                                                    }}
                                                    onPlaceSelect={(place) => {
                                                        updateLeg(
                                                            index,
                                                            "arrivalLocation",
                                                            getGooglePlaceLabel(
                                                                place,
                                                                leg.arrivalLocation
                                                            )
                                                        );
                                                        updateLeg(
                                                            index,
                                                            "arrivalPlaceId",
                                                            place.place_id || ""
                                                        );
                                                        const lat =
                                                            place.geometry?.location?.lat();
                                                        const lng =
                                                            place.geometry?.location?.lng();
                                                        if (
                                                            typeof lat === "number" &&
                                                            typeof lng === "number"
                                                        ) {
                                                            airportCoordinateRefs.current[
                                                                index
                                                            ] = {
                                                                ...airportCoordinateRefs
                                                                    .current[index],
                                                                arrival: { lat, lng },
                                                            };
                                                            void resolveLegTimezone({
                                                                index,
                                                                timezoneKey:
                                                                    "arrivalTimezone",
                                                                lat,
                                                                lng,
                                                                date: leg.arrivalDate,
                                                            });
                                                        }
                                                    }}
                                                    placeholder="Arrival airport, code, or city"
                                                    types={["airport"]}
                                                    required
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <DatePickerField
                                                        name={`leg_${index}_departure_date`}
                                                        label="Departure date"
                                                        required
                                                        value={leg.departureDate}
                                                        onChange={(value) =>
                                                            updateLeg(index, "departureDate", value)
                                                        }
                                                    />
                                                    <TimeInput
                                                        id={`flightLeg${index}DepartureTime`}
                                                        name={`leg_${index}_departure_time`}
                                                        required
                                                        value={leg.departureTime}
                                                        onChange={(event) =>
                                                            updateLeg(index, "departureTime", event.target.value)
                                                        }
                                                        className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                        {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <DatePickerField
                                                        name={`leg_${index}_arrival_date`}
                                                        label="Arrival date"
                                                        required
                                                        value={leg.arrivalDate}
                                                        onChange={(value) =>
                                                            updateLeg(index, "arrivalDate", value)
                                                        }
                                                    />
                                                    <TimeInput
                                                        id={`flightLeg${index}ArrivalTime`}
                                                        name={`leg_${index}_arrival_time`}
                                                        required
                                                        value={leg.arrivalTime}
                                                        onChange={(event) =>
                                                            updateLeg(index, "arrivalTime", event.target.value)
                                                        }
                                                        className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                        {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
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
                                                    placeholder="Departure time zone"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
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
                                                    placeholder="Arrival time zone"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-4">
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
                                                    placeholder="Departure terminal"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
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
                                                    placeholder="Arrival terminal"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
                                                <input
                                                    id={`flightLeg${index}FlightNumber`}
                                                    value={leg.flightNumber}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            index,
                                                            "flightNumber",
                                                            event.target.value.toUpperCase()
                                                        )
                                                    }
                                                    placeholder="Flight number, e.g. AC692"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
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
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                />
                                            </div>

                                            {legDuration && (
                                                <p className="text-sm text-slate-500">
                                                    Duration: {legDuration}
                                                </p>
                                            )}
                                        </fieldset>
                                    );
                                })}
                            </div>
                        ) : null}

                        {shouldShowDetails && isTaxiOrCarMode ? (
                            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                                <div>
                                    <p className="text-sm font-black text-slate-900">
                                        Route
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                        Add your starting point, destination, and any
                                        extra stops. Drag stops to reorder the route.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    {visibleRouteStops.map((stop, index) => {
                                        const isFirst = index === 0;
                                        const isLast =
                                            index === visibleRouteStops.length - 1;

                                        return (
                                            <div
                                                key={index}
                                                draggable
                                                onDragStart={(event) => {
                                                    event.dataTransfer.setData(
                                                        "text/plain",
                                                        String(index)
                                                    );
                                                    event.dataTransfer.effectAllowed =
                                                        "move";
                                                }}
                                                onDragOver={(event) => {
                                                    event.preventDefault();
                                                    event.dataTransfer.dropEffect =
                                                        "move";
                                                }}
                                                onDrop={(event) => {
                                                    event.preventDefault();
                                                    const fromIndex = Number(
                                                        event.dataTransfer.getData(
                                                            "text/plain"
                                                        )
                                                    );
                                                    if (!Number.isNaN(fromIndex)) {
                                                        moveRouteStop(fromIndex, index);
                                                    }
                                                }}
                                                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[auto_1fr_auto]"
                                            >
                                                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                                                    <GripVertical
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                                <label className="min-w-0">
                                                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                                        {isFirst
                                                            ? "Starting destination"
                                                            : isLast
                                                              ? "Arrival destination"
                                                              : `Additional stop ${index}`}
                                                    </span>
                                                    <PlaceAutocompleteInput
                                                        value={stop.label}
                                                        onInputChange={(value) => {
                                                            updateRouteStop(
                                                                index,
                                                                value
                                                            );
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        onPlaceSelect={(place) => {
                                                            updateRouteStop(
                                                                index,
                                                                getGooglePlaceLabel(
                                                                    place,
                                                                    stop.label
                                                                ),
                                                                place.place_id || ""
                                                            );
                                                            const lat =
                                                                place.geometry?.location?.lat();
                                                            const lng =
                                                                place.geometry?.location?.lng();
                                                            if (
                                                                typeof lat !== "number" ||
                                                                typeof lng !== "number"
                                                            ) {
                                                                return;
                                                            }
                                                            if (isFirst) {
                                                                airportCoordinateRefs.current[0] = {
                                                                    ...airportCoordinateRefs
                                                                        .current[0],
                                                                    departure: { lat, lng },
                                                                };
                                                                void resolveLegTimezone({
                                                                    index: 0,
                                                                    timezoneKey:
                                                                        "departureTimezone",
                                                                    lat,
                                                                    lng,
                                                                    date: firstLeg.departureDate,
                                                                });
                                                            }
                                                            if (isLast) {
                                                                airportCoordinateRefs.current[0] = {
                                                                    ...airportCoordinateRefs
                                                                        .current[0],
                                                                    arrival: { lat, lng },
                                                                };
                                                                void resolveLegTimezone({
                                                                    index: 0,
                                                                    timezoneKey:
                                                                        "arrivalTimezone",
                                                                    lat,
                                                                    lng,
                                                                    date: firstLeg.arrivalDate,
                                                                });
                                                            }
                                                        }}
                                                        placeholder={
                                                            isFirst
                                                                ? "Where are you starting?"
                                                                : isLast
                                                                  ? "Where are you arriving?"
                                                                  : "Additional stop"
                                                        }
                                                        types={[
                                                            "geocode",
                                                            "establishment",
                                                        ]}
                                                        required={isFirst || isLast}
                                                        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                    />
                                                </label>
                                                <div className="flex items-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            moveRouteStop(
                                                                index,
                                                                index - 1
                                                            )
                                                        }
                                                        disabled={index === 0}
                                                        className="h-10 rounded-xl border border-slate-300 px-3 text-xs font-black text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        Up
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            moveRouteStop(
                                                                index,
                                                                index + 1
                                                            )
                                                        }
                                                        disabled={
                                                            index ===
                                                            visibleRouteStops.length - 1
                                                        }
                                                        className="h-10 rounded-xl border border-slate-300 px-3 text-xs font-black text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        Down
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeRouteStop(index)
                                                        }
                                                        disabled={
                                                            visibleRouteStops.length <= 2
                                                        }
                                                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-35"
                                                        aria-label="Remove stop"
                                                    >
                                                        <Trash2
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={addRouteStop}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-black text-slate-800 transition hover:bg-slate-50"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Add stop
                                </button>

                                <label className="block">
                                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                        Preferred taxi company or ride sharing app
                                    </span>
                                    <input
                                        name="preferred_ride_provider"
                                        defaultValue={
                                            initialItem?.preferredRideProvider || ""
                                        }
                                        placeholder="e.g. Uber, Lyft, Bolt, local taxi company"
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...PASSWORD_MANAGER_IGNORE_PROPS}
                                    />
                                </label>
                            </div>
                        ) : null}

                        {shouldShowDetails &&
                        mode !== "airplane" &&
                        !isTaxiOrCarMode ? (
                            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                                <div>
                                    <p className="text-sm font-black text-slate-900">
                                        Departure and arrival
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                        Select both locations from the Google suggestions.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block">
                                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            Departure location
                                        </span>
                                        <PlaceAutocompleteInput
                                            value={firstLeg.departureLocation}
                                            onInputChange={(value) => {
                                                updateLeg(
                                                    0,
                                                    "departureLocation",
                                                    value
                                                );
                                                updateLeg(0, "departurePlaceId", "");
                                            }}
                                            onPlaceSelect={(place) => {
                                                updateLeg(
                                                    0,
                                                    "departureLocation",
                                                    getGooglePlaceLabel(
                                                        place,
                                                        firstLeg.departureLocation
                                                    )
                                                );
                                                updateLeg(
                                                    0,
                                                    "departurePlaceId",
                                                    place.place_id || ""
                                                );
                                                const lat =
                                                    place.geometry?.location?.lat();
                                                const lng =
                                                    place.geometry?.location?.lng();
                                                if (
                                                    typeof lat === "number" &&
                                                    typeof lng === "number"
                                                ) {
                                                    airportCoordinateRefs.current[0] = {
                                                        ...airportCoordinateRefs
                                                            .current[0],
                                                        departure: { lat, lng },
                                                    };
                                                    void resolveLegTimezone({
                                                        index: 0,
                                                        timezoneKey:
                                                            "departureTimezone",
                                                        lat,
                                                        lng,
                                                        date: firstLeg.departureDate,
                                                    });
                                                }
                                            }}
                                            placeholder="Departure station or location"
                                            types={[
                                                "geocode",
                                                "establishment",
                                            ]}
                                            required
                                            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            Arrival location
                                        </span>
                                        <PlaceAutocompleteInput
                                            value={firstLeg.arrivalLocation}
                                            onInputChange={(value) => {
                                                updateLeg(0, "arrivalLocation", value);
                                                updateLeg(0, "arrivalPlaceId", "");
                                            }}
                                            onPlaceSelect={(place) => {
                                                updateLeg(
                                                    0,
                                                    "arrivalLocation",
                                                    getGooglePlaceLabel(
                                                        place,
                                                        firstLeg.arrivalLocation
                                                    )
                                                );
                                                updateLeg(
                                                    0,
                                                    "arrivalPlaceId",
                                                    place.place_id || ""
                                                );
                                                const lat =
                                                    place.geometry?.location?.lat();
                                                const lng =
                                                    place.geometry?.location?.lng();
                                                if (
                                                    typeof lat === "number" &&
                                                    typeof lng === "number"
                                                ) {
                                                    airportCoordinateRefs.current[0] = {
                                                        ...airportCoordinateRefs
                                                            .current[0],
                                                        arrival: { lat, lng },
                                                    };
                                                    void resolveLegTimezone({
                                                        index: 0,
                                                        timezoneKey:
                                                            "arrivalTimezone",
                                                        lat,
                                                        lng,
                                                        date: firstLeg.arrivalDate,
                                                    });
                                                }
                                            }}
                                            placeholder="Arrival station or location"
                                            types={[
                                                "geocode",
                                                "establishment",
                                            ]}
                                            required
                                            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        />
                                    </label>
                                </div>
                            </div>
                        ) : null}

                        {shouldShowDetails && mode !== "airplane" ? (
                            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                                <input
                                    type="hidden"
                                    name="leg_0_departure_location"
                                    value={effectiveDepartureLocation}
                                />
                                <input
                                    type="hidden"
                                    name="leg_0_arrival_location"
                                    value={effectiveArrivalLocation}
                                />
                                <input
                                    type="hidden"
                                    name="leg_0_departure_google_place_id"
                                    value={effectiveDeparturePlaceId}
                                />
                                <input
                                    type="hidden"
                                    name="leg_0_arrival_google_place_id"
                                    value={effectiveArrivalPlaceId}
                                />
                                <input
                                    type="hidden"
                                    name="leg_0_departure_timezone"
                                    value={firstLeg.departureTimezone}
                                />
                                <input
                                    type="hidden"
                                    name="leg_0_arrival_timezone"
                                    value={firstLeg.arrivalTimezone}
                                />
                                <div>
                                    <p className="text-sm font-black text-slate-900">
                                        Date and time
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                        Add when this transportation departs and arrives.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <DatePickerField
                                            name="leg_0_departure_date"
                                            label="Departure date"
                                            required
                                            value={firstLeg.departureDate}
                                            onChange={(value) =>
                                                updateLeg(0, "departureDate", value)
                                            }
                                        />
                                        <TimeInput
                                            name="leg_0_departure_time"
                                            aria-label="Departure time"
                                            required
                                            value={firstLeg.departureTime}
                                            onChange={(event) =>
                                                updateLeg(
                                                    0,
                                                    "departureTime",
                                                    event.target.value
                                                )
                                            }
                                            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <DatePickerField
                                            name="leg_0_arrival_date"
                                            label="Arrival date"
                                            required
                                            value={firstLeg.arrivalDate}
                                            onChange={(value) =>
                                                updateLeg(0, "arrivalDate", value)
                                            }
                                        />
                                        <TimeInput
                                            name="leg_0_arrival_time"
                                            aria-label="Arrival time"
                                            required
                                            value={firstLeg.arrivalTime}
                                            onChange={(event) =>
                                                updateLeg(
                                                    0,
                                                    "arrivalTime",
                                                    event.target.value
                                                )
                                            }
                                            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {locationValidationError ? (
                            <p
                                role="alert"
                                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                            >
                                {locationValidationError}
                            </p>
                        ) : null}

                        {shouldShowDetails && (
                            <>
                                <input
                                    name="reservation_code"
                                    placeholder="Reservation code / booking reference"
                                    defaultValue={initialItem?.reservationCode || ""}
                                    className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                />

                                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                                    <input
                                        type="number"
                                        name="cost"
                                        min="0"
                                        step="0.01"
                                        placeholder="Cost"
                                        value={costAmount}
                                        onChange={(event) =>
                                            setCostAmount(event.target.value)
                                        }
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...PASSWORD_MANAGER_IGNORE_PROPS}
                                    />
                                    <select
                                        name="currency"
                                        defaultValue={initialItem?.currency || "CAD"}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    >
                                        {COMMON_CURRENCIES.map((currency) => (
                                            <option key={currency} value={currency}>
                                                {currency}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <CostAllocationFields
                                    amount={costAmount}
                                    participants={audienceOptions}
                                    currentUserTripMemberId={currentUserTripMemberId}
                                    tone="light"
                                />

                                <div className="grid gap-4 md:grid-cols-2">
                                    <textarea
                                        name="visa_requirements"
                                        rows={4}
                                        placeholder="VISA requirements"
                                        defaultValue={initialItem?.visaRequirements || ""}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    />
                                    <textarea
                                        name="luggage_requirements"
                                        rows={4}
                                        placeholder="Luggage requirements"
                                        defaultValue={initialItem?.luggageRequirements || ""}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    />
                                </div>

                                {totalDuration && (
                                    <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                                        Total duration: {totalDuration}
                                    </div>
                                )}

                                <select
                                    name="status"
                                    defaultValue={initialItem?.status || "planned"}
                                    className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                >
                                    {TRANSPORTATION_STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>

                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                                    >
                                        {submitLabel}
                                    </button>
                                </div>
                            </>
                        )}
                    </form>
                </aside>
            </div>
            </Portal>

            {showCloseWarning && (
                <Portal>
                <div
                    className="fixed inset-0 z-[140] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-950">
                                    Save changes before leaving?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    You have unsaved transportation details.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowCloseWarning(false)}
                                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCloseWarning(false);
                                    closeWithAnimation();
                                }}
                                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
                </Portal>
            )}
        </>
    );
}
