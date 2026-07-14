"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import {
    getAirlineNameFromCode,
    inferAirlineCodeFromFlightNumber,
} from "@/lib/airline";
import {
    formatDurationLabelFromMinutes,
    getZonedDurationLabel,
    zonedDateTimeToUtc,
} from "@/lib/timezoneDuration";

type JourneyPlanningTabProps = {
    tripId: string;
    tripStartDate?: string | null;
    createTransportationAction: (formData: FormData) => Promise<void>;
};

type PlanningLeg = {
    departureLocation: string;
    arrivalLocation: string;
    departureDate: string;
    arrivalDate: string;
    departureTime: string;
    arrivalTime: string;
    departureTimezone: string;
    arrivalTimezone: string;
    departureTerminal: string;
    arrivalTerminal: string;
    flightNumber: string;
    airlineName: string;
    cost: string;
    currency: string;
};

type PlanningTransportMode =
    | "airplane"
    | "train"
    | "bus"
    | "tram"
    | "ferry"
    | "taxi"
    | "car"
    | "bicycle";

type PlanningScenario = {
    id: string;
    label: string;
    transportMode: PlanningTransportMode;
    cost: string;
    currency: string;
    pros: string;
    cons: string;
    legs: PlanningLeg[];
};

const STORAGE_KEY_PREFIX = "vaivia:journey-planning:";
const SCENARIO_LABELS = ["Scenario A", "Scenario B", "Scenario C"];
const COMMON_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "NZD", "JPY"];
const FLIGHT_STRUCTURE_OPTIONS = [
    { value: "1", label: "Direct" },
    { value: "2", label: "1 layover" },
    { value: "3", label: "2 layovers" },
    { value: "4", label: "3 layovers" },
];
const PLANNING_TRANSPORT_MODES: Array<{
    value: PlanningTransportMode;
    label: string;
    emoji: string;
}> = [
    { value: "airplane", label: "Airplane", emoji: "✈️" },
    { value: "train", label: "Train", emoji: "🚆" },
    { value: "bus", label: "Bus", emoji: "🚌" },
    { value: "tram", label: "Tram", emoji: "🚊" },
    { value: "ferry", label: "Ferry", emoji: "⛴️" },
    { value: "taxi", label: "Taxi", emoji: "🚕" },
    { value: "car", label: "Car", emoji: "🚗" },
    { value: "bicycle", label: "Bicycle", emoji: "🚲" },
];
const PASSWORD_MANAGER_IGNORE_PROPS = {
    autoComplete: "off",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
};

type StyledOption = {
    value: string;
    label: string;
    emoji?: string;
};

type StyledOptionPickerProps = {
    label: string;
    value: string;
    options: StyledOption[];
    onChange: (value: string) => void;
};

