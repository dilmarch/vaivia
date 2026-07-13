"use client";

import {
    Bed,
    Car,
    Compass,
    Luggage,
    MapPin,
    Plane,
    Route,
    Send,
    Star,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import PassportStamp from "@/components/PassportStamp";
import { createClient } from "@/lib/supabase/client";

export type VaiviaLoadingScreenProps = {
    title?: string;
    subtitle?: string;
    compact?: boolean;
    passportStampFlag?: string | null;
};

type LoadingPassportStamp = {
    countryName: string;
    countryCode: string;
    flagEmoji: string;
    firstVisitYear?: string | null;
    welcomeLabel?: string | null;
    airportCode?: string | null;
    airportCity?: string | null;
};

const loadingChips = [
    {
        label: "Flights",
        icon: Plane,
        className:
            "left-2 top-8 -rotate-12 border-lime-300/35 text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]",
    },
    {
        label: "Hotels",
        icon: Bed,
        className:
            "right-5 top-3 rotate-6 border-violet-400/40 text-violet-300 shadow-[0_0_24px_rgba(124,60,255,0.22)]",
    },
    {
        label: "Transfers",
        icon: Car,
        className:
            "left-12 top-24 -rotate-6 border-lime-300/35 text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]",
    },
    {
        label: "Activities",
        icon: Star,
        className:
            "right-0 top-24 rotate-8 border-pink-400/45 text-pink-300 shadow-[0_0_24px_rgba(255,54,190,0.22)]",
    },
    {
        label: "Local tips",
        icon: MapPin,
        className:
            "right-8 top-40 rotate-3 border-violet-400/40 text-violet-300 shadow-[0_0_24px_rgba(124,60,255,0.22)]",
    },
];

type LoadingHeroIcon = {
    label: string;
    Icon?: LucideIcon;
    className?: string;
    isPassportStamp?: boolean;
    isBoardingPass?: boolean;
    weight?: number;
};

function BoardingPassLoaderIcon({ className = "" }: { className?: string }) {
    return (
        <span
            className={`relative inline-flex items-center justify-center ${className}`}
            aria-hidden="true"
        >
            <svg
                viewBox="0 0 180 112"
                className="h-full w-full overflow-visible"
                fill="none"
            >
                <path
                    d="M16 19c0-5.5 4.5-10 10-10h128c5.5 0 10 4.5 10 10v15c-6.1 0-11 4.9-11 11s4.9 11 11 11v37c0 5.5-4.5 10-10 10H26c-5.5 0-10-4.5-10-10V56c6.1 0 11-4.9 11-11s-4.9-11-11-11V19Z"
                    className="stroke-current"
                    strokeWidth="5"
                    strokeLinejoin="round"
                />
                <path
                    d="M118 13v86"
                    className="stroke-current opacity-60"
                    strokeDasharray="7 7"
                    strokeLinecap="round"
                    strokeWidth="3"
                />
                <path
                    d="M34 33h51M34 51h34M34 75h60"
                    className="stroke-current opacity-80"
                    strokeLinecap="round"
                    strokeWidth="4"
                />
                <path
                    d="M130 32h19M130 49h19M130 66h19"
                    className="stroke-current opacity-75"
                    strokeLinecap="round"
                    strokeWidth="3.5"
                />
                <path
                    d="m71 51 24-11c2.5-1.1 5.3.7 5.3 3.5 0 1.4-.8 2.7-2.1 3.4L74 60l-15-7.7"
                    className="stroke-current"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                />
                <path
                    d="M42 87h50"
                    className="stroke-current opacity-45"
                    strokeLinecap="round"
                    strokeWidth="3"
                    strokeDasharray="3 6"
                />
            </svg>
        </span>
    );
}

const heroIcons: LoadingHeroIcon[] = [
    {
        label: "Paper plane",
        Icon: Send,
        className: "-rotate-12",
    },
    {
        label: "Compass star",
        Icon: Compass,
        className: "rotate-6",
    },
    {
        label: "Passport stamp",
        Icon: Send,
        isPassportStamp: true,
        weight: 5,
    },
    {
        label: "Suitcase tag",
        Icon: Luggage,
        className: "-rotate-6",
    },
    {
        label: "Route path",
        Icon: Route,
        className: "rotate-3",
    },
    {
        label: "Boarding pass",
        isBoardingPass: true,
        className: "-rotate-3",
    },
];

function getYearFromDate(value?: string | null) {
    if (!value) return null;
    const year = Number(String(value).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? String(year) : null;
}

function getRandomArrayItem<T>(items: T[]) {
    return items[Math.floor(Math.random() * items.length)] || null;
}

function getWeightedHeroIconIndexes(hasPassportStamps: boolean) {
    return heroIcons.flatMap((icon, index) => {
        if (icon.isPassportStamp && !hasPassportStamps) return [];
        return Array.from({ length: icon.weight || 1 }, () => index);
    });
}

async function loadEarnedPassportStamps() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .from("user_passport_stamps")
        .select(
            "country_code,country_name,flag_emoji,first_visited_on,stamped_at,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag,first_entry_iata_code,first_entry_icao_code,first_entry_city,port_of_entry_name"
        )
        .eq("user_id", user.id)
        .order("stamped_at", { ascending: false })
        .limit(50);

    if (error) {
        console.warn("Could not load passport stamps for loading screen:", error);
        return [];
    }

    return ((data || []) as Array<{
        country_code?: string | null;
        country_name?: string | null;
        flag_emoji?: string | null;
        first_visited_on?: string | null;
        stamped_at?: string | null;
        welcome_label_snapshot?: string | null;
        arrival_label_snapshot?: string | null;
        stamp_display_country_name?: string | null;
        stamp_display_flag?: string | null;
        first_entry_iata_code?: string | null;
        first_entry_icao_code?: string | null;
        first_entry_city?: string | null;
        port_of_entry_name?: string | null;
    }>)
        .map<LoadingPassportStamp | null>((stamp) => {
            const countryCode = String(stamp.country_code || "")
                .trim()
                .toUpperCase();
            if (!/^[A-Z]{2}$/.test(countryCode)) return null;

            return {
                countryName:
                    stamp.stamp_display_country_name ||
                    stamp.country_name ||
                    countryCode,
                countryCode,
                flagEmoji: stamp.stamp_display_flag || stamp.flag_emoji || "",
                firstVisitYear:
                    getYearFromDate(stamp.first_visited_on) ||
                    getYearFromDate(stamp.stamped_at) ||
                    null,
                welcomeLabel:
                    stamp.welcome_label_snapshot ||
                    stamp.arrival_label_snapshot ||
                    null,
                airportCode:
                    stamp.first_entry_iata_code ||
                    stamp.first_entry_icao_code ||
                    null,
                airportCity:
                    stamp.first_entry_city ||
                    stamp.port_of_entry_name ||
                    null,
            } satisfies LoadingPassportStamp;
        })
        .filter((stamp): stamp is LoadingPassportStamp => Boolean(stamp));
}

export default function VaiviaLoadingScreen({
    title = "Curating your itinerary",
    subtitle = "Handpicking the best experiences just for you.",
    compact = false,
    passportStampFlag = null,
}: VaiviaLoadingScreenProps) {
    const [heroIconIndex, setHeroIconIndex] = useState(0);
    const [passportStamp, setPassportStamp] =
        useState<LoadingPassportStamp | null>(null);

    useEffect(() => {
        let isCancelled = false;

        async function chooseHeroIcon() {
            const passportStamps = await loadEarnedPassportStamps();
            if (isCancelled) return;

            const selectedPassportStamp = getRandomArrayItem(passportStamps);
            setPassportStamp(selectedPassportStamp);

            const weightedIndexes = getWeightedHeroIconIndexes(
                Boolean(selectedPassportStamp)
            );
            const weightedIndex =
                weightedIndexes[Math.floor(Math.random() * weightedIndexes.length)] ||
                0;
            setHeroIconIndex(weightedIndex);
        }

        void chooseHeroIcon();

        return () => {
            isCancelled = true;
        };
    }, []);

    const HeroIcon = heroIcons[heroIconIndex] || heroIcons[0];
    const { Icon, className: heroIconClassName = "" } = HeroIcon;
    const cardWidthClass = HeroIcon.isPassportStamp || HeroIcon.isBoardingPass
        ? compact
            ? "max-w-[460px]"
            : "max-w-[540px]"
        : compact
          ? "max-w-[400px]"
          : "max-w-[440px]";
    const cardPaddingClass =
        HeroIcon.isPassportStamp || HeroIcon.isBoardingPass
            ? "p-8 md:p-10"
            : "p-8";

    return (
        <main className="vaivia-loading-screen fixed inset-0 z-[90] overflow-y-auto bg-[#0c0115] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(var(--vaivia-neon-rgb),0.16),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(255,54,190,0.18),transparent_28%),linear-gradient(180deg,#0c0115_0%,#05030b_52%,#0c0115_100%)]" />
            <div className="vaivia-loading-backdrop-image absolute inset-0 bg-[url('/dashboard-bg.png')] bg-cover bg-center opacity-20 mix-blend-screen" />
            <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />

            <div className="relative z-10 flex min-h-full w-full items-center justify-center px-5 pb-[max(2.5rem,var(--safe-area-bottom))] pt-[max(2.5rem,var(--safe-area-top))]">
                <section className="flex w-full justify-center px-0 md:px-10">
                    <div
                        className={`vaivia-loading-card relative w-full ${cardWidthClass} overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.055] ${cardPaddingClass} shadow-2xl shadow-black/50 backdrop-blur-2xl`}
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(var(--vaivia-neon-rgb),0.22),transparent_24%),radial-gradient(circle_at_86%_28%,rgba(255,54,190,0.18),transparent_28%),radial-gradient(circle_at_58%_56%,rgba(124,60,255,0.22),transparent_32%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_30%,rgba(255,255,255,0.03))]" />
                        <div className="pointer-events-none absolute inset-px rounded-[2.2rem] border border-white/10" />

                        <div className="relative z-10">
                            {HeroIcon.isPassportStamp ? (
                                <div className={`mb-7 inline-flex ${heroIconClassName}`}>
                                    <PassportStamp
                                        countryName={
                                            passportStamp?.countryName || "Passport"
                                        }
                                        countryCode={
                                            passportStamp?.countryCode || "VA"
                                        }
                                        flagEmoji={
                                            passportStamp?.flagEmoji ||
                                            passportStampFlag ||
                                            "✈️"
                                        }
                                        firstVisitYear={
                                            passportStamp?.firstVisitYear || undefined
                                        }
                                        welcomeLabel={
                                            passportStamp?.welcomeLabel || "WELCOME"
                                        }
                                        airportCode={
                                            passportStamp?.airportCode || undefined
                                        }
                                        airportCity={
                                            passportStamp?.airportCity || undefined
                                        }
                                        size="sm"
                                    />
                                </div>
                            ) : HeroIcon.isBoardingPass ? (
                                <BoardingPassLoaderIcon
                                    className={`mb-7 h-11 w-20 text-lime-300 drop-shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.78)] md:h-14 md:w-[6.3rem] ${heroIconClassName}`}
                                />
                            ) : (
                                Icon ? (
                                    <Icon
                                        className={`mb-5 h-7 w-7 text-lime-300 drop-shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.9)] ${heroIconClassName}`}
                                        aria-hidden="true"
                                    />
                                ) : null
                            )}
                            <h1 className="vaivia-loading-title text-2xl font-black tracking-tight text-white md:text-3xl">
                                {title}
                            </h1>
                            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                                {subtitle}
                            </p>
                        </div>

                        <div className="relative z-10 mt-10 h-56">
                            {loadingChips.map(({ label, icon: Icon, className }) => (
                                <div
                                    key={label}
                                    className={`vaivia-loading-chip absolute inline-flex items-center gap-2 rounded-full border bg-slate-950/55 px-4 py-2.5 text-sm font-black backdrop-blur-xl transition ${className}`}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <div className="relative z-10 mt-8 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-lime-300 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.75)] animate-vaivia-loading-bar" />
                            </div>
                            <span className="text-xs font-black text-lime-300">65%</span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
