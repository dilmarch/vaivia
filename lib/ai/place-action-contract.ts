import type { AssistantPlaceSavedTarget } from "@/lib/ai/places-contract";

export type { AssistantPlaceSavedTarget } from "@/lib/ai/places-contract";

export const ASSISTANT_PLACE_ACTION_TYPES = [
    "save_thing_to_do",
    "save_food",
    "add_itinerary",
] as const;

export type AssistantPlaceActionType =
    (typeof ASSISTANT_PLACE_ACTION_TYPES)[number];

export type AssistantPlaceActionPreview = {
    name: string;
    address: string | null;
    category: string;
    rating: number | null;
    userRatingCount: number | null;
    mapsUrl: string;
};

export type AssistantPlaceActionOption = {
    id: string;
    label: string;
    startDate?: string | null;
    endDate?: string | null;
};

export type AssistantPlaceActionProposalResponse = {
    proposal: {
        id: string;
        actionType: AssistantPlaceActionType;
        expiresAt: string;
    } | null;
    preview: AssistantPlaceActionPreview | null;
    previewUnavailable: boolean;
    alreadySaved: AssistantPlaceSavedTarget | null;
    options: {
        tripLegs: AssistantPlaceActionOption[];
        itineraryCategories: AssistantPlaceActionOption[];
        timezoneHints: Record<string, string>;
    };
};

export type AssistantPlaceActionResult = {
    status: "succeeded" | "already_saved";
    savedTarget: AssistantPlaceSavedTarget;
};

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAssistantPlaceActionType(
    value: unknown
): value is AssistantPlaceActionType {
    return ASSISTANT_PLACE_ACTION_TYPES.includes(
        value as AssistantPlaceActionType
    );
}

export function isGooglePlaceId(value: unknown): value is string {
    return typeof value === "string" && PLACE_ID_PATTERN.test(value.trim());
}

export function isActionUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

export function getAssistantPlaceTargetHref(
    tripId: string,
    targetType: AssistantPlaceSavedTarget["type"]
) {
    if (targetType === "trip_food_item") {
        return `/trips/${tripId}/food?tab=places`;
    }
    if (targetType === "itinerary_item") {
        return `/trips/${tripId}/itinerary`;
    }
    return `/trips/${tripId}?tab=ideas`;
}

export function getAssistantPlaceActionLabel(action: AssistantPlaceActionType) {
    if (action === "save_food") return "Save to Eat & Drink";
    if (action === "add_itinerary") return "Add to itinerary";
    return "Save to Things to Do";
}
