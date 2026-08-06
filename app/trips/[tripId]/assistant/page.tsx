import { notFound, redirect } from "next/navigation";
import TripAssistant from "@/components/assistant/TripAssistant";
import { isUuid } from "@/lib/ai/assistant-contract";
import { createClient } from "@/lib/supabase/server";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";
import {
    buildWeatherAssistantPrompt,
    getAffectedWeatherPlanIds,
} from "@/lib/weather/assistant-weather-context";

type PageProps = {
    params: Promise<{ tripId: string }>;
    searchParams?: Promise<{ weatherAlert?: string }>;
};

export default async function TripAssistantPage({ params, searchParams }: PageProps) {
    const { tripId: routeParam } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const resolved = await resolveTripRouteParam<{
        id: string;
        slug: string;
        title: string;
    }>(supabase, routeParam, "id,slug,title");

    if (resolved.error || !resolved.trip) notFound();
    if (resolved.shouldRedirect) {
        const weatherAlert = (await searchParams)?.weatherAlert;
        const query = isUuid(weatherAlert)
            ? `?weatherAlert=${encodeURIComponent(weatherAlert)}`
            : "";
        redirect(`${getTripHref(resolved.trip, "/assistant")}${query}`);
    }

    const weatherAlertId = (await searchParams)?.weatherAlert;
    let initialPrompt = "";
    let initialContextLabel = "";
    if (isUuid(weatherAlertId)) {
        const { data: notification } = await supabase
            .from("notifications")
            .select("id,type,trip_id,user_id,metadata")
            .eq("id", weatherAlertId)
            .eq("user_id", user.id)
            .eq("trip_id", resolved.trip.id)
            .eq("type", "weather_alert")
            .maybeSingle();
        if (notification) {
            const affectedIds = getAffectedWeatherPlanIds(
                notification.metadata
            );
            const [itineraryResult, accommodationResult, transportationResult] =
                affectedIds.length > 0
                    ? await Promise.all([
                          supabase
                              .from("itinerary_items")
                              .select("id,title")
                              .eq("trip_id", resolved.trip.id)
                              .in("id", affectedIds),
                          supabase
                              .from("trip_accommodations")
                              .select("id,hotel_name")
                              .eq("trip_id", resolved.trip.id)
                              .in("id", affectedIds),
                          supabase
                              .from("transportation_items")
                              .select("id,title,transport_type")
                              .eq("trip_id", resolved.trip.id)
                              .in("id", affectedIds),
                      ])
                    : [
                          { data: [], error: null },
                          { data: [], error: null },
                          { data: [], error: null },
                      ];
            const affectedPlanLabels = [
                ...(itineraryResult.data || []).map((item) => item.title),
                ...(accommodationResult.data || []).map(
                    (item) => item.hotel_name
                ),
                ...(transportationResult.data || []).map(
                    (item) => item.title || item.transport_type
                ),
            ];
            initialPrompt = buildWeatherAssistantPrompt({
                metadata: notification.metadata,
                affectedPlanLabels,
            });
            initialContextLabel = "Weather alert review";
        }
    }

    return (
        <main className="vaivia-page-bg h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--vaivia-neon-rgb),0.08),transparent_35%),#030712] px-3 pb-[calc(5.5rem+var(--safe-area-bottom))] pt-[calc(4.5rem+var(--safe-area-top))] sm:px-5 md:pb-5 md:pl-28 md:pt-5">
            <TripAssistant
                key={resolved.trip.id}
                tripId={resolved.trip.id}
                tripTitle={resolved.trip.title}
                initialPrompt={initialPrompt || undefined}
                initialContextLabel={initialContextLabel || undefined}
            />
        </main>
    );
}
