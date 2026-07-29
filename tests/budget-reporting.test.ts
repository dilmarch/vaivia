import { describe, expect, it } from "vitest";
import {
    calculateBudgetTotals,
    calculateCategoryActuals,
    getExpenseReportingAmount,
    type TripExpense,
} from "@/lib/budget";

function expense(
    overrides: Partial<TripExpense> & Pick<TripExpense, "amount" | "exchange_rate_used">
) {
    const { amount, exchange_rate_used: exchangeRateUsed, ...rest } = overrides;

    return {
        id: crypto.randomUUID(),
        trip_id: "trip-a",
        expense_date: "2026-09-15",
        description: "Test expense",
        category: "transportation",
        amount,
        currency: "GBP",
        reporting_currency: "CAD",
        exchange_rate_used: exchangeRateUsed,
        exchange_rate_is_manual: false,
        amount_in_reporting_currency: 0,
        split_method: "just_me",
        source_type: "manual",
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-09-15T00:00:00.000Z",
        ...rest,
    } as TripExpense;
}

describe("expense reporting currency", () => {
    it("falls back to the stored exchange rate when a converted value is absent", () => {
        const foreignExpense = expense({
            amount: 100,
            exchange_rate_used: 1.75,
        });

        expect(getExpenseReportingAmount(foreignExpense)).toBe(175);
        expect(
            calculateBudgetTotals({
                budget: null,
                lineItems: [],
                expenses: [foreignExpense],
            }).spent
        ).toBe(175);
        expect(calculateCategoryActuals([foreignExpense]).transportation).toBe(175);
    });

    it("subtracts converted refunds from totals and category actuals", () => {
        const refund = expense({
            amount: -20,
            exchange_rate_used: 1.5,
            amount_in_reporting_currency: -30,
        });

        expect(getExpenseReportingAmount(refund)).toBe(-30);
        expect(
            calculateBudgetTotals({
                budget: null,
                lineItems: [],
                expenses: [refund],
            }).spent
        ).toBe(-30);
        expect(calculateCategoryActuals([refund]).transportation).toBe(-30);
    });
});
