"use client";

import Link from "next/link";
import {
    AlertTriangle,
    Bot,
    Loader2,
    Menu,
    MessageSquare,
    Plus,
    RotateCcw,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import SafeMarkdown from "@/components/assistant/SafeMarkdown";
import PlaceRecommendationCards from "@/components/assistant/PlaceRecommendationCards";
import GroundedWebAnswer from "@/components/assistant/GroundedWebAnswer";
import type {
    AssistantConversation,
    AssistantMessage,
    AssistantUsage,
} from "@/lib/ai/assistant-contract";

export const ASSISTANT_STARTER_PROMPTS = [
    "Summarize this trip",
    "Review my itinerary",
    "What still needs planning?",
    "Find gaps or conflicts",
    "Find cafés near my accommodation",
    "What current events are on during this trip?",
] as const;

type BootstrapPayload = {
    configured: boolean;
    placesConfigured: boolean;
    trip: { id: string; title: string };
    conversations: AssistantConversation[];
    activeConversationId: string | null;
    messages: AssistantMessage[];
    usage: AssistantUsage;
};

type ApiErrorPayload = {
    error?: string;
    code?: string;
    usage?: AssistantUsage;
    conversation?: AssistantConversation;
    userMessage?: AssistantMessage;
    assistantMessage?: AssistantMessage;
};

function upsertConversation(
    conversations: AssistantConversation[],
    conversation: AssistantConversation
) {
    return [conversation, ...conversations.filter((item) => item.id !== conversation.id)];
}

export default function TripAssistant({
    tripId,
    tripTitle,
}: {
    tripId: string;
    tripTitle: string;
}) {
    const endpoint = `/api/trips/${encodeURIComponent(tripId)}/assistant`;
    const [conversations, setConversations] = useState<AssistantConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [usage, setUsage] = useState<AssistantUsage>({ limit: 50, used: 0, remaining: 50 });
    const [configured, setConfigured] = useState(true);
    const [placesConfigured, setPlacesConfigured] = useState(true);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [isConversationPanelOpen, setIsConversationPanelOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<AssistantConversation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const messageScrollRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
    const loadAbortRef = useRef<AbortController | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const drawerWasOpenRef = useRef(false);
    const restoreDrawerFocusRef = useRef(true);

    const loadAssistant = useCallback(
        async (conversationId?: string | null) => {
            loadAbortRef.current?.abort();
            const controller = new AbortController();
            loadAbortRef.current = controller;
            setIsLoading(true);
            setError(null);
            setErrorCode(null);
            try {
                const url = conversationId
                    ? `${endpoint}?conversationId=${encodeURIComponent(conversationId)}`
                    : endpoint;
                const response = await fetch(url, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = (await response.json()) as BootstrapPayload & ApiErrorPayload;
                if (!response.ok) throw new Error(payload.error || "Unable to load the assistant");
                if (controller.signal.aborted) return;
                shouldAutoScrollRef.current = true;
                setConfigured(payload.configured);
                setPlacesConfigured(payload.placesConfigured);
                setConversations(payload.conversations);
                setActiveConversationId(payload.activeConversationId);
                setMessages(payload.messages);
                setUsage(payload.usage);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Unable to load the assistant"
                );
                setErrorCode("load_failed");
            } finally {
                if (loadAbortRef.current === controller) {
                    loadAbortRef.current = null;
                    setIsLoading(false);
                }
            }
        },
        [endpoint]
    );

    useEffect(() => {
        const media = window.matchMedia?.("(min-width: 768px)");
        if (!media) return;
        const update = () => setIsDesktop(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        loadAbortRef.current?.abort();
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        setInput("");
        setLastFailedMessage(null);
        setIsConversationPanelOpen(false);
        setConfigured(true);
        setPlacesConfigured(true);
        shouldAutoScrollRef.current = true;
        void loadAssistant();
        return () => loadAbortRef.current?.abort();
    }, [tripId, loadAssistant]);

    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            bottomRef.current?.scrollIntoView?.({
                behavior: isSending ? "smooth" : "auto",
                block: "end",
            });
        }
    }, [messages, isSending]);

    useEffect(() => {
        if (isConversationPanelOpen) {
            drawerWasOpenRef.current = true;
            drawerCloseButtonRef.current?.focus();
            return;
        }
        if (drawerWasOpenRef.current && restoreDrawerFocusRef.current) {
            menuButtonRef.current?.focus();
        }
        drawerWasOpenRef.current = false;
        restoreDrawerFocusRef.current = true;
    }, [isConversationPanelOpen]);

    function closeConversationPanel({ restoreFocus = true } = {}) {
        restoreDrawerFocusRef.current = restoreFocus;
        setIsConversationPanelOpen(false);
    }

    async function startNewConversation() {
        if (!configured || isSending) return;
        setError(null);
        setErrorCode(null);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "new" }),
            });
            const payload = (await response.json()) as ApiErrorPayload;
            if (!response.ok || !payload.conversation) {
                throw new Error(payload.error || "Unable to create a conversation");
            }
            setConversations((current) =>
                upsertConversation(current, payload.conversation as AssistantConversation)
            );
            setActiveConversationId(payload.conversation.id);
            setMessages([]);
            setInput("");
            setLastFailedMessage(null);
            closeConversationPanel({ restoreFocus: false });
            requestAnimationFrame(() => composerRef.current?.focus());
        } catch (newError) {
            setError(
                newError instanceof Error
                    ? newError.message
                    : "Unable to create a conversation"
            );
            setErrorCode("create_failed");
        }
    }

    async function openConversation(conversationId: string) {
        closeConversationPanel({ restoreFocus: false });
        await loadAssistant(conversationId);
        composerRef.current?.focus();
    }

    async function deleteConversation(
        conversation: AssistantConversation,
        requestClose: () => void
    ) {
        if (isSending || isDeleting) return;
        setIsDeleting(true);
        setError(null);
        try {
            const response = await fetch(
                `${endpoint}?conversationId=${encodeURIComponent(conversation.id)}`,
                { method: "DELETE" }
            );
            const payload = (await response.json()) as ApiErrorPayload;
            if (!response.ok) {
                throw new Error(payload.error || "Unable to delete the conversation");
            }
            const remaining = conversations.filter((item) => item.id !== conversation.id);
            setConversations(remaining);
            requestClose();
            if (activeConversationId === conversation.id) {
                if (remaining[0]) await openConversation(remaining[0].id);
                else {
                    setActiveConversationId(null);
                    setMessages([]);
                    requestAnimationFrame(() => composerRef.current?.focus());
                }
            }
        } catch (deleteError) {
            setError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "Unable to delete the conversation"
            );
            setErrorCode("delete_failed");
        } finally {
            setIsDeleting(false);
        }
    }

    async function sendMessage(rawMessage = input) {
        const message = rawMessage.trim();
        if (!message || isSending || !configured || usage.remaining <= 0) return;
        shouldAutoScrollRef.current = true;
        setIsSending(true);
        setError(null);
        setErrorCode(null);
        setLastFailedMessage(null);
        setInput("");

        const optimisticMessage: AssistantMessage = {
            id: `pending-${Date.now()}`,
            role: "user",
            status: "pending",
            content: message,
            created_at: new Date().toISOString(),
        };
        setMessages((current) => [...current, optimisticMessage]);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "message",
                    conversationId: activeConversationId,
                    message,
                }),
            });
            const payload = (await response.json()) as ApiErrorPayload;

            if (payload.usage) setUsage(payload.usage);
            if (payload.conversation) {
                setActiveConversationId(payload.conversation.id);
                setConversations((current) =>
                    upsertConversation(current, payload.conversation as AssistantConversation)
                );
            }
            setMessages((current) => {
                const withoutOptimistic = current.filter(
                    (item) => item.id !== optimisticMessage.id
                );
                return [
                    ...withoutOptimistic,
                    ...(payload.userMessage ? [payload.userMessage] : []),
                    ...(payload.assistantMessage ? [payload.assistantMessage] : []),
                ];
            });

            if (!response.ok) {
                setError(payload.error || "The assistant could not answer right now");
                setErrorCode(payload.code || "request_failed");
                if (payload.code !== "quota_exceeded") setLastFailedMessage(message);
                if (!payload.userMessage) setInput(message);
            }
        } catch {
            setMessages((current) =>
                current.filter((item) => item.id !== optimisticMessage.id)
            );
            setInput(message);
            setLastFailedMessage(message);
            setError("The assistant could not answer right now. Please try again.");
            setErrorCode("request_failed");
        } finally {
            setIsSending(false);
        }
    }

    const quotaReached = usage.remaining <= 0 || errorCode === "quota_exceeded";
    const drawerAccessible = isDesktop || isConversationPanelOpen;

    return (
        <>
            <section className="mx-auto flex h-full min-h-0 max-w-[96rem] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 text-white shadow-2xl shadow-black/35 backdrop-blur-xl">
                {isConversationPanelOpen ? (
                    <button
                        type="button"
                        aria-label="Close conversations"
                        className="fixed inset-0 z-30 bg-black/65 md:hidden"
                        onClick={() => closeConversationPanel()}
                    />
                ) : null}

                <aside
                    id="assistant-conversation-panel"
                    className={`vaivia-assistant-conversation-panel fixed inset-y-0 left-0 z-40 flex w-[min(20rem,86vw)] flex-col border-r border-white/10 bg-[#070b17] p-4 transition-transform md:static md:w-72 md:translate-x-0 ${
                        isConversationPanelOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                    aria-label="Assistant conversations"
                    aria-hidden={!drawerAccessible}
                    inert={!drawerAccessible}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
                                Conversations
                            </p>
                            <p className="mt-1 truncate text-sm font-bold text-slate-300">
                                {tripTitle}
                            </p>
                        </div>
                        <button
                            ref={drawerCloseButtonRef}
                            type="button"
                            onClick={() => closeConversationPanel()}
                            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
                            aria-label="Close conversations"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => void startNewConversation()}
                        disabled={!configured || isSending}
                        className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" /> New conversation
                    </button>

                    <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto" role="list">
                        {conversations.length === 0 && !isLoading ? (
                            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-xs leading-5 text-slate-500">
                                Your {tripTitle} conversations will appear here.
                            </p>
                        ) : null}
                        {conversations.map((conversation) => (
                            <div
                                key={conversation.id}
                                className={`group flex items-center gap-1 rounded-2xl border p-1 transition ${
                                    activeConversationId === conversation.id
                                        ? "border-lime-300/35 bg-lime-300/10"
                                        : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                                }`}
                                role="listitem"
                            >
                                <button
                                    type="button"
                                    onClick={() => void openConversation(conversation.id)}
                                    className="min-w-0 flex-1 px-3 py-2 text-left"
                                    aria-label={`Open ${conversation.title}`}
                                >
                                    <span className="line-clamp-2 text-xs font-bold leading-5 text-slate-200">
                                        {conversation.title}
                                    </span>
                                    <span className="mt-1 block text-[10px] text-slate-500">
                                        {new Date(conversation.updated_at).toLocaleDateString()}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPendingDelete(conversation)}
                                    className="rounded-xl p-2 text-slate-600 opacity-60 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
                                    aria-label={`Delete ${conversation.title}`}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-[11px] leading-5 text-slate-400">
                        <span className="font-black text-slate-200">{usage.remaining}</span> of{" "}
                        {usage.limit} messages left today
                    </div>
                </aside>

                <div className="relative flex min-w-0 flex-1 flex-col">
                    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
                        <button
                            ref={menuButtonRef}
                            type="button"
                            onClick={() => setIsConversationPanelOpen(true)}
                            className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10 md:hidden"
                            aria-label="Open conversations"
                            aria-controls="assistant-conversation-panel"
                            aria-expanded={isConversationPanelOpen}
                        >
                            <Menu className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300/10 text-lime-200">
                            <Bot className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-sm font-black sm:text-base">
                                VAIVIA Assistant
                            </h1>
                            <p className="truncate text-[11px] font-semibold text-slate-500">
                                Read-only answers from {tripTitle}
                            </p>
                        </div>
                        <span className="hidden rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-200 sm:inline-flex">
                            Phase 2A
                        </span>
                    </header>

                    <div
                        ref={messageScrollRef}
                        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8"
                        aria-live="polite"
                        onScroll={(event) => {
                            const target = event.currentTarget;
                            shouldAutoScrollRef.current =
                                target.scrollHeight - target.scrollTop - target.clientHeight < 80;
                        }}
                    >
                        {isLoading ? (
                            <div className="flex h-full items-center justify-center gap-3 text-sm font-semibold text-slate-400">
                                <Loader2 className="h-5 w-5 animate-spin text-lime-300" aria-hidden="true" />
                                Loading your trip assistant…
                            </div>
                        ) : !configured ? (
                            <StateCard
                                icon={AlertTriangle}
                                title="The VAIVIA assistant is temporarily unavailable"
                                body="Your trip and email importing are unaffected. The dedicated assistant key must be configured on the server."
                            />
                        ) : messages.length === 0 ? (
                            <div className="mx-auto flex h-full max-w-3xl flex-col justify-center py-6">
                                <div className="text-center">
                                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_30px_rgba(var(--vaivia-neon-rgb),0.12)]">
                                        <Sparkles className="h-7 w-7" aria-hidden="true" />
                                    </span>
                                    <h2 className="mt-5 text-2xl font-black sm:text-3xl">
                                        Ask about {tripTitle}
                                    </h2>
                                    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
                                        I can explain what is saved in this trip, find nearby
                                        places, and check current public events or visitor
                                        information. I can’t make changes, bookings, or route
                                        searches.
                                    </p>
                                </div>
                                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                                    {ASSISTANT_STARTER_PROMPTS.map((prompt) => (
                                        <button
                                            type="button"
                                            key={prompt}
                                            onClick={() => void sendMessage(prompt)}
                                            disabled={quotaReached}
                                            className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left text-sm font-bold leading-5 text-slate-200 transition hover:border-lime-300/30 hover:bg-lime-300/[0.07] disabled:opacity-40"
                                        >
                                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" aria-hidden="true" />
                                            <span>{prompt}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-3xl space-y-5">
                                {messages.map((message) => (
                                    <article
                                        key={message.id}
                                        className={`flex ${
                                            message.role === "user" ? "justify-end" : "justify-start"
                                        }`}
                                    >
                                        <div
                                            className={`max-w-[92%] rounded-[1.5rem] px-4 py-3 text-sm leading-7 sm:max-w-[82%] sm:px-5 ${
                                                message.role === "user"
                                                    ? "rounded-br-md bg-lime-300 font-semibold text-slate-950"
                                                    : "rounded-bl-md border border-white/10 bg-white/[0.055] text-slate-200"
                                            }`}
                                        >
                                            {message.role === "assistant" ? (
                                                <div>
                                                    {message.webGrounding ? (
                                                        <GroundedWebAnswer
                                                            content={message.content}
                                                            grounding={message.webGrounding}
                                                        />
                                                    ) : (
                                                        <SafeMarkdown content={message.content} />
                                                    )}
                                                    <PlaceRecommendationCards
                                                        recommendations={
                                                            message.recommendations || []
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="whitespace-pre-wrap">
                                                        {message.content}
                                                    </p>
                                                    {message.status === "failed" ? (
                                                        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] font-bold text-red-950/70">
                                                            <span>Assistant did not answer</span>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void sendMessage(message.content)
                                                                }
                                                                disabled={
                                                                    isSending || quotaReached
                                                                }
                                                                className="rounded-full border border-slate-950/20 px-2.5 py-1 hover:bg-slate-950/10 disabled:opacity-50"
                                                            >
                                                                Retry
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                ))}
                                {isSending ? (
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin text-lime-300" aria-hidden="true" />
                                        Reading your trip and approved live sources…
                                    </div>
                                ) : null}
                                <div ref={bottomRef} />
                            </div>
                        )}

                        {error ? (
                            <div
                                role="alert"
                                className="mx-auto mt-4 flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100"
                            >
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <div className="flex-1">
                                    <p>{error}</p>
                                    {lastFailedMessage && !quotaReached ? (
                                        <button
                                            type="button"
                                            onClick={() => void sendMessage(lastFailedMessage)}
                                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-100/20 px-3 py-1.5 text-xs font-black hover:bg-amber-100/10"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                            Retry request
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <footer className="border-t border-white/10 bg-slate-950/60 p-3 pb-[calc(0.75rem+var(--safe-area-bottom))] sm:p-5">
                        {configured && !placesConfigured ? (
                            <p
                                role="status"
                                className="mx-auto mb-3 max-w-3xl text-center text-xs font-bold text-amber-200"
                            >
                                Live nearby place discovery is temporarily unavailable. Saved-trip
                                questions still work.
                            </p>
                        ) : null}
                        {quotaReached ? (
                            <p className="mx-auto mb-3 max-w-3xl text-center text-xs font-bold text-amber-200">
                                You’ve reached today’s limit. Your allowance resets at 00:00 UTC.
                            </p>
                        ) : null}
                        <form
                            className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-2 focus-within:border-lime-300/35"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void sendMessage();
                            }}
                        >
                            <textarea
                                ref={composerRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value.slice(0, 4_000))}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void sendMessage();
                                    }
                                }}
                                rows={1}
                                maxLength={4_000}
                                disabled={!configured || quotaReached || isSending || isLoading}
                                placeholder={
                                    configured ? `Ask about ${tripTitle}…` : "Assistant unavailable"
                                }
                                aria-label="Ask the VAIVIA assistant"
                                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
                            />
                            <button
                                type="submit"
                                disabled={
                                    !input.trim() ||
                                    !configured ||
                                    quotaReached ||
                                    isSending ||
                                    isLoading
                                }
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lime-300 text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-600"
                                aria-label="Send message"
                            >
                                {isSending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        </form>
                        <p className="mx-auto mt-2 flex max-w-3xl items-start justify-center gap-1.5 text-center text-[10px] leading-4 text-slate-500">
                            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-lime-300/70" aria-hidden="true" />
                            <span>
                                Your allowlisted trip details and questions are sent to Google
                                Gemini. For explicit nearby discovery, a trusted saved trip
                                location and bounded query are sent server-side to Google Places.
                                Current-information questions may use Google Search grounding with
                                only the minimum necessary question, trip location, and dates.
                                Google states that grounding prompts, contextual information, and
                                output are stored for 30 days. Saved-trip-only questions do not
                                invoke Google Search. Sensitive details and precise coordinates are
                                not sent to Gemini or exposed in the browser. Current information
                                can change; verify important details with the cited source.{" "}
                                <Link
                                    href="/terms"
                                    className="font-bold text-slate-300 underline underline-offset-2 hover:text-white"
                                >
                                    VAIVIA privacy notice
                                </Link>
                                .
                            </span>
                        </p>
                    </footer>
                </div>
            </section>

            {pendingDelete ? (
                <AnimatedModal
                    onClose={() => setPendingDelete(null)}
                    panelClassName="max-w-lg"
                    labelledBy="delete-assistant-conversation-title"
                >
                    {({ requestClose }) => (
                        <div className="bg-[#05050c] p-6 text-white">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="vaivia-modal-eyebrow">VAIVIA Assistant</p>
                                    <h2
                                        id="delete-assistant-conversation-title"
                                        className="vaivia-modal-title"
                                    >
                                        Delete conversation?
                                    </h2>
                                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                                        This permanently removes “{pendingDelete.title}” and its
                                        saved messages from this trip.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="vaivia-modal-close"
                                    aria-label="Close delete conversation confirmation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={requestClose}
                                    disabled={isDeleting}
                                    className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.14] disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        void deleteConversation(pendingDelete, requestClose)
                                    }
                                    disabled={isDeleting}
                                    className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-black text-white transition hover:bg-red-400 disabled:opacity-50"
                                >
                                    {isDeleting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    )}
                                    Delete conversation
                                </button>
                            </div>
                        </div>
                    )}
                </AnimatedModal>
            ) : null}
        </>
    );
}

function StateCard({
    icon: Icon,
    title,
    body,
}: {
    icon: typeof AlertTriangle;
    title: string;
    body: string;
}) {
    return (
        <div className="flex h-full items-center justify-center p-4">
            <div className="max-w-md rounded-[1.75rem] border border-amber-300/20 bg-amber-300/[0.06] p-6 text-center">
                <Icon className="mx-auto h-8 w-8 text-amber-200" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
            </div>
        </div>
    );
}
