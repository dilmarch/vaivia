import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Globe2 } from "lucide-react";
import { redirect } from "next/navigation";
import ScratchMap from "@/components/maps/ScratchMap";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Scratch Map - VAIVIA",
};

function getYearFromDate(value?: string | null) {
    if (!value) return null;
    const year = Number(String(value).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
}

export default async function ScratchMapPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [stampsResult, scratchedResult] = await Promise.all([
        (supabase.from as any)("user_passport_stamps")
            .select("country_code,country_name,first_visited_on,stamped_at,created_at")
            .eq("user_id", user.id),
        (supabase.from as any)("user_scratch_map_countries")
            .select("country_code")
            .eq("user_id", user.id),
    ]);

    if (stampsResult.error) {
        console.error("Could not load scratch map passport stamps:", {
            message: stampsResult.error.message,
            code: stampsResult.error.code,
            details: stampsResult.error.details,
        });
        throw new Error("Could not load scratch map.");
    }

    if (scratchedResult.error) {
        console.error("Could not load scratch map scratched countries:", {
            message: scratchedResult.error.message,
            code: scratchedResult.error.code,
            details: scratchedResult.error.details,
        });
        throw new Error("Could not load scratch map.");
    }

    const stampRows = (stampsResult.data || []) as Array<{
        country_code?: string | null;
        country_name?: string | null;
        first_visited_on?: string | null;
        stamped_at?: string | null;
        created_at?: string | null;
    }>;
    const scratchedRows = (scratchedResult.data || []) as Array<{
        country_code?: string | null;
    }>;
    const visitedCountryCodes = Array.from(
        new Set(
            stampRows
                .flatMap((stamp) => [stamp.country_code, stamp.country_name])
                .filter(Boolean) as string[]
        )
    );
    const visitedCountryYears = stampRows.reduce<Record<string, number[]>>(
        (yearsByCountry, stamp) => {
            const countryCode = stamp.country_code?.trim().toUpperCase();
            const year =
                getYearFromDate(stamp.first_visited_on) ||
                getYearFromDate(stamp.stamped_at) ||
                getYearFromDate(stamp.created_at);

            if (!countryCode || !year) return yearsByCountry;

            yearsByCountry[countryCode] = Array.from(
                new Set([...(yearsByCountry[countryCode] || []), year])
            ).sort((yearA, yearB) => yearB - yearA);

            return yearsByCountry;
        },
        {}
    );
    const scratchedCountryCodes = Array.from(
        new Set(
            scratchedRows
                .map((country) => country.country_code?.trim().toUpperCase() || "")
                .filter(Boolean)
        )
    );

    return (
        <main className="min-h-screen overflow-x-hidden bg-[#050712] px-4 pb-[calc(7rem+var(--safe-area-bottom))] pt-[calc(5.75rem+var(--safe-area-top))] text-white sm:px-6 md:px-10 md:pb-12 md:pt-28">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                    <Link
                        href="/profile"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 shadow-xl shadow-black/20 transition hover:bg-white/[0.14]"
                        aria-label="Back to profile"
                        prefetch
                    >
                        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                    </Link>
                    <div className="min-w-0 flex-1 text-right">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                            Passport profile
                        </p>
                        <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-white sm:text-5xl">
                            Scratch map
                        </h1>
                    </div>
                </div>

                <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/30 sm:p-5">
                    <div className="mb-4 flex items-center gap-2 px-1">
                        <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                        <p className="text-sm font-semibold text-slate-300">
                            Use scratch mode to mark visited countries, or view mode to explore.
                        </p>
                    </div>
                    <ScratchMap
                        userId={user.id}
                        visitedCountryCodes={visitedCountryCodes}
                        visitedCountryYears={visitedCountryYears}
                        scratchedCountryCodes={scratchedCountryCodes}
                        settingsHref="/profile"
                        statsClassName="grid grid-cols-3 gap-2"
                        mapViewportClassName="relative min-h-[58vh] w-full sm:aspect-[2/1] sm:min-h-0"
                    />
                </section>
            </div>
        </main>
    );
}
