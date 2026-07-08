"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
} from "@/lib/accommodations";
import { createClient } from "@/lib/supabase/server";

export async function createAccommodation(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const payload = buildAccommodationPayload(formData, tripId);
    const validationErrors = validateAccommodationPayload(payload);

    if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(" "));
    }

    const { error } = await supabase.from("trip_accommodations").insert(payload);

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

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/accommodations`);
}
