import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TripWeatherCard, {
    clearWeatherWidgetRequestCache,
} from "@/components/weather/TripWeatherCard";
import type { WeatherWidgetResponse } from "@/lib/weather/contracts";

const successResponse: WeatherWidgetResponse = {
    status: "success",
    destinationName: "Berlin, Germany",
    forecast: {
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
                iconUri:
                    "https://maps.gstatic.com/weather/v1/partly_cloudy_dark.svg",
            },
        },
        daily: Array.from({ length: 5 }, (_, index) => ({
            date: `2026-08-0${5 + index}`,
            highTemperature: 24 + index,
            lowTemperature: 15 + index,
            precipitationProbability: index * 10,
            condition: {
                description: "Sunny",
                type: "CLEAR",
                iconUri: "https://maps.gstatic.com/weather/v1/sunny_dark.svg",
            },
        })),
    },
};

function apiResponse(body: WeatherWidgetResponse, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
    clearWeatherWidgetRequestCache();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("TripWeatherCard", () => {
    it("renders loading, normalized weather, units, and Google attribution", async () => {
        let resolveFetch: ((response: Response) => void) | null = null;
        const fetchMock = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                })
        );
        vi.stubGlobal("fetch", fetchMock);

        const { container } = render(<TripWeatherCard tripId="trip-1" />);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Loading destination weather"
        );

        resolveFetch!(apiResponse(successResponse));

        expect(
            await screen.findByRole("heading", { name: "Berlin, Germany" })
        ).toBeInTheDocument();
        expect(screen.getByText("20°C")).toBeInTheDocument();
        expect(screen.getByText(/Feels like 19°C/)).toBeInTheDocument();
        expect(screen.getByText("Google Maps")).toBeInTheDocument();
        expect(
            screen.getByText("Source: Includes weather data from Google")
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("GOOGLE_WEATHER_API_KEY");
    });

    it("renders the graceful unavailable state", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                apiResponse({
                    status: "unavailable",
                    destinationName: "Berlin, Germany",
                    reason: "missing_coordinates",
                })
            )
        );

        render(<TripWeatherCard tripId="trip-1" />);
        expect(
            await screen.findByText(
                "Weather forecast unavailable for this destination"
            )
        ).toBeInTheDocument();
    });

    it("renders a retryable error without breaking the page", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                apiResponse(
                    { status: "error", code: "weather_unavailable" },
                    503
                )
            )
            .mockResolvedValueOnce(apiResponse(successResponse));
        vi.stubGlobal("fetch", fetchMock);

        render(<TripWeatherCard tripId="trip-1" />);
        expect(
            await screen.findByText("Weather could not be loaded right now.")
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Retry weather" }));
        expect(
            await screen.findByRole("heading", { name: "Berlin, Germany" })
        ).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("deduplicates repeated widget mounts for the same trip", async () => {
        const fetchMock = vi.fn(async () => apiResponse(successResponse));
        vi.stubGlobal("fetch", fetchMock);

        const first = render(<TripWeatherCard tripId="trip-1" />);
        await screen.findByRole("heading", { name: "Berlin, Germany" });
        first.unmount();

        render(<TripWeatherCard tripId="trip-1" />);
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Berlin, Germany" })
            ).toBeInTheDocument()
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
