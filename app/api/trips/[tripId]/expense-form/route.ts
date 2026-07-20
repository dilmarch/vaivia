import { NextResponse } from "next/server";
import {
    loadBudgetParticipants,
    loadTripBudgetData,
} from "@/lib/budgetServer";
import { createClient } from "@/lib/supabase/server";
import { resolveTripRouteParam } from "@/lib/tripRoutes";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, context: RouteContext) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    const { tripId: routeParam } = await context.params;
    const { trip } = await resolveTripRouteParam<{ id: string }>(
        supabase,
        routeParam,
        "id"
    );

    if (!trip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    const [budgetData, participants] = await Promise.all([
        loadTripBudgetData(trip.id),
        loadBudgetParticipants(trip.id, user.id),
    ]);
    const reportingCurrency =
        budgetData.budget?.reporting_currency ||
        budgetData.lineItems[0]?.currency ||
        "CAD";

    return NextResponse.json({
        tripId: trip.id,
        reportingCurrency,
        budgetCategories: budgetData.lineItems,
        expenseCategories: budgetData.categories,
        participants,
    });
}
