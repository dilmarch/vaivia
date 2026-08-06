import "server-only";

import type {
    WeatherAlert,
    WeatherAlertCertainty,
    WeatherAlertProvider,
    WeatherAlertSeverity,
    WeatherAlertUrgency,
    WeatherForecastHour,
    WeatherMonitoringData,
    WeatherMonitoringFailureReason,
    WeatherMonitoringRequest,
    WeatherMonitoringResult,
} from "@/lib/weather/alerts-contracts";

const PUBLIC_ALERTS_URL =
    "https://weather.googleapis.com/v1/publicAlerts:lookup";
const HOURLY_FORECAST_URL =
    "https://weather.googleapis.com/v1/forecast/hours:lookup";
const MONITOR_TIMEOUT_MS = 8_000;
const MONITOR_REVALIDATE_SECONDS = 15 * 60;
const MAX_PUBLIC_ALERTS = 20;
const MAX_HOURS = 48;
const MAX_PAGES = 2;

type WeatherFetch = (
    input: string | URL | Request,
    init?: RequestInit & { next?: { revalidate: number } }
) => Promise<Response>;

type GoogleFetchResult =
    | { status: "success"; data: Record<string, unknown> }
    | { status: "unsupported" }
    | { status: "failure"; reason: WeatherMonitoringFailureReason };

const SEVERITIES = new Set<WeatherAlertSeverity>([
    "UNKNOWN",
    "MINOR",
    "MODERATE",
    "SEVERE",
    "EXTREME",
]);
const CERTAINTIES = new Set<WeatherAlertCertainty>([
    "CERTAINTY_UNKNOWN",
    "OBSERVED",
    "VERY_LIKELY",
    "LIKELY",
    "POSSIBLE",
    "UNLIKELY",
]);
const URGENCIES = new Set<WeatherAlertUrgency>([
    "URGENCY_UNKNOWN",
    "IMMEDIATE",
    "EXPECTED",
    "FUTURE",
    "PAST",
]);

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function cleanString(value: unknown, maxLength: number) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

function safeNumber(value: unknown, minimum: number, maximum: number) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum
        ? value
        : null;
}

function timestamp(value: unknown) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
        return null;
    }
    return new Date(value).toISOString();
}

