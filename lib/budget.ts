import {
    COMMON_CURRENCY_CODES,
    formatMoney,
    normalizeCurrencyCode,
} from "@/lib/currency";

export const EXPENSE_CATEGORIES = [
    "accommodations",
    "transportation",
    "entertainment",
    "food",
    "drink",
    "souvenirs",
    "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type SplitMethod = "just_me" | "equal" | "exact" | "percentage";

export type ExpenseSourceType =
    | "manual"
    | "transportation"
    | "itinerary_event"
    | "accommodation";

export type BudgetParticipantKind =
    | "member"
    | "invitation"
    | "family_member"
    | "guest";

export type BudgetParticipant = {
    id: string;
    kind: BudgetParticipantKind;
    label: string;
    secondaryLabel?: string | null;
    avatarUrl?: string | null;
    userId?: string | null;
    tripMemberId?: string | null;
    invitationId?: string | null;
    familyMemberId?: string | null;
    guestName?: string | null;
    isCurrentUser?: boolean;
};

export type TripBudget = {
    id: string;
    trip_id: string;
    name: string;
    reporting_currency: string;
    total_budget_amount: number | null;
    is_active: boolean;
};

export type TripBudgetLineItem = {
    id: string;
    budget_id: string;
    trip_id: string;
    category_id?: string | null;
    name: string;
    linked_expense_category: ExpenseCategory;
    planned_amount: number;
    currency: string;
    notes?: string | null;
    sort_order: number;
};

export type TripExpense = {
    id: string;
    trip_id: string;
    expense_date: string;
    transaction_date?: string | null;
    description: string;
    category: ExpenseCategory;
    budget_category_id?: string | null;
    amount: number;
    currency: string;
    original_amount?: number | null;
    original_currency?: string | null;
    reporting_currency: string;
    fetched_exchange_rate?: number | null;
    manual_exchange_rate?: number | null;
    exchange_rate_used: number;
    exchange_rate_is_manual: boolean;
    amount_in_reporting_currency: number;
    paid_by_trip_member_id?: string | null;
    paid_by_invitation_id?: string | null;
    paid_by_family_member_id?: string | null;
    paid_by_user_id?: string | null;
    paid_by_guest_name?: string | null;
    split_method: SplitMethod;
    source_type: ExpenseSourceType;
    transportation_item_id?: string | null;
    itinerary_event_id?: string | null;
    accommodation_id?: string | null;
    notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type TripExpenseSplit = {
    id: string;
    expense_id: string;
    trip_id: string;
    participant_kind: BudgetParticipantKind;
    trip_member_id?: string | null;
    invitation_id?: string | null;
    family_member_id?: string | null;
    user_id?: string | null;
    guest_name?: string | null;
    split_amount: number;
    split_percentage?: number | null;
    currency: string;
    amount_in_reporting_currency?: number | null;
    is_included: boolean;
};

export const DEFAULT_EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    accommodations: "Accommodations",
    transportation: "Transportation",
    entertainment: "Entertainment",
    food: "Food",
    drink: "Drink",
    souvenirs: "Souvenirs",
    other: "Other",
};

export const DEFAULT_BUDGET_CATEGORIES: Array<{
    name: string;
    linkedExpenseCategory: ExpenseCategory;
}> = [
    { name: "Accommodations", linkedExpenseCategory: "accommodations" },
    { name: "Transportation", linkedExpenseCategory: "transportation" },
    { name: "Food", linkedExpenseCategory: "food" },
    { name: "Drink", linkedExpenseCategory: "drink" },
    { name: "Entertainment", linkedExpenseCategory: "entertainment" },
    { name: "Souvenirs", linkedExpenseCategory: "souvenirs" },
    { name: "Other", linkedExpenseCategory: "other" },
];

export const COMMON_CURRENCIES = COMMON_CURRENCY_CODES;

export function normalizeCurrency(value?: FormDataEntryValue | string | null) {
    return normalizeCurrencyCode(value);
}

export function normalizeExpenseCategory(
    value?: FormDataEntryValue | string | null
): ExpenseCategory {
    const category = String(value || "").trim() as ExpenseCategory;
    return EXPENSE_CATEGORIES.includes(category) ? category : "other";
}

export function parseMoney(value?: FormDataEntryValue | string | null) {
    const parsed = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(amount: number, currency = "CAD") {
    return formatMoney(amount, currency);
}

export function formatPercent(value: number) {
    return `${Math.round(value)}%`;
}

export function calculateBudgetTotals({
    budget,
    lineItems,
    expenses,
}: {
    budget?: TripBudget | null;
    lineItems: TripBudgetLineItem[];
    expenses: TripExpense[];
}) {
    const budgeted =
        budget?.total_budget_amount ??
        lineItems.reduce((sum, item) => sum + Number(item.planned_amount || 0), 0);
    const spent = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount_in_reporting_currency || 0),
        0
    );
    const remaining = budgeted - spent;
    const percentUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;

    return { budgeted, spent, remaining, percentUsed };
}

export function calculateCategoryActuals(expenses: TripExpense[]) {
    return expenses.reduce<Record<string, number>>((totals, expense) => {
        const key = expense.budget_category_id || expense.category;
        totals[key] =
            (totals[key] || 0) + Number(expense.amount_in_reporting_currency || 0);
        return totals;
    }, {} as Record<string, number>);
}

export function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
