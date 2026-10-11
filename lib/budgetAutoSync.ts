import {
    getLocalDateKey,
    getBudgetParticipantValue,
    normalizeCurrency,
    normalizeExpenseCategory,
    parseMoney,
    resolveBudgetParticipant,
    type BudgetParticipant,
    type BudgetParticipantKind,
    type SplitMethod,
} from "@/lib/budget";
import {
    asUntypedSupabase,
    getActiveReportingCurrency,
    getExchangeRate,
    loadBudgetParticipantsWithClient,
    type UntypedSupabaseClient,
} from "@/lib/budgetServer";

type AutoBudgetSourceType =
    | "transportation"
    | "accommodation"
    | "itinerary_event";

type SyncAutoBudgetExpenseInput = {
    supabase: unknown;
    userId: string;
    tripId: string;
    sourceType: AutoBudgetSourceType;
    sourceId: string;
    amount: FormDataEntryValue | string | number | null | undefined;
    currency: FormDataEntryValue | string | null | undefined;
    expenseDate?: string | null;
    description: string;
    formData?: FormData;
};

function getSourceColumn(sourceType: AutoBudgetSourceType) {
    if (sourceType === "transportation") return "transportation_item_id";
    if (sourceType === "itinerary_event") return "itinerary_event_id";
    return "accommodation_id";
}

function getDefaultCategory(sourceType: AutoBudgetSourceType) {
    if (sourceType === "transportation") return "transportation";
    if (sourceType === "itinerary_event") return "entertainment";
    return "accommodations";
}

function parseParticipantValue(value?: FormDataEntryValue | string | null) {
    const participantValue = String(value || "");
    const separatorIndex = participantValue.indexOf(":");
    const kind = participantValue.slice(0, separatorIndex);
    const id = participantValue.slice(separatorIndex + 1);

    if (kind === "member_user" && id) {
        return {
            kind: "member" as BudgetParticipantKind,
            id: `user:${id}`,
        };
    }

    if (
        kind !== "member" &&
        kind !== "invitation" &&
        kind !== "family_member" &&
        kind !== "guest"
    ) {
        return null;
    }

    if (!id) return null;
    return { kind: kind as BudgetParticipantKind, id };
}

export function resolveAutoExpensePayer(
    formData: FormData | undefined,
    userId: string
) {
    return parseParticipantValue(formData?.get("paid_by")) || {
        kind: "member" as BudgetParticipantKind,
        id: `user:${userId}`,
    };
}

function participantColumns(participant: BudgetParticipant) {
    if (participant.kind === "member") {
        return {
            participant_kind: "member",
            trip_member_id: participant.tripMemberId || null,
            user_id: participant.userId || null,
        };
    }

    if (participant.kind === "invitation") {
        return {
            participant_kind: "invitation",
            invitation_id: participant.invitationId || participant.id,
        };
    }

    if (participant.kind === "family_member") {
        return {
            participant_kind: "family_member",
            family_member_id: participant.familyMemberId || participant.id,
        };
    }

    return {
        participant_kind: "guest",
        guest_name: participant.guestName || participant.label,
    };
}

function payerColumns(participant: BudgetParticipant) {
    if (participant.kind === "member") {
        return {
            paid_by_trip_member_id: participant.tripMemberId || null,
            paid_by_user_id: participant.userId || null,
        };
    }
    if (participant.kind === "invitation") {
        return { paid_by_invitation_id: participant.invitationId || participant.id };
    }
    if (participant.kind === "family_member") {
        return {
            paid_by_family_member_id:
                participant.familyMemberId || participant.id,
        };
    }
    return { paid_by_guest_name: participant.guestName || participant.label };
}

function participantFormKey(value: string) {
    return value.replace(":", "_");
}

function getSplitMethod(value?: FormDataEntryValue | string | null): SplitMethod {
    return value === "just_me" ||
        value === "exact" ||
        value === "percentage"
        ? value
        : "equal";
}

function roundMoney(value: number) {
    return Math.round(value * 100) / 100;
}

function splitEvenly(total: number, count: number) {
    if (count <= 0) return [];
    const base = Math.floor((total / count) * 100) / 100;
    const rows = Array.from({ length: count }, () => base);
    const assigned = base * count;
    const remainder = Math.round((total - assigned) * 100);

    for (let index = 0; index < remainder; index += 1) {
        rows[index] = roundMoney(rows[index] + 0.01);
    }

    return rows;
}

function normalizeSourceAmount(
    amount: FormDataEntryValue | string | number | null | undefined
) {
    if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0;
    return parseMoney(amount);
}

async function findAutoBudgetCategory({
    supabase,
    tripId,
    sourceType,
}: {
    supabase: UntypedSupabaseClient;
    tripId: string;
    sourceType: AutoBudgetSourceType;
}) {
    const category = normalizeExpenseCategory(getDefaultCategory(sourceType));
    const { data, error } = await supabase
        .from("trip_budget_categories")
        .select("id")
        .eq("trip_id", tripId)
        .eq("linked_expense_category", category)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) return null;
    return typeof data?.id === "string" ? data.id : null;
}

