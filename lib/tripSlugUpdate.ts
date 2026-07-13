import type { SupabaseClient } from "@supabase/supabase-js";
import { slugifyTripTitle } from "@/lib/tripRoutes";

type TripSlugPayload = {
    slug?: string;
};

type SupabaseErrorLike = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

export function isTripSlugConflictError(error: SupabaseErrorLike | null | undefined) {
    const text = `${error?.message || ""} ${error?.details || ""} ${
        error?.hint || ""
    }`.toLowerCase();

    return (
        error?.code === "23505" ||
        text.includes("trip slug already exists") ||
        text.includes("trips_owner_active_slug_unique_idx") ||
        text.includes("trips_slug_format_check")
    );
}

export function getTripSlugErrorMessage(error: SupabaseErrorLike | null | undefined) {
    if (!error) return "Could not update trip.";

    if (isTripSlugConflictError(error)) {
        if (
            `${error.message || ""} ${error.details || ""}`
                .toLowerCase()
                .includes("format")
        ) {
            return "Trip links can only use lowercase letters, numbers, and hyphens.";
        }

        return "That trip link is already in use. Choose a unique slug.";
    }

    return "Could not update trip.";
}

export async function addValidatedTripSlugToPayload<TPayload extends TripSlugPayload>(
    supabase: SupabaseClient,
    payload: TPayload,
    {
        tripId,
        submittedSlug,
        fallbackTitle,
    }: {
        tripId: string;
        submittedSlug: string;
        fallbackTitle: string;
    }
) {
    const requestedSlug = slugifyTripTitle(submittedSlug || fallbackTitle);

    const { data: availableSlug, error } = await supabase.rpc(
        "get_available_trip_slug",
        {
            base_slug: requestedSlug,
            excluded_trip_id: tripId,
        }
    );

    if (error) {
        console.error("Error checking edited trip slug:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            requestedSlug,
        });
        throw new Error("Could not check whether that trip link is available.");
    }

    if (typeof availableSlug === "string" && availableSlug !== requestedSlug) {
        throw new Error("That trip link is already in use. Choose a unique slug.");
    }

    payload.slug = requestedSlug;
    return payload;
}
