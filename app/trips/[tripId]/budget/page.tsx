import { redirect, notFound } from "next/navigation";
import BudgetFeatureClient from "@/components/budget/BudgetFeatureClient";
import TripPageHero from "@/components/TripPageHero";
import { getCurrencyMetadata } from "@/lib/currency";
import {
    asUntypedSupabase,
    loadBudgetParticipants,
    loadTripBudgetData,
    loadTripExpenseData,
} from "@/lib/budgetServer";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
    params: Promise<{ tripId: string }>;
};

const CURRENCY_FLAG_MAP: Record<string, string> = {
    AUD: "🇦🇺",
    BRL: "🇧🇷",
    CAD: "🇨🇦",
    CHF: "🇨🇭",
    EUR: "🇪🇺",
    GBP: "🇬🇧",
    JPY: "🇯🇵",
    KRW: "🇰🇷",
    MXN: "🇲🇽",
    NZD: "🇳🇿",
    THB: "🇹🇭",
    TWD: "🇹🇼",
    USD: "🇺🇸",
    VND: "🇻🇳",
};

function CurrencyHeroSummary({ currency }: { currency: string }) {
    const metadata = getCurrencyMetadata(currency);
    const code = metadata?.code || currency;

    return (
        <div className="flex h-30 w-28 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-xl shadow-black/20 sm:h-32 sm:w-32">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/70 text-2xl ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] sm:h-12 sm:w-12 sm:text-3xl">
                <span aria-hidden="true">{CURRENCY_FLAG_MAP[code] || "💱"}</span>
            </div>
            <div className="min-w-0 text-center leading-tight">
                <div className="line-clamp-1 text-sm font-black text-white">
                    {code}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-400">
                    {metadata?.name || "Currency"}
                </div>
            </div>
        </div>
    );
}

async function loadBudgetPageData(tripId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,title,destination")
        .eq("id", tripId)
        .maybeSingle();

    if (tripError) {
        console.warn("Could not load trip for budget page:", {
            message: tripError.message,
            code: tripError.code,
            details: tripError.details,
        });
    }

    if (!trip) notFound();

    const db = asUntypedSupabase(supabase);
    const { data: financeSettings } = await db
        .from("user_finance_settings")
        .select("home_currency")
        .eq("user_id", user.id)
        .maybeSingle();
    const defaultCurrency =
        typeof financeSettings?.home_currency === "string"
            ? financeSettings.home_currency
            : "CAD";

    const [budgetData, expenseData, participants] = await Promise.all([
        loadTripBudgetData(tripId),
        loadTripExpenseData(tripId),
        loadBudgetParticipants(tripId, user.id),
    ]);

    return {
        tripTitle: trip.title || trip.destination || "Trip",
        defaultCurrency,
        participants,
        budget: budgetData.budget,
        lineItems: budgetData.lineItems,
        expenses: expenseData.expenses,
        splits: expenseData.splits,
    };
}

export default async function TripBudgetPage({ params }: PageProps) {
    const { tripId } = await params;
    const data = await loadBudgetPageData(tripId);

    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
            <TripPageHero
                tripId={tripId}
                pageLabel="Budget"
                revalidatePathname={`/trips/${tripId}/budget`}
                summaryContent={
                    <CurrencyHeroSummary
                        currency={
                            data.budget?.reporting_currency || data.defaultCurrency
                        }
                    />
                }
            />
            <BudgetFeatureClient
                tripId={tripId}
                mode="budget"
                {...data}
            />
        </main>
    );
}
