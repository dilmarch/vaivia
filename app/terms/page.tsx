import type { Metadata } from "next";
import Link from "next/link";
import {
    DEFAULT_TERMS_CONTENT,
    DEFAULT_TERMS_TITLE,
    renderTermsMarkdown,
} from "@/lib/terms/defaultTerms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Terms and Privacy - VAIVIA",
    description: "VAIVIA terms, privacy notice, and data rights information.",
};

type TermsVersion = {
    title?: string | null;
    content?: string | null;
    published_at?: string | null;
};

type TermsPageClient = {
    from: (table: "terms_versions") => {
        select: (columns: string) => {
            order: (
                column: string,
                options?: { ascending?: boolean }
            ) => {
                limit: (count: number) => {
                    maybeSingle: () => Promise<{
                        data: TermsVersion | null;
                        error: unknown;
                    }>;
                };
            };
        };
    };
};

export default async function TermsPage() {
    const supabase = await createClient();
    const [
        { data },
        {
            data: { user },
        },
    ] = await Promise.all([
        (supabase as unknown as TermsPageClient)
            .from("terms_versions")
            .select("title,content,published_at")
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase.auth.getUser(),
    ]);

    const terms = (data || {}) as TermsVersion;
    const title = terms.title?.trim() || DEFAULT_TERMS_TITLE;
    const content = terms.content?.trim() || DEFAULT_TERMS_CONTENT;
    const publishedAt = terms.published_at
        ? new Intl.DateTimeFormat("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
          }).format(new Date(terms.published_at))
        : "July 2026";
    const blocks = renderTermsMarkdown(content);

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 py-10 text-white md:px-8">
            <article className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-[#03030a]/95 p-6 shadow-2xl shadow-black/35 md:p-10">
                <Link
                    href={user ? "/" : "/auth/login"}
                    className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.12]"
                >
                    Back to VAIVIA
                </Link>
                <p className="mt-8 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                    Legal
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                    {title}
                </h1>
                <p className="mt-3 text-sm font-semibold text-slate-400">
                    Published {publishedAt}. This page is available to every
                    VAIVIA visitor, whether signed in or not.
                </p>
                <div className="mt-8 space-y-5 text-slate-200">
                    {blocks.map((block) => {
                        if (block.type === "h1") {
                            return (
                                <h2
                                    key={block.key}
                                    className="text-3xl font-black text-white"
                                >
                                    {block.text}
                                </h2>
                            );
                        }

                        if (block.type === "h2") {
                            return (
                                <h3
                                    key={block.key}
                                    className="pt-3 text-xl font-black text-lime-100"
                                >
                                    {block.text}
                                </h3>
                            );
                        }

                        return (
                            <p
                                key={block.key}
                                className="text-sm font-semibold leading-7 text-slate-300"
                            >
                                {block.text}
                            </p>
                        );
                    })}
                </div>
            </article>
        </main>
    );
}
