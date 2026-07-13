import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Closed Tasks - VAIVIA Admin",
};

type FeatureSuggestion = {
    id: string;
    user_id: string;
    suggestion_type: string;
    title: string | null;
    message: string;
    current_path: string | null;
    contact_email: string | null;
    status: string;
    created_at: string;
};

function formatDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function getSuggestionStatusBorderClass(status: string) {
    switch (status) {
        case "archived":
            return "border-l-black";
        case "implemented":
            return "border-l-sky-400";
        default:
            return "border-l-white/20";
    }
}

async function reopenFeatureSuggestion(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") {
        throw new Error("Only super admins can update feature requests.");
    }

    const suggestionId = String(formData.get("suggestion_id") || "");
    const { error } = await supabase
        .from("feature_suggestions")
        .update({
            status: "open",
            updated_at: new Date().toISOString(),
        })
        .eq("id", suggestionId);

    if (error) {
        console.error("Could not reopen feature suggestion:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            suggestionId,
        });
        throw new Error(`Could not reopen feature request: ${error.message}`);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/closed-tasks");
}

export default async function ClosedAdminTasksPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") redirect("/");

    const { data, error } = await supabase
        .from("feature_suggestions")
        .select(
            "id,user_id,suggestion_type,title,message,current_path,contact_email,status,created_at"
        )
        .in("status", ["archived", "implemented"])
        .order("created_at", { ascending: false })
        .limit(250);

    if (error) {
        console.error("Could not load closed feature suggestions:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        throw new Error(`Could not load closed tasks: ${error.message}`);
    }

    const suggestions = (data || []) as FeatureSuggestion[];

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-5xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                    <Link
                        href="/admin"
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to admin
                    </Link>
                    <p className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        Closed tasks
                    </p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                        Completed user issues
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                        Feature requests and issue reports checked off from the admin dashboard.
                    </p>
                </header>

                <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                Archive
                            </p>
                            <h2 className="mt-2 text-2xl font-black">
                                Closed requests
                            </h2>
                        </div>
                        <p className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">
                            {suggestions.length} closed / archived
                        </p>
                    </div>

                    <div className="mt-5 space-y-3">
                        {suggestions.length > 0 ? (
                            suggestions.map((suggestion) => (
                                <article
                                    key={suggestion.id}
                                    className={`rounded-[1.25rem] border border-l-8 border-white/10 bg-slate-950/55 p-4 text-white ${getSuggestionStatusBorderClass(
                                        suggestion.status
                                    )}`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/80">
                                                {suggestion.suggestion_type} · {suggestion.status}
                                            </p>
                                            <h3 className="mt-2 text-lg font-black">
                                                {suggestion.title || "Untitled request"}
                                            </h3>
                                            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-300">
                                                {suggestion.message}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-400">
                                                <span>
                                                    {formatDate(suggestion.created_at.slice(0, 10))}
                                                </span>
                                                {suggestion.contact_email ? (
                                                    <span>{suggestion.contact_email}</span>
                                                ) : null}
                                                {suggestion.current_path ? (
                                                    <span>{suggestion.current_path}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <form action={reopenFeatureSuggestion}>
                                            <input
                                                type="hidden"
                                                name="suggestion_id"
                                                value={suggestion.id}
                                            />
                                            <button
                                                type="submit"
                                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.14]"
                                            >
                                                <Circle className="h-4 w-4" aria-hidden="true" />
                                                Reopen
                                            </button>
                                        </form>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-300">
                                No closed tasks yet.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
