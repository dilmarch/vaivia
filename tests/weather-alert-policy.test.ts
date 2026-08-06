import { describe, expect, it } from "vitest";

import {
    ADVERSE_WEATHER_THRESHOLDS,
    aggregateAdverseSignals,
    deriveAdverseSignals,
} from "@/lib/weather/adverse-rules";
import type {
    WeatherAlert,
    WeatherForecastHour,
} from "@/lib/weather/alerts-contracts";
import {
    buildWeatherNotificationDeduplicationKey,
    getMemberTripDateRange,
    isNotificationWorthyOfficialAlert,
    isTripActiveOnDestinationDate,
    selectRelevantWeatherLocations,
    type MonitoredLocation,
    type WeatherNotificationEvent,
} from "@/lib/weather/weather-alert-policy";

const now = new Date("2026-08-06T01:00:00.000Z");

function officialAlert(
    overrides: Partial<WeatherAlert> = {}
): WeatherAlert {
    return {
        provider: "google",
        providerAlertId: "alert-1",
        title: "Severe thunderstorm warning",
        eventType: "SEVERE_THUNDERSTORM_WARNING",
        affectedArea: "Berlin",
        description: "Severe thunderstorms are expected.",
        severity: "SEVERE",
        certainty: "LIKELY",
        urgency: "EXPECTED",
        startsAt: "2026-08-06T02:00:00.000Z",
        expiresAt: "2026-08-06T08:00:00.000Z",
        instructions: [],
        safetyRecommendations: [],
        sourceName: "Weather Authority",
        sourceAuthorityUrl: "https://weather.example/",
        ...overrides,
    };
}

function forecastHour(
    overrides: Partial<WeatherForecastHour> = {}
): WeatherForecastHour {
    return {
        startsAt: "2026-08-06T02:00:00.000Z",
        endsAt: "2026-08-06T03:00:00.000Z",
        conditionType: "CLEAR",
        conditionDescription: "Clear",
        feelsLikeCelsius: 20,
        precipitationType: "NONE",
        precipitationProbability: 0,
        snowQpfMillimeters: 0,
        iceThicknessMillimeters: 0,
        windGustKph: 15,
        visibilityKilometers: 15,
        thunderstormProbability: 0,
        ...overrides,
    };
}

describe("destination-local active trip semantics", () => {
    it("distinguishes active, future, and past trips at a UTC date boundary", () => {
        expect(
            isTripActiveOnDestinationDate({
                now,
                timeZone: "America/Los_Angeles",
                startDate: "2026-08-05",
                endDate: "2026-08-05",
            })
        ).toBe(true);
        expect(
            isTripActiveOnDestinationDate({
                now,
                timeZone: "America/Los_Angeles",
                startDate: "2026-08-06",
                endDate: "2026-08-07",
            })
        ).toBe(false);
        expect(
            isTripActiveOnDestinationDate({
                now,
                timeZone: "Asia/Tokyo",
                startDate: "2026-08-04",
                endDate: "2026-08-05",
            })
        ).toBe(false);
    });

    it("uses joining trip-leg dates before the broad trip range", () => {
        expect(
            getMemberTripDateRange({
                tripStartDate: "2026-08-01",
                tripEndDate: "2026-08-20",
                joiningLegs: [
                    { startDate: "2026-08-05", endDate: "2026-08-08" },
                    { startDate: "2026-08-10", endDate: "2026-08-12" },
                ],
            })
        ).toEqual({ startDate: "2026-08-05", endDate: "2026-08-12" });
    });
});

