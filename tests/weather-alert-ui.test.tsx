import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SettingsNotificationsClient from "@/components/SettingsNotificationsClient";
import WeatherAlertNotificationDetails from "@/components/weather/WeatherAlertNotificationDetails";
import { buildWeatherAssistantPrompt } from "@/lib/weather/assistant-weather-context";
import { mergeNotificationPreferences } from "@/lib/notificationTypes";

afterEach(cleanup);

describe("weather alert in-app experience", () => {
    it("shows official source attribution and the emergency-alert disclaimer", () => {
        render(
            <WeatherAlertNotificationDetails
                metadata={{
                    weatherAlertKind: "official",
                    severity: "SEVERE",
                    locationLabel: "Berlin",
                    eventWindowLabel: "Thu, Aug 6, 2:00 PM to 8:00 PM",
                    sourceName: "National Weather Service",
                    sourceAuthorityUrl: "https://weather.example/",
                }}
            />
        );
        expect(screen.getByText("Official weather alert")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /National Weather Service/ })
        ).toHaveAttribute("href", "https://weather.example/");
        expect(
            screen.getByText(/do not replace official emergency alerts/i)
        ).toBeInTheDocument();
        expect(
            screen.getByText("Source: Includes weather data from Google")
        ).toBeInTheDocument();
    });

    it("renders opt-in weather email and push settings", () => {
        const preferences = mergeNotificationPreferences([]);
        render(
            <SettingsNotificationsClient
                preferences={preferences}
                vapidPublicKey={null}
            />
        );
        expect(
            screen.getByRole("checkbox", { name: "Weather alerts" })
        ).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Email" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Push" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Push" })).toBeDisabled();
    });

    it("allows weather push selection after an active device exists", () => {
        render(
            <SettingsNotificationsClient
                preferences={mergeNotificationPreferences([])}
                vapidPublicKey="public-key"
                pushDevices={[
                    {
                        id: "device-1",
                        platform: "ios",
                        userAgent: "Safari on iPhone",
                        lastSeenAt: "2026-08-06T10:00:00.000Z",
                    },
                ]}
            />
        );
        expect(screen.getByRole("checkbox", { name: "Push" })).toBeEnabled();
        expect(screen.getByText("Saved devices")).toBeInTheDocument();
        expect(screen.getByText("Safari on iPhone")).toBeInTheDocument();
    });

    it("builds structured review context without authorizing automatic edits", () => {
        const prompt = buildWeatherAssistantPrompt({
            metadata: {
                weatherAlertKind: "official",
                severity: "SEVERE",
                eventType: "THUNDERSTORM",
                locationLabel: "Berlin",
                eventWindowLabel: "Tomorrow afternoon",
                description: "Thunderstorms may affect outdoor plans.",
            },
            affectedPlanLabels: ["Museum Island walking tour"],
        });
        expect(prompt).toContain("Museum Island walking tour");
        expect(prompt).toContain("proposal and confirmation workflow");
        expect(prompt).toContain("Do not change anything automatically");
    });

    it("routes Review plans through an owned notification ID", () => {
        const root = process.cwd();
        const action = readFileSync(
            resolve(root, "components/NotificationActionButton.tsx"),
            "utf8"
        );
        const assistantPage = readFileSync(
            resolve(root, "app/trips/[tripId]/assistant/page.tsx"),
            "utf8"
        );
        expect(action).toContain('notification.type === "weather_alert"');
        expect(action).toContain("Review plans");
        expect(assistantPage).toContain('.eq("user_id", user.id)');
        expect(assistantPage).toContain('.eq("trip_id", resolved.trip.id)');
        expect(assistantPage).toContain('.eq("type", "weather_alert")');
    });

    it("defines own-row notification RLS and service-only job history", () => {
        const migration = readFileSync(
            resolve(
                process.cwd(),
                "supabase/migrations/20260806020203_add_weather_alert_monitoring_phase_two.sql"
            ),
            "utf8"
        );
        expect(migration).toContain(
            'create policy "Users can update own app alerts"'
        );
        expect(migration).toContain(
            'create policy "Users can view own app alerts"'
        );
        expect(migration).toContain("(select auth.uid()) = user_id");
        expect(migration).toContain(
            "revoke all on table public.weather_alert_job_runs"
        );
        expect(migration).toContain(
            "grant update (read_at, archived_at) on table public.notifications"
        );
    });

    it("keeps weather push disabled when a device enables general push", () => {
        const action = readFileSync(
            resolve(process.cwd(), "app/actions/notificationPreferences.ts"),
            "utf8"
        );
        expect(action).toContain(
            "push_enabled: notificationType !== WEATHER_NOTIFICATION_TYPE"
        );
    });

    it("contains no trip-domain mutation in scheduled alert generation", () => {
        const monitor = readFileSync(
            resolve(process.cwd(), "lib/weather/weather-alert-monitor.ts"),
            "utf8"
        );
        expect(monitor).not.toMatch(
            /\.from\("(?:trips|itinerary_items|trip_accommodations|transportation_items)"\)\s*\.update\(/
        );
    });
});
