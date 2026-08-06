import "server-only";

import type {
    WeatherCondition,
    WeatherDailyForecast,
    WeatherForecast,
    WeatherForecastRequest,
    WeatherForecastResult,
    WeatherProvider,
    WeatherTemperatureUnit,
} from "@/lib/weather/contracts";

const CURRENT_CONDITIONS_URL =
    "https://weather.googleapis.com/v1/currentConditions:lookup";
const DAILY_FORECAST_URL =
    "https://weather.googleapis.com/v1/forecast/days:lookup";
const GOOGLE_WEATHER_TIMEOUT_MS = 6_000;
export const GOOGLE_WEATHER_REVALIDATE_SECONDS = 15 * 60;
const MAX_FORECAST_DAYS = 5;

type GoogleTemperature = { degrees?: unknown; unit?: unknown };
type GoogleCondition = {
    iconBaseUri?: unknown;
    description?: { text?: unknown };
    type?: unknown;
};
type GooglePrecipitation = {
    probability?: { percent?: unknown; type?: unknown };
};
type GoogleCurrentResponse = {
    currentTime?: unknown;
    timeZone?: { id?: unknown };
    weatherCondition?: GoogleCondition;
    temperature?: GoogleTemperature;
    feelsLikeTemperature?: GoogleTemperature;
    precipitation?: GooglePrecipitation;
};
type GoogleForecastDay = {
    displayDate?: { year?: unknown; month?: unknown; day?: unknown };
    daytimeForecast?: {
        weatherCondition?: GoogleCondition;
        precipitation?: GooglePrecipitation;
    };
    maxTemperature?: GoogleTemperature;
    minTemperature?: GoogleTemperature;
};
type GoogleDailyResponse = {
    forecastDays?: unknown;
    timeZone?: { id?: unknown };
};

type GoogleFetchResult =
    | { status: "success"; data: unknown }
    | { status: "unsupported" }
    | { status: "failure"; code: "timeout" | "rate_limited" | "provider_error" };

type WeatherFetch = (
    input: string | URL | Request,
    init?: RequestInit & { next?: { revalidate: number } }
) => Promise<Response>;

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

function safeTimestamp(value: unknown) {
    if (typeof value !== "string") return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sanitizeIconUri(value: unknown) {
    const baseUri = cleanString(value, 300);
    if (!baseUri) return null;

    try {
        const url = new URL(baseUri);
        if (
            url.protocol !== "https:" ||
            url.hostname !== "maps.gstatic.com" ||
            !url.pathname.startsWith("/weather/")
        ) {
            return null;
        }
        return `${url.origin}${url.pathname}_dark.svg`;
    } catch {
        return null;
    }
}

function normalizeCondition(value: GoogleCondition | undefined): WeatherCondition | null {
    const description = cleanString(value?.description?.text, 120);
    if (!description) return null;

    return {
        description,
        type: cleanString(value?.type, 80) || null,
        iconUri: sanitizeIconUri(value?.iconBaseUri),
    };
}

function temperatureDegrees(value: GoogleTemperature | undefined) {
    return safeNumber(value?.degrees, -150, 150);
}

function precipitationProbability(value: GooglePrecipitation | undefined) {
    return safeNumber(value?.probability?.percent, 0, 100);
}

function normalizeDisplayDate(value: GoogleForecastDay["displayDate"]) {
    const year = safeNumber(value?.year, 1, 9999);
    const month = safeNumber(value?.month, 1, 12);
    const day = safeNumber(value?.day, 1, 31);
    if (year === null || month === null || day === null) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDailyForecast(value: unknown): WeatherDailyForecast | null {
    if (!value || typeof value !== "object") return null;
    const day = value as GoogleForecastDay;
    const date = normalizeDisplayDate(day.displayDate);
    const condition = normalizeCondition(day.daytimeForecast?.weatherCondition);
    const highTemperature = temperatureDegrees(day.maxTemperature);
    const lowTemperature = temperatureDegrees(day.minTemperature);
    if (!date || !condition || highTemperature === null || lowTemperature === null) {
        return null;
    }

    return {
        date,
        highTemperature,
        lowTemperature,
        precipitationProbability: precipitationProbability(
            day.daytimeForecast?.precipitation
        ),
        condition,
    };
}

function temperatureUnitForRequest(
    request: WeatherForecastRequest
): WeatherTemperatureUnit {
    return request.units === "IMPERIAL" ? "F" : "C";
}

function roundCoordinate(value: number) {
    return Math.round(value * 10_000) / 10_000;
}

function isValidCoordinate(value: number, minimum: number, maximum: number) {
    return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function fetchGoogleWeather(
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
            next: { revalidate: GOOGLE_WEATHER_REVALIDATE_SECONDS },
        });

        if (response.status === 404) return { status: "unsupported" };
        if (response.status === 429) {
            return { status: "failure", code: "rate_limited" };
        }
        if (!response.ok) {
            return { status: "failure", code: "provider_error" };
        }

        const data = await response.json().catch(() => null);
        return data
            ? { status: "success", data }
            : { status: "failure", code: "provider_error" };
    } catch (error) {
        const errorName =
            error && typeof error === "object" && "name" in error
                ? String(error.name)
                : "";
        if (
            signal.aborted ||
            errorName === "AbortError" ||
            errorName === "TimeoutError"
        ) {
            return { status: "failure", code: "timeout" };
        }
        return { status: "failure", code: "provider_error" };
    }
}