describe("weather monitoring locations", () => {
    it("selects the next 48 hours, merges nearby locations, and caps at three", () => {
        const result = selectRelevantWeatherLocations({
            now: new Date("2026-08-06T10:00:00.000Z"),
            tripTimeZone: "Europe/Berlin",
            primaryDestination: {
                key: "berlin",
                label: "Berlin",
                latitude: 52.52,
                longitude: 13.405,
            },
            itinerary: [
                {
                    id: "item-1",
                    title: "Museum",
                    itemDate: "2026-08-06",
                    startTime: "13:00",
                    timeZone: "Europe/Berlin",
                    label: "Museum Island",
                    latitude: 52.5169,
                    longitude: 13.401,
                },
                {
                    id: "item-2",
                    title: "Potsdam",
                    itemDate: "2026-08-07",
                    startTime: "12:00",
                    timeZone: "Europe/Berlin",
                    label: "Potsdam",
                    latitude: 52.39,
                    longitude: 13.0645,
                },
                {
                    id: "item-3",
                    title: "Leipzig",
                    itemDate: "2026-08-08",
                    startTime: "11:00",
                    timeZone: "Europe/Berlin",
                    label: "Leipzig",
                    latitude: 51.3397,
                    longitude: 12.3731,
                },
            ],
            accommodations: [
                {
                    id: "stay-1",
                    label: "Berlin hotel",
                    checkInDate: "2026-08-05",
                    checkOutDate: "2026-08-09",
                    latitude: 52.517,
                    longitude: 13.4,
                },
            ],
            transportation: [],
        });

        expect(result).toHaveLength(3);
        expect(result[0].affectedItineraryItemIds).toEqual([
            "item-1",
            "stay-1",
        ]);
        expect(result.map((location) => location.label)).toEqual([
            "Berlin hotel",
            "Leipzig",
            "Potsdam",
        ]);
    });

    it("excludes exactly scheduled items beyond 48 hours", () => {
        const result = selectRelevantWeatherLocations({
            now: new Date("2026-08-06T10:00:00.000Z"),
            tripTimeZone: "Europe/Berlin",
            primaryDestination: null,
            itinerary: [
                {
                    id: "outside-window",
                    title: "Late concert",
                    itemDate: "2026-08-08",
                    startTime: "23:00",
                    timeZone: "Europe/Berlin",
                    label: "Late concert",
                    latitude: 52.52,
                    longitude: 13.405,
                },
            ],
            accommodations: [],
            transportation: [],
        });

        expect(result).toEqual([]);
    });
});

describe("official alert decision policy", () => {
    it.each(["EXTREME", "SEVERE"] as const)(
        "accepts qualifying %s alerts",
        (severity) => {
            expect(
                isNotificationWorthyOfficialAlert(
                    officialAlert({ severity }),
                    now
                )
            ).toBe(true);
        }
    );

    it("accepts only likely and urgent MODERATE alerts", () => {
        expect(
            isNotificationWorthyOfficialAlert(
                officialAlert({
                    severity: "MODERATE",
                    urgency: "IMMEDIATE",
                    certainty: "OBSERVED",
                }),
                now
            )
        ).toBe(true);
        expect(
            isNotificationWorthyOfficialAlert(
                officialAlert({ severity: "MODERATE", urgency: "FUTURE" }),
                now
            )
        ).toBe(false);
    });

    it.each([
        { severity: "MINOR" as const },
        { urgency: "PAST" as const },
        { certainty: "UNLIKELY" as const },
        { expiresAt: "2026-08-06T00:00:00.000Z" },
        { startsAt: "2026-08-09T10:00:00.000Z" },
    ])("ignores non-qualifying alert %#", (override) => {
        expect(
            isNotificationWorthyOfficialAlert(
                officialAlert(override),
                now
            )
        ).toBe(false);
    });
});

