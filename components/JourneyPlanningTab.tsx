"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type PlanningScenario = {
    id: string;
    label: string;
    legs: PlanningLeg[];
};

const STORAGE_KEY_PREFIX = "vaivia:journey-planning:";
const SCENARIO_LABELS = ["Scenario A", "Scenario B", "Scenario C"];
const PASSWORD_MANAGER_IGNORE_PROPS = {
    autoComplete: "off",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
};

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
    };
}

function createInitialScenarios(defaultDate = ""): PlanningScenario[] {
    return SCENARIO_LABELS.map((label, index) => ({
        id: `scenario-${index + 1}`,
        label,
        legs: [createEmptyLeg(defaultDate)],
    }));
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
            leg.flightNumber
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

export default function JourneyPlanningTab({
    tripId,
    tripStartDate,
    createTransportationAction,
}: JourneyPlanningTabProps) {
    const defaultDate = tripStartDate || "";
    const storageKey = `${STORAGE_KEY_PREFIX}${tripId}`;
    const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
    const [scenarios, setScenarios] = useState<PlanningScenario[]>(() =>
        createInitialScenarios(defaultDate)
    );

    useEffect(() => {
        try {
            const storedScenarios = window.localStorage.getItem(storageKey);
            if (!storedScenarios) return;

            const parsedScenarios = JSON.parse(storedScenarios) as PlanningScenario[];
            if (Array.isArray(parsedScenarios) && parsedScenarios.length) {
                setScenarios(parsedScenarios);
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
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) =>
                scenario.id === scenarioId ? { ...scenario, label } : scenario
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
    }

    function addLeg(scenarioId: string) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) =>
                scenario.id === scenarioId
                    ? { ...scenario, legs: [...scenario.legs, createEmptyLeg(defaultDate)] }
                    : scenario
            )
        );
    }

    function removeLeg(scenarioId: string, legIndex: number) {
        setScenarios((currentScenarios) =>
            currentScenarios.map((scenario) => {
                if (scenario.id !== scenarioId || scenario.legs.length === 1) {
                    return scenario;
                }

                return {
                    ...scenario,
                    legs: scenario.legs.filter((_, index) => index !== legIndex),
                };
            })
        );
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

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
                {scenarios.map((scenario) => {
                    const scenarioReady = isScenarioReady(scenario);
                    const isSelected = selectedScenarioId === scenario.id;
                    const isDimmed = Boolean(selectedScenarioId && !isSelected);
                    const firstLeg = scenario.legs[0] || createEmptyLeg(defaultDate);
                    const lastLeg = scenario.legs.at(-1) || firstLeg;
                    const firstFlightNumber = normalizeFlightNumber(firstLeg.flightNumber);
                    const firstAirlineCode =
                        inferAirlineCodeFromFlightNumber(firstFlightNumber);

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
                                value="airplane"
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

                            <div className="rounded-[1.25rem] border border-white/10 bg-[#0c0115]/70 p-4">
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
                                <div className="mt-4 rounded-2xl bg-lime-300 px-4 py-3 text-slate-950">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">
                                        Total flying time
                                    </p>
                                    <p className="mt-1 text-3xl font-black">
                                        {scenarioTotals[scenario.id]}
                                    </p>
                                </div>
                                <p className="mt-3 text-xs leading-5 text-slate-300">
                                    {getScenarioSummary(scenario)}
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
                                        <fieldset
                                            key={legIndex}
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

                                            <div className="flex items-center justify-between gap-3">
                                                <legend className="text-sm font-black uppercase tracking-wide text-white">
                                                    Flight {legIndex + 1}
                                                </legend>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeLeg(scenario.id, legIndex)
                                                    }
                                                    disabled={scenario.legs.length === 1}
                                                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                <input
                                                    name={`leg_${legIndex}_departure_location`}
                                                    value={leg.departureLocation}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "departureLocation",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Departure airport"
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
                                                />
                                                <input
                                                    name={`leg_${legIndex}_arrival_location`}
                                                    value={leg.arrivalLocation}
                                                    onChange={(event) =>
                                                        updateLeg(
                                                            scenario.id,
                                                            legIndex,
                                                            "arrivalLocation",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Arrival airport"
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                    {...PASSWORD_MANAGER_IGNORE_PROPS}
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
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white"
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
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white"
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
                                                    placeholder="Departure time zone"
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
                                                    placeholder="Arrival time zone"
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
                                                    placeholder="Flight number"
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
                                                        airlineCode
                                                            ? `Airline (${airlineCode})`
                                                            : "Airline"
                                                    }
                                                    className="rounded-xl border border-white/10 bg-[#0c0115]/70 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                                />
                                            </div>

                                            {durationLabel && (
                                                <p className="mt-3 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                                                    Flight time: {durationLabel}
                                                </p>
                                            )}
                                        </fieldset>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={() => addLeg(scenario.id)}
                                    className="rounded-full border border-lime-300/40 px-4 py-2 text-sm font-black uppercase tracking-wide text-lime-200 transition hover:bg-lime-300/10"
                                >
                                    Add flight
                                </button>
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
        </section>
    );
}
