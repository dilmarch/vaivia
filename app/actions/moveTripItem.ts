"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type MovableTripItemType =
    | "itinerary"
    | "transportation"
    | "accommodation"
    | "idea"
    | "food";

function getRedirectPath(itemType: MovableTripItemType, targetTripId: string) {
    if (itemType === "idea") return `/trips/${targetTripId}?tab=ideas`;
    if (itemType === "food") return `/trips/${targetTripId}/food`;
    if (itemType === "accommodation") return `/trips/${targetTripId}/accommodations`;

    return `/trips/${targetTripId}`;
}

function getSafeReturnPath(value: FormDataEntryValue | null) {
    const returnPath = String(value || "").trim();

    if (!returnPath.startsWith("/")) return null;
    if (returnPath.startsWith("//")) return null;

    return returnPath;
}

async function assertTargetTripAccess({
    supabase,
    targetTripId,
    userId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    targetTripId: string;
    userId: string;
}) {
    const { data: trip } = await supabase
        .from("trips")
        .select("id,user_id")
        .eq("id", targetTripId)
        .maybeSingle();

    if ((trip as { user_id?: string | null } | null)?.user_id === userId) return;

    const { data: membership } = await supabase
        .from("trip_members")
        .select("id")
        .eq("trip_id", targetTripId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    if (!membership) {
        throw new Error("You do not have access to the target trip.");
    }
}

async function clearTripItemParticipants({
    supabase,
    tripId,
    itemType,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tripId: string;
    itemType: string;
    itemId: string;
}) {
    const { error } = await supabase
        .from("trip_item_participants")
        .delete()
        .eq("trip_id", tripId)
        .eq("item_type", itemType)
        .eq("item_id", itemId);

    if (error) {
        throw new Error(`Could not clear item participants: ${error.message}`);
    }
}

async function moveItineraryItem({
    supabase,
    currentTripId,
    targetTripId,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    currentTripId: string;
    targetTripId: string;
    itemId: string;
}) {
    await clearTripItemParticipants({
        supabase,
        tripId: currentTripId,
        itemType: "itinerary",
        itemId,
    });

    const { error } = await supabase
        .from("itinerary_items")
        .update({
            trip_id: targetTripId,
            trip_leg_id: null,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", currentTripId)
        .eq("id", itemId);

    if (error) throw new Error(`Could not move itinerary item: ${error.message}`);
}

async function moveTransportationItem({
    supabase,
    currentTripId,
    targetTripId,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    currentTripId: string;
    targetTripId: string;
    itemId: string;
}) {
    const { data: transportation, error: readError } = await supabase
        .from("transportation_items")
        .select("id,itinerary_item_id")
        .eq("trip_id", currentTripId)
        .eq("id", itemId)
        .maybeSingle();

    if (readError) {
        throw new Error(`Could not load transportation item: ${readError.message}`);
    }

    await clearTripItemParticipants({
        supabase,
        tripId: currentTripId,
        itemType: "transportation",
        itemId,
    });

    const linkedItineraryItemId =
        (transportation as { itinerary_item_id?: string | null } | null)
            ?.itinerary_item_id || null;

    if (linkedItineraryItemId) {
        const { error: itineraryError } = await supabase
            .from("itinerary_items")
            .update({
                trip_id: targetTripId,
                trip_leg_id: null,
                updated_at: new Date().toISOString(),
            })
            .eq("trip_id", currentTripId)
            .eq("id", linkedItineraryItemId);

        if (itineraryError) {
            throw new Error(
                `Could not move linked itinerary item: ${itineraryError.message}`
            );
        }
    }

    const { error } = await supabase
        .from("transportation_items")
        .update({
            trip_id: targetTripId,
            trip_leg_id: null,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", currentTripId)
        .eq("id", itemId);

    if (error) throw new Error(`Could not move transportation item: ${error.message}`);
}

async function moveAccommodation({
    supabase,
    currentTripId,
    targetTripId,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    currentTripId: string;
    targetTripId: string;
    itemId: string;
}) {
    await clearTripItemParticipants({
        supabase,
        tripId: currentTripId,
        itemType: "accommodation",
        itemId,
    });

    const { error } = await supabase
        .from("trip_accommodations")
        .update({
            trip_id: targetTripId,
            trip_leg_id: null,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", currentTripId)
        .eq("id", itemId);

    if (error) throw new Error(`Could not move stay: ${error.message}`);
}

async function moveIdea({
    supabase,
    currentTripId,
    targetTripId,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    currentTripId: string;
    targetTripId: string;
    itemId: string;
}) {
    await supabase
        .from("trip_idea_reactions")
        .delete()
        .eq("trip_id", currentTripId)
        .eq("idea_id", itemId);

    const { error } = await supabase
        .from("trip_ideas")
        .update({
            trip_id: targetTripId,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", currentTripId)
        .eq("id", itemId);

    if (error) throw new Error(`Could not move idea: ${error.message}`);
}

async function moveFoodItem({
    supabase,
    currentTripId,
    targetTripId,
    itemId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    currentTripId: string;
    targetTripId: string;
    itemId: string;
}) {
    await supabase
        .from("trip_food_reactions")
        .delete()
        .eq("trip_id", currentTripId)
        .eq("food_item_id", itemId);
    await supabase
        .from("trip_food_tried")
        .delete()
        .eq("trip_id", currentTripId)
        .eq("food_item_id", itemId);

    const { error } = await supabase
        .from("trip_food_items")
        .update({
            trip_id: targetTripId,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", currentTripId)
        .eq("id", itemId);

    if (error) throw new Error(`Could not move food item: ${error.message}`);
}

export async function moveTripItem(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const itemType = String(formData.get("item_type") || "") as MovableTripItemType;
    const itemId = String(formData.get("item_id") || "");
    const currentTripId = String(formData.get("current_trip_id") || "");
    const targetTripId = String(formData.get("target_trip_id") || "");
    const returnPath = getSafeReturnPath(formData.get("return_path"));

    if (!itemId || !currentTripId || !targetTripId || currentTripId === targetTripId) {
        throw new Error("Choose another trip to move this item to.");
    }

    await assertTargetTripAccess({ supabase, targetTripId, userId: user.id });

    if (itemType === "itinerary") {
        await moveItineraryItem({ supabase, currentTripId, targetTripId, itemId });
    } else if (itemType === "transportation") {
        await moveTransportationItem({ supabase, currentTripId, targetTripId, itemId });
    } else if (itemType === "accommodation") {
        await moveAccommodation({ supabase, currentTripId, targetTripId, itemId });
    } else if (itemType === "idea") {
        await moveIdea({ supabase, currentTripId, targetTripId, itemId });
    } else if (itemType === "food") {
        await moveFoodItem({ supabase, currentTripId, targetTripId, itemId });
    } else {
        throw new Error("This item cannot be moved yet.");
    }

    await supabase
        .from("trips")
        .update({
            countdown_target_type: null,
            countdown_target_id: null,
            countdown_target_itinerary_item_id: null,
        })
        .eq("id", currentTripId);

    revalidatePath(`/trips/${currentTripId}`);
    revalidatePath(`/trips/${targetTripId}`);
    if (returnPath) {
        revalidatePath(returnPath.split("?")[0] || `/trips/${currentTripId}`);
        redirect(returnPath);
    }

    redirect(getRedirectPath(itemType, currentTripId));
}
