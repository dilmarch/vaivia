import type { Json } from "@/src/types/supabase";
import type { IdeaReactionProfile } from "@/lib/tripIdeas";

export const FOOD_MEAL_OPTIONS = [
    { value: "any", label: "Any" },
    { value: "breakfast", label: "Breakfast" },
    { value: "brunch", label: "Brunch" },
    { value: "lunch", label: "Lunch" },
    { value: "dinner", label: "Dinner" },
    { value: "snack", label: "Snack" },
    { value: "dessert", label: "Dessert" },
    { value: "coffee", label: "Coffee" },
    { value: "drinks", label: "Drinks" },
    { value: "late_night", label: "Late night" },
    { value: "grocery_store", label: "Grocery / store" },
] as const;

export const FOOD_ITEM_TYPES = ["place", "food"] as const;
export const FOOD_REACTION_TYPES = ["heart", "thumbs_up", "thumbs_down"] as const;

export const FOOD_REACTION_VALUES: Record<FoodReactionType, 2 | 1 | -1> = {
    heart: 2,
    thumbs_up: 1,
    thumbs_down: -1,
};

export type FoodItemType = (typeof FOOD_ITEM_TYPES)[number];
export type FoodMealCategory = (typeof FOOD_MEAL_OPTIONS)[number]["value"];
export type FoodReactionType = (typeof FOOD_REACTION_TYPES)[number];

export type FoodReactionSummary = {
    reaction: FoodReactionType;
    value: 2 | 1 | -1;
    count: number;
    profiles?: IdeaReactionProfile[];
};

export type TripFoodItem = {
    id: string;
    trip_id: string;
    item_type: FoodItemType;
    name: string;
    description?: string | null;
    region?: string | null;
    personal_note?: string | null;
    google_place_id?: string | null;
    place_source?: string | null;
    formatted_address?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    primary_place_type?: string | null;
    place_types: string[];
    business_status?: string | null;
    regular_opening_hours?: Json | null;
    website_url?: string | null;
    phone_number?: string | null;
    google_maps_url?: string | null;
    facebook_url?: string | null;
    instagram_url?: string | null;
    meal_categories: FoodMealCategory[];
    created_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    reaction_summaries?: FoodReactionSummary[];
    current_user_reaction?: FoodReactionType | null;
    reaction_score?: number;
    tried_count?: number;
    tried_profiles?: IdeaReactionProfile[];
    current_user_tried?: boolean;
};

export type TripFoodReactionRecord = {
    food_item_id: string;
    user_id: string;
    reaction: string;
    score?: number | null;
};

export type TripFoodTriedRecord = {
    food_item_id: string;
    user_id: string;
};

export function normalizeFoodReaction(value: unknown): FoodReactionType | null {
    if (
        value === "heart" ||
        value === "thumbs_up" ||
        value === "thumbs_down"
    ) {
        return value;
    }

    return null;
}

export function normalizeFoodMealCategories(value: unknown): FoodMealCategory[] {
    const allowedValues = new Set(FOOD_MEAL_OPTIONS.map((option) => option.value));
    const values = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [];
    const normalized = values
        .map((entry) => String(entry).trim())
        .filter((entry): entry is FoodMealCategory =>
            allowedValues.has(entry as FoodMealCategory)
        );

    if (normalized.includes("any")) return ["any"];

    return normalized.length > 0 ? [...new Set(normalized)] : ["any"];
}

export function normalizeTripFoodItem(record: Record<string, unknown>): TripFoodItem {
    return {
        id: String(record.id || ""),
        trip_id: String(record.trip_id || ""),
        item_type: record.item_type === "food" ? "food" : "place",
        name: String(record.name || ""),
        description:
            typeof record.description === "string" ? record.description : null,
        region: typeof record.region === "string" ? record.region : null,
        personal_note:
            typeof record.personal_note === "string" ? record.personal_note : null,
        google_place_id:
            typeof record.google_place_id === "string"
                ? record.google_place_id
                : null,
        place_source:
            typeof record.place_source === "string" ? record.place_source : null,
        formatted_address:
            typeof record.formatted_address === "string"
                ? record.formatted_address
                : null,
        location_lat:
            typeof record.location_lat === "number" ? record.location_lat : null,
        location_lng:
            typeof record.location_lng === "number" ? record.location_lng : null,
        primary_place_type:
            typeof record.primary_place_type === "string"
                ? record.primary_place_type
                : null,
        place_types: Array.isArray(record.place_types)
            ? record.place_types.map(String)
            : [],
        business_status:
            typeof record.business_status === "string"
                ? record.business_status
                : null,
        regular_opening_hours:
            record.regular_opening_hours === undefined
                ? null
                : (record.regular_opening_hours as Json | null),
        website_url:
            typeof record.website_url === "string" ? record.website_url : null,
        phone_number:
            typeof record.phone_number === "string" ? record.phone_number : null,
        google_maps_url:
            typeof record.google_maps_url === "string"
                ? record.google_maps_url
                : null,
        facebook_url:
            typeof record.facebook_url === "string" ? record.facebook_url : null,
        instagram_url:
            typeof record.instagram_url === "string"
                ? record.instagram_url
                : null,
        meal_categories: normalizeFoodMealCategories(record.meal_categories),
        created_by:
            typeof record.created_by === "string" ? record.created_by : null,
        created_at:
            typeof record.created_at === "string" ? record.created_at : null,
        updated_at:
            typeof record.updated_at === "string" ? record.updated_at : null,
    };
}

export function formatFoodMealCategory(value: string) {
    return (
        FOOD_MEAL_OPTIONS.find((option) => option.value === value)?.label || value
    );
}