function safeAuthorityUrl(value: unknown) {
    const raw = cleanString(value, 500);
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function enumValue<T extends string>(
    value: unknown,
    allowed: Set<T>,
    fallback: T
) {
    return typeof value === "string" && allowed.has(value as T)
        ? (value as T)
        : fallback;
}

function normalizePublicAlert(value: unknown): WeatherAlert | null {
    const alert = record(value);
    if (!alert) return null;
    const title = cleanString(record(alert.alertTitle)?.text, 180);
    const providerAlertId = cleanString(alert.alertId, 300);
    const dataSource = record(alert.dataSource);
    if (!title || !providerAlertId || !dataSource) return null;

    const instructions = Array.isArray(alert.instruction)
        ? alert.instruction
              .map((item) => cleanString(item, 600))
              .filter(Boolean)
              .slice(0, 5)
        : [];
    const safetyRecommendations = Array.isArray(alert.safetyRecommendations)
        ? alert.safetyRecommendations
              .map((item) => {
                  const recommendation = record(item);
                  const directive = cleanString(
                      recommendation?.directive,
                      300
                  );
                  if (!directive) return null;
                  return {
                      directive,
                      subtext:
                          cleanString(recommendation?.subtext, 500) || null,
                  };
              })
              .filter(
                  (
                      item
                  ): item is {
                      directive: string;
                      subtext: string | null;
                  } => Boolean(item)
              )
              .slice(0, 5)
        : [];

    return {
        provider: "google",
        providerAlertId,
        title,
        eventType: cleanString(alert.eventType, 100) || "WEATHER_ALERT",
        affectedArea: cleanString(alert.areaName, 250),
        description: cleanString(alert.description, 1_500),
        severity: enumValue(alert.severity, SEVERITIES, "UNKNOWN"),
        certainty: enumValue(
            alert.certainty,
            CERTAINTIES,
            "CERTAINTY_UNKNOWN"
        ),
        urgency: enumValue(
            alert.urgency,
            URGENCIES,
            "URGENCY_UNKNOWN"
        ),
        startsAt: timestamp(alert.startTime),
        expiresAt: timestamp(alert.expirationTime),
        instructions,
        safetyRecommendations,
        sourceName:
            cleanString(dataSource.name, 200) || "Official weather authority",
        sourceAuthorityUrl: safeAuthorityUrl(dataSource.authorityUri),
    };
}

function metricQuantity(
    value: unknown,
    valueKey: "quantity" | "thickness",
    metricUnit: "MILLIMETERS"
) {
    const item = record(value);
    if (!item || item.unit !== metricUnit) return null;
    return safeNumber(item[valueKey], 0, 10_000);
}

function normalizeHourlyForecast(value: unknown): WeatherForecastHour | null {
    const hour = record(value);
    const interval = record(hour?.interval);
    const condition = record(hour?.weatherCondition);
    const precipitation = record(hour?.precipitation);
    const probability = record(precipitation?.probability);
    const wind = record(hour?.wind);
    const gust = record(wind?.gust);
    const visibility = record(hour?.visibility);
    const feelsLike = record(hour?.feelsLikeTemperature);
    const startsAt = timestamp(interval?.startTime);
    const endsAt = timestamp(interval?.endTime);
    const conditionType = cleanString(condition?.type, 100);
    if (!startsAt || !endsAt || !conditionType) return null;

    return {
        startsAt,
        endsAt,
        conditionType,
        conditionDescription:
            cleanString(record(condition?.description)?.text, 180) ||
            conditionType.replaceAll("_", " ").toLowerCase(),
        feelsLikeCelsius:
            feelsLike?.unit === "CELSIUS"
                ? safeNumber(feelsLike.degrees, -150, 150)
                : null,
        precipitationType:
            cleanString(probability?.type, 80) || null,
        precipitationProbability: safeNumber(probability?.percent, 0, 100),
        snowQpfMillimeters: metricQuantity(
            precipitation?.snowQpf,
            "quantity",
            "MILLIMETERS"
        ),
        iceThicknessMillimeters: metricQuantity(
            hour?.iceThickness,
            "thickness",
            "MILLIMETERS"
        ),
        windGustKph:
            gust?.unit === "KILOMETERS_PER_HOUR"
                ? safeNumber(gust.value, 0, 500)
                : null,
        visibilityKilometers:
            visibility?.unit === "KILOMETERS"
                ? safeNumber(visibility.distance, 0, 1_000)
                : null,
        thunderstormProbability: safeNumber(
            hour?.thunderstormProbability,
            0,
            100
        ),
    };
}

function roundCoordinate(value: number) {
    return Math.round(value * 10_000) / 10_000;
}

function isCoordinate(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchPage(
    fetchImpl: WeatherFetch,
    url: URL,
    apiKey: string,
    signal: AbortSignal
): Promise<GoogleFetchResult> {
    try {
        const response = await fetchImpl(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "X-Goog-Api-Key": apiKey,
            },
            signal,
            next: { revalidate: MONITOR_REVALIDATE_SECONDS },
        });
        if (response.status === 404) return { status: "unsupported" };
        if (response.status === 429) {
            return { status: "failure", reason: "rate_limited" };
        }
        if (!response.ok) {
            return { status: "failure", reason: "provider_error" };
        }
        const data = await response.json().catch(() => null);
        return record(data)
            ? { status: "success", data: data as Record<string, unknown> }
            : { status: "failure", reason: "invalid_response" };
    } catch (error) {
        const name =
            error && typeof error === "object" && "name" in error
                ? String(error.name)
                : "";
        return signal.aborted || name === "AbortError" || name === "TimeoutError"
            ? { status: "failure", reason: "timeout" }
            : { status: "failure", reason: "provider_error" };
    }
}

function baseUrl(
    endpoint: string,
    request: WeatherMonitoringRequest,
    latitude: number,
    longitude: number
) {
    const url = new URL(endpoint);
    url.searchParams.set("location.latitude", String(latitude));
    url.searchParams.set("location.longitude", String(longitude));
    url.searchParams.set(
        "languageCode",
        cleanString(request.languageCode, 35) || "en"
    );
    return url;
}

