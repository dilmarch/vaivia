"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CloudSun, Newspaper, ShieldAlert, SmilePlus, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NewsFeedMode = "integrated" | "widget";

export type NewsFeedReaction = {
    post_key: string;
    emoji: string;
    user_id: string;
};

type NewsFeedPost = {
    key: string;
    type: "friends" | "weather" | "advisory" | "news";
    title: string;
    body: string;
    meta: string;
    borderClass: string;
};

export type StoredNewsFeedPost = {
    post_key: string;
    post_type: string;
    title: string;
    body: string;
    meta?: string | null;
    created_at?: string | null;
};

type NewsFeedClientProps = {
    mode: NewsFeedMode;
    userId: string;
    hasFriends: boolean;
    initialReactions: NewsFeedReaction[];
    initialPosts?: StoredNewsFeedPost[];
};

type NewsFeedReactionClient = {
    from: (table: "news_feed_reactions") => {
        delete: () => {
            eq: (column: string, value: string) => {
                eq: (column: string, value: string) => {
                    eq: (
                        column: string,
                        value: string
                    ) => Promise<{ error: unknown }>;
                };
            };
        };
        insert: (
            value: NewsFeedReaction
        ) => Promise<{ error: unknown }>;
    };
};

const POSTS: NewsFeedPost[] = [
    {
        key: "friends-profile-updates",
        type: "friends",
        title: "Friends",
        body: "Friend activity and profile updates will appear here when your friends add stamps, bucket-list places, or public trip milestones.",
        meta: "Friend updates",
        borderClass: "border-l-lime-300",
    },
    {
        key: "weather-environment-next-trips",
        type: "weather",
        title: "Weather & Environment",
        body: "Placeholder alerts for upcoming destinations: heat advisories, storms, air quality, and environmental disruptions will be summarized here.",
        meta: "Upcoming trips",
        borderClass: "border-l-sky-300",
    },
    {
        key: "travel-advisories-home-country",
        type: "advisory",
        title: "Travel Advisories",
        body: "Government advisories, transit strikes, airport disruptions, and entry-rule changes for your next 60 days of travel will live in this stream.",
        meta: "Advisory watch",
        borderClass: "border-l-amber-300",
    },
    {
        key: "local-news-trip-cities",
        type: "news",
        title: "Local News",
        body: "Local headlines for cities on upcoming trips will be grouped here so you can keep a light pulse on what is happening before arrival.",
        meta: "Cities in next 60 days",
        borderClass: "border-l-fuchsia-300",
    },
];

const REACTION_OPTIONS = [
    "😀",
    "😄",
    "😂",
    "🥹",
    "😊",
    "😍",
    "🤩",
    "😎",
    "🥳",
    "😮",
    "😱",
    "🤯",
    "😢",
    "😭",
    "😤",
    "😴",
    "🤔",
    "🫶",
    "👏",
    "🙌",
    "👍",
    "👎",
    "🙏",
    "💪",
    "👀",
    "💅",
    "🤝",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "💖",
    "💯",
    "✨",
    "🔥",
    "✅",
    "⭐",
    "🌈",
    "☀️",
    "🌧️",
    "⛈️",
    "❄️",
    "🌍",
    "🧳",
    "✈️",
    "🛫",
    "🛬",
    "🚆",
    "🚌",
    "⛴️",
    "🚕",
    "🚲",
    "🛵",
    "🗺️",
    "🧭",
    "🎟️",
    "🛂",
    "🏨",
    "🍽️",
    "🍕",
    "🍜",
    "🍣",
    "🍷",
    "☕",
    "🏖️",
    "🏔️",
    "🏙️",
    "🎭",
    "🎉",
    "📸",
    "📝",
    "🚨",
    "⚠️",
    "📌",
    "💡",
    "💸",
];

function normalizeCustomEmoji(value: string) {
    return Array.from(value.trim())[0] || "";
}

function getPostIcon(type: NewsFeedPost["type"]) {
    if (type === "friends") return UsersRound;
    if (type === "weather") return CloudSun;
    if (type === "advisory") return ShieldAlert;
    return Newspaper;
}

