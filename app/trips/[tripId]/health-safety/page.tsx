import { notFound, redirect } from "next/navigation";

import HealthSafetyAdvisories, {
    HealthSafetyHeroSummaryPresentation,
} from "@/components/health/HealthSafetyAdvisories";
import TripPageHero from "@/components/TripPageHero";
import { fetchGovernmentTravelAdvisories } from "@/lib/governmentTravelAdvisories";
import { createClient } from "@/lib/supabase/server";
import { loadTripDestinations } from "@/lib/tripDestinations";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";

type PageProps = {
    params: Promise<{ tripId: string }>;
};

export default async function TripHealthSafetyPage({ params }: PageProps) {
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
        destination: string | null;
    }>(supabase, routeParam, "id,slug,title,destination");

    if (resolved.error || !resolved.trip) notFound();
    if (resolved.shouldRedirect) {
        redirect(getTripHref(resolved.trip, "/health-safety"));
    }

    const [destinations, advisoryResult] = await Promise.all([
        loadTripDestinations({
            supabase,
            tripId: resolved.trip.id,
            legacyDestination: resolved.trip.destination,
        }),
        fetchGovernmentTravelAdvisories(),
    ]);

    return (
        <main className="vaivia-page-bg min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
            <TripPageHero
                tripId={resolved.trip.id}
                pageLabel="Health & Safety"
                revalidatePathname={`/trips/${resolved.routeSegment}/health-safety`}
                summaryContent={<HealthSafetyHeroSummaryPresentation />}
            />
            <HealthSafetyAdvisories
                destinations={destinations}
                advisoryResult={advisoryResult}
            />
        </main>
    );
}
