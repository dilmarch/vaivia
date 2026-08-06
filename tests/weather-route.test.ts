import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherForecast } from "@/lib/weather/contracts";

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getForecast: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/weather/google-weather", () => ({
    getGoogleWeatherProvider: () => ({ getForecast: mocks.getForecast }),
}));

import { GET } from "@/app/api/trips/[tripId]/weather/route";

const forecast: WeatherForecast = {
    provider: "google",
    units: "METRIC",
    temperatureUnit: "C",
    timeZone: "Europe/Berlin",
    updatedAt: "2026-08-05T18:30:00.000Z",
    current: {
        observedAt: "2026-08-05T18:30:00.000Z",
        temperature: 20,
        feelsLikeTemperature: 19,
        precipitationProbability: 25,
        condition: {
            description: "Partly cloudy",
            type: "PARTLY_CLOUDY",
            iconUri: "https://maps.gstatic.com/weather/v1/partly_cloudy_dark.svg",
        },
    },
    daily: [
        {
            date: "2026-08-05",
            highTemperature: 24,
            lowTemperature: 15,
            precipitationProbability: 20,
            condition: {
                description: "Sunny",
                type: "CLEAR",
                iconUri: "https://maps.gstatic.com/weather/v1/sunny_dark.svg",
            },
        },
    ],
};

function fakeSupabase({
    user = { id: "user-1" } as { id: string } | null,
    trip = { id: "trip-1", slug: "berlin", destination: "Berlin" } as Record<
        string,
        unknown
    > | null,
    destination = {
        label: "Berlin, Germany",
        latitude: 52.52,
        longitude: 13.405,
        sort_order: 0,
    } as Record<string, unknown> | null,
} = {}) {
    return {
        auth: {
            getUser: vi.fn(async () => ({ data: { user } })),
        },
        from: vi.fn((table: string) => {
            const builder = {
                select: vi.fn(() => builder),
                eq: vi.fn(() => builder),
                order: vi.fn(() => builder),
                limit: vi.fn(() => builder),
                maybeSingle: vi.fn(async () => ({
                    data: table === "trips" ? trip : destination,
                    error: null,
                })),
            };
            return builder;
        }),
    };
}

function context(tripId = "trip-1") {
    return { params: Promise.resolve({ tripId }) };
}

beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.getForecast.mockReset();
    mocks.createClient.mockResolvedValue(fakeSupabase());
    mocks.getForecast.mockResolvedValue({ status: "success", forecast });
});

describe("trip weather route", () => {
    it("returns normalized weather to an authorized trip member", async () => {
        const response = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: "success",
            destinationName: "Berlin, Germany",
            forecast,
        });
        expect(mocks.getForecast).toHaveBeenCalledWith(
            expect.objectContaining({
                latitude: 52.52,
                longitude: 13.405,
                units: "METRIC",
                days: 5,
            })
        );
    });

    it("rejects unauthenticated and inaccessible trips", async () => {
        mocks.createClient.mockResolvedValueOnce(fakeSupabase({ user: null }));
        const unauthenticated = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );
        expect(unauthenticated.status).toBe(401);

        mocks.createClient.mockResolvedValueOnce(fakeSupabase({ trip: null }));
        const inaccessible = await GET(
            new Request("http://localhost/api/trips/other/weather"),
            context("other")
        );
        expect(inaccessible.status).toBe(404);
        expect(mocks.getForecast).not.toHaveBeenCalled();
    });

    it("returns a typed unavailable state when destination coordinates are missing", async () => {
        mocks.createClient.mockResolvedValue(
            fakeSupabase({
                destination: {
                    label: "Berlin, Germany",
                    latitude: null,
                    longitude: null,
                    sort_order: 0,
                },
            })
        );

        const response = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            destinationName: "Berlin, Germany",
            reason: "missing_coordinates",
        });
        expect(mocks.getForecast).not.toHaveBeenCalled();
    });

    it("keeps missing configuration and upstream failures safe", async () => {
        mocks.getForecast.mockResolvedValueOnce({
            status: "failure",
            reason: "missing_configuration",
        });
        const missingKey = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );
        const missingKeyBody = await missingKey.json();
        expect(missingKey.status).toBe(503);
        expect(missingKeyBody).toEqual({
            status: "error",
            code: "weather_unavailable",
        });
        expect(JSON.stringify(missingKeyBody)).not.toContain("GOOGLE_WEATHER_API_KEY");

        mocks.getForecast.mockResolvedValueOnce({
            status: "failure",
            reason: "timeout",
        });
        const timeout = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );
        expect(timeout.status).toBe(504);
        await expect(timeout.json()).resolves.toEqual({
            status: "error",
            code: "weather_timeout",
        });
    });

    it("returns Google unsupported locations as typed unavailable data", async () => {
        mocks.getForecast.mockResolvedValue({
            status: "unavailable",
            reason: "unsupported_location",
        });

        const response = await GET(
            new Request("http://localhost/api/trips/trip-1/weather"),
            context()
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            destinationName: "Berlin, Germany",
            reason: "unsupported_location",
        });
    });
});
