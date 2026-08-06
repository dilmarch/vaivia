export const WEATHER_UNITS = ["METRIC", "IMPERIAL"] as const;

export type WeatherUnits = (typeof WEATHER_UNITS)[number];
export type WeatherTemperatureUnit = "C" | "F";

export type WeatherCondition = {
    description: string;
    type: string | null;
    iconUri: string | null;
};

export type WeatherCurrentConditions = {
    observedAt: string;
    temperature: number;
    feelsLikeTemperature: number | null;
    precipitationProbability: number | null;
    condition: WeatherCondition;
};

export type WeatherDailyForecast = {
    date: string;
    highTemperature: number;
    lowTemperature: number;
    precipitationProbability: number | null;
    condition: WeatherCondition;
};

export type WeatherForecast = {
    provider: "google";
    units: WeatherUnits;
    temperatureUnit: WeatherTemperatureUnit;
    timeZone: string;
    updatedAt: string;
    current: WeatherCurrentConditions;
    daily: WeatherDailyForecast[];
};

export type WeatherUnavailableReason =
    | "missing_coordinates"
    | "unsupported_location";

export type WeatherFailureReason =
    | "missing_configuration"
    | "timeout"
    | "rate_limited"
    | "provider_error"
    | "invalid_response";

export type WeatherForecastResult =
    | { status: "success"; forecast: WeatherForecast }
    | { status: "unavailable"; reason: WeatherUnavailableReason }
    | { status: "failure"; reason: WeatherFailureReason };

export type WeatherForecastRequest = {
    latitude: number;
    longitude: number;
    units: WeatherUnits;
    languageCode: string;
    days: number;
    signal?: AbortSignal;
};

export interface WeatherProvider {
    getForecast(request: WeatherForecastRequest): Promise<WeatherForecastResult>;
}

export type WeatherWidgetResponse =
    | {
          status: "success";
          destinationName: string;
          forecast: WeatherForecast;
      }
    | {
          status: "unavailable";
          destinationName: string;
          reason: WeatherUnavailableReason;
      }
    | {
          status: "error";
          code: "weather_unavailable" | "weather_timeout";
      };

export function resolveWeatherUnitsPreference(value: unknown): WeatherUnits {
    return typeof value === "string" && value.trim().toUpperCase() === "IMPERIAL"
        ? "IMPERIAL"
        : "METRIC";
}
