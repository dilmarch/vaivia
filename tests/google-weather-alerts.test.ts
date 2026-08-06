import { describe, expect, it, vi } from "vitest";

import { GoogleWeatherAlertProvider } from "@/lib/weather/google-weather-alerts";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("GoogleWeatherAlertProvider", () => {
    it("fails safely without the dedicated monitor key", async () => {
        const fetchImpl = vi.fn();
        const provider = new GoogleWeatherAlertProvider({
            apiKey: null,
            fetchImpl,
        });
        await expect(
            provider.getMonitoringData({
                latitude: 52.52,
                longitude: 13.405,
                languageCode: "en",
                hours: 48,
            })
        ).resolves.toEqual({
            status: "failure",
            reason: "missing_configuration",
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("normalizes alerts and hourly fields without exposing raw payloads or the key", async () => {
        const fetchImpl = vi.fn(
            async (
                input: string | URL | Request,
                _init?: RequestInit & { next?: { revalidate: number } }
            ) => {
                void _init;
                const url = String(input);
                if (url.includes("publicAlerts")) {
                    return json({
                        weatherAlerts: [
                            {
                                alertId: "official-1",
                                alertTitle: { text: "Storm warning" },
                                eventType: "SEVERE_THUNDERSTORM_WARNING",
                                areaName: "Berlin",
                                description: "Storms expected",
                                severity: "SEVERE",
                                certainty: "LIKELY",
                                urgency: "EXPECTED",
                                startTime: "2026-08-06T02:00:00Z",
                                expirationTime: "2026-08-06T08:00:00Z",
                                instruction: ["Seek shelter"],
                                safetyRecommendations: [
                                    { directive: "Stay indoors", subtext: "If safe" },
                                ],
                                dataSource: {
                                    name: "Weather Authority",
                                    authorityUri: "https://weather.example/",
                                },
                                polygon: "must not escape",
                            },
                        ],
                    });
                }
                return json({
                    timeZone: { id: "Europe/Berlin" },
                    forecastHours: [
                        {
                            interval: {
                                startTime: "2026-08-06T02:00:00Z",
                                endTime: "2026-08-06T03:00:00Z",
                            },
                            weatherCondition: {
                                type: "THUNDERSTORM",
                                description: { text: "Thunderstorm" },
                            },
                            feelsLikeTemperature: {
                                degrees: 24,
                                unit: "CELSIUS",
                            },
                            precipitation: {
                                probability: {
                                    percent: 80,
                                    type: "RAIN",
                                },
                                snowQpf: { quantity: 0, unit: "MILLIMETERS" },
                            },
                            wind: {
                                gust: {
                                    value: 95,
                                    unit: "KILOMETERS_PER_HOUR",
                                },
                            },
                            visibility: { distance: 4, unit: "KILOMETERS" },
                            iceThickness: { thickness: 0, unit: "MILLIMETERS" },
                            thunderstormProbability: 75,
                        },
                    ],
                });
            }
        );
        const provider = new GoogleWeatherAlertProvider({
            apiKey: "monitor-server-key",
            fetchImpl,
        });
        const result = await provider.getMonitoringData({
            latitude: 52.520008,
            longitude: 13.404954,
            languageCode: "en",
            hours: 1,
        });

        expect(result).toMatchObject({
            status: "success",
            data: {
                timeZone: "Europe/Berlin",
                officialAlerts: [
                    {
                        providerAlertId: "official-1",
                        severity: "SEVERE",
                        sourceName: "Weather Authority",
                    },
                ],
                hourlyForecast: [
                    {
                        windGustKph: 95,
                        thunderstormProbability: 75,
                    },
                ],
            },
        });
        expect(JSON.stringify(result)).not.toContain("polygon");
        for (const [url, init] of fetchImpl.mock.calls) {
            expect(String(url)).not.toContain("monitor-server-key");
            expect(String(url)).toContain("location.latitude=52.52");
            expect(
                (init?.headers as Record<string, string>)["X-Goog-Api-Key"]
            ).toBe("monitor-server-key");
        }
    });

    it("returns typed unavailable only when both endpoints reject the location", async () => {
        const provider = new GoogleWeatherAlertProvider({
            apiKey: "test-key",
            fetchImpl: vi.fn(async () => json({}, 404)),
        });
        await expect(
            provider.getMonitoringData({
                latitude: 0,
                longitude: 0,
                languageCode: "en",
                hours: 48,
            })
        ).resolves.toEqual({
            status: "unavailable",
            reason: "unsupported_location",
        });
    });

    it("uses an official alert offset when the hourly endpoint is unavailable", async () => {
        const provider = new GoogleWeatherAlertProvider({
            apiKey: "test-key",
            fetchImpl: vi.fn(async (input) =>
                String(input).includes("publicAlerts")
                    ? json({
                          weatherAlerts: [
                              {
                                  alertId: "alert-with-offset",
                                  alertTitle: { text: "Storm warning" },
                                  dataSource: { name: "Weather Authority" },
                                  timezoneOffset: "+02:00",
                                  severity: "SEVERE",
                                  certainty: "LIKELY",
                                  urgency: "EXPECTED",
                              },
                          ],
                      })
                    : json({}, 404)
            ),
        });

        await expect(
            provider.getMonitoringData({
                latitude: 52.52,
                longitude: 13.405,
                languageCode: "en",
                hours: 48,
            })
        ).resolves.toMatchObject({
            status: "success",
            data: { timeZone: "UTC+02:00" },
        });
    });
});
