import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { moveTripItem } from "@/app/actions/moveTripItem";
import FoodPageClient from "@/components/FoodPageClient";
import TripPageHero from "@/components/TripPageHero";
import { getMoveTargetTrips } from "@/lib/tripMove";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { createClient } from "@/lib/supabase/server";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";
import {
    FOOD_REACTION_TYPES,
    FOOD_REACTION_VALUES,
    normalizeFoodMealCategories,
    normalizeFoodReaction,
    normalizeTripFoodItem,
    type FoodReactionSummary,
    type TripFoodItem,
    type TripFoodReactionRecord,
    type TripFoodTriedRecord,
} from "@/lib/tripFood";
import type { IdeaReactionProfile } from "@/lib/tripIdeas";

type PageProps = {
    params: Promise<{ tripId: string }>;
    searchParams: Promise<{ tab?: string }>;
};

type FoodItemPayload = {
    trip_id: string;
    item_type: "place" | "food";
    name: string;
    description: string | null;
    region: string | null;
    personal_note: string | null;
    google_place_id: string | null;
    formatted_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    primary_place_type: string | null;
    place_types: string[];
    business_status: string | null;
    regular_opening_hours: Record<string, unknown> | null;
    website_url: string | null;
    phone_number: string | null;
    google_maps_url: string | null;
    facebook_url: string | null;
    instagram_url: string | null;
    meal_categories: string[];
};

function nullableString(value: FormDataEntryValue | null) {
    const nextValue = String(value || "").trim();
    return nextValue || null;
}

