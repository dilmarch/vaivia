import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import TripsIndexClient from "@/components/TripsIndexClient";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import type { DashboardTrip } from "@/components/TripDashboardClient";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
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

export const metadata: Metadata = {
    title: "My Trips – VAIVIA",
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

async function deleteTrip(formData: FormData) {
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
        .select("id")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        console.error("Error finding trip to delete:", {
            message: tripError?.message,
            code: tripError?.code,
            details: tripError?.details,
            hint: tripError?.hint,
            tripId,
        });
        throw new Error(
            `Could not delete trip: ${
                tripError?.message ?? "Trip was not found"
            }`
        );
    }

    const { count: activeMemberCount, error: memberCountError } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "active");

    if (!memberCountError && (activeMemberCount || 0) > 1) {
        throw new Error("Shared trips cannot be deleted. Leave the trip instead.");
    }

    const { error: itineraryError } = await supabase
        .from("itinerary_items")
        .delete()
        .eq("trip_id", tripId);

    if (itineraryError) {
        console.error("Error deleting trip itinerary items:", {
            message: itineraryError.message,
            code: itineraryError.code,
            details: itineraryError.details,
            hint: itineraryError.hint,
            tripId,
        });
        throw new Error(
            `Could not delete trip itinerary items: ${
                itineraryError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        throw new Error(
            `Could not delete trip: ${error.message ?? "Unknown Supabase error"}`
        );
    }

    redirect("/trips");
}

async function TripsIndexPageContent() {
    await connection();

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { trips, error } = await loadActiveMemberTrips(supabase, user.id);

    if (error) {
        console.error("Error loading trips page:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId: user.id,
        });
    }

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-16 pt-24 text-white md:px-8 md:pt-28">
            <TripsIndexClient
                trips={(trips || []) as DashboardTrip[]}
                currentUserId={user.id}
                updateTripAction={updateTrip}
                deleteTripAction={deleteTrip}
            />
        </main>
    );
}

export default function TripsIndexPage() {
    return (
        <Suspense
            fallback={
                <DelayedVaiviaLoadingScreen
                    title="Preparing your trips"
                    subtitle="Getting your upcoming adventures polished and ready."
                />
            }
        >
            <TripsIndexPageContent />
        </Suspense>
    );
}
