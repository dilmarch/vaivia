import { redirect, notFound } from "next/navigation";
import BudgetFeatureClient from "@/components/budget/BudgetFeatureClient";
import TripPageHero from "@/components/TripPageHero";
import { CurrencyHeroSummaryPresentation } from "@/components/budget/BudgetPresentation";
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

async function loadBudgetPageData(tripRouteParam: string) {
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
        console.warn("Could not load trip for budget page:", {
            message: resolvedTrip.error.message,
            code: resolvedTrip.error.code,
            details: resolvedTrip.error.details,
        });
    }

    const trip = resolvedTrip.trip;
    if (!trip) notFound();
    if (resolvedTrip.shouldRedirect) redirect(getTripHref(trip, "/budget"));

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

export default async function TripBudgetPage({ params }: PageProps) {
    const { tripId: tripRouteParam } = await params;
    const data = await loadBudgetPageData(tripRouteParam);

    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
            <TripPageHero
                tripId={data.tripId}
                pageLabel="Budget"
                revalidatePathname={`/trips/${data.tripRouteSegment}/budget`}
                summaryContent={
                    <CurrencyHeroSummaryPresentation
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
                mode="budget"
            />
        </main>
    );
}
