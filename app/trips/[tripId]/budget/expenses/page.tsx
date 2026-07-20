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
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";

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

async function loadExpensesPageData(tripRouteParam: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const resolvedTrip = await resolveTripRouteParam<{
        id: string;
        slug?: string | null;
        title?: string | null;
        destination?: string | null;
    }>(supabase, tripRouteParam, "id,slug,title,destination");

    if (resolvedTrip.error) {
        console.warn("Could not load trip for expenses page:", {
            message: resolvedTrip.error.message,
            code: resolvedTrip.error.code,
            details: resolvedTrip.error.details,
        });
    }

    const trip = resolvedTrip.trip;
    if (!trip) notFound();
    if (resolvedTrip.shouldRedirect) {
        redirect(getTripHref(trip, "/budget/expenses"));
    }

    const tripId = resolvedTrip.tripId;

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
        tripId,
        tripTitle: trip.title || trip.destination || "Trip",
        tripRouteSegment: resolvedTrip.routeSegment,
        defaultCurrency,
        participants,
        budget: budgetData.budget,
        lineItems: budgetData.lineItems,
        expenseCategories: budgetData.categories,
        expenses: expenseData.expenses,
        splits: expenseData.splits,
        settlementPayments: expenseData.settlements,
    };
}

export default async function TripExpensesPage({ params }: PageProps) {
    const { tripId: tripRouteParam } = await params;
    const data = await loadExpensesPageData(tripRouteParam);

    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
            <TripPageHero
                tripId={data.tripId}
                pageLabel="Budget"
                revalidatePathname={`/trips/${data.tripRouteSegment}/budget/expenses`}
                summaryContent={
                    <CurrencyHeroSummary
                        currency={
                            data.budget?.reporting_currency || data.defaultCurrency
                        }
                    />
                }
            />
            <BudgetFeatureClient
                {...data}
                tripId={data.tripId}
                tripRouteSegment={data.tripRouteSegment}
                mode="expenses"
            />
        </main>
    );
}
