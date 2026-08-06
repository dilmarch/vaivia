export const WEATHER_ALERT_SEVERITIES = [
    "UNKNOWN",
    "MINOR",
    "MODERATE",
    "SEVERE",
    "EXTREME",
] as const;

export type WeatherAlertSeverity =
    (typeof WEATHER_ALERT_SEVERITIES)[number];

export type WeatherAlertCertainty =
    | "CERTAINTY_UNKNOWN"
    | "OBSERVED"
    | "VERY_LIKELY"
    | "LIKELY"
    | "POSSIBLE"
    | "UNLIKELY";

export type WeatherAlertUrgency =
    | "URGENCY_UNKNOWN"
    | "IMMEDIATE"
    | "EXPECTED"
    | "FUTURE"
    | "PAST";

export type WeatherAlert = {
    provider: "google";
    providerAlertId: string;
    title: string;
    eventType: string;
    affectedArea: string;
    description: string;
    severity: WeatherAlertSeverity;
    certainty: WeatherAlertCertainty;
    urgency: WeatherAlertUrgency;
    startsAt: string | null;
    expiresAt: string | null;
    instructions: string[];
    safetyRecommendations: Array<{
        directive: string;
        subtext: string | null;
    }>;
    sourceName: string;
    sourceAuthorityUrl: string | null;
};

export type WeatherForecastHour = {
    startsAt: string;
    endsAt: string;
    conditionType: string;
    conditionDescription: string;
    feelsLikeCelsius: number | null;
    precipitationType: string | null;
    precipitationProbability: number | null;
    snowQpfMillimeters: number | null;
    iceThicknessMillimeters: number | null;
    windGustKph: number | null;
    visibilityKilometers: number | null;
    thunderstormProbability: number | null;
};

export type WeatherMonitoringData = {
    provider: "google";
    timeZone: string;
    officialAlerts: WeatherAlert[];
    hourlyForecast: WeatherForecastHour[];
    partialFailures: Array<"public_alerts" | "hourly_forecast">;
};

export type WeatherMonitoringUnavailableReason =
    | "missing_coordinates"
    | "unsupported_location";

export type WeatherMonitoringFailureReason =
    | "missing_configuration"
    | "timeout"
    | "rate_limited"
    | "provider_error"
    | "invalid_response";

export type WeatherMonitoringResult =
    | { status: "success"; data: WeatherMonitoringData }
    | { status: "unavailable"; reason: WeatherMonitoringUnavailableReason }
    | { status: "failure"; reason: WeatherMonitoringFailureReason };

export type WeatherMonitoringRequest = {
    latitude: number;
    longitude: number;
    languageCode: string;
    hours: number;
    signal?: AbortSignal;
};

export interface WeatherAlertProvider {
    getMonitoringData(
        request: WeatherMonitoringRequest
    ): Promise<WeatherMonitoringResult>;
}
