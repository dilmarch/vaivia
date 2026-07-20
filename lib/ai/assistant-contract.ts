export const ASSISTANT_MAX_MESSAGE_LENGTH = 4_000;
export const ASSISTANT_HISTORY_LIMIT = 20;
export const ASSISTANT_CONVERSATION_LIST_LIMIT = 30;

export type AssistantConversation = {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    last_message_at: string | null;
};

export type AssistantMessage = {
    id: string;
    role: "user" | "assistant";
    status: "pending" | "complete" | "failed";
    content: string;
    created_at: string;
    recommendations?: import("@/lib/ai/places-contract").AssistantPlaceRecommendation[];
    webGrounding?: import("@/lib/ai/grounding-contract").AssistantWebGrounding;
};

export type AssistantUsage = {
    limit: number;
    used: number;
    remaining: number;
};

export function parseAssistantMessage(value: unknown) {
    if (typeof value !== "string") return null;
    const message = value.trim();
    if (!message || message.length > ASSISTANT_MAX_MESSAGE_LENGTH) return null;
    return message;
}

export function createConversationTitle(message: string) {
    const singleLine = message.replace(/\s+/g, " ").trim();
    return singleLine.length <= 64
        ? singleLine
        : `${singleLine.slice(0, 61).trimEnd()}…`;
}

export function isConversationInScope(
    conversation: { trip_id: string; user_id: string } | null | undefined,
    tripId: string,
    userId: string
) {
    return Boolean(
        conversation &&
            conversation.trip_id === tripId &&
            conversation.user_id === userId
    );
}

export function isUuid(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        )
    );
}

export function getUtcDayStart(now = new Date()) {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
}