function StyledOptionPicker({
    label,
    value,
    options,
    onChange,
}: StyledOptionPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement | null>(null);
    const selectedOption = options.find((option) => option.value === value) || options[0];

    useEffect(() => {
        if (!isOpen) return;

        function handlePointerDown(event: PointerEvent) {
            if (!pickerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);

        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [isOpen]);

    return (
        <div ref={pickerRef} className="relative">
            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {label}
            </span>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0c0115]/90 px-3 py-2 text-left text-sm font-bold text-white shadow-xl shadow-black/20 outline-none transition hover:border-lime-300/35 hover:bg-white/[0.08] focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/30"
            >
                <span className="min-w-0 truncate">
                    {selectedOption?.emoji ? `${selectedOption.emoji} ` : ""}
                    {selectedOption?.label || value}
                </span>
                <span
                    className={`text-lime-200 transition ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                >
                    ▾
                </span>
            </button>
            {isOpen ? (
                <div
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#080710]/95 p-1 text-sm text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
                >
                    {options.map((option) => {
                        const isSelected = option.value === value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left font-bold transition ${
                                    isSelected
                                        ? "bg-lime-300 text-slate-950"
                                        : "text-slate-100 hover:bg-lime-300/15 hover:text-lime-100"
                                }`}
                            >
                                <span className="min-w-0 truncate">
                                    {option.emoji ? `${option.emoji} ` : ""}
                                    {option.label}
                                </span>
                                {isSelected ? (
                                    <span className="text-xs font-black uppercase">
                                        Selected
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function createEmptyLeg(defaultDate = ""): PlanningLeg {
    return {
        departureLocation: "",
        arrivalLocation: "",
        departureDate: defaultDate,
        arrivalDate: defaultDate,
        departureTime: "",
        arrivalTime: "",
        departureTimezone: "",
        arrivalTimezone: "",
        departureTerminal: "",
        arrivalTerminal: "",
        flightNumber: "",
        airlineName: "",
        cost: "",
        currency: "CAD",
    };
}

function createScenario(index: number, defaultDate = ""): PlanningScenario {
    return {
        id: `scenario-${index + 1}`,
        label: SCENARIO_LABELS[index] || `Scenario ${index + 1}`,
        transportMode: "airplane",
        cost: "",
        currency: "CAD",
        pros: "",
        cons: "",
        legs: [createEmptyLeg(defaultDate)],
    };
}

function createInitialScenarios(defaultDate = ""): PlanningScenario[] {
    return SCENARIO_LABELS.map((_, index) => createScenario(index, defaultDate));
}

function normalizeScenario(
    scenario: Partial<PlanningScenario>,
    index: number,
    defaultDate = ""
): PlanningScenario {
    return {
        id: scenario.id || `scenario-${index + 1}`,
        label: scenario.label || SCENARIO_LABELS[index] || `Scenario ${index + 1}`,
        transportMode: scenario.transportMode || "airplane",
        cost: scenario.cost || "",
        currency: scenario.currency || "CAD",
        pros: scenario.pros || "",
        cons: scenario.cons || "",
        legs:
            Array.isArray(scenario.legs) && scenario.legs.length
                ? scenario.legs.map((leg) => ({ ...createEmptyLeg(defaultDate), ...leg }))
                : [createEmptyLeg(defaultDate)],
    };
}

function normalizeFlightNumber(value: string) {
    return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function getLegDurationMinutes(leg: PlanningLeg) {
    if (
        !leg.departureDate ||
        !leg.departureTime ||
        !leg.departureTimezone ||
        !leg.arrivalDate ||
        !leg.arrivalTime ||
        !leg.arrivalTimezone
    ) {
        return 0;
    }

    try {
        const departure = zonedDateTimeToUtc(
            leg.departureDate,
            leg.departureTime,
            leg.departureTimezone
        );
        const arrival = zonedDateTimeToUtc(
            leg.arrivalDate,
            leg.arrivalTime,
            leg.arrivalTimezone
        );
        const minutes = Math.round((arrival.getTime() - departure.getTime()) / 60000);

        return minutes > 0 ? minutes : 0;
    } catch {
        return 0;
    }
}

function getLegDurationLabel(leg: PlanningLeg) {
    return getZonedDurationLabel({
        startDate: leg.departureDate,
        startTime: leg.departureTime,
        startTimezone: leg.departureTimezone,
        endDate: leg.arrivalDate,
        endTime: leg.arrivalTime,
        endTimezone: leg.arrivalTimezone,
    });
}

function isScenarioReady(scenario: PlanningScenario) {
    return scenario.legs.every(
        (leg) =>
            leg.departureLocation &&
            leg.arrivalLocation &&
            leg.departureDate &&
            leg.arrivalDate &&
            leg.departureTime &&
            leg.arrivalTime &&
            leg.departureTimezone &&
            leg.arrivalTimezone &&
            (scenario.transportMode !== "airplane" || leg.flightNumber)
    );
}

function getScenarioSummary(scenario: PlanningScenario) {
    const firstLeg = scenario.legs[0];
    const lastLeg = scenario.legs.at(-1);

    if (!firstLeg || !lastLeg) return "Add flights to compare this option.";

    return [firstLeg.departureLocation, ...scenario.legs.map((leg) => leg.arrivalLocation)]
        .filter(Boolean)
        .join(" -> ");
}

function getPlaceName(place: google.maps.places.PlaceResult, fallback: string) {
    return place.name || place.formatted_address || fallback;
}

function getPlaceCoordinates(place: google.maps.places.PlaceResult) {
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();

    if (typeof lat !== "number" || typeof lng !== "number") return null;

    return { lat, lng };
}

function getPlaceUtcOffsetTimezone(place: google.maps.places.PlaceResult) {
    const offsetMinutes = place.utc_offset_minutes;
    if (typeof offsetMinutes !== "number" || !Number.isFinite(offsetMinutes)) {
        return "";
    }

    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absoluteMinutes / 60)
        .toString()
        .padStart(2, "0");
    const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");

    return `UTC${sign}${hours}:${minutes}`;
}

function formatScenarioPrice(cost: string, currency: string) {
    const trimmedCost = cost.trim();
    if (!trimmedCost) return "Price not added";

    return `${currency || "CAD"} ${trimmedCost}`;
}

function getScenarioTotalCost(scenario: PlanningScenario) {
    const pricedLegs = scenario.legs
        .map((leg) => ({
            amount: Number(leg.cost.replace(/,/g, "")),
            currency: leg.currency || scenario.currency || "CAD",
        }))
        .filter((leg) => Number.isFinite(leg.amount) && leg.amount > 0);

    if (!pricedLegs.length) return scenario.cost;

    const firstCurrency = pricedLegs[0].currency;
    if (!pricedLegs.every((leg) => leg.currency === firstCurrency)) return scenario.cost;

    return pricedLegs
        .reduce((total, leg) => total + leg.amount, 0)
        .toFixed(2)
        .replace(/\.00$/, "");
}

function getScenarioCurrency(scenario: PlanningScenario) {
    const pricedLegs = scenario.legs.filter((leg) => leg.cost.trim());
    if (!pricedLegs.length) return scenario.currency;

    const firstCurrency = pricedLegs[0].currency || scenario.currency || "CAD";
    return pricedLegs.every((leg) => (leg.currency || scenario.currency) === firstCurrency)
        ? firstCurrency
        : scenario.currency;
}

function getLayoverDurationLabel(previousLeg: PlanningLeg, nextLeg: PlanningLeg) {
    if (
        !previousLeg.arrivalDate ||
        !previousLeg.arrivalTime ||
        !previousLeg.arrivalTimezone ||
        !nextLeg.departureDate ||
        !nextLeg.departureTime ||
        !nextLeg.departureTimezone
    ) {
        return "Add arrival and departure times";
    }

    try {
        const arrival = zonedDateTimeToUtc(
            previousLeg.arrivalDate,
            previousLeg.arrivalTime,
            previousLeg.arrivalTimezone
        );
        const departure = zonedDateTimeToUtc(
            nextLeg.departureDate,
            nextLeg.departureTime,
            nextLeg.departureTimezone
        );
        const minutes = Math.round((departure.getTime() - arrival.getTime()) / 60000);

        return minutes > 0
            ? formatDurationLabelFromMinutes(minutes)
            : "Check connection times";
    } catch {
        return "Add time zones";
    }
}

export default function JourneyPlanningTab({
    tripId,
    tripStartDate,
    createTransportationAction,
}: JourneyPlanningTabProps) {
    const defaultDate = tripStartDate || "";
    const storageKey = `${STORAGE_KEY_PREFIX}${tripId}`;
    const airportCoordinateRefs = useRef<
        Record<
            string,
            {
                departure?: { lat: number; lng: number };
                arrival?: { lat: number; lng: number };
            }
        >
    >({});
    const [detectingTimezones, setDetectingTimezones] = useState<Record<string, boolean>>(
        {}
    );
    const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
    const [pendingDeleteScenarioId, setPendingDeleteScenarioId] = useState<
        string | null
    >(null);
    const [scenarios, setScenarios] = useState<PlanningScenario[]>(() =>
        createInitialScenarios(defaultDate)
    );

    useEffect(() => {
        try {
            const storedScenarios = window.localStorage.getItem(storageKey);
            if (!storedScenarios) return;

            const parsedScenarios = JSON.parse(storedScenarios) as Array<
                Partial<PlanningScenario>
            >;
            if (Array.isArray(parsedScenarios) && parsedScenarios.length) {
                setScenarios(
                    parsedScenarios.map((scenario, index) =>
                        normalizeScenario(scenario, index, defaultDate)
                    )
                );
            }
        } catch {
            setScenarios(createInitialScenarios(defaultDate));
        }
    }, [defaultDate, storageKey]);

    useEffect(() => {
        window.localStorage.setItem(storageKey, JSON.stringify(scenarios));
    }, [scenarios, storageKey]);

    const scenarioTotals = useMemo(
        () =>
            scenarios.reduce<Record<string, string>>((totals, scenario) => {
                const totalMinutes = scenario.legs.reduce(
                    (sum, leg) => sum + getLegDurationMinutes(leg),
                    0
                );
                return {
                    ...totals,
                    [scenario.id]: totalMinutes
                        ? formatDurationLabelFromMinutes(totalMinutes)
                        : "Add flight times",
                };
            }, {}),
        [scenarios]
    );

    function updateScenarioLabel(scenarioId: string, label: string) {
        updateScenarioFields(scenarioId, { label });
    }

    function updateScenarioFields(
        scenarioId: string,
        values: Partial<Omit<PlanningScenario, "id" | "legs">>
    ) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) =>
                scenario.id === scenarioId ? { ...scenario, ...values } : scenario
            )
        );
    }

    function updateLeg(
        scenarioId: string,
        legIndex: number,
        field: keyof PlanningLeg,
        value: string
    ) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                return {
                    ...scenario,
                    legs: scenario.legs.map((leg, index) => {
                        if (index !== legIndex) return leg;

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
                    }),
                };
            })
        );

        if (field === "departureDate" || field === "arrivalDate") {
            const coordinateKey = field === "departureDate" ? "departure" : "arrival";
            const timezoneKey =
                field === "departureDate" ? "departureTimezone" : "arrivalTimezone";
            const coordinates =
                airportCoordinateRefs.current[`${scenarioId}:${legIndex}`]?.[
                    coordinateKey
                ];

            if (coordinates) {
                void resolveLegTimezone({
                    scenarioId,
                    legIndex,
                    timezoneKey,
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    date: value,
                });
            }
        }
    }

    function updateLegFields(
        scenarioId: string,
        legIndex: number,
        values: Partial<PlanningLeg>
    ) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                return {
                    ...scenario,
                    legs: scenario.legs.map((leg, index) =>
                        index === legIndex ? { ...leg, ...values } : leg
                    ),
                };
            })
        );
    }

    function setScenarioLegCount(scenarioId: string, legCount: number) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                const nextLegs = [...scenario.legs];
                while (nextLegs.length < legCount) {
                    const previousLeg = nextLegs.at(-1);
                    nextLegs.push({
                        ...createEmptyLeg(defaultDate),
                        currency: previousLeg?.currency || scenario.currency || "CAD",
                    });
                }

                return {
                    ...scenario,
                    legs: nextLegs.slice(0, legCount),
                };
            })
        );
    }

    async function resolveLegTimezone({
        scenarioId,
        legIndex,
        timezoneKey,
        lat,
        lng,
        date,
        fallbackTimezone,
    }: {
        scenarioId: string;
        legIndex: number;
        timezoneKey: "departureTimezone" | "arrivalTimezone";
        lat: number;
        lng: number;
        date?: string;
        fallbackTimezone?: string;
    }) {
        const detectingKey = `${scenarioId}:${legIndex}:${timezoneKey}`;
        setDetectingTimezones((current) => ({ ...current, [detectingKey]: true }));

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
                updateLegFields(scenarioId, legIndex, {
                    [timezoneKey]: data.timeZoneId,
                });
            } else if (fallbackTimezone) {
                updateLegFields(scenarioId, legIndex, {
                    [timezoneKey]: fallbackTimezone,
                });
            }
        } catch {
            if (fallbackTimezone) {
                updateLegFields(scenarioId, legIndex, {
                    [timezoneKey]: fallbackTimezone,
                });
            }
            // Manual time zone entry remains available.
        } finally {
            setDetectingTimezones((current) => {
                const next = { ...current };
                delete next[detectingKey];
                return next;
            });
        }
    }

    function handleAirportPlaceSelect({
        scenarioId,
        legIndex,
        place,
        locationKey,
        timezoneKey,
        coordinateKey,
        fallback,
        date,
    }: {
        scenarioId: string;
        legIndex: number;
        place: google.maps.places.PlaceResult;
        locationKey: "departureLocation" | "arrivalLocation";
        timezoneKey: "departureTimezone" | "arrivalTimezone";
        coordinateKey: "departure" | "arrival";
        fallback: string;
        date?: string;
    }) {
        const placeName = getPlaceName(place, fallback);
        const coordinates = getPlaceCoordinates(place);
        const fallbackTimezone = getPlaceUtcOffsetTimezone(place);

        updateLegFields(scenarioId, legIndex, {
            [locationKey]: placeName,
            ...(fallbackTimezone ? { [timezoneKey]: fallbackTimezone } : {}),
        });

        if (!coordinates) return;

        airportCoordinateRefs.current[`${scenarioId}:${legIndex}`] = {
            ...airportCoordinateRefs.current[`${scenarioId}:${legIndex}`],
            [coordinateKey]: coordinates,
        };

        void resolveLegTimezone({
            scenarioId,
            legIndex,
            timezoneKey,
            lat: coordinates.lat,
            lng: coordinates.lng,
            date,
            fallbackTimezone,
        });
    }

    function addScenario() {
        setScenarios((currentScenarios) => [
            ...currentScenarios,
            {
                ...createScenario(currentScenarios.length, defaultDate),
                id: `scenario-${Date.now()}`,
            },
        ]);
    }

    function deleteScenario(scenarioId: string) {
        setScenarios((currentScenarios) =>
            currentScenarios.filter((scenario) => scenario.id !== scenarioId)
        );
        if (selectedScenarioId === scenarioId) setSelectedScenarioId(null);
        setPendingDeleteScenarioId(null);
    }

    return (
        <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-5 text-white shadow-2xl shadow-black/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-lime-300">
                        Flight scenarios
                    </p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight">
                        Journey Planning
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        Compare possible flight plans here first. Nothing is added to
                        the itinerary until you choose a scenario.
                    </p>
                </div>
                {selectedScenarioId && (
                    <div className="rounded-full border border-lime-300/40 bg-lime-300/15 px-4 py-2 text-sm font-bold text-lime-100">
                        Selected plan is being added
                    </div>
                )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {scenarios.map((scenario) => {
                    const scenarioReady = isScenarioReady(scenario);
                    const isSelected = selectedScenarioId === scenario.id;
                    const isDimmed = Boolean(selectedScenarioId && !isSelected);
                    const firstLeg = scenario.legs[0] || createEmptyLeg(defaultDate);
                    const lastLeg = scenario.legs.at(-1) || firstLeg;
                    const firstFlightNumber = normalizeFlightNumber(firstLeg.flightNumber);
                    const firstAirlineCode =
                        inferAirlineCodeFromFlightNumber(firstFlightNumber);
                    const selectedMode =
                        PLANNING_TRANSPORT_MODES.find(
                            (mode) => mode.value === scenario.transportMode
                        ) || PLANNING_TRANSPORT_MODES[0];
                    const locationPlaceholder =
                        scenario.transportMode === "airplane"
                            ? "airport"
                            : "station, port, stop, or location";
                    const scenarioTotalCost = getScenarioTotalCost(scenario);
                    const scenarioCurrency = getScenarioCurrency(scenario);
                    const routeSummary = getScenarioSummary(scenario);
                    const flightStructureValue = String(
                        Math.min(Math.max(scenario.legs.length, 1), 4)
                    );

                    return (
                        <form
                            key={scenario.id}
                            action={createTransportationAction}
                            onSubmit={() => setSelectedScenarioId(scenario.id)}
                            className={`flex min-h-full flex-col rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20 transition duration-300 ${
                                isDimmed ? "opacity-35 grayscale" : "opacity-100"
                            }`}
                        >
                            <input type="hidden" name="trip_id" value={tripId} />
                            <input
                                type="hidden"
                                name="transportation_mode"
                                value={scenario.transportMode}
                            />
                            <input type="hidden" name="status" value="planned" />
                            <input
                                type="hidden"
                                name="flight_leg_count"
                                value={scenario.legs.length}
                            />
                            <input
                                type="hidden"
                                name="item_date"
                                value={firstLeg.departureDate}
                            />
                            <input
                                type="hidden"
                                name="start_time"
                                value={firstLeg.departureTime}
                            />
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
                            <input
                                type="hidden"
                                name="airline_code"
                                value={firstAirlineCode}
                            />
                            <input
                                type="hidden"
                                name="airline_name"
                                value={firstLeg.airlineName}
                            />
                            <input
                                type="hidden"
                                name="flight_number"
                                value={firstFlightNumber}
                            />
                            <input
                                type="hidden"
                                name="duration"
                                value={scenarioTotals[scenario.id] || ""}
                            />
                            <input type="hidden" name="cost" value={scenarioTotalCost} />
                            <input
                                type="hidden"
                                name="currency"
                                value={scenarioCurrency}
                            />
                            <input type="hidden" name="scenario_pros" value={scenario.pros} />
                            <input type="hidden" name="scenario_cons" value={scenario.cons} />

                            <div className="rounded-[1.25rem] border border-white/10 bg-[#0c0115]/70 p-4">
                                <div className="flex items-start gap-3">
                                    <span
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300 text-2xl text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                        aria-hidden="true"
                                    >
                                        {selectedMode.emoji}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                                            Scenario name
                                        </label>
                                        <input
                                            value={scenario.label}
                                            onChange={(event) =>
                                                updateScenarioLabel(
                                                    scenario.id,
                                                    event.target.value
                                                )
                                            }
                                            className="mt-2 w-full bg-transparent text-2xl font-black text-white outline-none"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setPendingDeleteScenarioId(scenario.id)
                                        }
                                        className="rounded-full border border-red-300/20 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-red-100 transition hover:bg-red-400/15"
                                    >
                                        Delete
                                    </button>
                                </div>
                                {pendingDeleteScenarioId === scenario.id ? (
                                    <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/10 p-3">
                                        <p className="text-sm font-bold text-red-50">
                                            Delete this transport idea?
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => deleteScenario(scenario.id)}
                                                className="rounded-full bg-red-300 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-950 transition hover:bg-red-200"
                                            >
                                                Confirm delete
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPendingDeleteScenarioId(null)
                                                }
                                                className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-200 transition hover:bg-white/10"
                                            >
                                                Keep it
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <StyledOptionPicker
                                        label="Transport type"
                                        value={scenario.transportMode}
                                        options={PLANNING_TRANSPORT_MODES}
                                        onChange={(value) =>
                                            updateScenarioFields(scenario.id, {
                                                transportMode:
                                                    value as PlanningTransportMode,
                                            })
                                        }
                                    />
                                    <StyledOptionPicker
                                        label="Flight structure"
                                        value={flightStructureValue}
                                        options={FLIGHT_STRUCTURE_OPTIONS}
                                        onChange={(value) =>
                                            setScenarioLegCount(scenario.id, Number(value))
                                        }
                                    />
                                </div>
                                <div className="mt-4 rounded-2xl bg-lime-300 px-4 py-3 text-slate-950">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">
                                        Total{" "}
                                        {scenario.transportMode === "airplane"
                                            ? "flying"
                                            : "travel"}{" "}
                                        time
                                    </p>
                                    <p className="mt-1 text-3xl font-black">
                                        {scenarioTotals[scenario.id]}
                                    </p>
                                </div>
                                <p className="mt-3 text-xs leading-5 text-slate-300">
                                    {routeSummary}
                                </p>
                            </div>

                            <div className="mt-4 flex-1 space-y-4">
                                {scenario.legs.map((leg, legIndex) => {
                                    const flightNumber = normalizeFlightNumber(
                                        leg.flightNumber
                                    );
                                    const airlineCode =
                                        inferAirlineCodeFromFlightNumber(flightNumber);
                                    const durationLabel = getLegDurationLabel(leg);

                                    return (
                                        <div key={legIndex} className="space-y-4">
                                        <fieldset
                                            className="rounded-[1.25rem] border border-white/10 bg-white/[0.07] p-4"
                                        >
                                            <input
                                                type="hidden"
                                                name={`leg_${legIndex}_flight_number`}
                                                value={flightNumber}
                                            />
                                            <input
                                                type="hidden"
                                                name={`leg_${legIndex}_airline_code`}
                                                value={airlineCode}
                                            />
                                            <input
                                                type="hidden"
                                                name={`leg_${legIndex}_duration`}
                                                value={durationLabel}
                                            />
                                            <input
                                                type="hidden"
                                                name={`leg_${legIndex}_cost`}
                                                value={leg.cost}
                                            />
                                            <input
                                                type="hidden"
                                                name={`leg_${legIndex}_currency`}
                                                value={leg.currency}
                                            />

                                            <div className="flex items-center justify-between gap-3">
                                                <legend className="text-sm font-black uppercase tracking-wide text-white">
                                                    {scenario.transportMode === "airplane"
                                                        ? "Flight"
                                                        : "Segment"}{" "}
                                                    {legIndex + 1}
                                                </legend>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <PlaceAutocompleteInput
                                                    name={`leg_${legIndex}_departure_location`}
                                                    value={leg.departureLocation}
                                                    onInputChange={(value) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureLocation",
                                                            value
                                                        )
                                                    }
                                                    onPlaceSelect={(place) =>
                                                        handleAirportPlaceSelect({
                                                            scenarioId: scenario.id,
                                                            legIndex,
                                                            place,
                                                            locationKey:
                                                                "departureLocation",
                                                            timezoneKey:
                                                                "departureTimezone",
                                                            coordinateKey: "departure",
                                                            fallback:
                                                                leg.departureLocation,
                                                            date: leg.departureDate,
                                                        })
                                                    }
                                                    placeholder={`Departure ${locationPlaceholder}`}
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                    types={
                                                        scenario.transportMode === "airplane"
                                                            ? ["airport"]
                                                            : ["geocode", "establishment"]
                                                    }
                                                />
                                                <PlaceAutocompleteInput
                                                    name={`leg_${legIndex}_arrival_location`}
                                                    value={leg.arrivalLocation}
                                                    onInputChange={(value) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalLocation",
                                                            value
                                                        )
                                                    }
                                                    onPlaceSelect={(place) =>
                                                        handleAirportPlaceSelect({
                                                            scenarioId: scenario.id,
                                                            legIndex,
                                                            place,
                                                            locationKey: "arrivalLocation",
                                                            timezoneKey: "arrivalTimezone",
                                                            coordinateKey: "arrival",
                                                            fallback: leg.arrivalLocation,
                                                            date: leg.arrivalDate,
                                                        })
                                                    }
                                                    placeholder={`Arrival ${locationPlaceholder}`}
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                    types={
                                                        scenario.transportMode === "airplane"
                                                            ? ["airport"]
                                                            : ["geocode", "establishment"]
                                                    }
                                                />
                                            </div>

                                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                <input
                                                    name={`leg_${legIndex}_departure_date`}
                                                    type="date"
                                                    value={leg.departureDate}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureDate",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="cursor-pointer rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white [color-scheme:dark]"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    name={`leg_${legIndex}_arrival_date`}
                                                    type="date"
                                                    value={leg.arrivalDate}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalDate",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="cursor-pointer rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white [color-scheme:dark]"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    name={`leg_${legIndex}_departure_time`}
                                                    type="time"
                                                    value={leg.departureTime}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureTime",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    name={`leg_${legIndex}_arrival_time`}
                                                    type="time"
                                                    value={leg.arrivalTime}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalTime",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                            </div>

                                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                <input
                                                    name={`leg_${legIndex}_departure_timezone`}
                                                    value={leg.departureTimezone}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureTimezone",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder={
                                                        detectingTimezones[
                                                            `${scenario.id}:${legIndex}:departureTimezone`
                                                        ]
                                                            ? "Detecting departure time zone..."
                                                            : "Departure time zone"
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                                <input
                                                    name={`leg_${legIndex}_arrival_timezone`}
                                                    value={leg.arrivalTimezone}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalTimezone",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder={
                                                        detectingTimezones[
                                                            `${scenario.id}:${legIndex}:arrivalTimezone`
                                                        ]
                                                            ? "Detecting arrival time zone..."
                                                            : "Arrival time zone"
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                            </div>

                                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                <input
                                                    name={`leg_${legIndex}_departure_terminal`}
                                                    value={leg.departureTerminal}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureTerminal",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Departure terminal"
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                                <input
                                                    name={`leg_${legIndex}_arrival_terminal`}
                                                    value={leg.arrivalTerminal}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalTerminal",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Arrival terminal"
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                                <input
                                                    value={leg.flightNumber}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "flightNumber",
                                                            event.target.value.toUpperCase()
                                                        )
                                                    }
                                                    placeholder={
                                                        scenario.transportMode === "airplane"
                                                            ? "Flight number"
                                                            : "Service / route number"
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    name={`leg_${legIndex}_airline_name`}
                                                    value={leg.airlineName}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "airlineName",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder={
                                                        scenario.transportMode === "airplane"
                                                            ? airlineCode
                                                                ? `Airline (${airlineCode})`
                                                                : "Airline"
                                                            : "Operator"
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                            </div>
                                            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_0.5fr]">
                                                <label className="block">
                                                    <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                        Price
                                                    </span>
                                                    <input
                                                        value={leg.cost}
                                                        onChange={(event) =>
                                                            updateLeg(
                                                                scenario.id,
                                                                legIndex,
                                                                "cost",
                                                                event.target.value
                                                            )
                                                        }
                                                        inputMode="decimal"
                                                        placeholder="0.00"
                                                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                        {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                    />
                                                </label>
                                                <StyledOptionPicker
                                                    label="Currency"
                                                    value={leg.currency}
                                                    options={COMMON_CURRENCIES.map(
                                                        (currency) => ({
                                                            value: currency,
                                                            label: currency,
                                                        })
                                                    )}
                                                    onChange={(value) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "currency",
                                                            value
                                                        )
                                                    }
                                                />
                                            </div>

                                            <div className="mt-3 rounded-2xl border border-lime-300/20 bg-lime-300/10 p-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Calculated flight duration
                                                </p>
                                                <p className="mt-1 text-lg font-black text-white">
                                                    {durationLabel || "Add flight times"}
                                                </p>
                                                <p className="mt-2 text-sm font-black text-lime-100">
                                                    {formatScenarioPrice(
                                                        leg.cost,
                                                        leg.currency
                                                    )}
                                                </p>
                                            </div>

                                        </fieldset>
                                        {scenario.legs[legIndex + 1] ? (
                                            <div
                                                key={`${scenario.id}-${legIndex}-layover`}
                                                className="rounded-[1.25rem] border border-white/10 bg-[#0c0115]/70 p-3"
                                            >
                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                    Layover duration
                                                </p>
                                                <p className="mt-1 text-lg font-black text-lime-100">
                                                    {getLayoverDurationLabel(
                                                        leg,
                                                        scenario.legs[legIndex + 1]
                                                    )}
                                                </p>
                                            </div>
                                        ) : null}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex flex-col gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                            Pros
                                        </span>
                                        <textarea
                                            value={scenario.pros}
                                            onChange={(event) =>
                                                updateScenarioFields(scenario.id, {
                                                    pros: event.target.value,
                                                })
                                            }
                                            rows={3}
                                            placeholder="What makes this option strong?"
                                            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/40"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                            Cons
                                        </span>
                                        <textarea
                                            value={scenario.cons}
                                            onChange={(event) =>
                                                updateScenarioFields(scenario.id, {
                                                    cons: event.target.value,
                                                })
                                            }
                                            rows={3}
                                            placeholder="What tradeoffs should you remember?"
                                            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/40"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </label>
                                </div>
                                <button
                                    type="submit"
                                    disabled={!scenarioReady || Boolean(selectedScenarioId)}
                                    className="rounded-full bg-lime-300 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Add this travel plan to itinerary
                                </button>
                            </div>
                        </form>
                    );
                })}
            </div>
            <div className="mt-5 flex justify-center">
                <button
                    type="button"
                    onClick={addScenario}
                    className="rounded-full border border-lime-300/40 bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/60"
                >
                    Add scenario
                </button>
            </div>
        </section>
    );
}
