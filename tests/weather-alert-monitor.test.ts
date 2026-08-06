import { describe, expect, it, vi } from "vitest";

import type {
    WeatherAlertProvider,
    WeatherMonitoringResult,
} from "@/lib/weather/alerts-contracts";
import {
    processWeatherAlertRun,
    type WeatherAlertMonitorRepository,
    type WeatherMonitorTrip,
    type WeatherNotificationInsert,
} from "@/lib/weather/weather-alert-monitor";

const baseNow = new Date("2026-08-06T10:00:00.000Z");

function trip(
    id: string,
    latitude = 52.52,
    longitude = 13.405
): WeatherMonitorTrip {
    return {
        id,
        slug: id,
        title: `Trip ${id}`,
        startDate: "2026-08-05",
        endDate: "2026-08-08",
        primaryDestination: {
            key: `place-${id}`,
            label: "Berlin",
            latitude,
            longitude,
            priority: 2,
            source: "destination",
            affectedItineraryItemIds: [],
        },
        recipients: [
            {
                userId: `user-${id}`,
                tripMemberId: `member-${id}`,
                invitationId: null,
                startDate: "2026-08-05",
                endDate: "2026-08-08",
                enabled: true,
                itinerary: [],
                accommodations: [],
                transportation: [],
            },
        ],
    };
}

function monitoringResult(
    severity: "MODERATE" | "SEVERE" = "SEVERE"
): WeatherMonitoringResult {
    return {
        status: "success",
        data: {
            provider: "google",
            timeZone: "Europe/Berlin",
            partialFailures: [],
            hourlyForecast: [],
            officialAlerts: [
                {
                    provider: "google",
                    providerAlertId: "alert-1",
                    title: "Thunderstorm warning",
                    eventType: "SEVERE_THUNDERSTORM_WARNING",
                    affectedArea: "Berlin",
                    description: "Thunderstorms may affect travel.",
                    severity,
                    certainty: "LIKELY",
                    urgency: "EXPECTED",
                    startsAt: "2026-08-06T12:00:00.000Z",
                    expiresAt: "2026-08-06T18:00:00.000Z",
                    instructions: [],
                    safetyRecommendations: [],
                    sourceName: "Weather Authority",
                    sourceAuthorityUrl: "https://weather.example/",
                },
            ],
        },
    };
}

class FakeRepository implements WeatherAlertMonitorRepository {
    claimed = new Set<string>();
    deduplicationKeys = new Set<string>();
    notifications: WeatherNotificationInsert[] = [];
    completeCalls = 0;

    constructor(public trips: WeatherMonitorTrip[]) {}

    async claimRun(runKey: string) {
        if (this.claimed.has(runKey)) return false;
        this.claimed.add(runKey);
        return true;
    }

    async completeRun() {
        this.completeCalls += 1;
    }

    async loadEligibleTripCandidates() {
        return this.trips;
    }

    async insertNotification(notification: WeatherNotificationInsert) {
        if (this.deduplicationKeys.has(notification.deduplicationKey)) {
            return "duplicate" as const;
        }
        this.deduplicationKeys.add(notification.deduplicationKey);
        this.notifications.push(notification);
        return "created" as const;
    }
}

describe("scheduled weather alert monitor", () => {
    it("deduplicates an identical event across repeated three-hour runs", async () => {
        const repository = new FakeRepository([trip("one")]);
        const provider: WeatherAlertProvider = {
            getMonitoringData: vi.fn(async () => monitoringResult()),
        };

        const first = await processWeatherAlertRun({
            repository,
            provider,
            now: baseNow,
        });
        const second = await processWeatherAlertRun({
            repository,
            provider,
            now: new Date(baseNow.getTime() + 3 * 3_600_000),
        });

        expect(first.notificationsCreated).toBe(1);
        expect(second.notificationsCreated).toBe(0);
        expect(second.duplicatesSkipped).toBe(1);
        expect(repository.notifications).toHaveLength(1);
    });

    it("allows a meaningful severity escalation to create a new notification", async () => {
        const repository = new FakeRepository([trip("one")]);
        let severity: "MODERATE" | "SEVERE" = "MODERATE";
        const provider: WeatherAlertProvider = {
            getMonitoringData: vi.fn(async () =>
                monitoringResult(severity)
            ),
        };

        await processWeatherAlertRun({ repository, provider, now: baseNow });
        severity = "SEVERE";
        await processWeatherAlertRun({
            repository,
            provider,
            now: new Date(baseNow.getTime() + 3 * 3_600_000),
        });

        expect(repository.notifications.map((item) => item.severity)).toEqual([
            "MODERATE",
            "SEVERE",
        ]);
    });

    it("continues with other trips when one provider lookup fails", async () => {
        const repository = new FakeRepository([
            trip("failed", 1, 1),
            trip("successful", 2, 2),
        ]);
        const provider: WeatherAlertProvider = {
            getMonitoringData: vi.fn(async (request) =>
                request.latitude === 1
                    ? {
                          status: "failure" as const,
                          reason: "provider_error" as const,
                      }
                    : monitoringResult()
            ),
        };

        const result = await processWeatherAlertRun({
            repository,
            provider,
            now: baseNow,
        });
        expect(result.ok).toBe(true);
        expect(result.errors).toBe(1);
        expect(result.tripsProcessed).toBe(1);
        expect(result.notificationsCreated).toBe(1);
        expect(repository.completeCalls).toBe(1);
    });

    it("only asks the repository for job and notification writes", async () => {
        const repository = new FakeRepository([trip("one")]);
        const provider: WeatherAlertProvider = {
            getMonitoringData: vi.fn(async () => monitoringResult()),
        };
        await processWeatherAlertRun({ repository, provider, now: baseNow });

        expect(repository.notifications).toHaveLength(1);
        expect(repository.notifications[0].deepLink).toMatch(
            /^\/trips\/one\/assistant\?weatherAlert=/
        );
        expect(repository.notifications[0].metadata.tripName).toBe("Trip one");
        expect(Object.keys(repository)).not.toContain("itineraryWrites");
        expect(Object.keys(repository)).not.toContain("tripWrites");
    });
});