async function replaceAutoExpenseSplits({
    supabase,
    expenseId,
    tripId,
    amount,
    currency,
    exchangeRateUsed,
    formData,
    participants,
    currentParticipant,
}: {
    supabase: UntypedSupabaseClient;
    expenseId: string;
    tripId: string;
    amount: number;
    currency: string;
    exchangeRateUsed: number;
    formData?: FormData;
    participants: BudgetParticipant[];
    currentParticipant: BudgetParticipant;
}) {
    const formParticipants =
        formData
            ?.getAll("included_participants")
            .map((value) => ({
                formValue: String(value || "").trim(),
                participant: resolveBudgetParticipant(String(value || ""), participants),
            }))
            .filter(
                (entry): entry is { formValue: string; participant: BudgetParticipant } =>
                    Boolean(entry.formValue && entry.participant)
            ) || [];
    const splitMethod = getSplitMethod(formData?.get("split_method"));
    const selectedParticipants =
        splitMethod === "just_me"
            ? [
                  {
                      formValue: getBudgetParticipantValue(currentParticipant),
                      participant: currentParticipant,
                  },
              ]
            : formParticipants.length > 0
              ? formParticipants
              : [
                    {
                        formValue: getBudgetParticipantValue(currentParticipant),
                        participant: currentParticipant,
                    },
                ];

    let splitAmounts: number[] = [];
    let splitPercentages: Array<number | null> = selectedParticipants.map(() => null);

    if (splitMethod === "just_me") {
        splitAmounts = [amount];
    } else if (splitMethod === "equal") {
        splitAmounts = splitEvenly(amount, selectedParticipants.length);
    } else if (splitMethod === "exact") {
        splitAmounts = selectedParticipants.map(({ formValue }) =>
            parseMoney(
                formData?.get(`split_amount_${participantFormKey(formValue)}`)
            )
        );
        const total = roundMoney(splitAmounts.reduce((sum, value) => sum + value, 0));
        if (Math.abs(total - amount) > 0.01) {
            throw new Error("Exact split amounts must add up to the cost total.");
        }
    } else {
        splitPercentages = selectedParticipants.map(({ formValue }) =>
            parseMoney(
                formData?.get(
                    `split_percentage_${participantFormKey(formValue)}`
                )
            )
        );
        const percentageTotal = roundMoney(
            splitPercentages.reduce<number>(
                (sum, value) => sum + Number(value || 0),
                0
            )
        );
        if (Math.abs(percentageTotal - 100) > 0.01) {
            throw new Error("Percentage splits must add up to 100%.");
        }
        splitAmounts = splitPercentages.map((percentage) =>
            roundMoney(amount * (Number(percentage || 0) / 100))
        );
    }

    const { data: previousSplitRows, error: previousSplitError } = await supabase
        .from("trip_expense_splits")
        .select("*")
        .eq("expense_id", expenseId)
        .eq("trip_id", tripId);

    if (previousSplitError) {
        throw new Error(
            `Could not load existing auto budget splits: ${
                previousSplitError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const { error: deleteError } = await supabase
        .from("trip_expense_splits")
        .delete()
        .eq("expense_id", expenseId)
        .eq("trip_id", tripId);

    if (deleteError) {
        throw new Error(
            `Could not update auto budget splits: ${
                deleteError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const rows = selectedParticipants.map(({ participant }, index) => ({
        expense_id: expenseId,
        trip_id: tripId,
        ...participantColumns(participant),
        split_amount: splitAmounts[index] || 0,
        split_percentage: splitPercentages[index],
        currency,
        amount_in_reporting_currency: roundMoney(
            (splitAmounts[index] || 0) * exchangeRateUsed
        ),
        is_included: true,
    }));

    const { error: insertError } = await supabase
        .from("trip_expense_splits")
        .insert(rows);

    if (insertError) {
        if ((previousSplitRows || []).length > 0) {
            const { error: restoreError } = await supabase
                .from("trip_expense_splits")
                .insert(previousSplitRows || []);
            if (restoreError) {
                console.error("Could not restore auto budget splits after failure:", {
                    expenseId,
                    tripId,
                    restoreError,
                });
            }
        }
        throw new Error(
            `Could not create auto budget splits: ${
                insertError.message ?? "Unknown Supabase error"
            }`
        );
    }
}

async function fetchExistingAutoExpense({
    supabase,
    tripId,
    sourceType,
    sourceId,
}: {
    supabase: UntypedSupabaseClient;
    tripId: string;
    sourceType: AutoBudgetSourceType;
    sourceId: string;
}) {
    const sourceColumn = getSourceColumn(sourceType);
    const { data, error } = await supabase
        .from("trip_expenses")
        .select("*")
        .eq("trip_id", tripId)
        .eq("source_type", sourceType)
        .eq(sourceColumn, sourceId)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Could not load existing budget expense: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    return data;
}

export async function syncAutoBudgetExpense({
    supabase,
    userId,
    tripId,
    sourceType,
    sourceId,
    amount,
    currency,
    expenseDate,
    description,
    formData,
}: SyncAutoBudgetExpenseInput) {
    if (!tripId || !sourceId) return;

    const db = asUntypedSupabase(supabase);
    const sourceColumn = getSourceColumn(sourceType);
    const normalizedAmount = normalizeSourceAmount(amount);
    const existingExpense = await fetchExistingAutoExpense({
        supabase: db,
        tripId,
        sourceType,
        sourceId,
    });

    if (normalizedAmount <= 0) {
        if (existingExpense?.id) {
            const { error } = await db
                .from("trip_expenses")
                .update({
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingExpense.id);

            if (error) {
                throw new Error(
                    `Could not remove auto budget expense: ${
                        error.message ?? "Unknown Supabase error"
                    }`
                );
            }
        }

        return;
    }

    const normalizedCurrency = normalizeCurrency(currency);
    const date = expenseDate || getLocalDateKey();
    const reportingCurrency = await getActiveReportingCurrency(
        tripId,
        normalizedCurrency
    );
    const exchangeRate = await getExchangeRate({
        date,
        fromCurrency: normalizedCurrency,
        toCurrency: reportingCurrency,
    });
    const budgetCategoryId = await findAutoBudgetCategory({
        supabase: db,
        tripId,
        sourceType,
    });
    const participants = await loadBudgetParticipantsWithClient(db, tripId, userId);
    const currentParticipant = participants.find(
        (participant) => participant.isCurrentUser
    );
    if (!currentParticipant) {
        throw new Error("Could not identify the current trip participant.");
    }
    const submittedPayerValue = String(formData?.get("paid_by") || "").trim();
    const paidBy = submittedPayerValue
        ? resolveBudgetParticipant(submittedPayerValue, participants)
        : formData && sourceType === "accommodation"
          ? null
          : currentParticipant;
    if (!paidBy) {
        throw new Error("Choose a current trip participant as payer.");
    }

    const payload: Record<string, unknown> = {
        trip_id: tripId,
        expense_date: date,
        transaction_date: date,
        description,
        amount: normalizedAmount,
        currency: normalizedCurrency,
        original_amount: normalizedAmount,
        original_currency: normalizedCurrency,
        reporting_currency: reportingCurrency,
        fetched_exchange_rate:
            exchangeRate.provider === "identity" ? null : exchangeRate.rate,
        manual_exchange_rate: null,
        exchange_rate_used: exchangeRate.rate,
        exchange_rate_is_manual: false,
        category: getDefaultCategory(sourceType),
        budget_category_id: budgetCategoryId,
        split_method: getSplitMethod(formData?.get("split_method")),
        source_type: sourceType,
        transportation_item_id: null,
        itinerary_event_id: null,
        accommodation_id: null,
        notes: "Automatically added from trip item cost.",
        updated_at: new Date().toISOString(),
        deleted_at: null,
    };
    payload[sourceColumn] = sourceId;

    payload.paid_by_user_id = null;
    payload.paid_by_trip_member_id = null;
    payload.paid_by_invitation_id = null;
    payload.paid_by_family_member_id = null;
    payload.paid_by_guest_name = null;
    Object.assign(payload, payerColumns(paidBy));

    let expenseId = existingExpense?.id ? String(existingExpense.id) : "";

    if (existingExpense?.id) {
        const { error } = await db
            .from("trip_expenses")
            .update(payload)
            .eq("id", existingExpense.id);

        if (error) {
            throw new Error(
                `Could not update auto budget expense: ${
                    error.message ?? "Unknown Supabase error"
                }`
            );
        }
    } else {
        const { data, error } = await db
            .from("trip_expenses")
            .insert({
                ...payload,
                created_by: userId,
            })
            .select("id")
            .single();

        if (error || !data?.id) {
            throw new Error(
                `Could not create auto budget expense: ${
                    error?.message ?? "Unknown Supabase error"
                }`
            );
        }

        expenseId = String(data.id);
    }

    try {
        await replaceAutoExpenseSplits({
            supabase: db,
            expenseId,
            tripId,
            amount: normalizedAmount,
            currency: normalizedCurrency,
            exchangeRateUsed: exchangeRate.rate,
            formData,
            participants,
            currentParticipant,
        });
    } catch (error) {
        if (existingExpense?.id) {
            const previousPayload = Object.fromEntries(
                Object.keys(payload).map((key) => [key, existingExpense[key]])
            );
            const { error: restoreError } = await db
                .from("trip_expenses")
                .update(previousPayload)
                .eq("id", existingExpense.id)
                .eq("trip_id", tripId);
            if (restoreError) {
                console.error("Could not restore auto budget expense after failure:", {
                    expenseId,
                    tripId,
                    restoreError,
                });
            }
        } else {
            const { error: cleanupError } = await db
                .from("trip_expenses")
                .update({
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", expenseId)
                .eq("trip_id", tripId);
            if (cleanupError) {
                console.error("Could not clean up incomplete auto budget expense:", {
                    expenseId,
                    tripId,
                    cleanupError,
                });
            }
        }
        throw error;
    }
}
