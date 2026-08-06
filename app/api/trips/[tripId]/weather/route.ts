import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveTripRouteParam } from "@/lib/tripRoutes";
import {
    resolveWeatherUnitsPreference,
    type WeatherWidgetResponse,
} from "@/lib/weather/contracts";
import { getGoogleWeatherProvider } from "@/lib/weather/google-weather";

export const runtime = "nodejs";
export const maxDuration = 15;

type RouteContext = { params: Promise<{ tripId: string }> };

function response(
    body: WeatherWidgetResponse | { error: string },
    status = 200,
    cacheControl = "private, no-store"
) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": cacheControl },
    });
}

function isCoordinate(value: unknown, minimum: number, maximum: number) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum;
}

export async function GET(request: Request, context: RouteContext) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return response({ error: "Unauthorized" }, 401);
    }

    const { tripId: routeParam } = await context.params;
    const resolvedTrip = await resolveTripRouteParam<{
        id: string;
        slug: string;
        destination: string | null;
    }>(supabase, routeParam, "id,slug,destination");

    if (resolvedTrip.error || !resolvedTrip.trip) {
        return response({ error: "Trip not found" }, 404);
    }

    const { data: destination, error: destinationError } = await supabase
        .from("trip_destinations")
        .select("label,latitude,longitude,sort_order")
        .eq("trip_id", resolvedTrip.trip.id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (destinationError) {
        console.warn("Weather destination lookup failed", {
            code: destinationError.code,
            tripId: resolvedTrip.trip.id,
        });
        return response(
            { status: "error", code: "weather_unavailable" },
            500
        );
    }

    const destinationName =
        destination?.label || resolvedTrip.trip.destination || "Trip destination";
    if (
        !destination ||
        !isCoordinate(destination.latitude, -90, 90) ||
        !isCoordinate(destination.longitude, -180, 180)
    ) {
        return response({
            status: "unavailable",
            destinationName,
            reason: "missing_coordinates",
        });
    }

    // VAIVIA has no temperature-unit preference yet. Keeping this resolution
    // explicit makes a future user preference a route-only change.
    const units = resolveWeatherUnitsPreference(null);
    const result = await getGoogleWeatherProvider().getForecast({
        latitude: destination.latitude,
        longitude: destination.longitude,
        units,
        languageCode: "en",
        days: 5,
        signal: request.signal,
    });

    if (result.status === "success") {
        return response(
            {
                status: "success",
                destinationName,
                forecast: result.forecast,
            },
            200,
            "private, max-age=300, stale-while-revalidate=300"
        );
    }

    if (result.status === "unavailable") {
        return response({
            status: "unavailable",
            destinationName,
            reason: result.reason,
        });
    }

    console.warn("Google Weather request failed", {
        reason: result.reason,
        tripId: resolvedTrip.trip.id,
    });
    return response(
        {
            status: "error",
            code:
                result.reason === "timeout"
                    ? "weather_timeout"
                    : "weather_unavailable",
        },
        result.reason === "timeout" ? 504 : 503
    );
}
