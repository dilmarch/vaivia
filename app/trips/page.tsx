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
    buildTripCoverPayloadFromForm,
    cleanupReplacedTripCover,
    deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import {
    addValidatedTripSlugToPayload,
    getTripSlugErrorMessage,
    isTripSlugConflictError,
} from "@/lib/tripSlugUpdate";
import { assertDateRangeOrdered } from "@/lib/dateRange";
import { syncTripDestinationsFromForm } from "@/lib/tripDestinations";

export const metadata: Metadata = {
    title: "My Trips – VAIVIA",
};

type PageProps = {
    searchParams?: Promise<{
        filter?: string;
    }>;
};

type TripUpdatePayload = {
    title: string;
    slug?: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    notes: string;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
};

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("cover_image_url") ||
                message.includes("cover_image_source") ||
                message.includes("cover_image_storage_path") ||
                message.includes("cover_image_unsplash_id") ||
                message.includes("cover_image_photographer") ||
                message.includes("schema cache")))
    );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
    const {
        cover_image_url,
        cover_image_source,
        cover_image_storage_path,
        cover_image_unsplash_id,
        cover_image_photographer_name,
        cover_image_photographer_url,
        ...fallbackPayload
    } = payload;

    void cover_image_url;
    void cover_image_source;
    void cover_image_storage_path;
    void cover_image_unsplash_id;
    void cover_image_photographer_name;
    void cover_image_photographer_url;

    return fallbackPayload;
}

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
    const title = String(formData.get("title") || "");
    const slug = String(formData.get("slug") || "");
    const destination = String(formData.get("destination") || "");
    const startDate = String(formData.get("start_date") || "");
    const endDate = String(formData.get("end_date") || "");
    const notes = String(formData.get("notes") || "");
    assertDateRangeOrdered(
        startDate,
        endDate,
        "Trip end date cannot be before its start date."
    );
    const { data: existingTripCover, error: existingTripCoverError } = await supabase
        .from("trips")
        .select("id,cover_image_source,cover_image_storage_path")
        .eq("id", tripId)
        .maybeSingle();

    if (existingTripCoverError || !existingTripCover) {
        console.error("Error loading existing trip cover:", existingTripCoverError);
        throw new Error("Could not update trip");
    }

    let coverPayload: Partial<TripUpdatePayload> = {};
    let uploadedStoragePath: string | null | undefined = null;
    try {
        const coverResult = await buildTripCoverPayloadFromForm({
            supabase,
            userId: user.id,
            tripId,
            formData,
        });
        coverPayload = coverResult.payload;
        uploadedStoragePath = coverResult.uploadedStoragePath;
    } catch (error) {
        console.error("Error preparing trip cover:", error);
        throw error;
    }

    const payload: TripUpdatePayload = {
        title,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        notes,
        ...coverPayload,
    };
    await addValidatedTripSlugToPayload(supabase, payload, {
        tripId,
        submittedSlug: slug,
        fallbackTitle: title,
    });

    let { error } = await supabase
        .from("trips")
        .update(payload)
        .eq("id", tripId);

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn(
            "Optional trip cover column is missing. Falling back to legacy trip fields.",
            error
        );
        ({ error } = await supabase
            .from("trips")
            .update(removeTripCoverColumn(payload))
            .eq("id", tripId));
    }

    if (error) {
        await deleteOwnedTripCoverObject({
            supabase,
            userId: user.id,
            storagePath: uploadedStoragePath,
        });
        console.error("Error updating trip:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
            tripId,
        });
        if (isTripSlugConflictError(error)) {
            throw new Error(getTripSlugErrorMessage(error));
        }
        throw new Error(
            `Could not update trip: ${error.message ?? "Unknown Supabase error"}`
        );
    }

    await syncTripDestinationsFromForm({ supabase, tripId, formData });

    await cleanupReplacedTripCover({
        supabase,
        userId: user.id,
        oldCover: existingTripCover,
        nextPayload: coverPayload,
    });

    await supabase.rpc("notify_trip_members", {
        target_trip_id: tripId,
        notification_type: "trip_updated",
        notification_title: "Trip updated",
        notification_body: "A trip detail was updated.",
        notification_metadata: {
            changedArea: "trip",
        },
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

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,user_id")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error finding trip to archive:", {
            message: tripError?.message,
            code: tripError?.code,
            details: tripError?.details,
            hint: tripError?.hint,
            tripId,
        });
        throw new Error(
            `Could not archive trip: ${
                tripError?.message ?? "Trip was not found"
            }`
        );
    }

    const { error } = await supabase
        .from("trips")
        .update({
            archived_at: new Date().toISOString(),
            archived_reason: "user_archived",
        })
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error archiving trip:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        throw new Error(
            `Could not archive trip: ${error.message ?? "Unknown Supabase error"}`
        );
    }

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