export default function NewsFeedClient({
    mode,
    userId,
    hasFriends,
    initialReactions,
    initialPosts = [],
}: NewsFeedClientProps) {
    const [feedMode, setFeedMode] = useState<NewsFeedMode>(mode);
    const [reactions, setReactions] = useState(initialReactions);
    const [activePicker, setActivePicker] = useState<string | null>(null);
    const [customEmojiByPost, setCustomEmojiByPost] = useState<Record<string, string>>(
        {}
    );

    const reactionsByPost = useMemo(() => {
        const next = new Map<string, Map<string, number>>();
        reactions.forEach((reaction) => {
            const postCounts = next.get(reaction.post_key) || new Map<string, number>();
            postCounts.set(reaction.emoji, (postCounts.get(reaction.emoji) || 0) + 1);
            next.set(reaction.post_key, postCounts);
        });
        return next;
    }, [reactions]);

    async function toggleReaction(postKey: string, emoji: string) {
        const existing = reactions.find(
            (reaction) =>
                reaction.post_key === postKey &&
                reaction.emoji === emoji &&
                reaction.user_id === userId
        );
        const supabase = createClient();

        if (existing) {
            setReactions((current) =>
                current.filter(
                    (reaction) =>
                        !(
                            reaction.post_key === postKey &&
                            reaction.emoji === emoji &&
                            reaction.user_id === userId
                        )
                )
            );
            await (supabase as unknown as NewsFeedReactionClient)
                .from("news_feed_reactions")
                .delete()
                .eq("post_key", postKey)
                .eq("emoji", emoji)
                .eq("user_id", userId);
        } else {
            setReactions((current) => [
                ...current,
                { post_key: postKey, emoji, user_id: userId },
            ]);
            await (supabase as unknown as NewsFeedReactionClient)
                .from("news_feed_reactions")
                .insert({ post_key: postKey, emoji, user_id: userId });
        }
    }

    async function updateFeedMode(nextMode: NewsFeedMode) {
        if (nextMode === feedMode) return;

        setFeedMode(nextMode);
        const supabase = createClient();
        const { error } = await supabase
            .from("user_preferences")
            .upsert({ user_id: userId, news_feed_mode: nextMode }, { onConflict: "user_id" });

        if (error) {
            setFeedMode(feedMode);
            console.error("Could not update news feed layout", error);
        }
    }

    async function submitCustomReaction(postKey: string) {
        const emoji = normalizeCustomEmoji(customEmojiByPost[postKey] || "");
        if (!emoji) return;

        await toggleReaction(postKey, emoji);
        setCustomEmojiByPost((current) => ({ ...current, [postKey]: "" }));
        setActivePicker(null);
    }

    const dynamicPosts = useMemo<NewsFeedPost[]>(() => {
        return initialPosts.map((post) => ({
            key: post.post_key,
            type:
                post.post_type === "weather" ||
                post.post_type === "advisory" ||
                post.post_type === "news"
                    ? post.post_type
                    : "friends",
            title: post.title,
            body: post.body,
            meta: post.meta || "Friend update",
            borderClass: "border-l-lime-300",
        }));
    }, [initialPosts]);

    const feedPosts = useMemo(() => {
        return [...dynamicPosts, ...POSTS];
    }, [dynamicPosts]);

    function renderPost(post: NewsFeedPost, compact = false) {
        const Icon = getPostIcon(post.type);
        const counts = reactionsByPost.get(post.key) || new Map<string, number>();
        const isFriendCtaPost = post.key === "friends-profile-updates";
        const postBody =
            isFriendCtaPost && !hasFriends
                ? "Please add friends to see friend updates in your news feed."
                : post.body;

        return (
            <article
                key={post.key}
                className={`relative flex h-full flex-col rounded-[1.5rem] border border-white/10 border-l-8 ${post.borderClass} bg-white/[0.06] p-5 text-white shadow-2xl shadow-black/25`}
            >
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 text-lime-200">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/80">
                            {post.meta}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-white">
                            {post.title}
                        </h2>
                        <p
                            className={`mt-2 text-sm font-semibold leading-6 text-slate-300 ${
                                compact ? "line-clamp-4" : ""
                            }`}
                        >
                            {postBody}
                        </p>
                        {isFriendCtaPost ? (
                            <Link
                                href="/profile?modal=friends"
                                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                            >
                                Add friends
                            </Link>
                        ) : null}
                    </div>
                </div>

                {!isFriendCtaPost ? (
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                        {Array.from(counts.entries()).map(([emoji, count]) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(post.key, emoji)}
                                className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-sm font-black text-slate-100 transition hover:border-lime-300/40 hover:bg-white/[0.1]"
                            >
                                {emoji} {count}
                            </button>
                        ))}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() =>
                                    setActivePicker((current) =>
                                        current === post.key ? null : post.key
                                    )
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-sm font-black text-slate-100 transition hover:border-lime-300/40 hover:bg-white/[0.14]"
                                aria-label={`React to ${post.title}`}
                            >
                                <SmilePlus className="h-4 w-4" aria-hidden="true" />
                                React
                            </button>
                            {activePicker === post.key ? (
                                <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-[1.5rem] border border-white/20 bg-white/[0.14] p-3 text-white shadow-2xl shadow-black/45 backdrop-blur-2xl ring-1 ring-white/10">
                                    <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                                        {REACTION_OPTIONS.map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => {
                                                    toggleReaction(post.key, emoji);
                                                    setActivePicker(null);
                                                }}
                                                className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-white/20 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-lime-200/70"
                                                aria-label={`React with ${emoji}`}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/45 p-1.5">
                                        <input
                                            value={customEmojiByPost[post.key] || ""}
                                            onChange={(event) =>
                                                setCustomEmojiByPost((current) => ({
                                                    ...current,
                                                    [post.key]: event.target.value,
                                                }))
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    submitCustomReaction(post.key);
                                                }
                                            }}
                                            className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-white placeholder:text-slate-300 focus:outline-none"
                                            placeholder="Type any emoji"
                                            aria-label="Type or paste any emoji"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => submitCustomReaction(post.key)}
                                            className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-lime-200"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </article>
        );
    }

    const layoutToggle = (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-3 text-white shadow-2xl shadow-black/20">
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/80">
                    Feed layout
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-300">
                    Switch between one feed or four widgets.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {(["integrated", "widget"] as const).map((nextMode) => {
                    const isSelected = feedMode === nextMode;

                    return (
                        <button
                            key={nextMode}
                            type="button"
                            onClick={() => updateFeedMode(nextMode)}
                            aria-pressed={isSelected}
                            className={`min-h-11 rounded-full px-4 text-sm font-black transition ${
                                isSelected
                                    ? "bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                    : "border border-white/10 bg-slate-950/70 text-slate-100 hover:border-lime-300/40 hover:bg-white/[0.1]"
                            }`}
                        >
                            {nextMode === "integrated" ? "Integrated" : "Widget"}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    if (feedMode === "widget") {
        return (
            <>
                {layoutToggle}
                <div className="grid gap-5 lg:grid-cols-2">
                    {feedPosts.map((post) => renderPost(post, true))}
                </div>
            </>
        );
    }

    return (
        <>
            {layoutToggle}
            <div className="space-y-5">{feedPosts.map((post) => renderPost(post))}</div>
        </>
    );
}
