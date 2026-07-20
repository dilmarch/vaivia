import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getAssistantPlaceTargetHref,
    type AssistantPlaceActionOption,
} from "@/lib/ai/place-action-contract";
import type {
    AssistantPlaceRecommendation,
    AssistantPlaceSavedTarget,
} from "@/lib/ai/places-contract";
import { buildItineraryTimezoneHints } from "@/lib/itineraryTimezoneHints";
import type { Database } from "@/src/types/supabase";

type SavedTargetWithPlaceId = AssistantPlaceSavedTarget & {
    placeId: string;
    placeIdSavedAt: string | null;
};

function cleanLabel(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim()
        ? value.trim().slice(0, 160)
        : fallback;
}

export async function loadAssistantSavedPlaceTargets({
    supabase,
    tripId,
    placeIds,
}: {
    supabase: SupabaseClient<Database>;
    tripId: string;
    placeIds: string[];
}) {
    const uniquePlaceIds = [...new Set(placeIds)].filter(Boolean).slice(0, 20);
    const targets = new Map<string, SavedTargetWithPlaceId[]>();
    if (uniquePlaceIds.length === 0) return targets;

    const [ideasResult, foodResult, itineraryResult] = await Promise.all([
        supabase
            .from("trip_ideas")
            .select("id,title,google_place_id,google_place_id_saved_at")
            .eq("trip_id", tripId)
            .in("google_place_id", uniquePlaceIds),
        supabase
            .from("trip_food_items")
            .select("id,name,google_place_id,google_place_id_saved_at")
            .eq("trip_id", tripId)
            .in("google_place_id", uniquePlaceIds),
        supabase
            .from("itinerary_items")
            .select("id,title,google_place_id,google_place_id_saved_at")
            .eq("trip_id", tripId)
            .in("google_place_id", uniquePlaceIds),
    ]);

    const add = (target: SavedTargetWithPlaceId) => {
        const current = targets.get(target.placeId) || [];
        if (!current.some((item) => item.type === target.type)) {
            current.push(target);
            targets.set(target.placeId, current);
        }
    };

    for (const idea of ideasResult.data || []) {
        if (!idea.google_place_id) continue;
        add({
            placeId: idea.google_place_id,
            placeIdSavedAt: idea.google_place_id_saved_at,
            type: "trip_idea",
            label: cleanLabel(idea.title, "Saved thing to do"),
            href: getAssistantPlaceTargetHref(tripId, "trip_idea"),
        });
    }
    for (const food of foodResult.data || []) {
        if (!food.google_place_id) continue;
        add({
            placeId: food.google_place_id,
            placeIdSavedAt: food.google_place_id_saved_at,
            type: "trip_food_item",
            label: cleanLabel(food.name, "Saved food place"),
            href: getAssistantPlaceTargetHref(tripId, "trip_food_item"),
        });
    }
    for (const item of itineraryResult.data || []) {
        if (!item.google_place_id) continue;
        add({
            placeId: item.google_place_id,
            placeIdSavedAt: item.google_place_id_saved_at,
            type: "itinerary_item",
            label: cleanLabel(item.title, "Scheduled place"),
            href: getAssistantPlaceTargetHref(tripId, "itinerary_item"),
        });
    }

    return targets;
}

export function attachAssistantSavedPlaceTargets(
    recommendations: AssistantPlaceRecommendation[],
    targets: Map<string, SavedTargetWithPlaceId[]>
) {
    return recommendations.map((recommendation) => {
        const savedTargets = targets.get(recommendation.placeId) || [];
        return {
            ...recommendation,
            alreadySaved:
                recommendation.alreadySaved ||
                savedTargets.some(
                    (target) =>
                        target.type === "trip_idea" ||
                        target.type === "trip_food_item"
                ),
            ...(savedTargets.length > 0
                ? {
                      savedTargets: savedTargets.map(
                          ({ type, label, href }) => ({ type, label, href })
                      ),
                  }
                : {}),
        };
    });
}

export async function loadAssistantPlaceActionOptions({
    supabase,
    tripId,
    userId,
    tripEndDate,
}: {
    supabase: SupabaseClient<Database>;
    tripId: string;
    userId: string;
    tripEndDate?: string | null;
}) {
    const [legsResult, categoriesResult, itineraryResult, transportationResult] =
        await Promise.all([
            supabase
                .from("trip_legs")
                .select("id,name,start_date,end_date")
                .eq("trip_id", tripId)
                .order("start_date", { ascending: true, nullsFirst: false }),
            supabase
                .from("user_categories")
                .select("id,name")
                .eq("user_id", userId)
                .order("name", { ascending: true }),
            supabase
                .from("itinerary_items")
                .select("item_date,end_date,category,timezone")
                .eq("trip_id", tripId),
            supabase
                .from("transportation_items")
                .select(
                    "departure_date,arrival_date,transport_type,departure_timezone,arrival_timezone"
                )
                .eq("trip_id", tripId),
        ]);

    const tripLegs: AssistantPlaceActionOption[] = (legsResult.data || []).map(
        (leg) => ({
            id: leg.id,
            label: cleanLabel(leg.name, "Trip leg"),
            startDate: leg.start_date,
            endDate: leg.end_date,
        })
    );
    const itineraryCategories: AssistantPlaceActionOption[] = (
        categoriesResult.data || []
    ).map((category) => ({
        id: category.id,
        label: cleanLabel(category.name, "Activity"),
    }));

    const timezoneItems = [
        ...(itineraryResult.data || []).map((item) => ({
            item_date: item.item_date,
            end_date: item.end_date,
            category: item.category,
            timezone: item.timezone,
            source_table: "itinerary_items" as const,
        })),
        ...(transportationResult.data || [])
            .filter((item) => item.departure_date || item.arrival_date)
            .map((item) => ({
                item_date: item.departure_date || item.arrival_date || "",
                end_date: item.arrival_date || item.departure_date,
                transportation_mode: item.transport_type,
                departure_timezone: item.departure_timezone,
                arrival_timezone: item.arrival_timezone,
                source_table: "transportation_items" as const,
            })),
    ];

    return {
        tripLegs,
        itineraryCategories,
        timezoneHints: buildItineraryTimezoneHints(timezoneItems, tripEndDate),
    };
}
