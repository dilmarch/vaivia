import { createClient } from "@/lib/supabase/server";
import {
    DEFAULT_BUDGET_CATEGORIES,
    getLocalDateKey,
    normalizeCurrency,
    type BudgetParticipant,
    type ExpenseCategory,
    type TripBudget,
    type TripBudgetLineItem,
    type TripExpense,
    type TripExpenseSplit,
} from "@/lib/budget";

type SupabaseErrorLike = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: SupabaseErrorLike | null }>;

type QueryBuilder<T = Record<string, unknown>[]> = {
    select: (columns?: string) => QueryBuilder<T>;
    insert: (
        rows: Record<string, unknown> | Array<Record<string, unknown>>
    ) => QueryBuilder<T>;
    update: (values: Record<string, unknown>) => QueryBuilder<T>;
    upsert: (
        rows: Record<string, unknown> | Array<Record<string, unknown>>,
        options?: Record<string, unknown>
    ) => QueryBuilder<T>;
    delete: () => QueryBuilder<T>;
    eq: (column: string, value: unknown) => QueryBuilder<T>;
    neq: (column: string, value: unknown) => QueryBuilder<T>;
    is: (column: string, value: null) => QueryBuilder<T>;
    in: (column: string, value: unknown[]) => QueryBuilder<T>;
    order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
    limit: (count: number) => QueryBuilder<T>;
    maybeSingle: () => QueryResult<Record<string, unknown>>;
    single: () => QueryResult<Record<string, unknown>>;
    then: Promise<{ data: T | null; error: SupabaseErrorLike | null }>["then"];
};

export type UntypedSupabaseClient = {
    from: (table: string) => QueryBuilder;
    storage: {
        from: (bucket: string) => {
            upload: (
                path: string,
                file: File,
                options?: Record<string, unknown>
            ) => Promise<{ data: Record<string, unknown> | null; error: SupabaseErrorLike | null }>;
        };
    };
};

export function asUntypedSupabase(client: unknown) {
    return client as UntypedSupabaseClient;
}

export async function createUntypedSupabaseClient() {
    return asUntypedSupabase(await createClient());
}

function toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBudget(row: Record<string, unknown> | null) {
    if (!row) return null;
    return {
        id: String(row.id),
        trip_id: String(row.trip_id),
        name: String(row.name || "Trip budget"),
        reporting_currency: normalizeCurrency(String(row.reporting_currency || "CAD")),
        total_budget_amount:
            row.total_budget_amount === null || row.total_budget_amount === undefined
                ? null
                : toNumber(row.total_budget_amount),
        is_active: row.is_active !== false,
    } satisfies TripBudget;
}

export function normalizeBudgetLineItem(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        budget_id: String(row.budget_id),
        trip_id: String(row.trip_id),
        category_id: typeof row.category_id === "string" ? row.category_id : null,
        name: String(row.name || "Budget item"),
        linked_expense_category: String(
            row.linked_expense_category || "other"
        ) as ExpenseCategory,
        planned_amount: toNumber(row.planned_amount),
        currency: normalizeCurrency(String(row.currency || "CAD")),
        notes: typeof row.notes === "string" ? row.notes : null,
        sort_order: toNumber(row.sort_order),
    } satisfies TripBudgetLineItem;
}

export function normalizeExpense(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        trip_id: String(row.trip_id),
        expense_date: String(row.expense_date),
        transaction_date:
            typeof row.transaction_date === "string"
                ? row.transaction_date
                : String(row.expense_date),
        description: String(row.description || "Expense"),
        category: String(row.category || "other") as ExpenseCategory,
        budget_category_id:
            typeof row.budget_category_id === "string"
                ? row.budget_category_id
                : null,
        amount: toNumber(row.amount),
        currency: normalizeCurrency(String(row.currency || "CAD")),
        original_amount:
            row.original_amount === null || row.original_amount === undefined
                ? toNumber(row.amount)
                : toNumber(row.original_amount),
        original_currency: normalizeCurrency(
            String(row.original_currency || row.currency || "CAD")
        ),
        reporting_currency: normalizeCurrency(String(row.reporting_currency || "CAD")),
        fetched_exchange_rate:
            row.fetched_exchange_rate === null || row.fetched_exchange_rate === undefined
                ? null
                : toNumber(row.fetched_exchange_rate),
        manual_exchange_rate:
            row.manual_exchange_rate === null || row.manual_exchange_rate === undefined
                ? null
                : toNumber(row.manual_exchange_rate),
        exchange_rate_used: toNumber(row.exchange_rate_used),
        exchange_rate_is_manual: row.exchange_rate_is_manual === true,
        amount_in_reporting_currency: toNumber(row.amount_in_reporting_currency),
        paid_by_trip_member_id:
            typeof row.paid_by_trip_member_id === "string"
                ? row.paid_by_trip_member_id
                : null,
        paid_by_invitation_id:
            typeof row.paid_by_invitation_id === "string"
                ? row.paid_by_invitation_id
                : null,
        paid_by_family_member_id:
            typeof row.paid_by_family_member_id === "string"
                ? row.paid_by_family_member_id
                : null,
        paid_by_user_id:
            typeof row.paid_by_user_id === "string" ? row.paid_by_user_id : null,
        paid_by_guest_name:
            typeof row.paid_by_guest_name === "string" ? row.paid_by_guest_name : null,
        split_method: String(row.split_method || "equal") as TripExpense["split_method"],
        source_type: String(row.source_type || "manual") as TripExpense["source_type"],
        transportation_item_id:
            typeof row.transportation_item_id === "string"
                ? row.transportation_item_id
                : null,
        itinerary_event_id:
            typeof row.itinerary_event_id === "string"
                ? row.itinerary_event_id
                : null,
        accommodation_id:
            typeof row.accommodation_id === "string" ? row.accommodation_id : null,
        notes: typeof row.notes === "string" ? row.notes : null,
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    } satisfies TripExpense;
}

