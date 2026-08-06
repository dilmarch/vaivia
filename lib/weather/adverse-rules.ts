import type {
    WeatherAlertSeverity,
    WeatherForecastHour,
} from "@/lib/weather/alerts-contracts";

/**
 * Conservative Phase 2 travel-disruption thresholds. These are planning
 * signals, not official alerts. Keep all tunable values in this module.
 */
export const ADVERSE_WEATHER_THRESHOLDS = {
    thunderstormProbabilityPercent: 70,
    freezingPrecipitationProbabilityPercent: 60,
    significantIceMillimeters: 2,
    heavySnowQpfMillimetersPerHour: 5,
    heavySnowProbabilityPercent: 60,
    veryStrongWindGustKph: 90,
    extremeWindGustKph: 120,
    dangerousVisibilityKilometers: 0.5,
    extremeFeelsLikeHeatCelsius: 45,
    extremeFeelsLikeColdCelsius: -35,
} as const;

const SEVERE_STORM_CONDITIONS = new Set([
    "HEAVY_THUNDERSTORM",
    "HEAVY_SNOW_STORM",
    "SNOWSTORM",
    "BLOWING_SNOW",
]);

const HEAVY_SNOW_CONDITIONS = new Set([
    "HEAVY_SNOW_SHOWERS",
    "MODERATE_TO_HEAVY_SNOW",
    "HEAVY_SNOW",
    "SNOW_PERIODICALLY_HEAVY",
    "HEAVY_SNOW_STORM",
    "SNOWSTORM",
]);

export type ForecastAdverseSignal = {
    kind: "forecast";
    ruleId:
        | "high_probability_thunderstorm"
        | "freezing_rain_or_ice"
        | "heavy_snow"
        | "very_strong_wind"
        | "dangerously_low_visibility"
        | "extreme_apparent_heat"
        | "extreme_apparent_cold"
        | "severe_storm_classification";
    title: string;
    eventType: string;
    description: string;
    severity: WeatherAlertSeverity;
    startsAt: string;
    expiresAt: string;
};

function signal(
    hour: WeatherForecastHour,
    value: Omit<ForecastAdverseSignal, "kind" | "startsAt" | "expiresAt">
): ForecastAdverseSignal {
    return {
        kind: "forecast",
        startsAt: hour.startsAt,
        expiresAt: hour.endsAt,
        ...value,
    };
}