describe("forecast-derived adverse rules", () => {
    it("detects each centralized conservative threshold", () => {
        const cases: Array<[Partial<WeatherForecastHour>, string]> = [
            [
                {
                    thunderstormProbability:
                        ADVERSE_WEATHER_THRESHOLDS.thunderstormProbabilityPercent,
                },
                "high_probability_thunderstorm",
            ],
            [
                {
                    precipitationType: "FREEZING_RAIN",
                    precipitationProbability: 70,
                },
                "freezing_rain_or_ice",
            ],
            [{ conditionType: "HEAVY_SNOW" }, "heavy_snow"],
            [{ windGustKph: 90 }, "very_strong_wind"],
            [{ visibilityKilometers: 0.5 }, "dangerously_low_visibility"],
            [{ feelsLikeCelsius: 45 }, "extreme_apparent_heat"],
            [{ feelsLikeCelsius: -35 }, "extreme_apparent_cold"],
            [
                { conditionType: "HEAVY_THUNDERSTORM" },
                "severe_storm_classification",
            ],
        ];

        for (const [override, ruleId] of cases) {
            expect(
                deriveAdverseSignals(forecastHour(override)).map(
                    (signal) => signal.ruleId
                )
            ).toContain(ruleId);
        }
    });

    it("does not flag ordinary rain, cloud, seasonal temperatures, or modest wind", () => {
        expect(
            deriveAdverseSignals(
                forecastHour({
                    conditionType: "RAIN",
                    precipitationType: "RAIN",
                    precipitationProbability: 90,
                    windGustKph: 45,
                    feelsLikeCelsius: 31,
                    visibilityKilometers: 5,
                })
            )
        ).toEqual([]);
    });

    it("collapses repeated hourly matches into one event window", () => {
        const signals = aggregateAdverseSignals([
            forecastHour({ windGustKph: 95 }),
            forecastHour({
                startsAt: "2026-08-06T03:00:00.000Z",
                endsAt: "2026-08-06T04:00:00.000Z",
                windGustKph: 100,
            }),
        ]);
        expect(signals.filter((signal) => signal.ruleId === "very_strong_wind"))
            .toEqual([
                expect.objectContaining({
                    startsAt: "2026-08-06T02:00:00.000Z",
                    expiresAt: "2026-08-06T04:00:00.000Z",
                }),
            ]);
    });

    it("keeps separated adverse periods as distinct event windows", () => {
        const signals = aggregateAdverseSignals([
            forecastHour({ windGustKph: 95 }),
            forecastHour({
                startsAt: "2026-08-06T08:00:00.000Z",
                endsAt: "2026-08-06T09:00:00.000Z",
                windGustKph: 95,
            }),
        ]).filter((signal) => signal.ruleId === "very_strong_wind");

        expect(signals).toHaveLength(2);
    });
});

describe("deduplication and escalation", () => {
    const location: MonitoredLocation = {
        key: "place-berlin",
        label: "Berlin",
        latitude: 52.52,
        longitude: 13.405,
        priority: 2,
        source: "destination",
        affectedItineraryItemIds: ["item-a"],
    };
    const event: WeatherNotificationEvent = {
        kind: "official",
        provider: "google",
        sourceIdentity: "alert-1",
        title: "Storm",
        eventType: "STORM",
        description: "Storm",
        severity: "MODERATE",
        startsAt: "2026-08-06T02:00:00.000Z",
        expiresAt: "2026-08-06T08:00:00.000Z",
        certainty: "LIKELY",
        urgency: "EXPECTED",
        instructions: [],
        safetyRecommendations: [],
        sourceName: "Authority",
        sourceAuthorityUrl: null,
    };

    it("is stable for identical events and changes for escalation or new plans", () => {
        const input = { userId: "user-1", tripId: "trip-1", location, event };
        const first = buildWeatherNotificationDeduplicationKey(input);
        expect(buildWeatherNotificationDeduplicationKey(input)).toBe(first);
        expect(
            buildWeatherNotificationDeduplicationKey({
                ...input,
                event: { ...event, severity: "SEVERE" },
            })
        ).not.toBe(first);
        expect(
            buildWeatherNotificationDeduplicationKey({
                ...input,
                location: {
                    ...location,
                    affectedItineraryItemIds: ["item-a", "item-b"],
                },
            })
        ).not.toBe(first);
    });
});