export function normalizeExpenseSplit(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        expense_id: String(row.expense_id),
        trip_id: String(row.trip_id),
        participant_kind: String(row.participant_kind || "guest") as TripExpenseSplit["participant_kind"],
        trip_member_id:
            typeof row.trip_member_id === "string" ? row.trip_member_id : null,
        invitation_id:
            typeof row.invitation_id === "string" ? row.invitation_id : null,
        family_member_id:
            typeof row.family_member_id === "string" ? row.family_member_id : null,
        user_id: typeof row.user_id === "string" ? row.user_id : null,
        guest_name: typeof row.guest_name === "string" ? row.guest_name : null,
        split_amount: toNumber(row.split_amount),
        split_percentage:
            row.split_percentage === null || row.split_percentage === undefined
                ? null
                : toNumber(row.split_percentage),
        currency: normalizeCurrency(String(row.currency || "CAD")),
        amount_in_reporting_currency:
            row.amount_in_reporting_currency === null ||
            row.amount_in_reporting_currency === undefined
                ? null
                : toNumber(row.amount_in_reporting_currency),
        is_included: row.is_included !== false,
    } satisfies TripExpenseSplit;
}

export async function loadTripBudgetData(tripId: string) {
    const supabase = await createUntypedSupabaseClient();
    const [{ data: budgetRow }, { data: lineRows }, { data: expenseRows }] =
        await Promise.all([
            supabase
                .from("trip_budgets")
                .select("*")
                .eq("trip_id", tripId)
                .eq("is_active", true)
                .maybeSingle(),
            supabase
                .from("trip_budget_line_items")
                .select("*")
                .eq("trip_id", tripId)
                .order("sort_order", { ascending: true }),
            supabase
                .from("trip_expenses")
                .select("*")
                .eq("trip_id", tripId)
                .is("deleted_at", null)
                .order("expense_date", { ascending: false }),
        ]);

    return {
        budget: normalizeBudget(budgetRow),
        lineItems: ((lineRows || []) as Record<string, unknown>[]).map(
            normalizeBudgetLineItem
        ),
        expenses: ((expenseRows || []) as Record<string, unknown>[]).map(
            normalizeExpense
        ),
    };
}

export async function loadTripExpenseData(tripId: string) {
    const supabase = await createUntypedSupabaseClient();
    const [{ data: expenseRows }, { data: splitRows }] = await Promise.all([
        supabase
            .from("trip_expenses")
            .select("*")
            .eq("trip_id", tripId)
            .is("deleted_at", null)
            .order("expense_date", { ascending: false }),
        supabase
            .from("trip_expense_splits")
            .select("*")
            .eq("trip_id", tripId),
    ]);

    return {
        expenses: ((expenseRows || []) as Record<string, unknown>[]).map(
            normalizeExpense
        ),
        splits: ((splitRows || []) as Record<string, unknown>[]).map(
            normalizeExpenseSplit
        ),
    };
}

