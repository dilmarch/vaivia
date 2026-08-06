import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createServiceRoleClient: vi.fn(),
    processWeatherAlertRun: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/weather/google-weather-alerts", () => ({
    getGoogleWeatherAlertProvider: () => ({ getMonitoringData: vi.fn() }),
}));
vi.mock("@/lib/weather/weather-alert-monitor", () => ({
    WEATHER_MONITOR_TRIP_LIMIT: 20,
    SupabaseWeatherAlertMonitorRepository: class {},
    processWeatherAlertRun: mocks.processWeatherAlertRun,
}));

import {
    isWeatherCronAuthorized,
    POST,
} from "@/app/api/cron/weather-alerts/route";

beforeEach(() => {
    vi.stubEnv("WEATHER_CRON_SECRET", "correct-secret");
    mocks.createServiceRoleClient.mockReset();
    mocks.processWeatherAlertRun.mockReset();
    mocks.createServiceRoleClient.mockReturnValue({});
    mocks.processWeatherAlertRun.mockResolvedValue({
        ok: true,
        skippedConcurrentRun: false,
        tripsConsidered: 2,
        tripsProcessed: 2,
        locationsChecked: 2,
        notificationsCreated: 1,
        duplicatesSkipped: 0,
        errors: 0,
    });
});

describe("weather alert Cron route", () => {
    it("rejects missing, malformed, and invalid credentials", async () => {
        for (const authorization of [
            undefined,
            "correct-secret",
            "Bearer wrong-secret",
        ]) {
            const headers = authorization
                ? { Authorization: authorization }
                : undefined;
            const response = await POST(
                new Request("https://vaivia.app/api/cron/weather-alerts", {
                    method: "POST",
                    headers,
                })
            );
            expect(response.status).toBe(401);
        }
        expect(mocks.processWeatherAlertRun).not.toHaveBeenCalled();
    });

    it("uses constant-time compatible bearer validation and returns counts only", async () => {
        const request = new Request(
            "https://vaivia.app/api/cron/weather-alerts",
            {
                method: "POST",
                headers: { Authorization: "Bearer correct-secret" },
            }
        );
        expect(isWeatherCronAuthorized(request, "correct-secret")).toBe(true);
        const response = await POST(request);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.notificationsCreated).toBe(1);
        expect(JSON.stringify(body)).not.toContain("correct-secret");
        expect(JSON.stringify(body)).not.toContain("locationLabel");
    });
});
