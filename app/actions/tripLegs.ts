"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function upsertTripLeg(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const tripLegId = String(formData.get("trip_leg_id") || "").trim();
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const now = new Date().toISOString();
    const name = String(formData.get("name") || "").trim();
    const cityName = String(formData.get("city_name") || "").trim();
    const countryCode = String(formData.get("country_code") || "")
        .trim()
        .toUpperCase();
    const iconEmoji = String(formData.get("icon_emoji") || "").trim();
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();
    const tripMemberIds = Array.from(
        new Set(
            formData
                .getAll("trip_member_ids")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (!tripId || !name) throw new Error("Could not save trip leg");

    const payload = {
        trip_id: tripId,
        name,
        city_name: cityName || null,
        country_code: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
        icon_emoji: iconEmoji || null,
        start_date: startDate || null,
        end_date: endDate || null,
        leg_type: "custom",
        created_by: user.id,
        updated_at: now,
    };

    const { data: savedLeg, error } = tripLegId
        ? await supabase
              .from("trip_legs")
              .update(payload)
              .eq("id", tripLegId)
              .eq("trip_id", tripId)
              .select("id")
              .single()
        : await supabase
              .from("trip_legs")
              .insert(payload)
              .select("id")
              .single();

    if (error || !savedLeg?.id) {
        console.error("Error saving trip leg:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            payload,
        });
        throw new Error(
            `Could not save trip leg: ${error?.message ?? "Unknown Supabase error"}`
        );
    }

    const { error: deleteMembersError } = await supabase
        .from("trip_member_legs")
        .delete()
        .eq("trip_id", tripId)
        .eq("trip_leg_id", savedLeg.id);

    if (deleteMembersError) {
        console.error("Error clearing trip leg members:", deleteMembersError);
        throw new Error("Could not update trip leg members");
    }

    if (tripMemberIds.length > 0) {
        const { error: insertMembersError } = await supabase
            .from("trip_member_legs")
            .insert(
                tripMemberIds.map((tripMemberId) => ({
                    trip_id: tripId,
                    trip_leg_id: savedLeg.id,
                    trip_member_id: tripMemberId,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    is_joining: true,
                    updated_at: now,
                }))
            );

        if (insertMembersError) {
            console.error("Error saving trip leg members:", {
                message: insertMembersError.message,
                code: insertMembersError.code,
                details: insertMembersError.details,
                hint: insertMembersError.hint,
                tripId,
                tripLegId: savedLeg.id,
                tripMemberIds,
            });
            throw new Error("Could not update trip leg members");
        }
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

export async function deleteTripLeg(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const tripLegId = String(formData.get("trip_leg_id") || "").trim();
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    if (!tripId || !tripLegId) throw new Error("Could not delete trip leg");

    const { error } = await supabase
        .from("trip_legs")
        .delete()
        .eq("id", tripLegId)
        .eq("trip_id", tripId)
        .eq("leg_type", "custom");

    if (error) {
        console.error("Error deleting trip leg:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            tripLegId,
        });
        throw new Error("Could not delete trip leg");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}
