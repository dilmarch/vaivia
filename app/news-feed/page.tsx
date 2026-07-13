import { redirect } from "next/navigation";
import NewsFeedClient from "@/components/NewsFeedClient";
import { createClient } from "@/lib/supabase/server";

export default async function NewsFeedPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data: preferences },
        { data: reactions },
        { count: friendCount },
        { data: userPosts },
    ] =
        await Promise.all([
        supabase
            .from("user_preferences")
            .select("news_feed_mode")
            .eq("user_id", user.id)
            .maybeSingle(),
        supabase
            .from("news_feed_reactions" as any)
            .select("post_key,emoji,user_id"),
        (supabase.from as any)("user_friendships")
            .select("id", { count: "exact", head: true })
            .eq("status", "accepted")
            .or(`requester_user_id.eq.${user.id},addressee_user_id.eq.${user.id}`),
        (supabase.from as any)("news_feed_posts")
            .select("post_key,post_type,title,body,meta,created_at")
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(25),
    ]);

    const mode =
        (preferences as { news_feed_mode?: string } | null)?.news_feed_mode === "widget"
            ? "widget"
            : "integrated";

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-[calc(7rem+var(--safe-area-bottom))] pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-8 md:pl-28 md:pr-8 md:pt-16">
            <div className="mx-auto max-w-6xl">
                <div className="mb-6 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_34%),rgba(255,255,255,0.06)] p-6 shadow-2xl shadow-black/30">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                        VAIVIA news
                    </p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                        News Feed
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                        Friend activity, weather placeholders, travel advisory placeholders,
                        and destination news for upcoming travel will collect here.
                    </p>
                </div>

                <NewsFeedClient
                    mode={mode}
                    userId={user.id}
                    hasFriends={Boolean(friendCount && friendCount > 0)}
                    initialReactions={(reactions || []) as any}
                    initialPosts={(userPosts || []) as any}
                />
            </div>
        </main>
    );
}