function nullableNumber(value: FormDataEntryValue | null) {
    const nextValue = String(value || "").trim();
    if (!nextValue) return null;

    const numberValue = Number(nextValue);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeUrl(value: FormDataEntryValue | null) {
    const nextValue = nullableString(value);
    if (!nextValue) return null;

    return /^https?:\/\//i.test(nextValue) ? nextValue : `https://${nextValue}`;
}

function nullableJsonObject(value: FormDataEntryValue | null) {
    const nextValue = nullableString(value);
    if (!nextValue) return null;

    try {
        const parsedValue = JSON.parse(nextValue);
        return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
            ? (parsedValue as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function getFoodPayload(formData: FormData): FoodItemPayload {
    const itemType = formData.get("item_type") === "food" ? "food" : "place";
    const mealCategories = normalizeFoodMealCategories(
        formData.getAll("meal_categories")
    );
    const name = nullableString(formData.get("name")) || "";

    return {
        trip_id: String(formData.get("trip_id") || ""),
        item_type: itemType,
        name,
        description: nullableString(formData.get("description")),
        region: nullableString(formData.get("region")),
        personal_note: nullableString(formData.get("personal_note")),
        google_place_id: nullableString(formData.get("google_place_id")),
        formatted_address: nullableString(formData.get("formatted_address")),
        location_lat: nullableNumber(formData.get("location_lat")),
        location_lng: nullableNumber(formData.get("location_lng")),
        primary_place_type: nullableString(formData.get("primary_place_type")),
        place_types: formData
            .getAll("place_types")
            .map((value) => String(value).trim())
            .filter(Boolean),
        business_status: nullableString(formData.get("business_status")),
        regular_opening_hours: nullableJsonObject(
            formData.get("regular_opening_hours")
        ),
        website_url: normalizeUrl(formData.get("website_url")),
        phone_number: nullableString(formData.get("phone_number")),
        google_maps_url: normalizeUrl(formData.get("google_maps_url")),
        facebook_url: normalizeUrl(formData.get("facebook_url")),
        instagram_url: normalizeUrl(formData.get("instagram_url")),
        meal_categories: mealCategories,
    };
}

function getFoodReturnPath(formData: FormData, fallbackPath: string) {
    const returnTo = String(formData.get("return_to") || "").trim();

    if (
        returnTo.startsWith("/trips/") &&
        !returnTo.startsWith("//") &&
        !returnTo.includes("://") &&
        !/[\r\n]/.test(returnTo)
    ) {
        return returnTo;
    }

    return fallbackPath;
}

function attachFoodMetadata({
    items,
    reactions,
    triedRows,
    profilesById,
    currentUserId,
}: {
    items: TripFoodItem[];
    reactions: TripFoodReactionRecord[];
    triedRows: TripFoodTriedRecord[];
    profilesById: Map<string, IdeaReactionProfile>;
    currentUserId: string;
}) {
    const reactionsByFoodId = new Map<string, TripFoodReactionRecord[]>();
    const triedByFoodId = new Map<string, TripFoodTriedRecord[]>();

    reactions.forEach((reaction) => {
        const normalizedReaction = normalizeFoodReaction(reaction.reaction);
        if (!normalizedReaction) return;

        const currentReactions = reactionsByFoodId.get(reaction.food_item_id) || [];
        currentReactions.push({ ...reaction, reaction: normalizedReaction });
        reactionsByFoodId.set(reaction.food_item_id, currentReactions);
    });

    triedRows.forEach((tried) => {
        const currentRows = triedByFoodId.get(tried.food_item_id) || [];
        currentRows.push(tried);
        triedByFoodId.set(tried.food_item_id, currentRows);
    });

    return items
        .map((item) => {
            const itemReactions = reactionsByFoodId.get(item.id) || [];
            const itemTriedRows = triedByFoodId.get(item.id) || [];
            const reactionScore = itemReactions.reduce((total, reaction) => {
                const normalizedReaction = normalizeFoodReaction(reaction.reaction);
                if (!normalizedReaction) return total;

                return (
                    total +
                    (typeof reaction.score === "number"
                        ? reaction.score
                        : FOOD_REACTION_VALUES[normalizedReaction])
                );
            }, 0);
            const currentUserReaction =
                normalizeFoodReaction(
                    itemReactions.find((reaction) => reaction.user_id === currentUserId)
                        ?.reaction
                ) || null;
            const reactionSummaries = FOOD_REACTION_TYPES.map(
                (reactionType): FoodReactionSummary => {
                    const matchingReactions = itemReactions.filter(
                        (reaction) => reaction.reaction === reactionType
                    );
                    return {
                        reaction: reactionType,
                        value: FOOD_REACTION_VALUES[reactionType],
                        count: matchingReactions.length,
                        profiles: matchingReactions.map((reaction) => {
                            const profile = profilesById.get(reaction.user_id);
                            return {
                                user_id: reaction.user_id,
                                avatar_url: profile?.avatar_url || null,
                                first_name: profile?.first_name || null,
                                last_name: profile?.last_name || null,
                                username: profile?.username || null,
                            };
                        }),
                    };
                }
            );

            return {
                ...item,
                reaction_score: reactionScore,
                current_user_reaction: currentUserReaction,
                reaction_summaries: reactionSummaries,
                tried_count: itemTriedRows.length,
                tried_profiles: itemTriedRows.map((tried) => {
                    const profile = profilesById.get(tried.user_id);
                    return {
                        user_id: tried.user_id,
                        avatar_url: profile?.avatar_url || null,
                        first_name: profile?.first_name || null,
                        last_name: profile?.last_name || null,
                        username: profile?.username || null,
                    };
                }),
                current_user_tried: itemTriedRows.some(
                    (tried) => tried.user_id === currentUserId
                ),
            };
        })
        .sort((a, b) => {
            if (a.current_user_tried !== b.current_user_tried) {
                return a.current_user_tried ? 1 : -1;
            }

            const scoreSort = (b.reaction_score || 0) - (a.reaction_score || 0);
            if (scoreSort !== 0) return scoreSort;

            const createdSort =
                new Date(b.created_at || 0).getTime() -
                new Date(a.created_at || 0).getTime();
            if (createdSort !== 0) return createdSort;

            return a.name.localeCompare(b.name);
        });
}

async function createFoodItem(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const payload = getFoodPayload(formData);
    const tab = payload.item_type === "place" ? "places" : "foods";

    if (!payload.trip_id || !payload.name.trim()) {
        throw new Error("Food item needs a name.");
    }

    if (
        payload.item_type === "place" &&
        (!payload.google_place_id || !payload.formatted_address)
    ) {
        throw new Error("Select a Google Maps result to validate this place.");
    }

    if (
        payload.item_type === "food" &&
        (!payload.google_place_id || !payload.region)
    ) {
        throw new Error("Select a Google Maps result to validate where this food is available.");
    }

    const { error } = await supabase.from("trip_food_items").insert(payload);

    if (error) {
        console.error("Error creating food item:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(
            `Could not create food item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${payload.trip_id}/food`);
    redirect(
        getFoodReturnPath(
            formData,
            `/trips/${payload.trip_id}/food?tab=${tab}`
        )
    );
}

async function updateFoodItem(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const foodItemId = String(formData.get("food_item_id") || "");
    const payload = getFoodPayload(formData);
    const tab = payload.item_type === "place" ? "places" : "foods";

    if (!payload.trip_id || !foodItemId || !payload.name.trim()) {
        throw new Error("Food item needs a name.");
    }

    if (
        payload.item_type === "place" &&
        (!payload.google_place_id || !payload.formatted_address)
    ) {
        throw new Error("Select a Google Maps result to validate this place.");
    }

    if (
        payload.item_type === "food" &&
        (!payload.google_place_id || !payload.region)
    ) {
        throw new Error("Select a Google Maps result to validate where this food is available.");
    }

    const { error } = await supabase
        .from("trip_food_items")
        .update({
            ...payload,
            updated_at: new Date().toISOString(),
        })
        .eq("trip_id", payload.trip_id)
        .eq("id", foodItemId);

    if (error) {
        console.error("Error updating food item:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
            foodItemId,
        });
        throw new Error(
            `Could not update food item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${payload.trip_id}/food`);
    redirect(
        getFoodReturnPath(
            formData,
            `/trips/${payload.trip_id}/food?tab=${tab}`
        )
    );
}

async function deleteFoodItem(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const foodItemId = String(formData.get("food_item_id") || "");

    const { error } = await supabase
        .from("trip_food_items")
        .delete()
        .eq("trip_id", tripId)
        .eq("id", foodItemId);

    if (error) {
        throw new Error(`Could not delete food item: ${error.message}`);
    }

    revalidatePath(`/trips/${tripId}/food`);
}

async function toggleFoodReaction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const foodItemId = String(formData.get("food_item_id") || "");
    const reaction = normalizeFoodReaction(formData.get("reaction"));

    if (!tripId || !foodItemId || !reaction) {
        throw new Error("Could not update food reaction.");
    }

    const { data: existingReaction, error: readError } = await supabase
        .from("trip_food_reactions")
        .select("id,reaction")
        .eq("food_item_id", foodItemId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (readError) {
        throw new Error(`Could not update food reaction: ${readError.message}`);
    }

    if (normalizeFoodReaction(existingReaction?.reaction) === reaction) {
        const { error } = await supabase
            .from("trip_food_reactions")
            .delete()
            .eq("food_item_id", foodItemId)
            .eq("user_id", user.id);

        if (error) throw new Error(`Could not update food reaction: ${error.message}`);
    } else {
        const { error } = await supabase
            .from("trip_food_reactions")
            .upsert(
                {
                    trip_id: tripId,
                    food_item_id: foodItemId,
                    user_id: user.id,
                    reaction,
                    score: FOOD_REACTION_VALUES[reaction],
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "food_item_id,user_id" }
            );

        if (error) throw new Error(`Could not update food reaction: ${error.message}`);
    }

    revalidatePath(`/trips/${tripId}/food`);
}

async function toggleFoodTried(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const foodItemId = String(formData.get("food_item_id") || "");
    const shouldBeTried = String(formData.get("tried") || "") === "true";

    if (shouldBeTried) {
        const { error } = await supabase.from("trip_food_tried").upsert(
            {
                trip_id: tripId,
                food_item_id: foodItemId,
                user_id: user.id,
                tried_at: new Date().toISOString(),
            },
            { onConflict: "food_item_id,user_id" }
        );

        if (error) throw new Error(`Could not update tried status: ${error.message}`);
    } else {
        const { error } = await supabase
            .from("trip_food_tried")
            .delete()
            .eq("food_item_id", foodItemId)
            .eq("user_id", user.id);

        if (error) throw new Error(`Could not update tried status: ${error.message}`);
    }

    revalidatePath(`/trips/${tripId}/food`);
}

export default async function TripFoodPage({ params, searchParams }: PageProps) {
    const { tripId: tripRouteParam } = await params;
    const { tab } = await searchParams;
    const initialTab = tab === "foods" ? "food" : "place";
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const resolvedTrip = await resolveTripRouteParam<{
        id: string;
        slug?: string | null;
    }>(supabase, tripRouteParam, "id,slug");

    if (!resolvedTrip.trip) notFound();
    if (resolvedTrip.shouldRedirect) {
        redirect(getTripHref(resolvedTrip.trip, "/food"));
    }

    const tripId = resolvedTrip.tripId;

    const { trips: movableTrips } = await loadActiveMemberTrips(supabase, user.id);
    const moveTargetTrips = getMoveTargetTrips({
        trips: movableTrips,
        currentTripId: tripId,
    });

    const { data: foodRows, error: foodError } = await supabase
        .from("trip_food_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false });

    if (foodError) {
        console.error("Could not load food items:", foodError);
        throw new Error("Could not load food items");
    }

    const items = ((foodRows || []) as Record<string, unknown>[]).map(
        normalizeTripFoodItem
    );
    const foodItemIds = items.map((item) => item.id);
    let reactions: TripFoodReactionRecord[] = [];
    let triedRows: TripFoodTriedRecord[] = [];

    if (foodItemIds.length > 0) {
        const [{ data: reactionRows }, { data: triedData }] = await Promise.all([
            supabase
                .from("trip_food_reactions")
                .select("food_item_id,user_id,reaction,score")
                .eq("trip_id", tripId)
                .in("food_item_id", foodItemIds),
            supabase
                .from("trip_food_tried")
                .select("food_item_id,user_id")
                .eq("trip_id", tripId)
                .in("food_item_id", foodItemIds),
        ]);

        reactions = (reactionRows || []) as TripFoodReactionRecord[];
        triedRows = (triedData || []) as TripFoodTriedRecord[];
    }

    const profileUserIds = Array.from(
        new Set([
            ...reactions.map((reaction) => reaction.user_id),
            ...triedRows.map((tried) => tried.user_id),
        ])
    );
    const profilesById = new Map<string, IdeaReactionProfile>();

    if (profileUserIds.length > 0) {
        const { data: profileRows } = await supabase
            .from("user_profiles")
            .select("id,first_name,last_name,username,avatar_url")
            .in("id", profileUserIds);

        ((profileRows || []) as Array<IdeaReactionProfile & { id: string }>).forEach(
            (profile) => {
                profilesById.set(profile.id, {
                    user_id: profile.id,
                    avatar_url: profile.avatar_url || null,
                    first_name: profile.first_name || null,
                    last_name: profile.last_name || null,
                    username: profile.username || null,
                });
            }
        );
    }

    const decoratedItems = attachFoodMetadata({
        items,
        reactions,
        triedRows,
        profilesById,
        currentUserId: user.id,
    });

    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0">
            <TripPageHero
                tripId={tripId}
                pageLabel="Food"
                revalidatePathname={`/trips/${resolvedTrip.routeSegment}/food`}
            />
            <FoodPageClient
                tripId={tripId}
                tripRouteSegment={resolvedTrip.routeSegment}
                initialTab={initialTab}
                items={decoratedItems}
                createFoodAction={createFoodItem}
                updateFoodAction={updateFoodItem}
                deleteFoodAction={deleteFoodItem}
                moveItemAction={moveTripItem}
                moveTargetTrips={moveTargetTrips}
                toggleReactionAction={toggleFoodReaction}
                toggleTriedAction={toggleFoodTried}
            />
        </main>
    );
}
