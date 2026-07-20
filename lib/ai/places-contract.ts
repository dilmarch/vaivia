export const ASSISTANT_PLACE_CARD_LIMIT = 10;

export type AssistantPlaceRecommendation = {
    recommendationId: string;
    name: string;
    category: string;
    address: string | null;
    matchReason: string;
    distance: string;
    rating: number | null;
    userRatingCount: number | null;
    priceLevel: string | null;
    hoursSummary: string | null;
    mapsUrl: string;
    alreadySaved: boolean;
};

export type AssistantPlaceReference = {
    placeId: string;
    matchReason: string;
    alreadySaved: boolean;
};

export type AssistantPlacesMessageMetadata = {
    version: 1;
    type: "google_places_recommendations";
    recommendations: AssistantPlaceReference[];
};

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;

function cleanText(value: unknown, maxLength: number) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

export function createPlacesMessageMetadata(
    references: AssistantPlaceReference[]
): AssistantPlacesMessageMetadata | Record<string, never> {
    const seen = new Set<string>();
    const recommendations = references
        .filter((reference) => {
            if (!PLACE_ID_PATTERN.test(reference.placeId) || seen.has(reference.placeId)) {
                return false;
            }
            seen.add(reference.placeId);
            return true;
        })
        .slice(0, ASSISTANT_PLACE_CARD_LIMIT)
        .map((reference) => ({
            placeId: reference.placeId,
            matchReason:
                cleanText(reference.matchReason, 240) ||
                "A relevant option near the selected trip location.",
            alreadySaved: Boolean(reference.alreadySaved),
        }));

    return recommendations.length > 0
        ? { version: 1, type: "google_places_recommendations", recommendations }
        : {};
}

export function parsePlacesMessageMetadata(
    value: unknown
): AssistantPlacesMessageMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const metadata = value as Record<string, unknown>;
    if (
        metadata.version !== 1 ||
        metadata.type !== "google_places_recommendations" ||
        !Array.isArray(metadata.recommendations)
    ) {
        return null;
    }

    const parsed = createPlacesMessageMetadata(
        metadata.recommendations.map((item) => {
            const reference =
                item && typeof item === "object" && !Array.isArray(item)
                    ? (item as Record<string, unknown>)
                    : {};
            return {
                placeId: cleanText(reference.placeId, 255),
                matchReason: cleanText(reference.matchReason, 240),
                alreadySaved: reference.alreadySaved === true,
            };
        })
    );

    return Object.keys(parsed).length > 0
        ? (parsed as AssistantPlacesMessageMetadata)
        : null;
}
