import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service";
import { getGoogleWeatherAlertProvider } from "@/lib/weather/google-weather-alerts";
import {
    processWeatherAlertRun,
    SupabaseWeatherAlertMonitorRepository,
    WEATHER_MONITOR_TRIP_LIMIT,
} from "@/lib/weather/weather-alert-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

function constantTimeEqual(left: string, right: string) {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
}

export function isWeatherCronAuthorized(
    request: Request,
    expectedSecret = process.env.WEATHER_CRON_SECRET?.trim() || ""
) {
    if (!expectedSecret) return false;
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return Boolean(
        match?.[1] && constantTimeEqual(match[1].trim(), expectedSecret)
    );
}

export async function POST(request: Request) {
    if (!isWeatherCronAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startedAt = performance.now();
    try {
        const repository = new SupabaseWeatherAlertMonitorRepository(
            createServiceRoleClient()
        );
        const result = await processWeatherAlertRun({
            repository,
            provider: getGoogleWeatherAlertProvider(),
            tripLimit: WEATHER_MONITOR_TRIP_LIMIT,
        });
        console.info("Weather alert monitor completed", {
            durationMs: Math.round(performance.now() - startedAt),
            tripsConsidered: result.tripsConsidered,
            tripsProcessed: result.tripsProcessed,
            locationsChecked: result.locationsChecked,
            notificationsCreated: result.notificationsCreated,
            duplicatesSkipped: result.duplicatesSkipped,
            errors: result.errors,
            skippedConcurrentRun: result.skippedConcurrentRun,
        });
        return NextResponse.json(result, {
            status: result.ok || result.skippedConcurrentRun ? 200 : 207,
            headers: { "Cache-Control": "no-store" },
        });
    } catch {
        console.error("Weather alert monitor failed", {
            durationMs: Math.round(performance.now() - startedAt),
            code: "weather_monitor_failed",
        });
        return NextResponse.json(
            { ok: false, error: "Weather monitor failed" },
            { status: 500 }
        );
    }
}
