"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    type AccommodationActionResult,
} from "@/lib/accommodations";
import {
    createStayForUser,
    StayMutationError,
    stayMutationInputFromFormData,
} from "@/lib/accommodations/mutations";
import { createClient } from "@/lib/supabase/server";

export async function createAccommodation(
    formData: FormData
): Promise<AccommodationActionResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    try {
        await createStayForUser({
            supabase,
            userId: user.id,
            tripId,
            input: stayMutationInputFromFormData(formData),
        });
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof StayMutationError
                    ? error.message
                    : "Could not create stay.",
        };
    }

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/accommodations`);
    return { ok: true };
}
