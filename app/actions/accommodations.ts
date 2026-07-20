"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
    type AccommodationActionResult,
} from "@/lib/accommodations";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import { createClient } from "@/lib/supabase/server";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";

export async function createAccommodation(
    formData: FormData
): Promise<AccommodationActionResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const payload = buildAccommodationPayload(formData, tripId);
    const validationErrors = validateAccommodationPayload(payload);

    if (validationErrors.length > 0) {
        return { ok: false, error: validationErrors.join(" ") };
    }

    const { data, error } = await supabase
        .from("trip_accommodations")
        .insert(payload)
        .select("id")
        .single();

    if (error) {
        console.error("Error creating stay:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
            userId: user.id,
        });
        return {
            ok: false,
            error: `Could not create stay: ${getAccommodationErrorMessage(
                error.message
            )}`,
        };
    }

    const accommodationId =
        typeof (data as { id?: unknown } | null)?.id === "string"
            ? ((data as { id: string }).id)
            : "";

    if (accommodationId) {
        const participantsError =
            payload.is_planning_option || payload.audience_mode === "everyone"
                ? null
                : await replaceTripItemParticipantsFromForm({
                      tripId,
                      itemType: "accommodation",
                      itemId: accommodationId,
                      formData,
                  });

        if (participantsError) {
            console.error("Error creating stay participants:", {
                message: participantsError.message,
                code: participantsError.code,
                details: participantsError.details,
                hint: participantsError.hint,
                tripId,
                accommodationId,
            });

            const { error: rollbackError } = await supabase
                .from("trip_accommodations")
                .delete()
                .eq("id", accommodationId)
                .eq("trip_id", tripId);

            if (rollbackError) {
                console.error("Error rolling back incomplete stay:", {
                    message: rollbackError.message,
                    code: rollbackError.code,
                    details: rollbackError.details,
                    hint: rollbackError.hint,
                    tripId,
                    accommodationId,
                });
            }

            return {
                ok: false,
                error: "Could not save who this stay is for. The stay was not created.",
            };
        }

        if (
            !payload.is_planning_option &&
            payload.cost !== null &&
            payload.cost !== undefined
        ) {
            try {
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
            } catch (budgetError) {
                console.error("Stay created without budget sync:", {
                    message:
                        budgetError instanceof Error
                            ? budgetError.message
                            : String(budgetError),
                    tripId,
                    accommodationId,
                    userId: user.id,
                });
            }
        }
    }

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/accommodations`);
    return { ok: true };
}
