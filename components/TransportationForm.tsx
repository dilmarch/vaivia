"use client";

import { AlertTriangle, X } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    getAirlineLogoUrl,
    getAirlineNameFromCode,
    inferAirlineCodeFromFlightNumber,
} from "@/lib/airline";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";

type TransportationFormProps = {
    tripId: string;
    submitAction: (formData: FormData) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
    defaultDate?: string;
};

type FlightLeg = {
    departureLocation: string;
    departureDate: string;
    departureTime: string;
    departureTimezone: string;
    arrivalLocation: string;
    arrivalDate: string;
    arrivalTime: string;
    arrivalTimezone: string;
    departureTerminal: string;
    arrivalTerminal: string;
    flightNumber: string;
    airlineName: string;
};

const MODES = [
    { value: "airplane", label: "Airplane", emoji: "✈️", disabled: false },
    { value: "train", label: "Train", emoji: "🚆", disabled: false },
    { value: "bus", label: "Bus", emoji: "🚌", disabled: false },
    { value: "tram", label: "Tram", emoji: "🚊", disabled: false },
    { value: "taxi", label: "Taxi", emoji: "🚕", disabled: true },
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
        departureDate: defaultDate,
        departureTime: "",
        departureTimezone: "",
        arrivalLocation: "",
        arrivalDate: defaultDate,
        arrivalTime: "",
        arrivalTimezone: "",
        departureTerminal: "",
        arrivalTerminal: "",
        flightNumber: "",
        airlineName: "",
    };
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
                <input
                    aria-label={`Choose ${label.toLowerCase()}`}
                    type="date"
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
}: TransportationFormProps) {
    const [mode, setMode] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [connectionCount, setConnectionCount] = useState<number | null>(null);
    const [flightLegs, setFlightLegs] = useState<FlightLeg[]>([
        createEmptyLeg(defaultDate),
    ]);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const departureRefs = useRef<Array<HTMLInputElement | null>>([]);
    const arrivalRefs = useRef<Array<HTMLInputElement | null>>([]);
    const flightLegsRef = useRef(flightLegs);
    const previousIsOpenRef = useRef(isOpen);
    const airportCoordinateRefs = useRef<
        Array<{
            departure?: { lat: number; lng: number };
            arrival?: { lat: number; lng: number };
        }>
    >([]);

    const firstLeg = flightLegs[0] || createEmptyLeg(defaultDate);
    const lastLeg = flightLegs.at(-1) || firstLeg;
    const firstAirlineCode = inferAirlineCodeFromFlightNumber(firstLeg.flightNumber);
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

    useEffect(() => {
        flightLegsRef.current = flightLegs;
    }, [flightLegs]);

    useEffect(() => {
        if (!isOpen || previousIsOpenRef.current === isOpen) {
            previousIsOpenRef.current = isOpen;
            return;
        }

        setMode("");
        setConnectionCount(null);
        setFlightLegs([createEmptyLeg(defaultDate)]);
        airportCoordinateRefs.current = [];
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        previousIsOpenRef.current = isOpen;
    }, [defaultDate, isOpen]);

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

    useEffect(() => {
        if (!isOpen || !isGoogleReady) return;
        if (!shouldShowDetails) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const listeners: google.maps.MapsEventListener[] = [];

        flightLegs.forEach((_, index) => {
            [
                {
                    element: departureRefs.current[index],
                    locationKey: "departureLocation" as const,
                    timezoneKey: "departureTimezone" as const,
                    dateKey: "departureDate" as const,
                    coordinateKey: "departure" as const,
                },
                {
                    element: arrivalRefs.current[index],
                    locationKey: "arrivalLocation" as const,
                    timezoneKey: "arrivalTimezone" as const,
                    dateKey: "arrivalDate" as const,
                    coordinateKey: "arrival" as const,
                },
            ].forEach(({ element, locationKey, timezoneKey, dateKey, coordinateKey }) => {
                if (!element) return;

                const autocomplete = new window.google.maps.places.Autocomplete(element, {
                    fields: ["name", "formatted_address", "geometry"],
                    types: mode === "airplane" ? ["airport"] : ["establishment"],
                });

                listeners.push(
                    autocomplete.addListener("place_changed", async () => {
                        const place = autocomplete.getPlace();
                        const placeName =
                            place.name || place.formatted_address || element.value;
                        const lat = place.geometry?.location?.lat();
                        const lng = place.geometry?.location?.lng();

                        updateLeg(index, locationKey, placeName);
                        setHasUnsavedChanges(true);

                        if (typeof lat !== "number" || typeof lng !== "number") return;

                        airportCoordinateRefs.current[index] = {
                            ...airportCoordinateRefs.current[index],
                            [coordinateKey]: { lat, lng },
                        };

                        void resolveLegTimezone({
                            index,
                            timezoneKey,
                            lat,
                            lng,
                            date: flightLegsRef.current[index]?.[dateKey],
                        });
                    })
                );
            });
        });

        return () => {
            listeners.forEach((listener) => listener.remove());
        };
        // Keep Autocomplete listeners stable across field edits; live leg values come from refs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flightLegs.length, isGoogleReady, isOpen, mode, shouldShowDetails]);

    if (!isOpen) return null;

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

    function requestClose() {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        onClose();
    }

    function modeLabel() {
        return MODES.find((option) => option.value === mode)?.label || "Transportation";
    }

    function selectMode(nextMode: string) {
        setMode(nextMode);
        setConnectionCount(null);
        setFlightLegs([createEmptyLeg(defaultDate)]);
        airportCoordinateRefs.current = [];
        setHasUnsavedChanges(true);
    }

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                onClick={requestClose}
            >
                <aside
                    className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex min-h-32 items-center gap-4 border-b border-slate-200 bg-slate-50 p-5">
                        <div className="flex h-16 w-16 items-center justify-center rounded-md border border-slate-200 bg-white text-3xl">
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
                            ) : (
                                MODES.find((option) => option.value === mode)?.emoji || "+"
                            )}
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Add transportation
                            </p>
                            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                                {modeLabel()}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            aria-label="Close transportation form"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <form
                        action={submitAction}
                        className="space-y-5 p-5"
                        onChange={() => setHasUnsavedChanges(true)}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
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
                        <input type="hidden" name="airline_name" value={firstLeg.airlineName} />
                        <input type="hidden" name="flight_number" value={firstLeg.flightNumber} />

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
                                    const legAirlineCode = inferAirlineCodeFromFlightNumber(
                                        leg.flightNumber
                                    );
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

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <input
                                                    id={`flightLeg${index}DepartureAirport`}
                                                    ref={(element) => {
                                                        departureRefs.current[index] = element;
                                                    }}
                                                    name={`leg_${index}_departure_location`}
                                                    type="text"
                                                    value={leg.departureLocation}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            index,
                                                            "departureLocation",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Departure airport, code, or city"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    id={`flightLeg${index}ArrivalAirport`}
                                                    ref={(element) => {
                                                        arrivalRefs.current[index] = element;
                                                    }}
                                                    name={`leg_${index}_arrival_location`}
                                                    type="text"
                                                    value={leg.arrivalLocation}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            index,
                                                            "arrivalLocation",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Arrival airport, code, or city"
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
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
                                                    <input
                                                        id={`flightLeg${index}DepartureTime`}
                                                        name={`leg_${index}_departure_time`}
                                                        type="time"
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
                                                    <input
                                                        id={`flightLeg${index}ArrivalTime`}
                                                        name={`leg_${index}_arrival_time`}
                                                        type="time"
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
                                                    name={`leg_${index}_flight_number`}
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

                        {shouldShowDetails && mode !== "airplane" ? (
                            <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
                                Train, bus, and tram details can be added in the next pass.
                            </div>
                        ) : null}

                        {shouldShowDetails && (
                            <>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <textarea
                                        name="visa_requirements"
                                        rows={4}
                                        placeholder="VISA requirements"
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    />
                                    <textarea
                                        name="luggage_requirements"
                                        rows={4}
                                        placeholder="Luggage requirements"
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
                                    defaultValue="planned"
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
                                        Save
                                    </button>
                                </div>
                            </>
                        )}
                    </form>
                </aside>
            </div>

            {showCloseWarning && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-6"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"
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
                                onClick={onClose}
                                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
