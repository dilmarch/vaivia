import { NextRequest, NextResponse } from "next/server";
import type { Content } from "@google/genai";
import {
    ASSISTANT_CONVERSATION_LIST_LIMIT,
    ASSISTANT_HISTORY_LIMIT,
    ASSISTANT_MAX_MESSAGE_LENGTH,
    createConversationTitle,
    isConversationInScope,
    isUuid,
    parseAssistantMessage,
} from "@/lib/ai/assistant-contract";
import {
    generateGeminiAssistantResponse,
    getAiDailyMessageLimit,
    getGeminiAssistantModel,
    isGeminiAssistantConfigured,
    VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
    type GeminiAssistantGenerationResult,
    type GeminiAssistantTokenUsage,
} from "@/lib/ai/gemini-assistant";
import { buildVaiviaAssistantSystemInstruction } from "@/lib/ai/system-instruction";
import { loadTripAssistantContext } from "@/lib/ai/trip-context";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { resolveTripRouteParam } from "@/lib/tripRoutes";

type RouteContext = { params: Promise<{ tripId: string }> };
type ConversationRow = {
    id: string;
    trip_id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    last_message_at: string | null;
};

function safeError(message: string, status: number, code: string) {
    return NextResponse.json({ error: message, code }, { status });
}

async function authenticateTrip(context: RouteContext) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: safeError("Authentication required", 401, "unauthorized") };
    }

    const { tripId: routeParam } = await context.params;
    const resolved = await resolveTripRouteParam<{
        id: string;
        slug: string;
        title: string;
    }>(supabase, routeParam, "id,slug,title");

    if (!resolved.trip) {
        return { error: safeError("Trip not found", 404, "trip_not_found") };
    }

    return { supabase, user, trip: resolved.trip };
}

function generationFailureResponse(generation: GeminiAssistantGenerationResult) {
    if (generation.status === "success") return null;

    const mapping = {
        missing_configuration: { status: 503, code: "assistant_unavailable" },
        timeout: { status: 504, code: "gemini_timeout" },
        rate_limited: { status: 429, code: "gemini_rate_limited" },
        service_failure: { status: 502, code: "gemini_service_failure" },
        empty_output: { status: 502, code: "gemini_empty_output" },
        aborted: { status: 499, code: "request_aborted" },
    } as const;
    return { ...mapping[generation.status], message: generation.message };
}