export async function loadBudgetParticipants(tripId: string, userId: string) {
    const supabase = await createUntypedSupabaseClient();
    const [{ data: tripRows }, { data: memberRows }, { data: invitationRows }, { data: familyRows }] =
        await Promise.all([
            supabase
                .from("trips")
                .select("id,user_id")
                .eq("id", tripId)
                .maybeSingle(),
            supabase
                .from("trip_members")
                .select("id,user_id,role,status,created_at")
                .eq("trip_id", tripId)
                .eq("status", "active"),
            supabase
                .from("trip_invitations")
                .select("id,invitee_email,invitee_username,status")
                .eq("trip_id", tripId)
                .eq("status", "pending"),
            supabase
                .from("trip_family_members")
                .select("id,family_member_id,status,user_family_members(id,name,avatar_url)")
                .eq("trip_id", tripId),
        ]);

    const ownerUserId =
        typeof tripRows?.user_id === "string" ? tripRows.user_id : null;
    const memberRecords = ((memberRows || []) as Array<{
        id?: string | null;
        user_id?: string | null;
        role?: string | null;
        status?: string | null;
    }>).filter((member) => member.user_id);
    const memberUserIds = Array.from(
        new Set([ownerUserId, ...memberRecords.map((member) => member.user_id)].filter(Boolean) as string[])
    );

    let profiles = new Map<string, Record<string, unknown>>();
    if (memberUserIds.length > 0) {
        const { data: profileRows } = await supabase
            .from("user_profiles")
            .select("id,first_name,last_name,username,avatar_url,email")
            .in("id", memberUserIds);
        profiles = new Map(
            ((profileRows || []) as Record<string, unknown>[]).map((profile) => [
                String(profile.id),
                profile,
            ])
        );
    }

    const memberByUserId = new Map(
        memberRecords.map((member) => [String(member.user_id), member])
    );

    const memberOptions: BudgetParticipant[] = memberUserIds.map((memberUserId) => {
        const profile = profiles.get(memberUserId);
        const member = memberByUserId.get(memberUserId);
        const displayName =
            [profile?.first_name, profile?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() ||
            String(profile?.username || profile?.email || "Trip member");

        return {
            id: member?.id || `owner:${memberUserId}`,
            kind: "member",
            label: displayName,
            secondaryLabel:
                typeof profile?.username === "string" ? `@${profile.username}` : null,
            avatarUrl:
                typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
            userId: memberUserId,
            tripMemberId: member?.id || null,
            isCurrentUser: memberUserId === userId,
        };
    });

    const invitationOptions: BudgetParticipant[] = (
        (invitationRows || []) as Record<string, unknown>[]
    ).map((invitation) => {
        const label = String(
            invitation.invitee_username || invitation.invitee_email || "Pending invite"
        );
        return {
            id: String(invitation.id),
            kind: "invitation",
            label,
            secondaryLabel: "Pending invitation",
            invitationId: String(invitation.id),
        };
    });

    const familyOptions: BudgetParticipant[] = (
        (familyRows || []) as Record<string, unknown>[]
    ).map((row) => {
        const rawFamily = row.user_family_members;
        const family = Array.isArray(rawFamily) ? rawFamily[0] : rawFamily;
        const familyRecord =
            family && typeof family === "object"
                ? (family as Record<string, unknown>)
                : {};
        return {
            id: String(row.family_member_id || row.id),
            kind: "family_member",
            label: String(familyRecord.name || "Family member"),
            secondaryLabel: "Managed by you",
            avatarUrl:
                typeof familyRecord.avatar_url === "string"
                    ? familyRecord.avatar_url
                    : null,
            familyMemberId: String(row.family_member_id || ""),
        };
    });

    return [...memberOptions, ...invitationOptions, ...familyOptions];
}

export async function getActiveReportingCurrency(tripId: string, fallback = "CAD") {
    const { budget } = await loadTripBudgetData(tripId);
    return normalizeCurrency(budget?.reporting_currency || fallback);
}

export async function getExchangeRate({
    date,
    fromCurrency,
    toCurrency,
    baseCurrency,
    targetCurrency,
}: {
    date?: string | null;
    fromCurrency?: string;
    toCurrency?: string;
    baseCurrency?: string;
    targetCurrency?: string;
}) {
    const rateDate = date || getLocalDateKey();
    const base = normalizeCurrency(fromCurrency || baseCurrency);
    const target = normalizeCurrency(toCurrency || targetCurrency);
    const today = getLocalDateKey();
    const useLatestEndpoint = !date || rateDate >= today;

    if (base === target) return { rate: 1, provider: "identity" };

    const supabase = await createUntypedSupabaseClient();
    const { data: cached } = await supabase
        .from("currency_exchange_rates")
        .select("*")
        .eq("rate_date", rateDate)
        .eq("base_currency", base)
        .eq("target_currency", target)
        .eq("provider", "frankfurter")
        .maybeSingle();

    if (cached?.rate) {
        return { rate: toNumber(cached.rate), provider: "frankfurter" };
    }

    const endpoint = useLatestEndpoint ? "latest" : rateDate;
    const url = `https://api.frankfurter.app/${endpoint}?from=${encodeURIComponent(
        base
    )}&to=${encodeURIComponent(target)}`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error("Could not fetch exchange rate");
    }

    const payload = (await response.json()) as {
        rates?: Record<string, number>;
    };
    const rate = payload.rates?.[target];

    if (!rate || !Number.isFinite(rate)) {
        throw new Error("Exchange rate was not available");
    }

    await supabase.from("currency_exchange_rates").upsert(
        {
            rate_date: rateDate,
            base_currency: base,
            target_currency: target,
            rate,
            provider: "frankfurter",
            fetched_at: new Date().toISOString(),
        },
        { onConflict: "rate_date,base_currency,target_currency,provider" }
    );

    return { rate, provider: "frankfurter" };
}

export function getDefaultBudgetLineItems(currency: string) {
    return DEFAULT_BUDGET_CATEGORIES.map((category, index) => ({
        name: category.name,
        linked_expense_category: category.linkedExpenseCategory,
        planned_amount: 0,
        currency,
        sort_order: index,
    }));
}