function offsetTimezone(value: unknown) {
    if (typeof value !== "string") return "";
    const formattedOffset = value.match(/^([+-])(\d{2}):(\d{2})$/);
    if (formattedOffset) {
        const hours = Number(formattedOffset[2]);
        const minutes = Number(formattedOffset[3]);
        if (hours <= 14 && minutes < 60) {
            return `UTC${formattedOffset[1]}${formattedOffset[2]}:${formattedOffset[3]}`;
        }
        return "";
    }
    const match = value.match(/^(-?)(\d+)s$/);
    if (!match) return "";
    const seconds = Number(match[2]) * (match[1] ? -1 : 1);
    if (!Number.isFinite(seconds) || Math.abs(seconds) > 14 * 3600) return "";
    const absoluteMinutes = Math.abs(Math.round(seconds / 60));
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = absoluteMinutes % 60;
    return `UTC${seconds < 0 ? "-" : "+"}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function firstAlertTimezone(alerts: unknown[]) {
    for (const value of alerts) {
        const timezone = offsetTimezone(record(value)?.timezoneOffset);
        if (timezone) return timezone;
    }
    return "";
}

export class GoogleWeatherAlertProvider implements WeatherAlertProvider {
    private readonly apiKey: string | null;
    private readonly fetchImpl: WeatherFetch;
    private readonly timeoutMs: number;

    constructor(options?: {
        apiKey?: string | null;
        fetchImpl?: WeatherFetch;
        timeoutMs?: number;
    }) {
        this.apiKey =
            options?.apiKey === undefined
                ? process.env.GOOGLE_WEATHER_MONITOR_API_KEY?.trim() || null
                : options.apiKey?.trim() || null;
        this.fetchImpl = options?.fetchImpl || fetch;
        this.timeoutMs = options?.timeoutMs || MONITOR_TIMEOUT_MS;
    }

    async getMonitoringData(
        request: WeatherMonitoringRequest
    ): Promise<WeatherMonitoringResult> {
        if (!this.apiKey) {
            return { status: "failure", reason: "missing_configuration" };
        }
        if (
            !isCoordinate(request.latitude, -90, 90) ||
            !isCoordinate(request.longitude, -180, 180)
        ) {
            return { status: "unavailable", reason: "missing_coordinates" };
        }

        const latitude = roundCoordinate(request.latitude);
        const longitude = roundCoordinate(request.longitude);
        const hours = Math.min(
            MAX_HOURS,
            Math.max(1, Math.round(request.hours))
        );
        const signal = requestSignal(request.signal, this.timeoutMs);
        const publicUrl = baseUrl(
            PUBLIC_ALERTS_URL,
            request,
            latitude,
            longitude
        );
        publicUrl.searchParams.set("pageSize", String(MAX_PUBLIC_ALERTS));
        const hourlyUrl = baseUrl(
            HOURLY_FORECAST_URL,
            request,
            latitude,
            longitude
        );
        hourlyUrl.searchParams.set("unitsSystem", "METRIC");
        hourlyUrl.searchParams.set("hours", String(hours));
        hourlyUrl.searchParams.set("pageSize", "24");

        const [publicResult, firstHourlyResult] = await Promise.all([
            fetchPage(this.fetchImpl, publicUrl, this.apiKey, signal),
            fetchPage(this.fetchImpl, hourlyUrl, this.apiKey, signal),
        ]);

        if (
            publicResult.status === "unsupported" &&
            firstHourlyResult.status === "unsupported"
        ) {
            return { status: "unavailable", reason: "unsupported_location" };
        }

        const rawAlerts =
            publicResult.status === "success" &&
            Array.isArray(publicResult.data.weatherAlerts)
                ? publicResult.data.weatherAlerts.slice(0, MAX_PUBLIC_ALERTS)
                : [];
        const rawHours =
            firstHourlyResult.status === "success" &&
            Array.isArray(firstHourlyResult.data.forecastHours)
                ? [...firstHourlyResult.data.forecastHours]
                : [];
        let hourlyTimeZone =
            firstHourlyResult.status === "success"
                ? cleanString(
                      record(firstHourlyResult.data.timeZone)?.id,
                      100
                  )
                : "";

        if (
            firstHourlyResult.status === "success" &&
            rawHours.length < hours
        ) {
            let pageToken = cleanString(
                firstHourlyResult.data.nextPageToken,
                2_000
            );
            for (
                let page = 1;
                page < MAX_PAGES && pageToken && rawHours.length < hours;
                page += 1
            ) {
                const nextUrl = new URL(hourlyUrl);
                nextUrl.searchParams.set("pageToken", pageToken);
                const next = await fetchPage(
                    this.fetchImpl,
                    nextUrl,
                    this.apiKey,
                    signal
                );
                if (next.status !== "success") break;
                if (Array.isArray(next.data.forecastHours)) {
                    rawHours.push(...next.data.forecastHours);
                }
                hourlyTimeZone ||= cleanString(
                    record(next.data.timeZone)?.id,
                    100
                );
                pageToken = cleanString(next.data.nextPageToken, 2_000);
            }
        }

        const officialAlerts = rawAlerts
            .map(normalizePublicAlert)
            .filter((alert): alert is WeatherAlert => Boolean(alert));
        const hourlyForecast = rawHours
            .map(normalizeHourlyForecast)
            .filter((hour): hour is WeatherForecastHour => Boolean(hour))
            .slice(0, hours);
        const timeZone = hourlyTimeZone || firstAlertTimezone(rawAlerts);
        const partialFailures: WeatherMonitoringData["partialFailures"] = [];
        if (publicResult.status !== "success") {
            partialFailures.push("public_alerts");
        }
        if (firstHourlyResult.status !== "success" || hourlyForecast.length === 0) {
            partialFailures.push("hourly_forecast");
        }

        if (!timeZone || (officialAlerts.length === 0 && hourlyForecast.length === 0)) {
            const failures = [publicResult, firstHourlyResult].filter(
                (result): result is Extract<GoogleFetchResult, { status: "failure" }> =>
                    result.status === "failure"
            );
            return {
                status: "failure",
                reason: failures[0]?.reason || "invalid_response",
            };
        }

        return {
            status: "success",
            data: {
                provider: "google",
                timeZone,
                officialAlerts,
                hourlyForecast,
                partialFailures,
            },
        };
    }
}

let provider: GoogleWeatherAlertProvider | null = null;

export function getGoogleWeatherAlertProvider() {
    provider ||= new GoogleWeatherAlertProvider();
    return provider;
}
