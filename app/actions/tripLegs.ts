"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertDateRangeOrdered } from "@/lib/dateRange";

async function syncTripLegMembers({
    supabase,
    tripId,
    tripLegId,
    tripMemberIds,
    startDate,
    endDate,
    now,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tripId: string;
    tripLegId: string;
    tripMemberIds: string[];
    startDate: string;
    endDate: string;
    now: string;
}) {
    const { data: existingRows, error: existingRowsError } = await supabase
        .from("trip_member_legs")
        .select("id,trip_member_id")
        .eq("trip_id", tripId)
        .eq("trip_leg_id", tripLegId);

    if (existingRowsError) {
        console.error("Error loading existing trip leg members:", {
            message: existingRowsError.message,
            code: existingRowsError.code,
            details: existingRowsError.details,
            hint: existingRowsError.hint,
            tripId,
            tripLegId,
        });
        throw new Error("Could not update trip leg members");
    }

    const selectedMemberIds = new Set(tripMemberIds);
    const existingMembers = ((existingRows || []) as Array<{
        id: string;
        trip_member_id: string;
    }>).filter((row) => Boolean(row.id) && Boolean(row.trip_member_id));
    const existingByMemberId = new Map(
        existingMembers.map((row) => [row.trip_member_id, row])
    );

    const rowsToDelete = existingMembers
        .filter((row) => !selectedMemberIds.has(row.trip_member_id))
        .map((row) => row.id);

    if (rowsToDelete.length > 0) {
        const { error: deleteMembersError } = await supabase
            .from("trip_member_legs")
            .delete()
            .eq("trip_id", tripId)
            .eq("trip_leg_id", tripLegId)
            .in("id", rowsToDelete);

        if (deleteMembersError) {
            console.error("Error clearing trip leg members:", {
                message: deleteMembersError.message,
                code: deleteMembersError.code,
                details: deleteMembersError.details,
                hint: deleteMembersError.hint,
                tripId,
                tripLegId,
                rowsToDelete,
            });
            throw new Error("Could not update trip leg members");
        }
    }

    const rowsToUpdate = tripMemberIds
        .map((tripMemberId) => existingByMemberId.get(tripMemberId)?.id)
        .filter(Boolean) as string[];

    if (rowsToUpdate.length > 0) {
        const { error: updateMembersError } = await supabase
            .from("trip_member_legs")
            .update({
                start_date: startDate || null,
                end_date: endDate || null,
                is_joining: true,
                updated_at: now,
            })
            .eq("trip_id", tripId)
            .eq("trip_leg_id", tripLegId)
            .in("id", rowsToUpdate);

        if (updateMembersError) {
            console.error("Error updating trip leg members:", {
                message: updateMembersError.message,
                code: updateMembersError.code,
                details: updateMembersError.details,
                hint: updateMembersError.hint,
                tripId,
                tripLegId,
                rowsToUpdate,
            });
            throw new Error("Could not update trip leg members");
        }
    }

    const rowsToInsert = tripMemberIds.filter(
        (tripMemberId) => !existingByMemberId.has(tripMemberId)
    );

    if (rowsToInsert.length > 0) {
        const { error: insertMembersError } = await supabase
            .from("trip_member_legs")
            .insert(
                rowsToInsert.map((tripMemberId) => ({
                    trip_id: tripId,
                    trip_leg_id: tripLegId,
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
                tripLegId,
                rowsToInsert,
            });
            throw new Error("Could not update trip leg members");
        }
    }
}

export async function upsertTripLeg(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const tripLegId = String(formData.get("trip_leg_id") || "").trim();
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const requiresGooglePlace =
        String(formData.get("require_google_place_id") || "") === "true";
    const now = new Date().toISOString();
    const name = String(formData.get("name") || "").trim();
    const googlePlaceId = String(formData.get("google_place_id") || "").trim();
    const cityName = String(formData.get("city_name") || "").trim();
    const countryCode = String(formData.get("country_code") || "")
        .trim()
        .toUpperCase();
    const iconEmoji = String(formData.get("icon_emoji") || "").trim();
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();
    assertDateRangeOrdered(
        startDate,
        endDate,
        "Trip leg end date cannot be before the start date."
    );
    const tripMemberIds = Array.from(
        new Set(
            formData
                .getAll("trip_member_ids")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (!tripId || !name) throw new Error("Could not save trip leg");
    if (requiresGooglePlace && !tripLegId && !googlePlaceId) {
        throw new Error("Choose the destination from the Google location list.");
    }

    const payload: {
        trip_id: string;
        name: string;
        city_name: string | null;
        country_code: string | null;
        icon_emoji: string | null;
        start_date: string | null;
        end_date: string | null;
        leg_type: string;
        created_by: string;
        updated_at: string;
        google_place_id?: string | null;
    } = {
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
    if (googlePlaceId || !tripLegId) {
        payload.google_place_id = googlePlaceId || null;
    }

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

    await syncTripLegMembers({
        supabase,
        tripId,
        tripLegId: savedLeg.id,
        tripMemberIds,
        startDate,
        endDate,
        now,
    });

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

    const { data: deletedLeg, error } = await supabase
        .from("trip_legs")
        .delete()
        .eq("id", tripLegId)
        .eq("trip_id", tripId)
        .eq("leg_type", "custom")
        .select("id")
        .maybeSingle();

    if (error || !deletedLeg) {
        console.error("Error deleting trip leg:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            tripId,
            tripLegId,
        });
        throw new Error(
            error
                ? "Could not delete trip leg"
                : "Only custom trip legs can be deleted here."
        );
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}
