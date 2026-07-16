import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Globe2 } from "lucide-react";
import { redirect } from "next/navigation";
import ScratchMap from "@/components/maps/ScratchMap";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Friend Scratch Map - VAIVIA",
};

type FriendScratchMapPageProps = {
    params: Promise<{
        friendId: string;
    }>;
};

function getYearFromDate(value?: string | null) {
    if (!value) return null;
    const year = Number(String(value).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
}

function getFriendDisplayName(profile: Record<string, unknown>) {
    const firstName = String(profile.first_name || "").trim();
    const lastName = String(profile.last_name || "").trim();
    const username = String(profile.username || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    return fullName || username || "Friend";
}

export default async function FriendScratchMapPage({
    params,
}: FriendScratchMapPageProps) {
    const { friendId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data, error } = await (supabase.rpc as any)(
        "get_friend_profile_snapshot",
        { target_user_id: friendId }
    );

    if (error) {
        console.error("Could not load friend scratch map:", {
            message: error.message,
            code: error.code,
            details: error.details,
            friendId,
        });
        redirect("/profile");
    }

    const profile = (data?.profile || {}) as Record<string, unknown>;
    const stampRows: any[] = Array.isArray(data?.stamps) ? data.stamps : [];
    const scratchRows: any[] = Array.isArray(data?.scratchMapCountries)
        ? data.scratchMapCountries
        : [];
    const friendName = getFriendDisplayName(profile);
    const visitedCountryCodes = Array.from(
        new Set(
            stampRows
                .flatMap((stamp: any) => [stamp.country_code, stamp.country_name])
                .filter(Boolean) as string[]
        )
    );
    const visitedCountryYears = stampRows.reduce<Record<string, number[]>>(
        (yearsByCountry, stamp: any) => {
            const countryCode = String(stamp.country_code || "")
                .trim()
                .toUpperCase();
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
            scratchRows
                .map((country: any) =>
                    String(country.country_code || "")
                        .trim()
                        .toUpperCase()
                )
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
                            Friend profile
                        </p>
                        <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-white sm:text-5xl">
                            {friendName}'s scratch map
                        </h1>
                    </div>
                </div>

                <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/30 sm:p-5">
                    <div className="mb-4 flex items-center gap-2 px-1">
                        <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                        <p className="text-sm font-semibold text-slate-300">
                            View their visited and scratched-off countries.
                        </p>
                    </div>
                    <ScratchMap
                        visitedCountryCodes={visitedCountryCodes}
                        visitedCountryYears={visitedCountryYears}
                        scratchedCountryCodes={scratchedCountryCodes}
                        settingsHref="/profile"
                        statsClassName="grid grid-cols-3 gap-2"
                        mapViewportClassName="relative h-[62vh] w-full sm:aspect-[2/1] sm:h-auto"
                        readOnly
                    />
                </section>
            </div>
        </main>
    );
}
