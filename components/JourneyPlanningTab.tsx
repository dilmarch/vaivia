"use client";

import {
    type DragEvent,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Copy, GripVertical, Pencil } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
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
    undoJourneyTransportationAction?: (formData: FormData) => Promise<void>;
    addedScenarioId?: string | null;
    addedTransportationId?: string | null;
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
    isRoundTrip: boolean;
    returnLegCount: number;
    cost: string;
    currency: string;
    pros: string[];
    cons: string[];
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

type ScenarioListEditorProps = {
    title: string;
    placeholder: string;
    items: string[];
    onAdd: () => void;
    onRemove: (index: number) => void;
    onChange: (index: number, value: string) => void;
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

function ScenarioListEditor({
    title,
    placeholder,
    items,
    onAdd,
    onRemove,
    onChange,
}: ScenarioListEditorProps) {
    const populatedCount = items.filter((item) => item.trim()).length;

    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-[#0c0115]/70 p-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {title}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                        {populatedCount} {populatedCount === 1 ? "item" : "items"}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onAdd}
                    className="rounded-full border border-lime-300/35 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-lime-100 transition hover:bg-lime-300/10"
                >
                    Add
                </button>
            </div>
            <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-300 text-xs font-black text-slate-950">
                            {index + 1}
                        </span>
                        <input
                            value={item}
                            onChange={(event) => onChange(index, event.target.value)}
                            placeholder={placeholder}
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/40"
                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                        />
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            disabled={items.length === 1}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-300/20 text-sm font-black text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
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
        isRoundTrip: false,
        returnLegCount: 0,
        cost: "",
        currency: "CAD",
        pros: [""],
        cons: [""],
        legs: [createEmptyLeg(defaultDate)],
    };
}

function normalizeListItems(value: unknown): string[] {
    if (Array.isArray(value)) {
        const items = value.map((item) => String(item || ""));
        return items.length ? items : [""];
    }

    if (typeof value === "string" && value.trim()) {
        return value
            .split(/\r?\n/)
            .map((item) => item.replace(/^[-*•]\s*/, "").trim())
            .filter(Boolean);
    }

    return [""];
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
        isRoundTrip: Boolean(scenario.isRoundTrip),
        returnLegCount: Boolean(scenario.isRoundTrip)
            ? Math.min(Math.max(Number(scenario.returnLegCount || 1), 1), 4)
            : 0,
        cost: scenario.cost || "",
        currency: scenario.currency || "CAD",
        pros: normalizeListItems((scenario as { pros?: unknown }).pros),
        cons: normalizeListItems((scenario as { cons?: unknown }).cons),
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

function getLegDurationDisplayLabel(leg: PlanningLeg) {
    const hasDateAndTime =
        leg.departureDate &&
        leg.departureTime &&
        leg.arrivalDate &&
        leg.arrivalTime;

    if (!hasDateAndTime) return "Add flight times";

    if (!leg.departureTimezone || !leg.arrivalTimezone) {
        return "Add time zones";
    }

    return getLegDurationLabel(leg) || "Check flight times";
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

function getOutboundLegCount(scenario: PlanningScenario) {
    if (!scenario.isRoundTrip) return scenario.legs.length;

    return Math.max(1, scenario.legs.length - scenario.returnLegCount);
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
    undoJourneyTransportationAction,
    addedScenarioId = null,
    addedTransportationId = null,
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
    const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
        addedScenarioId
    );
    const [pendingUndoScenarioId, setPendingUndoScenarioId] = useState<string | null>(
        null
    );
    const [pendingDeleteScenarioId, setPendingDeleteScenarioId] = useState<
        string | null
    >(null);
    const [draggedScenarioId, setDraggedScenarioId] = useState<string | null>(null);
    const [dragOverScenarioId, setDragOverScenarioId] = useState<string | null>(null);
    const [draggedLeg, setDraggedLeg] = useState<{
        scenarioId: string;
        legIndex: number;
    } | null>(null);
    const [dragOverLeg, setDragOverLeg] = useState<{
        scenarioId: string;
        legIndex: number;
    } | null>(null);
    const [scenarioModalDraft, setScenarioModalDraft] =
        useState<PlanningScenario | null>(null);
    const [scenarioModalMode, setScenarioModalMode] = useState<"add" | "edit">(
        "add"
    );
    const scenarioCardRefs = useRef<Record<string, HTMLFormElement | null>>({});
    const previousScenarioRectsRef = useRef<Map<string, DOMRect> | null>(null);
    const [scenarios, setScenarios] = useState<PlanningScenario[]>(() =>
        createInitialScenarios(defaultDate)
    );

    useLayoutEffect(() => {
        const previousRects = previousScenarioRectsRef.current;
        if (!previousRects) return;

        previousScenarioRectsRef.current = null;

        scenarios.forEach((scenario) => {
            const element = scenarioCardRefs.current[scenario.id];
            const previousRect = previousRects.get(scenario.id);
            if (!element || !previousRect) return;

            const nextRect = element.getBoundingClientRect();
            const deltaX = previousRect.left - nextRect.left;
            const deltaY = previousRect.top - nextRect.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

            element.animate(
                [
                    { transform: `translate(${deltaX}px, ${deltaY}px)` },
                    { transform: "translate(0, 0)" },
                ],
                {
                    duration: 260,
                    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                }
            );
        });
    }, [scenarios]);

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

    useEffect(() => {
        setSelectedScenarioId(addedScenarioId);
        setPendingUndoScenarioId(null);
    }, [addedScenarioId, addedTransportationId]);

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

    function updateScenarioListItem(
        scenarioId: string,
        field: "pros" | "cons",
        itemIndex: number,
        value: string
    ) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                return {
                    ...scenario,
                    [field]: scenario[field].map((item, index) =>
                        index === itemIndex ? value : item
                    ),
                };
            })
        );
    }

    function addScenarioListItem(scenarioId: string, field: "pros" | "cons") {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) =>
                scenario.id === scenarioId
                    ? { ...scenario, [field]: [...scenario[field], ""] }
                    : scenario
            )
        );
    }

    function removeScenarioListItem(
        scenarioId: string,
        field: "pros" | "cons",
        itemIndex: number
    ) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId || scenario[field].length === 1) {
                    return scenario;
                }

                return {
                    ...scenario,
                    [field]: scenario[field].filter((_, index) => index !== itemIndex),
                };
            })
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

    function clearScenarioCoordinateRefs(scenarioId: string) {
        Object.keys(airportCoordinateRefs.current).forEach((key) => {
            if (key.startsWith(`${scenarioId}:`)) {
                delete airportCoordinateRefs.current[key];
            }
        });
    }

    function moveLeg(scenarioId: string, legIndex: number, direction: "up" | "down") {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                const nextIndex = direction === "up" ? legIndex - 1 : legIndex + 1;
                if (nextIndex < 0 || nextIndex >= scenario.legs.length) return scenario;

                const nextLegs = [...scenario.legs];
                const [legToMove] = nextLegs.splice(legIndex, 1);
                nextLegs.splice(nextIndex, 0, legToMove);

                return { ...scenario, legs: nextLegs };
            })
        );
        clearScenarioCoordinateRefs(scenarioId);
    }

    function reorderLeg(scenarioId: string, fromIndex: number, toIndex: number) {
        if (fromIndex === toIndex) return;

        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;
                if (
                    fromIndex < 0 ||
                    fromIndex >= scenario.legs.length ||
                    toIndex < 0 ||
                    toIndex >= scenario.legs.length
                ) {
                    return scenario;
                }

                const nextLegs = [...scenario.legs];
                const [legToMove] = nextLegs.splice(fromIndex, 1);
                nextLegs.splice(toIndex, 0, legToMove);

                return { ...scenario, legs: nextLegs };
            })
        );
        clearScenarioCoordinateRefs(scenarioId);
    }

    function setScenarioLegCount(scenarioId: string, legCount: number) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                const outboundLegCount = getOutboundLegCount(scenario);
                const outboundLegs = scenario.legs.slice(0, outboundLegCount);
                const returnLegs = scenario.isRoundTrip
                    ? scenario.legs.slice(outboundLegCount)
                    : [];
                const nextOutboundLegs = [...outboundLegs];
                while (nextOutboundLegs.length < legCount) {
                    const previousLeg = nextOutboundLegs.at(-1);
                    nextOutboundLegs.push({
                        ...createEmptyLeg(defaultDate),
                        currency: previousLeg?.currency || scenario.currency || "CAD",
                    });
                }
                const trimmedOutboundLegs = nextOutboundLegs.slice(0, legCount);

                return {
                    ...scenario,
                    legs: scenario.isRoundTrip
                        ? [...trimmedOutboundLegs, ...returnLegs]
                        : trimmedOutboundLegs,
                };
            })
        );
    }

    function createReturnLegFromScenario(scenario: PlanningScenario) {
        const outboundLegCount = getOutboundLegCount(scenario);
        const firstOutboundLeg = scenario.legs[0] || createEmptyLeg(defaultDate);
        const lastOutboundLeg =
            scenario.legs[outboundLegCount - 1] || firstOutboundLeg;

        return {
            ...createEmptyLeg(lastOutboundLeg.arrivalDate || defaultDate),
            departureLocation: lastOutboundLeg.arrivalLocation,
            arrivalLocation: firstOutboundLeg.departureLocation,
            departureDate: lastOutboundLeg.arrivalDate || defaultDate,
            arrivalDate: lastOutboundLeg.arrivalDate || defaultDate,
            departureTimezone: lastOutboundLeg.arrivalTimezone,
            arrivalTimezone: firstOutboundLeg.departureTimezone,
            currency: firstOutboundLeg.currency || scenario.currency || "CAD",
        };
    }

    function setScenarioRoundTrip(scenarioId: string, isRoundTrip: boolean) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                const outboundLegCount = getOutboundLegCount(scenario);
                const outboundLegs = scenario.legs.slice(0, outboundLegCount);
                if (!isRoundTrip) {
                    return {
                        ...scenario,
                        isRoundTrip: false,
                        returnLegCount: 0,
                        legs: outboundLegs.length ? outboundLegs : [createEmptyLeg(defaultDate)],
                    };
                }

                const existingReturnLegs = scenario.legs.slice(outboundLegCount);
                const returnLegCount = Math.max(
                    existingReturnLegs.length || scenario.returnLegCount || 1,
                    1
                );
                const nextReturnLegs = [...existingReturnLegs];
                while (nextReturnLegs.length < returnLegCount) {
                    const previousLeg = nextReturnLegs.at(-1);
                    nextReturnLegs.push(
                        previousLeg
                            ? {
                                  ...createEmptyLeg(
                                      previousLeg.arrivalDate || defaultDate
                                  ),
                                  departureLocation: previousLeg.arrivalLocation,
                                  departureDate:
                                      previousLeg.arrivalDate || defaultDate,
                                  arrivalDate: previousLeg.arrivalDate || defaultDate,
                                  departureTimezone:
                                      previousLeg.arrivalTimezone,
                                  currency:
                                      previousLeg.currency ||
                                      scenario.currency ||
                                      "CAD",
                              }
                            : createReturnLegFromScenario(scenario)
                    );
                }

                return {
                    ...scenario,
                    isRoundTrip: true,
                    returnLegCount,
                    legs: [...outboundLegs, ...nextReturnLegs.slice(0, returnLegCount)],
                };
            })
        );
    }

    function setScenarioReturnLegCount(scenarioId: string, returnLegCount: number) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId) return scenario;

                const outboundLegCount = getOutboundLegCount(scenario);
                const outboundLegs = scenario.legs.slice(0, outboundLegCount);
                const nextReturnLegs = scenario.legs.slice(outboundLegCount);
                while (nextReturnLegs.length < returnLegCount) {
                    const previousLeg = nextReturnLegs.at(-1);
                    nextReturnLegs.push(
                        previousLeg
                            ? {
                                  ...createEmptyLeg(
                                      previousLeg.arrivalDate || defaultDate
                                  ),
                                  departureLocation: previousLeg.arrivalLocation,
                                  departureDate:
                                      previousLeg.arrivalDate || defaultDate,
                                  arrivalDate: previousLeg.arrivalDate || defaultDate,
                                  departureTimezone:
                                      previousLeg.arrivalTimezone,
                                  currency:
                                      previousLeg.currency ||
                                      scenario.currency ||
                                      "CAD",
                              }
                            : createReturnLegFromScenario(scenario)
                    );
                }

                return {
                    ...scenario,
                    isRoundTrip: true,
                    returnLegCount,
                    legs: [...outboundLegs, ...nextReturnLegs.slice(0, returnLegCount)],
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

    function openAddScenarioModal() {
        setScenarioModalMode("add");
        setScenarioModalDraft({
            ...createScenario(scenarios.length, defaultDate),
            id: `scenario-${Date.now()}`,
        });
    }

    function openEditScenarioModal(scenario: PlanningScenario) {
        setScenarioModalMode("edit");
        setScenarioModalDraft({
            ...scenario,
            pros: [...scenario.pros],
            cons: [...scenario.cons],
            legs: scenario.legs.map((leg) => ({ ...leg })),
        });
    }

    function closeScenarioModal() {
        setScenarioModalDraft(null);
    }

    function updateScenarioDraftFields(
        values: Partial<Omit<PlanningScenario, "id" | "legs">>
    ) {
        setScenarioModalDraft((draft) => (draft ? { ...draft, ...values } : draft));
    }

    function setScenarioDraftLegCount(legCount: number) {
        setScenarioModalDraft((draft) => {
            if (!draft) return draft;

            const outboundLegCount = getOutboundLegCount(draft);
            const outboundLegs = draft.legs.slice(0, outboundLegCount);
            const returnLegs = draft.isRoundTrip
                ? draft.legs.slice(outboundLegCount)
                : [];
            const nextOutboundLegs = [...outboundLegs];
            while (nextOutboundLegs.length < legCount) {
                const previousLeg = nextOutboundLegs.at(-1);
                nextOutboundLegs.push({
                    ...createEmptyLeg(defaultDate),
                    currency: previousLeg?.currency || draft.currency || "CAD",
                });
            }

            return {
                ...draft,
                legs: draft.isRoundTrip
                    ? [...nextOutboundLegs.slice(0, legCount), ...returnLegs]
                    : nextOutboundLegs.slice(0, legCount),
            };
        });
    }

    function setScenarioDraftRoundTrip(isRoundTrip: boolean) {
        setScenarioModalDraft((draft) => {
            if (!draft) return draft;

            const outboundLegCount = getOutboundLegCount(draft);
            const outboundLegs = draft.legs.slice(0, outboundLegCount);
            if (!isRoundTrip) {
                return {
                    ...draft,
                    isRoundTrip: false,
                    returnLegCount: 0,
                    legs: outboundLegs.length ? outboundLegs : [createEmptyLeg(defaultDate)],
                };
            }

            const existingReturnLegs = draft.legs.slice(outboundLegCount);
            const returnLegCount = Math.max(
                existingReturnLegs.length || draft.returnLegCount || 1,
                1
            );
            const nextReturnLegs = [...existingReturnLegs];
            while (nextReturnLegs.length < returnLegCount) {
                nextReturnLegs.push(createReturnLegFromScenario(draft));
            }

            return {
                ...draft,
                isRoundTrip: true,
                returnLegCount,
                legs: [...outboundLegs, ...nextReturnLegs.slice(0, returnLegCount)],
            };
        });
    }

    function setScenarioDraftReturnLegCount(returnLegCount: number) {
        setScenarioModalDraft((draft) => {
            if (!draft) return draft;

            const outboundLegCount = getOutboundLegCount(draft);
            const outboundLegs = draft.legs.slice(0, outboundLegCount);
            const nextReturnLegs = draft.legs.slice(outboundLegCount);
            while (nextReturnLegs.length < returnLegCount) {
                nextReturnLegs.push(createReturnLegFromScenario(draft));
            }

            return {
                ...draft,
                isRoundTrip: true,
                returnLegCount,
                legs: [...outboundLegs, ...nextReturnLegs.slice(0, returnLegCount)],
            };
        });
    }

    function updateScenarioDraftListItem(
        field: "pros" | "cons",
        itemIndex: number,
        value: string
    ) {
        setScenarioModalDraft((draft) =>
            draft
                ? {
                      ...draft,
                      [field]: draft[field].map((item, index) =>
                          index === itemIndex ? value : item
                      ),
                  }
                : draft
        );
    }

    function addScenarioDraftListItem(field: "pros" | "cons") {
        setScenarioModalDraft((draft) =>
            draft ? { ...draft, [field]: [...draft[field], ""] } : draft
        );
    }

    function removeScenarioDraftListItem(field: "pros" | "cons", itemIndex: number) {
        setScenarioModalDraft((draft) => {
            if (!draft || draft[field].length === 1) return draft;

            return {
                ...draft,
                [field]: draft[field].filter((_, index) => index !== itemIndex),
            };
        });
    }

    function saveScenarioModalDraft() {
        if (!scenarioModalDraft) return;

        setScenarios((currentScenarios) => {
            const normalizedDraft = normalizeScenario(
                scenarioModalDraft,
                currentScenarios.length,
                defaultDate
            );

            if (scenarioModalMode === "edit") {
                return currentScenarios.map((scenario) =>
                    scenario.id === normalizedDraft.id ? normalizedDraft : scenario
                );
            }

            return [...currentScenarios, normalizedDraft];
        });
        closeScenarioModal();
    }

    function duplicateScenario(scenarioId: string) {
        setScenarios((currentScenarios) => {
            const scenarioIndex = currentScenarios.findIndex(
                (scenario) => scenario.id === scenarioId
            );
            if (scenarioIndex === -1) return currentScenarios;

            const sourceScenario = currentScenarios[scenarioIndex];
            const duplicatedScenario: PlanningScenario = {
                ...sourceScenario,
                id: `scenario-${Date.now()}`,
                label: `${sourceScenario.label} copy`,
                pros: [...sourceScenario.pros],
                cons: [...sourceScenario.cons],
                legs: sourceScenario.legs.map((leg) => ({ ...leg })),
            };
            const nextScenarios = [...currentScenarios];
            nextScenarios.splice(scenarioIndex + 1, 0, duplicatedScenario);

            return nextScenarios;
        });
    }

    function deleteScenario(scenarioId: string) {
        setScenarios((currentScenarios) =>
            currentScenarios.filter((scenario) => scenario.id !== scenarioId)
        );
        if (selectedScenarioId === scenarioId) setSelectedScenarioId(null);
        setPendingDeleteScenarioId(null);
    }

    function captureScenarioRects() {
        previousScenarioRectsRef.current = new Map(
            Object.entries(scenarioCardRefs.current)
                .filter((entry): entry is [string, HTMLFormElement] => Boolean(entry[1]))
                .map(([scenarioId, element]) => [
                    scenarioId,
                    element.getBoundingClientRect(),
                ])
        );
    }

    function moveScenario(scenarioId: string, direction: "up" | "down") {
        captureScenarioRects();
        setScenarios((currentScenarios) => {
            const currentIndex = currentScenarios.findIndex(
                (scenario) => scenario.id === scenarioId
            );
            if (currentIndex === -1) return currentScenarios;

            const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= currentScenarios.length) {
                return currentScenarios;
            }

            const nextScenarios = [...currentScenarios];
            const [scenarioToMove] = nextScenarios.splice(currentIndex, 1);
            nextScenarios.splice(nextIndex, 0, scenarioToMove);

            return nextScenarios;
        });
    }

    function swapScenarios(draggedId: string, targetId: string) {
        if (draggedId === targetId) return;

        captureScenarioRects();
        setScenarios((currentScenarios) => {
            const draggedIndex = currentScenarios.findIndex(
                (scenario) => scenario.id === draggedId
            );
            const targetIndex = currentScenarios.findIndex(
                (scenario) => scenario.id === targetId
            );
            if (draggedIndex === -1 || targetIndex === -1) return currentScenarios;

            const nextScenarios = [...currentScenarios];
            [nextScenarios[draggedIndex], nextScenarios[targetIndex]] = [
                nextScenarios[targetIndex],
                nextScenarios[draggedIndex],
            ];

            return nextScenarios;
        });
    }

    function handleScenarioDragStart(
        event: DragEvent<HTMLElement>,
        scenarioId: string
    ) {
        setDraggedScenarioId(scenarioId);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", scenarioId);
    }

    function handleScenarioDragOver(
        event: DragEvent<HTMLFormElement>,
        scenarioId: string
    ) {
        if (!draggedScenarioId || draggedScenarioId === scenarioId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverScenarioId(scenarioId);
    }

    function handleScenarioDrop(
        event: DragEvent<HTMLFormElement>,
        targetScenarioId: string
    ) {
        event.preventDefault();
        const droppedScenarioId =
            event.dataTransfer.getData("text/plain") || draggedScenarioId;
        if (droppedScenarioId) {
            swapScenarios(droppedScenarioId, targetScenarioId);
        }
        setDraggedScenarioId(null);
        setDragOverScenarioId(null);
    }

    function handleLegDragStart(
        event: DragEvent<HTMLDivElement>,
        scenarioId: string,
        legIndex: number
    ) {
        setDraggedLeg({ scenarioId, legIndex });
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${scenarioId}:${legIndex}`);
    }

    function handleLegDragOver(
        event: DragEvent<HTMLDivElement>,
        scenarioId: string,
        legIndex: number
    ) {
        if (!draggedLeg || draggedLeg.scenarioId !== scenarioId) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverLeg({ scenarioId, legIndex });
    }

    function handleLegDrop(
        event: DragEvent<HTMLDivElement>,
        scenarioId: string,
        legIndex: number
    ) {
        event.preventDefault();

        const dragKey = event.dataTransfer.getData("text/plain");
        const [, rawIndex] = dragKey.startsWith(`${scenarioId}:`)
            ? dragKey.split(":")
            : [];
        const fromIndex = Number(rawIndex);

        if (Number.isInteger(fromIndex)) {
            reorderLeg(scenarioId, fromIndex, legIndex);
        } else if (draggedLeg?.scenarioId === scenarioId) {
            reorderLeg(scenarioId, draggedLeg.legIndex, legIndex);
        }

        setDraggedLeg(null);
        setDragOverLeg(null);
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
                        {addedTransportationId
                            ? "Selected plan added to itinerary"
                            : "Selected plan is being added"}
                    </div>
                )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {scenarios.map((scenario, scenarioIndex) => {
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
                    const outboundLegCount = getOutboundLegCount(scenario);
                    const flightStructureValue = String(
                        Math.min(Math.max(outboundLegCount, 1), 4)
                    );

                    return (
                        <form
                            key={scenario.id}
                            ref={(element) => {
                                scenarioCardRefs.current[scenario.id] = element;
                            }}
                            action={createTransportationAction}
                            onSubmit={() => setSelectedScenarioId(scenario.id)}
                            onDragOver={(event) =>
                                handleScenarioDragOver(event, scenario.id)
                            }
                            onDragLeave={() => {
                                if (dragOverScenarioId === scenario.id) {
                                    setDragOverScenarioId(null);
                                }
                            }}
                            onDrop={(event) => handleScenarioDrop(event, scenario.id)}
                            onDragEnd={() => {
                                setDraggedScenarioId(null);
                                setDragOverScenarioId(null);
                            }}
                            className={`flex min-h-full flex-col rounded-[1.5rem] border p-4 shadow-xl shadow-black/20 transition-all duration-300 ease-out ${
                                dragOverScenarioId === scenario.id
                                    ? "border-lime-300/70 bg-lime-300/10 ring-2 ring-lime-300/30"
                                    : "border-white/10 bg-white/[0.06]"
                            } ${
                                draggedScenarioId === scenario.id
                                    ? "scale-[0.985] opacity-60"
                                    : ""
                            } ${
                                isDimmed ? "opacity-35 grayscale" : "opacity-100"
                            }`}
                        >
                            <input type="hidden" name="trip_id" value={tripId} />
                            <input
                                type="hidden"
                                name="return_to"
                                value={`/trips/${tripId}?tab=journey-planning&addedScenario=${encodeURIComponent(
                                    scenario.id
                                )}`}
                            />
                            {isSelected && addedTransportationId ? (
                                <input
                                    type="hidden"
                                    name="transportation_item_id"
                                    value={addedTransportationId}
                                />
                            ) : null}
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
                            <input
                                type="hidden"
                                name="is_round_trip"
                                value={scenario.isRoundTrip ? "true" : "false"}
                            />
                            <input
                                type="hidden"
                                name="return_flight_leg_count"
                                value={
                                    scenario.isRoundTrip
                                        ? String(scenario.returnLegCount)
                                        : "0"
                                }
                            />
                            <input
                                type="hidden"
                                name="scenario_pros"
                                value={scenario.pros
                                    .map((item) => item.trim())
                                    .filter(Boolean)
                                    .join("\n")}
                            />
                            <input
                                type="hidden"
                                name="scenario_cons"
                                value={scenario.cons
                                    .map((item) => item.trim())
                                    .filter(Boolean)
                                    .join("\n")}
                            />

                            <div className="rounded-[1.25rem] border border-white/10 bg-[#0c0115]/70 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="relative shrink-0">
                                        <span
                                            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300 text-2xl text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                            aria-hidden="true"
                                        >
                                            {selectedMode.emoji}
                                        </span>
                                        <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-950/20 bg-white px-1.5 text-[11px] font-black text-slate-950 shadow-xl shadow-black/30">
                                            #{scenarioIndex + 1}
                                        </span>
                                    </div>
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
                                    <div className="flex shrink-0 flex-col gap-2">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openEditScenarioModal(scenario)
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-lime-300/30 hover:bg-white/10 hover:text-lime-100"
                                                aria-label={`Edit ${scenario.label}`}
                                                title="Edit scenario"
                                            >
                                                <Pencil
                                                    className="h-4 w-4"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    duplicateScenario(scenario.id)
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-lime-300/30 hover:bg-white/10 hover:text-lime-100"
                                                aria-label={`Duplicate ${scenario.label}`}
                                                title="Duplicate scenario"
                                            >
                                                <Copy
                                                    className="h-4 w-4"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                draggable
                                                onDragStart={(event) =>
                                                    handleScenarioDragStart(
                                                        event,
                                                        scenario.id
                                                    )
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-lime-300/30 hover:bg-white/10 hover:text-lime-100"
                                                aria-label={`Drag ${scenario.label} to reorder`}
                                                title="Drag to reorder"
                                            >
                                                <GripVertical
                                                    className="h-4 w-4"
                                                    aria-hidden="true"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    moveScenario(scenario.id, "up")
                                                }
                                                disabled={scenarioIndex === 0}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm font-black text-lime-100 transition hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                aria-label={`Move ${scenario.label} earlier`}
                                                title="Move earlier"
                                            >
                                                <span className="md:hidden">↑</span>
                                                <span className="hidden md:inline">←</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    moveScenario(scenario.id, "down")
                                                }
                                                disabled={
                                                    scenarioIndex === scenarios.length - 1
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm font-black text-lime-100 transition hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                aria-label={`Move ${scenario.label} later`}
                                                title="Move later"
                                            >
                                                <span className="md:hidden">↓</span>
                                                <span className="hidden md:inline">→</span>
                                            </button>
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
                                    <div>
                                        <StyledOptionPicker
                                            label="Flight structure"
                                            value={flightStructureValue}
                                            options={FLIGHT_STRUCTURE_OPTIONS}
                                            onChange={(value) =>
                                                setScenarioLegCount(
                                                    scenario.id,
                                                    Number(value)
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                                        <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-[#0c0115]/90 px-3 py-2 text-sm font-black text-slate-100 shadow-xl shadow-black/20 transition hover:border-lime-300/35 hover:bg-white/[0.08]">
                                            <input
                                                type="checkbox"
                                                checked={scenario.isRoundTrip}
                                                onChange={(event) =>
                                                    setScenarioRoundTrip(
                                                        scenario.id,
                                                        event.target.checked
                                                    )
                                                }
                                                className="h-4 w-4 accent-lime-300"
                                            />
                                            Roundtrip
                                        </label>
                                        {scenario.isRoundTrip ? (
                                            <StyledOptionPicker
                                                label="Return connections"
                                                value={String(scenario.returnLegCount)}
                                                options={FLIGHT_STRUCTURE_OPTIONS}
                                                onChange={(value) =>
                                                    setScenarioReturnLegCount(
                                                        scenario.id,
                                                        Number(value)
                                                    )
                                                }
                                            />
                                        ) : null}
                                    </div>
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
                                    const durationDisplayLabel =
                                        getLegDurationDisplayLabel(leg);
                                    const isLegDragTarget =
                                        dragOverLeg?.scenarioId === scenario.id &&
                                        dragOverLeg.legIndex === legIndex;
                                    const isReturnLeg =
                                        scenario.isRoundTrip &&
                                        legIndex >= outboundLegCount;
                                    const legDisplayIndex = isReturnLeg
                                        ? legIndex - outboundLegCount + 1
                                        : legIndex + 1;
                                    const shouldShowLayover =
                                        Boolean(scenario.legs[legIndex + 1]) &&
                                        !(
                                            scenario.isRoundTrip &&
                                            legIndex === outboundLegCount - 1
                                        );

                                    return (
                                        <div
                                            key={legIndex}
                                            className="space-y-4"
                                            onDragOver={(event) =>
                                                handleLegDragOver(
                                                    event,
                                                    scenario.id,
                                                    legIndex
                                                )
                                            }
                                            onDrop={(event) =>
                                                handleLegDrop(
                                                    event,
                                                    scenario.id,
                                                    legIndex
                                                )
                                            }
                                            onDragLeave={() => {
                                                if (
                                                    dragOverLeg?.scenarioId ===
                                                        scenario.id &&
                                                    dragOverLeg.legIndex === legIndex
                                                ) {
                                                    setDragOverLeg(null);
                                                }
                                            }}
                                        >
                                        {isReturnLeg && legIndex === outboundLegCount ? (
                                            <div className="rounded-[1.25rem] border border-lime-300/25 bg-lime-300/10 p-4">
                                                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                                                    Roundtrip
                                                </p>
                                                <h3 className="mt-1 text-lg font-black text-white">
                                                    Return flight
                                                </h3>
                                            </div>
                                        ) : null}
                                        <fieldset
                                            className={`rounded-[1.25rem] border bg-white/[0.07] p-4 transition ${
                                                isLegDragTarget
                                                    ? "border-lime-300/60 shadow-[0_0_30px_rgba(var(--vaivia-neon-rgb),0.16)]"
                                                    : "border-white/10"
                                            }`}
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
                                                    {isReturnLeg
                                                        ? "Return "
                                                        : ""}
                                                    {scenario.transportMode === "airplane"
                                                        ? "Flight"
                                                        : "Segment"}{" "}
                                                    {legDisplayIndex}
                                                </legend>
                                                {scenario.legs.length > 1 ? (
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            draggable
                                                            onDragStart={(event) =>
                                                                handleLegDragStart(
                                                                    event,
                                                                    scenario.id,
                                                                    legIndex
                                                                )
                                                            }
                                                            onDragEnd={() => {
                                                                setDraggedLeg(null);
                                                                setDragOverLeg(null);
                                                            }}
                                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-lime-300/30 hover:bg-white/10 hover:text-lime-100"
                                                            aria-label={`Drag ${
                                                                scenario.transportMode ===
                                                                "airplane"
                                                                    ? "flight"
                                                                    : "segment"
                                                            } ${legIndex + 1} to reorder`}
                                                            title="Drag to reorder"
                                                        >
                                                            <GripVertical
                                                                className="h-4 w-4"
                                                                aria-hidden="true"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                moveLeg(
                                                                    scenario.id,
                                                                    legIndex,
                                                                    "up"
                                                                )
                                                            }
                                                            disabled={legIndex === 0}
                                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm font-black text-lime-100 transition hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                            aria-label={`Move ${
                                                                scenario.transportMode ===
                                                                "airplane"
                                                                    ? "flight"
                                                                    : "segment"
                                                            } ${legIndex + 1} earlier`}
                                                            title="Move earlier"
                                                        >
                                                            ↑
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                moveLeg(
                                                                    scenario.id,
                                                                    legIndex,
                                                                    "down"
                                                                )
                                                            }
                                                            disabled={
                                                                legIndex ===
                                                                scenario.legs.length - 1
                                                            }
                                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm font-black text-lime-100 transition hover:bg-lime-300/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                            aria-label={`Move ${
                                                                scenario.transportMode ===
                                                                "airplane"
                                                                    ? "flight"
                                                                    : "segment"
                                                            } ${legIndex + 1} later`}
                                                            title="Move later"
                                                        >
                                                            ↓
                                                        </button>
                                                    </div>
                                                ) : null}
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
                                                    {durationDisplayLabel}
                                                </p>
                                                <p className="mt-2 text-sm font-black text-lime-100">
                                                    {formatScenarioPrice(
                                                        leg.cost,
                                                        leg.currency
                                                    )}
                                                </p>
                                            </div>

                                        </fieldset>
                                        {shouldShowLayover ? (
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
                                <div className="rounded-[1.25rem] border border-lime-300/20 bg-[#0c0115]/70 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200">
                                        Total price across all legs
                                    </p>
                                    <p className="mt-1 text-2xl font-black text-white">
                                        {formatScenarioPrice(
                                            scenarioTotalCost,
                                            scenarioCurrency
                                        )}
                                    </p>
                                    {scenario.legs.some((leg) => leg.cost.trim()) ? (
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            Includes outbound
                                            {scenario.isRoundTrip
                                                ? " and return"
                                                : ""}{" "}
                                            legs.
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-3">
                                    <ScenarioListEditor
                                        title="Pros"
                                        placeholder="What makes this option strong?"
                                        items={scenario.pros}
                                        onAdd={() =>
                                            addScenarioListItem(scenario.id, "pros")
                                        }
                                        onRemove={(index) =>
                                            removeScenarioListItem(
                                                scenario.id,
                                                "pros",
                                                index
                                            )
                                        }
                                        onChange={(index, value) =>
                                            updateScenarioListItem(
                                                scenario.id,
                                                "pros",
                                                index,
                                                value
                                            )
                                        }
                                    />
                                    <ScenarioListEditor
                                        title="Cons"
                                        placeholder="What tradeoffs should you remember?"
                                        items={scenario.cons}
                                        onAdd={() =>
                                            addScenarioListItem(scenario.id, "cons")
                                        }
                                        onRemove={(index) =>
                                            removeScenarioListItem(
                                                scenario.id,
                                                "cons",
                                                index
                                            )
                                        }
                                        onChange={(index, value) =>
                                            updateScenarioListItem(
                                                scenario.id,
                                                "cons",
                                                index,
                                                value
                                            )
                                        }
                                    />
                                </div>
                                {isSelected &&
                                addedTransportationId &&
                                undoJourneyTransportationAction ? (
                                    <div className="rounded-[1.25rem] border border-lime-300/25 bg-lime-300/10 p-3">
                                        <p className="text-sm font-black text-lime-100">
                                            This plan has been added to your itinerary.
                                        </p>
                                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
                                            Undoing will remove the associated flights
                                            from the itinerary and make the other
                                            scenarios selectable again.
                                        </p>
                                        {pendingUndoScenarioId === scenario.id ? (
                                            <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-400/10 p-3">
                                                <p className="text-sm font-bold text-red-50">
                                                    Remove these associated flights
                                                    from the itinerary?
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button
                                                        type="submit"
                                                        formAction={
                                                            undoJourneyTransportationAction
                                                        }
                                                        className="rounded-full bg-red-300 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-950 transition hover:bg-red-200"
                                                    >
                                                        Confirm undo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPendingUndoScenarioId(
                                                                null
                                                            )
                                                        }
                                                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-200 transition hover:bg-white/10"
                                                    >
                                                        Keep itinerary item
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPendingUndoScenarioId(
                                                        scenario.id
                                                    )
                                                }
                                                className="mt-3 rounded-full border border-lime-300/35 px-4 py-2 text-xs font-black uppercase tracking-wide text-lime-100 transition hover:bg-lime-300/10"
                                            >
                                                Undo add to itinerary
                                            </button>
                                        )}
                                    </div>
                                ) : null}
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
                    onClick={openAddScenarioModal}
                    className="rounded-full border border-lime-300/40 bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/60"
                >
                    Add scenario
                </button>
            </div>
            {scenarioModalDraft ? (
                <AnimatedModal
                    onClose={closeScenarioModal}
                    labelledBy="journey-scenario-modal-title"
                    panelClassName="max-w-3xl"
                >
                    {({ requestClose }) => {
                        const draftOutboundLegCount =
                            getOutboundLegCount(scenarioModalDraft);
                        const draftFlightStructureValue = String(
                            Math.min(Math.max(draftOutboundLegCount, 1), 4)
                        );

                        return (
                            <>
                                <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Journey planning
                                        </p>
                                        <h2
                                            id="journey-scenario-modal-title"
                                            className="vaivia-modal-title"
                                        >
                                            {scenarioModalMode === "edit"
                                                ? "Edit scenario"
                                                : "Add scenario"}
                                        </h2>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="vaivia-modal-close"
                                        aria-label="Close scenario modal"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="vaivia-modal-body space-y-5">
                                    <label className="block">
                                        <span className="block text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Scenario name
                                        </span>
                                        <input
                                            value={scenarioModalDraft.label}
                                            onChange={(event) =>
                                                updateScenarioDraftFields({
                                                    label: event.target.value,
                                                })
                                            }
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                            {...PASSWORD_MANAGER_IGNORE_PROPS}
                                        />
                                    </label>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <StyledOptionPicker
                                            label="Transport type"
                                            value={scenarioModalDraft.transportMode}
                                            options={PLANNING_TRANSPORT_MODES}
                                            onChange={(value) =>
                                                updateScenarioDraftFields({
                                                    transportMode:
                                                        value as PlanningTransportMode,
                                                })
                                            }
                                        />
                                        <StyledOptionPicker
                                            label="Flight structure"
                                            value={draftFlightStructureValue}
                                            options={FLIGHT_STRUCTURE_OPTIONS}
                                            onChange={(value) =>
                                                setScenarioDraftLegCount(
                                                    Number(value)
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-[#0c0115]/90 px-3 py-2 text-sm font-black text-slate-100 shadow-xl shadow-black/20 transition hover:border-lime-300/35 hover:bg-white/[0.08]">
                                            <input
                                                type="checkbox"
                                                checked={scenarioModalDraft.isRoundTrip}
                                                onChange={(event) =>
                                                    setScenarioDraftRoundTrip(
                                                        event.target.checked
                                                    )
                                                }
                                                className="h-4 w-4 accent-lime-300"
                                            />
                                            Roundtrip
                                        </label>
                                        {scenarioModalDraft.isRoundTrip ? (
                                            <StyledOptionPicker
                                                label="Return connections"
                                                value={String(
                                                    scenarioModalDraft.returnLegCount
                                                )}
                                                options={FLIGHT_STRUCTURE_OPTIONS}
                                                onChange={(value) =>
                                                    setScenarioDraftReturnLegCount(
                                                        Number(value)
                                                    )
                                                }
                                            />
                                        ) : null}
                                    </div>

                                    <div className="space-y-3">
                                        <ScenarioListEditor
                                            title="Pros"
                                            placeholder="What makes this option strong?"
                                            items={scenarioModalDraft.pros}
                                            onAdd={() =>
                                                addScenarioDraftListItem("pros")
                                            }
                                            onRemove={(index) =>
                                                removeScenarioDraftListItem(
                                                    "pros",
                                                    index
                                                )
                                            }
                                            onChange={(index, value) =>
                                                updateScenarioDraftListItem(
                                                    "pros",
                                                    index,
                                                    value
                                                )
                                            }
                                        />
                                        <ScenarioListEditor
                                            title="Cons"
                                            placeholder="What tradeoffs should you remember?"
                                            items={scenarioModalDraft.cons}
                                            onAdd={() =>
                                                addScenarioDraftListItem("cons")
                                            }
                                            onRemove={(index) =>
                                                removeScenarioDraftListItem(
                                                    "cons",
                                                    index
                                                )
                                            }
                                            onChange={(index, value) =>
                                                updateScenarioDraftListItem(
                                                    "cons",
                                                    index,
                                                    value
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="vaivia-modal-footer flex flex-wrap justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="vaivia-modal-button-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveScenarioModalDraft}
                                        className="vaivia-modal-button-primary"
                                    >
                                        Save scenario
                                    </button>
                                </div>
                            </>
                        );
                    }}
                </AnimatedModal>
            ) : null}
        </section>
    );
}
