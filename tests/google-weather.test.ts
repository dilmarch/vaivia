import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleWeatherProvider } from "@/lib/weather/google-weather";
import type { WeatherUnits } from "@/lib/weather/contracts";

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function currentResponse(units: WeatherUnits) {
    const imperial = units === "IMPERIAL";
    return {
        currentTime: "2026-08-05T18:30:00Z",
        timeZone: { id: "Europe/Berlin" },
        weatherCondition: {
            iconBaseUri: "https://maps.gstatic.com/weather/v1/partly_cloudy",
            description: { text: "Partly cloudy", languageCode: "en" },
            type: "PARTLY_CLOUDY",
        },
        temperature: {
            degrees: imperial ? 68 : 20,
            unit: imperial ? "FAHRENHEIT" : "CELSIUS",
        },
        feelsLikeTemperature: {
            degrees: imperial ? 66 : 18.9,
            unit: imperial ? "FAHRENHEIT" : "CELSIUS",
        },
        precipitation: { probability: { percent: 25, type: "RAIN" } },
        rawProviderFieldThatMustNotEscape: "private provider detail",
    };
}

function dailyResponse(units: WeatherUnits) {
    const imperial = units === "IMPERIAL";
    return {
        timeZone: { id: "Europe/Berlin" },
        forecastDays: Array.from({ length: 5 }, (_, index) => ({
            displayDate: { year: 2026, month: 8, day: 5 + index },
            daytimeForecast: {
                weatherCondition: {
                    iconBaseUri: "https://maps.gstatic.com/weather/v1/sunny",
                    description: { text: "Sunny", languageCode: "en" },
                    type: "CLEAR",
                },
                precipitation: { probability: { percent: index * 5, type: "RAIN" } },
            },
            maxTemperature: {
                degrees: imperial ? 75 + index : 24 + index,
                unit: imperial ? "FAHRENHEIT" : "CELSIUS",
            },
            minTemperature: {
                degrees: imperial ? 59 + index : 15 + index,
                unit: imperial ? "FAHRENHEIT" : "CELSIUS",
            },
        })),
    };
}

function providerWithResponses(units: WeatherUnits) {
    const fetchImpl = vi.fn(async (
        input: string | URL | Request,
        init?: RequestInit & { next?: { revalidate: number } }
    ) => {
        void init;
        const url = String(input);
        return jsonResponse(
            url.includes("currentConditions")
                ? currentResponse(units)
                : dailyResponse(units)
        );
    });
    return {
        provider: new GoogleWeatherProvider({
            apiKey: "server-weather-key",
            fetchImpl,
        }),
        fetchImpl,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("GoogleWeatherProvider", () => {
    it("fails safely when the dedicated server key is missing", async () => {
        const fetchImpl = vi.fn();
        const provider = new GoogleWeatherProvider({ apiKey: null, fetchImpl });

        await expect(
            provider.getForecast({
                latitude: 52.52,
                longitude: 13.405,
                units: "METRIC",
                languageCode: "en",
                days: 5,
            })
        ).resolves.toEqual({
            status: "failure",
            reason: "missing_configuration",
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        ["METRIC" as const, "C", 20, 24],
        ["IMPERIAL" as const, "F", 68, 75],
    ])(
        "normalizes %s current conditions and daily forecasts",
        async (units, temperatureUnit, currentTemperature, highTemperature) => {
            const { provider, fetchImpl } = providerWithResponses(units);
            const result = await provider.getForecast({
                latitude: 52.520008,
                longitude: 13.404954,
                units,
                languageCode: "en",
                days: 5,
            });

            expect(result).toMatchObject({
                status: "success",
                forecast: {
                    provider: "google",
                    units,
                    temperatureUnit,
                    timeZone: "Europe/Berlin",
                    current: {
                        temperature: currentTemperature,
                        precipitationProbability: 25,
                        condition: {
                            description: "Partly cloudy",
                            iconUri:
                                "https://maps.gstatic.com/weather/v1/partly_cloudy_dark.svg",
                        },
                    },
                },
            });
            if (result.status !== "success") throw new Error("Expected success");
            expect(result.forecast.daily).toHaveLength(5);
            expect(result.forecast.daily[0]).toMatchObject({
                date: "2026-08-05",
                highTemperature,
                lowTemperature: units === "IMPERIAL" ? 59 : 15,
            });
            expect(JSON.stringify(result)).not.toContain("rawProviderField");
            expect(fetchImpl).toHaveBeenCalledTimes(2);

            for (const [url, init] of fetchImpl.mock.calls) {
                expect(String(url)).toContain("location.latitude=52.52");
                expect(String(url)).not.toContain("server-weather-key");
                expect((init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
                    "server-weather-key"
                );
                expect(init?.next).toEqual({ revalidate: 900 });
            }
        }
    );

    it("returns a typed unavailable result for Google 404 locations", async () => {
        const provider = new GoogleWeatherProvider({
            apiKey: "test-key",
            fetchImpl: vi.fn(async () => jsonResponse({}, 404)),
        });

        await expect(
            provider.getForecast({
                latitude: 0,
                longitude: 0,
                units: "METRIC",
                languageCode: "en",
                days: 5,
            })
        ).resolves.toEqual({
            status: "unavailable",
            reason: "unsupported_location",
        });
    });

    it.each([
        ["AbortError", "timeout"],
        ["provider failure", "provider_error"],
    ])("maps %s without exposing a response body", async (failure, reason) => {
        const fetchImpl =
            failure === "AbortError"
                ? vi.fn(async () => {
                      throw new DOMException("timed out", "AbortError");
                  })
                : vi.fn(async () =>
                      jsonResponse({ error: { message: "secret upstream body" } }, 500)
                  );
        const provider = new GoogleWeatherProvider({
            apiKey: "test-key",
            fetchImpl,
        });

        const result = await provider.getForecast({
            latitude: 52.52,
            longitude: 13.405,
            units: "METRIC",
            languageCode: "en",
            days: 5,
        });
        expect(result).toEqual({ status: "failure", reason });
        expect(JSON.stringify(result)).not.toContain("secret upstream body");
    });
});
