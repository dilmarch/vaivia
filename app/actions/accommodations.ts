"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
} from "@/lib/accommodations";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import { createClient } from "@/lib/supabase/server";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";
import { resolveTripLegIdForLocation } from "@/lib/tripLegs";

export async function createAccommodation(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const payload = buildAccommodationPayload(formData, tripId);
    payload.trip_leg_id = await resolveTripLegIdForLocation({
        supabase,
        tripId,
        explicitTripLegId: payload.trip_leg_id,
        city: payload.city,
        region: payload.region,
        country: payload.country,
        itemDate: payload.check_in_date,
    });
    const validationErrors = validateAccommodationPayload(payload);

    if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(" "));
    }

    const { data, error } = await supabase
        .from("trip_accommodations")
        .insert(payload)
        .select("id")
        .single();

    if (error) {
        console.error("Error creating accommodation:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
            userId: user.id,
        });
        throw new Error(
            `Could not create accommodation: ${getAccommodationErrorMessage(
                error.message
            )}`
        );
    }

    const accommodationId =
        typeof (data as { id?: unknown } | null)?.id === "string"
            ? ((data as { id: string }).id)
            : "";

    if (accommodationId) {
        await syncAutoBudgetExpense({
            supabase,
            userId: user.id,
            tripId,
            sourceType: "accommodation",
            sourceId: accommodationId,
            amount: payload.cost,
            currency: payload.currency,
            expenseDate: payload.check_in_date,
            description: payload.hotel_name,
            formData,
        });

        const participantsError = await replaceTripItemParticipantsFromForm({
            tripId,
            itemType: "accommodation",
            itemId: accommodationId,
            formData,
        });

        if (participantsError) {
            console.error("Error creating accommodation participants:", {
                message: participantsError.message,
                code: participantsError.code,
                details: participantsError.details,
                hint: participantsError.hint,
                tripId,
                accommodationId,
            });
            throw new Error(
                `Could not create accommodation participants: ${
                    participantsError.message ?? "Unknown Supabase error"
                }`
            );
        }
    }

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/accommodations`);
}