export function deriveAdverseSignals(
    hour: WeatherForecastHour
): ForecastAdverseSignal[] {
    const signals: ForecastAdverseSignal[] = [];
    const threshold = ADVERSE_WEATHER_THRESHOLDS;

    if (
        hour.thunderstormProbability !== null &&
        hour.thunderstormProbability >=
            threshold.thunderstormProbabilityPercent
    ) {
        signals.push(
            signal(hour, {
                ruleId: "high_probability_thunderstorm",
                title: "High-probability thunderstorms",
                eventType: "THUNDERSTORM",
                description: `Thunderstorm probability is ${Math.round(hour.thunderstormProbability)}%.`,
                severity: "MODERATE",
            })
        );
    }

    const freezingPrecipitation =
        hour.precipitationType === "FREEZING_RAIN" ||
        hour.precipitationType === "SLEET";
    if (
        (freezingPrecipitation &&
            (hour.precipitationProbability ?? 0) >=
                threshold.freezingPrecipitationProbabilityPercent) ||
        (hour.iceThicknessMillimeters ?? 0) >=
            threshold.significantIceMillimeters
    ) {
        signals.push(
            signal(hour, {
                ruleId: "freezing_rain_or_ice",
                title: "Freezing rain or significant ice",
                eventType: "FREEZING_RAIN",
                description:
                    "Freezing precipitation or travel-affecting ice is forecast.",
                severity: "SEVERE",
            })
        );
    }

    if (
        HEAVY_SNOW_CONDITIONS.has(hour.conditionType) ||
        ((hour.snowQpfMillimeters ?? 0) >=
            threshold.heavySnowQpfMillimetersPerHour &&
            (hour.precipitationProbability ?? 0) >=
                threshold.heavySnowProbabilityPercent)
    ) {
        signals.push(
            signal(hour, {
                ruleId: "heavy_snow",
                title: "Heavy snow",
                eventType: "HEAVY_SNOW",
                description: "Heavy snow may materially disrupt local travel.",
                severity: "SEVERE",
            })
        );
    }

    if (
        hour.windGustKph !== null &&
        hour.windGustKph >= threshold.veryStrongWindGustKph
    ) {
        signals.push(
            signal(hour, {
                ruleId: "very_strong_wind",
                title: "Very strong wind gusts",
                eventType: "WIND",
                description: `Wind gusts may reach ${Math.round(hour.windGustKph)} km/h.`,
                severity:
                    hour.windGustKph >= threshold.extremeWindGustKph
                        ? "EXTREME"
                        : "SEVERE",
            })
        );
    }

    if (
        hour.visibilityKilometers !== null &&
        hour.visibilityKilometers <=
            threshold.dangerousVisibilityKilometers
    ) {
        signals.push(
            signal(hour, {
                ruleId: "dangerously_low_visibility",
                title: "Dangerously low visibility",
                eventType: "LOW_VISIBILITY",
                description: `Visibility may fall to ${hour.visibilityKilometers.toFixed(1)} km.`,
                severity: "SEVERE",
            })
        );
    }

    if (
        hour.feelsLikeCelsius !== null &&
        hour.feelsLikeCelsius >= threshold.extremeFeelsLikeHeatCelsius
    ) {
        signals.push(
            signal(hour, {
                ruleId: "extreme_apparent_heat",
                title: "Extreme apparent heat",
                eventType: "EXTREME_HEAT",
                description: `It may feel like ${Math.round(hour.feelsLikeCelsius)}°C.`,
                severity: "SEVERE",
            })
        );
    }

    if (
        hour.feelsLikeCelsius !== null &&
        hour.feelsLikeCelsius <= threshold.extremeFeelsLikeColdCelsius
    ) {
        signals.push(
            signal(hour, {
                ruleId: "extreme_apparent_cold",
                title: "Extreme apparent cold",
                eventType: "EXTREME_COLD",
                description: `It may feel like ${Math.round(hour.feelsLikeCelsius)}°C.`,
                severity: "SEVERE",
            })
        );
    }

    if (SEVERE_STORM_CONDITIONS.has(hour.conditionType)) {
        signals.push(
            signal(hour, {
                ruleId: "severe_storm_classification",
                title: hour.conditionDescription || "Severe storm conditions",
                eventType: hour.conditionType,
                description:
                    "The forecast explicitly classifies this as a severe storm condition.",
                severity: "SEVERE",
            })
        );
    }

    return signals;
}

export function aggregateAdverseSignals(
    hours: WeatherForecastHour[]
): ForecastAdverseSignal[] {
    const byRule = new Map<string, ForecastAdverseSignal[]>();

    for (const hour of hours.toSorted((first, second) =>
        first.startsAt.localeCompare(second.startsAt)
    )) {
        for (const next of deriveAdverseSignals(hour)) {
            const windows = byRule.get(next.ruleId) || [];
            const current = windows.at(-1);
            if (!current) {
                windows.push(next);
                byRule.set(next.ruleId, windows);
                continue;
            }

            const currentEnd = Date.parse(current.expiresAt);
            const nextStart = Date.parse(next.startsAt);
            const isContiguous =
                Number.isFinite(currentEnd) &&
                Number.isFinite(nextStart) &&
                nextStart <= currentEnd + 30 * 60_000;
            if (!isContiguous) {
                windows.push(next);
                continue;
            }

            windows[windows.length - 1] = {
                ...current,
                severity:
                    severityRank(next.severity) > severityRank(current.severity)
                        ? next.severity
                        : current.severity,
                startsAt:
                    next.startsAt < current.startsAt
                        ? next.startsAt
                        : current.startsAt,
                expiresAt:
                    next.expiresAt > current.expiresAt
                        ? next.expiresAt
                        : current.expiresAt,
            };
        }
    }

    return Array.from(byRule.values()).flat();
}

export function severityRank(severity: WeatherAlertSeverity) {
    return {
        UNKNOWN: 0,
        MINOR: 1,
        MODERATE: 2,
        SEVERE: 3,
        EXTREME: 4,
    }[severity];
}
