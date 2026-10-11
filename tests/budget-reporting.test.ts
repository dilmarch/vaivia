import { describe, expect, it } from "vitest";
import {
    calculateBudgetTotals,
    calculateCategoryActuals,
    getExpenseReportingAmount,
    type TripExpense,
} from "@/lib/budget";
import { convertExpenseDataToReportingCurrency } from "@/lib/budgetServer";

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

    it("keeps expenses and splits aligned to the selected home currency", async () => {
        const foreignExpense = expense({
            id: "expense-a",
            amount: 100,
            original_amount: 100,
            original_currency: "GBP",
            reporting_currency: "USD",
            exchange_rate_used: 1.25,
            amount_in_reporting_currency: 125,
        });
        const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
                data: { rate: 1.75 },
                error: null,
            }),
        };

        const converted = await convertExpenseDataToReportingCurrency({
            supabase: {
                from: () => query,
            } as never,
            expenses: [foreignExpense],
            splits: [
                {
                    id: "split-a",
                    expense_id: "expense-a",
                    trip_id: "trip-a",
                    participant_kind: "member",
                    user_id: "user-a",
                    split_amount: 50,
                    currency: "GBP",
                    amount_in_reporting_currency: 62.5,
                    is_included: true,
                },
            ],
            settlements: [
                {
                    id: "settlement-a",
                    trip_id: "trip-a",
                    paid_by_participant_value: "member:a",
                    received_by_participant_value: "member:b",
                    amount: 10,
                    reporting_currency: "GBP",
                    settled_on: "2026-09-15",
                    created_by: "user-a",
                },
            ],
            reportingCurrency: "CAD",
        });

        expect(converted.expenses[0]).toMatchObject({
            currency: "GBP",
            reporting_currency: "CAD",
            exchange_rate_used: 1.75,
            amount_in_reporting_currency: 175,
        });
        expect(converted.splits[0]).toMatchObject({
            currency: "GBP",
            amount_in_reporting_currency: 87.5,
        });
        expect(converted.settlements[0]).toMatchObject({
            amount: 17.5,
            reporting_currency: "CAD",
        });
    });
});
