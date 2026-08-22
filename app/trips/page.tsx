import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import TripsIndexClient from "@/components/TripsIndexClient";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import type { DashboardTrip } from "@/components/TripDashboardClient";
import { loadActiveMemberTrips, loadArchivedMemberTrips } from "@/lib/sharedTrips";
import { createClient } from "@/lib/supabase/server";
import {
    setTripArchivedForOwner,
    updateTripForUser,
} from "@/lib/trips/lifecycle";

export const metadata: Metadata = {
    title: "My Trips – VAIVIA",
};

type PageProps = {
    searchParams?: Promise<{
        filter?: string;
    }>;
};

type DashboardPlanning = NonNullable<DashboardTrip["planning"]>;
type DashboardAccommodationSummary = NonNullable<
    DashboardPlanning["accommodations"]
>[number];
type DashboardTransportationSummary = NonNullable<
    DashboardPlanning["transportation"]
>[number];

async function addTripsPlanningData(
    supabase: Awaited<ReturnType<typeof createClient>>,
    trips: DashboardTrip[]
) {
    const tripIds = trips.map((trip) => trip.id).filter(Boolean);

    if (tripIds.length === 0) return trips;

    const [accommodationsResult, transportationResult] = await Promise.all([
        supabase
            .from("trip_accommodations")
            .select(
                "id,trip_id,check_in_date,check_out_date,status,city,region,country"
            )
            .eq("is_planning_option", false)
            .in("trip_id", tripIds),
        supabase
            .from("transportation_items")
            .select(
                "id,trip_id,departure_location,arrival_location,status,title,transport_type"
            )
            .in("trip_id", tripIds),
    ]);

    if (accommodationsResult.error) {
        console.warn("Could not load trips page stay summaries:", {
            message: accommodationsResult.error.message,
            code: accommodationsResult.error.code,
            details: accommodationsResult.error.details,
            hint: accommodationsResult.error.hint,
        });
    }

    if (transportationResult.error) {
        console.warn("Could not load trips page transportation summaries:", {
            message: transportationResult.error.message,
            code: transportationResult.error.code,
            details: transportationResult.error.details,
            hint: transportationResult.error.hint,
        });
    }

    const accommodationsByTripId = new Map<
        string,
        DashboardAccommodationSummary[]
    >();
    const transportationByTripId = new Map<
        string,
        DashboardTransportationSummary[]
    >();

    (
        (accommodationsResult.data || []) as Array<
            DashboardAccommodationSummary & { trip_id?: string | null }
        >
    ).forEach((stay) => {
        if (!stay.trip_id) return;
        const stays = accommodationsByTripId.get(stay.trip_id) || [];
        stays.push(stay);
        accommodationsByTripId.set(stay.trip_id, stays);
    });

    (
        (transportationResult.data || []) as Array<
            DashboardTransportationSummary & { trip_id?: string | null }
        >
    ).forEach((item) => {
        if (!item.trip_id) return;
        const items = transportationByTripId.get(item.trip_id) || [];
        items.push(item);
        transportationByTripId.set(item.trip_id, items);
    });

    return trips.map((trip) => ({
        ...trip,
        planning: {
            accommodations: accommodationsByTripId.get(trip.id) || [],
            transportation: transportationByTripId.get(trip.id) || [],
        },
    }));
}

async function updateTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = String(formData.get("trip_id") || "");
    await updateTripForUser({
        supabase,
        userId: user.id,
        tripId,
        input: {
            title: String(formData.get("title") || ""),
            slug: String(formData.get("slug") || ""),
            destination: String(formData.get("destination") || ""),
            startDate: String(formData.get("start_date") || ""),
            endDate: String(formData.get("end_date") || ""),
            notes: String(formData.get("notes") || ""),
        },
        coverFormData: formData,
    });

    redirect("/trips");
}

async function archiveTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = String(formData.get("trip_id") || "");

    await setTripArchivedForOwner({ supabase, userId: user.id, tripId, archived: true });

    redirect("/trips?filter=archive");
}

async function TripsIndexPageContent({ searchParams }: PageProps) {
    await connection();
    const resolvedSearchParams = searchParams ? await searchParams : {};

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { trips: activeTrips, error } = await loadActiveMemberTrips(
        supabase,
        user.id
    );
    const { trips: archivedTrips, error: archivedError } =
        await loadArchivedMemberTrips(supabase, user.id);

    if (error) {
        console.error("Error loading trips page:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId: user.id,
        });
    }
    if (archivedError) {
        console.error("Error loading archived trips page:", {
            message: archivedError.message,
            code: archivedError.code,
            details: archivedError.details,
            hint: archivedError.hint,
            userId: user.id,
        });
    }

    const tripsById = new Map<string, DashboardTrip>();
    ([...(activeTrips || []), ...(archivedTrips || [])] as DashboardTrip[]).forEach(
        (trip) => {
            if (trip.id) tripsById.set(trip.id, trip);
        }
    );

    const tripsWithPlanning = await addTripsPlanningData(
        supabase,
        Array.from(tripsById.values())
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-16 pt-24 text-white md:px-8 md:pt-28">
            <TripsIndexClient
                trips={tripsWithPlanning}
                currentUserId={user.id}
                updateTripAction={updateTrip}
                deleteTripAction={archiveTrip}
                initialFilter={
                    resolvedSearchParams.filter === "archive"
                        ? "archive"
                        : undefined
                }
            />
        </main>
    );
}

export default function TripsIndexPage({ searchParams }: PageProps) {
    return (
        <Suspense
            fallback={
                <DelayedVaiviaLoadingScreen
                    title="Preparing your trips"
                    subtitle="Getting your upcoming adventures polished and ready."
                />
            }
        >
            <TripsIndexPageContent searchParams={searchParams} />
        </Suspense>
    );
}
