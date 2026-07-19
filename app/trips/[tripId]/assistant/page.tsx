import { notFound, redirect } from "next/navigation";
import TripAssistant from "@/components/assistant/TripAssistant";
import { createClient } from "@/lib/supabase/server";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";

type PageProps = {
    params: Promise<{ tripId: string }>;
};

export default async function TripAssistantPage({ params }: PageProps) {
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
        redirect(getTripHref(resolved.trip, "/assistant"));
    }

    return (
        <main className="h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--vaivia-neon-rgb),0.08),transparent_35%),#030712] px-3 pb-[calc(5.5rem+var(--safe-area-bottom))] pt-[calc(4.5rem+var(--safe-area-top))] sm:px-5 md:pb-5 md:pl-28 md:pt-5">
            <TripAssistant
                key={resolved.trip.id}
                tripId={resolved.trip.id}
                tripTitle={resolved.trip.title}
            />
        </main>
    );
}