export class GoogleWeatherProvider implements WeatherProvider {
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
                ? process.env.GOOGLE_WEATHER_API_KEY?.trim() || null
                : options.apiKey?.trim() || null;
        this.fetchImpl = options?.fetchImpl || fetch;
        this.timeoutMs = options?.timeoutMs || GOOGLE_WEATHER_TIMEOUT_MS;
    }

    async getForecast(
        request: WeatherForecastRequest
    ): Promise<WeatherForecastResult> {
        if (!this.apiKey) {
            return { status: "failure", reason: "missing_configuration" };
        }
        if (
            !isValidCoordinate(request.latitude, -90, 90) ||
            !isValidCoordinate(request.longitude, -180, 180)
        ) {
            return { status: "unavailable", reason: "missing_coordinates" };
        }

        const latitude = roundCoordinate(request.latitude);
        const longitude = roundCoordinate(request.longitude);
        const days = Math.min(MAX_FORECAST_DAYS, Math.max(1, Math.round(request.days)));
        const languageCode = cleanString(request.languageCode, 35) || "en";
        const commonParams = {
            "location.latitude": String(latitude),
            "location.longitude": String(longitude),
            unitsSystem: request.units,
            languageCode,
        };
        const currentUrl = new URL(CURRENT_CONDITIONS_URL);
        const dailyUrl = new URL(DAILY_FORECAST_URL);
        Object.entries(commonParams).forEach(([key, value]) => {
            currentUrl.searchParams.set(key, value);
            dailyUrl.searchParams.set(key, value);
        });
        dailyUrl.searchParams.set("days", String(days));
        dailyUrl.searchParams.set("pageSize", String(days));

        const signal = createRequestSignal(request.signal, this.timeoutMs);
        const [currentResult, dailyResult] = await Promise.all([
            fetchGoogleWeather(this.fetchImpl, currentUrl, this.apiKey, signal),
            fetchGoogleWeather(this.fetchImpl, dailyUrl, this.apiKey, signal),
        ]);

        if (
            currentResult.status === "unsupported" ||
            dailyResult.status === "unsupported"
        ) {
            return { status: "unavailable", reason: "unsupported_location" };
        }
        if (currentResult.status === "failure") {
            return { status: "failure", reason: currentResult.code };
        }
        if (dailyResult.status === "failure") {
            return { status: "failure", reason: dailyResult.code };
        }

        const current = currentResult.data as GoogleCurrentResponse;
        const daily = dailyResult.data as GoogleDailyResponse;
        const observedAt = safeTimestamp(current.currentTime);
        const condition = normalizeCondition(current.weatherCondition);
        const temperature = temperatureDegrees(current.temperature);
        const dailyForecast = Array.isArray(daily.forecastDays)
            ? daily.forecastDays
                  .map(normalizeDailyForecast)
                  .filter((day): day is WeatherDailyForecast => Boolean(day))
                  .slice(0, days)
            : [];
        const timeZone =
            cleanString(daily.timeZone?.id, 100) ||
            cleanString(current.timeZone?.id, 100);

        if (
            !observedAt ||
            !condition ||
            temperature === null ||
            dailyForecast.length === 0 ||
            !timeZone
        ) {
            return { status: "failure", reason: "invalid_response" };
        }

        const forecast: WeatherForecast = {
            provider: "google",
            units: request.units,
            temperatureUnit: temperatureUnitForRequest(request),
            timeZone,
            updatedAt: observedAt,
            current: {
                observedAt,
                temperature,
                feelsLikeTemperature: temperatureDegrees(
                    current.feelsLikeTemperature
                ),
                precipitationProbability:
                    precipitationProbability(current.precipitation) ??
                    dailyForecast[0]?.precipitationProbability ??
                    null,
                condition,
            },
            daily: dailyForecast,
        };

        return { status: "success", forecast };
    }
}

let provider: GoogleWeatherProvider | null = null;

export function getGoogleWeatherProvider() {
    provider ||= new GoogleWeatherProvider();
    return provider;
}