async function completeUsageEvent({
    usageEventId,
    userId,
    tripId,
    outcome,
    errorCode,
    model,
    tokenUsage,
}: {
    usageEventId: string;
    userId: string;
    tripId: string;
    outcome: "succeeded" | "failed";
    errorCode?: string;
    model?: string;
    tokenUsage?: GeminiAssistantTokenUsage;
}) {
    try {
        const serviceSupabase = createServiceRoleClient();
        const { error } = await serviceSupabase
            .from("ai_usage_events")
            .update({
                outcome,
                error_code: errorCode || null,
                model,
                prompt_token_count: tokenUsage?.promptTokenCount ?? null,
                candidate_token_count: tokenUsage?.candidateTokenCount ?? null,
                total_token_count: tokenUsage?.totalTokenCount ?? null,
                completed_at: new Date().toISOString(),
            })
            .eq("id", usageEventId)
            .eq("user_id", userId)
            .eq("trip_id", tripId)
            .eq("outcome", "in_progress");
        return !error;
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;

    const { supabase, user, trip } = authenticated;
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (conversationId && !isUuid(conversationId)) {
        return safeError("Invalid conversation", 400, "invalid_conversation_id");
    }

    const dailyLimit = getAiDailyMessageLimit();
    const usageDate = new Date().toISOString().slice(0, 10);
    const [conversationsResult, usageResult] = await Promise.all([
        supabase
            .from("ai_conversations")
            .select("id,title,created_at,updated_at,last_message_at")
            .eq("trip_id", trip.id)
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(ASSISTANT_CONVERSATION_LIST_LIMIT),
        supabase
            .from("ai_usage_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("usage_date", usageDate)
            .eq("event_type", "assistant_request")
            .in("outcome", ["in_progress", "succeeded", "failed"]),
    ]);

    if (conversationsResult.error || usageResult.error) {
        return safeError("Unable to load the assistant", 500, "load_failed");
    }

    const conversations = conversationsResult.data || [];
    const requestedConversation = conversationId
        ? conversations.find((conversation) => conversation.id === conversationId)
        : conversations[0];
    if (conversationId && !requestedConversation) {
        return safeError("Conversation not found", 404, "conversation_not_found");
    }

    let messages: Array<{
        id: string;
        role: string;
        status: string;
        content: string;
        created_at: string;
    }> = [];

    if (requestedConversation) {
        const messagesResult = await supabase
            .from("ai_messages")
            .select("id,role,status,content,created_at")
            .eq("conversation_id", requestedConversation.id)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100);

        if (messagesResult.error) {
            return safeError("Unable to load the conversation", 500, "load_failed");
        }
        messages = (messagesResult.data || []).reverse();
    }

    const used = usageResult.count || 0;
    return NextResponse.json({
        configured: isGeminiAssistantConfigured(),
        trip: { id: trip.id, title: trip.title },
        conversations,
        activeConversationId: requestedConversation?.id || null,
        messages,
        usage: {
            limit: dailyLimit,
            used,
            remaining: Math.max(0, dailyLimit - used),
        },
    });
}

export async function POST(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;
    const { supabase, user, trip } = authenticated;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return safeError("Invalid request", 400, "invalid_request");
    }

    if (body.action === "new") {
        if (!isGeminiAssistantConfigured()) {
            return safeError(
                VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
                503,
                "assistant_unavailable"
            );
        }
        const { data, error } = await supabase
            .from("ai_conversations")
            .insert({ trip_id: trip.id, user_id: user.id, title: "New conversation" })
            .select("id,title,created_at,updated_at,last_message_at")
            .single();
        if (error || !data) {
            return safeError("Unable to create a conversation", 500, "create_failed");
        }
        return NextResponse.json({ conversation: data }, { status: 201 });
    }

    if (body.action !== "message") {
        return safeError("Invalid request", 400, "invalid_request");
    }
    if (!isGeminiAssistantConfigured()) {
        return safeError(
            VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
            503,
            "assistant_unavailable"
        );
    }

    const message = parseAssistantMessage(body.message);
    if (!message) {
        return safeError(
            `Enter a message between 1 and ${ASSISTANT_MAX_MESSAGE_LENGTH.toLocaleString()} characters`,
            400,
            "invalid_message"
        );
    }

    const suppliedConversationId = body.conversationId ?? null;
    if (suppliedConversationId !== null && !isUuid(suppliedConversationId)) {
        return safeError("Invalid conversation", 400, "invalid_conversation_id");
    }

    let conversation: ConversationRow | null = null;
    let createdConversation = false;
    if (suppliedConversationId) {
        const result = await supabase
            .from("ai_conversations")
            .select("id,trip_id,user_id,title,created_at,updated_at,last_message_at")
            .eq("id", suppliedConversationId)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id)
            .maybeSingle();
        conversation = result.data;
        if (result.error || !isConversationInScope(conversation, trip.id, user.id)) {
            return safeError("Conversation not found", 404, "conversation_not_found");
        }
    }

    let tripContext;
    try {
        tripContext = await loadTripAssistantContext(supabase, trip.id);
    } catch {
        return safeError("Unable to read the saved trip details", 500, "context_failed");
    }

    let history: Array<{ role: string; content: string }> = [];
    if (conversation) {
        const historyResult = await supabase
            .from("ai_messages")
            .select("role,content")
            .eq("conversation_id", conversation.id)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id)
            .eq("status", "complete")
            .order("created_at", { ascending: false })
            .limit(ASSISTANT_HISTORY_LIMIT);
        if (historyResult.error) {
            return safeError("Unable to load conversation history", 500, "history_failed");
        }
        history = historyResult.data || [];
    } else {
        const result = await supabase
            .from("ai_conversations")
            .insert({
                trip_id: trip.id,
                user_id: user.id,
                title: createConversationTitle(message),
            })
            .select("id,trip_id,user_id,title,created_at,updated_at,last_message_at")
            .single();
        if (result.error || !result.data) {
            return safeError("Unable to create a conversation", 500, "create_failed");
        }
        conversation = result.data;
        createdConversation = true;
    }

    const deleteEmptyCreatedConversation = async () => {
        if (!createdConversation || !conversation) return;
        await supabase
            .from("ai_conversations")
            .delete()
            .eq("id", conversation.id)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id);
    };

    const model = getGeminiAssistantModel();
    const dailyLimit = getAiDailyMessageLimit();
    let usageRows;
    let usageError;
    try {
        const serviceSupabase = createServiceRoleClient();
        const result = await serviceSupabase.rpc("consume_ai_daily_usage", {
            target_user_id: user.id,
            target_trip_id: trip.id,
            target_conversation_id: conversation.id,
            target_model: model,
            daily_limit: dailyLimit,
        });
        usageRows = result.data;
        usageError = result.error;
    } catch {
        await deleteEmptyCreatedConversation();
        return safeError("Unable to verify daily usage", 500, "usage_failed");
    }

    const usage = usageRows?.[0];
    if (usageError || !usage) {
        await deleteEmptyCreatedConversation();
        return safeError("Unable to verify daily usage", 500, "usage_failed");
    }
    if (!usage.allowed) {
        await deleteEmptyCreatedConversation();
        return NextResponse.json(
            {
                error: "You’ve reached today’s assistant message limit",
                code: "quota_exceeded",
                usage: { limit: dailyLimit, used: usage.used, remaining: 0 },
            },
            { status: 429 }
        );
    }

    const usageEventId = usage.usage_event_id;
    if (!usageEventId) {
        await deleteEmptyCreatedConversation();
        return safeError("Unable to verify daily usage", 500, "usage_failed");
    }

    const { data: userMessage, error: messageInsertError } = await supabase
        .from("ai_messages")
        .insert({
            conversation_id: conversation.id,
            trip_id: trip.id,
            user_id: user.id,
            role: "user",
            status: "pending",
            content: message,
        })
        .select("id,role,status,content,created_at")
        .single();
    if (messageInsertError || !userMessage) {
        await completeUsageEvent({
            usageEventId,
            userId: user.id,
            tripId: trip.id,
            outcome: "failed",
            errorCode: "user_message_persistence_failed",
        });
        await deleteEmptyCreatedConversation();
        return safeError("Unable to save your message", 500, "save_failed");
    }

    const now = new Date().toISOString();
    const updatedTitle =
        conversation.title === "New conversation"
            ? createConversationTitle(message)
            : conversation.title;
    const { data: updatedConversation } = await supabase
        .from("ai_conversations")
        .update({ title: updatedTitle, last_message_at: now, updated_at: now })
        .eq("id", conversation.id)
        .eq("trip_id", trip.id)
        .eq("user_id", user.id)
        .select("id,title,created_at,updated_at,last_message_at")
        .single();

    const contents: Content[] = history
        .reverse()
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.content }],
        }));
    contents.push({ role: "user", parts: [{ text: message }] });

    const generation = await generateGeminiAssistantResponse({
        contents,
        config: {
            systemInstruction: buildVaiviaAssistantSystemInstruction(tripContext),
            temperature: 0.2,
            maxOutputTokens: 1_200,
        },
        signal: request.signal,
    });

    const conversationPayload = updatedConversation || conversation;
    if (generation.status !== "success") {
        const failure = generationFailureResponse(generation)!;
        await supabase
            .from("ai_messages")
            .update({ status: "failed" })
            .eq("id", userMessage.id)
            .eq("conversation_id", conversation.id)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id);
        await completeUsageEvent({
            usageEventId,
            userId: user.id,
            tripId: trip.id,
            outcome: "failed",
            errorCode: failure.code,
        });
        return NextResponse.json(
            {
                conversation: conversationPayload,
                userMessage: { ...userMessage, status: "failed" },
                error: failure.message,
                code: failure.code,
                usage: {
                    limit: dailyLimit,
                    used: usage.used,
                    remaining: usage.remaining,
                },
            },
            { status: failure.status }
        );
    }

    const { data: assistantMessage, error: assistantInsertError } = await supabase
        .from("ai_messages")
        .insert({
            conversation_id: conversation.id,
            trip_id: trip.id,
            user_id: user.id,
            role: "assistant",
            status: "complete",
            content: generation.message,
            model: generation.model,
        })
        .select("id,role,status,content,created_at")
        .single();
    if (assistantInsertError || !assistantMessage) {
        await supabase
            .from("ai_messages")
            .update({ status: "failed" })
            .eq("id", userMessage.id)
            .eq("conversation_id", conversation.id)
            .eq("trip_id", trip.id)
            .eq("user_id", user.id);
        await completeUsageEvent({
            usageEventId,
            userId: user.id,
            tripId: trip.id,
            outcome: "failed",
            errorCode: "assistant_message_persistence_failed",
        });
        return NextResponse.json(
            {
                conversation: conversationPayload,
                userMessage: { ...userMessage, status: "failed" },
                error: "Unable to save the assistant response",
                code: "save_failed",
            },
            { status: 500 }
        );
    }

    const { error: userStatusError } = await supabase
        .from("ai_messages")
        .update({ status: "complete" })
        .eq("id", userMessage.id)
        .eq("conversation_id", conversation.id)
        .eq("trip_id", trip.id)
        .eq("user_id", user.id);
    if (userStatusError) {
        await completeUsageEvent({
            usageEventId,
            userId: user.id,
            tripId: trip.id,
            outcome: "failed",
            errorCode: "message_status_persistence_failed",
        });
        return NextResponse.json(
            {
                conversation: conversationPayload,
                userMessage,
                assistantMessage,
                error: "Unable to finalize the assistant response",
                code: "save_failed",
            },
            { status: 500 }
        );
    }

    const usageSaved = await completeUsageEvent({
        usageEventId,
        userId: user.id,
        tripId: trip.id,
        outcome: "succeeded",
        model: generation.model,
        tokenUsage: generation.tokenUsage,
    });

    const payload = {
        conversation: conversationPayload,
        userMessage: { ...userMessage, status: "complete" },
        assistantMessage,
        usage: {
            limit: dailyLimit,
            used: usage.used,
            remaining: usage.remaining,
        },
    };

    if (!usageSaved) {
        return NextResponse.json(
            { ...payload, error: "Unable to record assistant usage", code: "usage_failed" },
            { status: 500 }
        );
    }
    return NextResponse.json(payload);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const authenticated = await authenticateTrip(context);
    if ("error" in authenticated) return authenticated.error!;
    const { supabase, user, trip } = authenticated;
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (!isUuid(conversationId)) {
        return safeError("Invalid conversation", 400, "invalid_conversation_id");
    }

    const { data: conversation, error: lookupError } = await supabase
        .from("ai_conversations")
        .select("id,trip_id,user_id")
        .eq("id", conversationId)
        .eq("trip_id", trip.id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (lookupError || !isConversationInScope(conversation, trip.id, user.id)) {
        return safeError("Conversation not found", 404, "conversation_not_found");
    }

    const { error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", conversationId)
        .eq("trip_id", trip.id)
        .eq("user_id", user.id);
    if (error) {
        return safeError("Unable to delete the conversation", 500, "delete_failed");
    }
    return NextResponse.json({ deleted: true });
}
