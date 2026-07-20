import { ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import HealthSafetyAdvisories from "@/components/health/HealthSafetyAdvisories";
import TripPageHero from "@/components/TripPageHero";
import { fetchGovernmentTravelAdvisories } from "@/lib/governmentTravelAdvisories";
import { createClient } from "@/lib/supabase/server";
import { loadTripDestinations } from "@/lib/tripDestinations";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";

type PageProps = {
    params: Promise<{ tripId: string }>;
};

function HealthSafetyHeroSummary() {
    return (
        <div className="flex h-30 w-28 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-xl shadow-black/20 sm:h-32 sm:w-32">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/70 text-lime-200 ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] sm:h-12 sm:w-12">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="text-center text-xs font-black leading-tight text-slate-300">
                Official guidance
            </div>
        </div>
    );
}

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
                summaryContent={<HealthSafetyHeroSummary />}
            />
            <HealthSafetyAdvisories
                destinations={destinations}
                advisoryResult={advisoryResult}
            />
        </main>
    );
}
