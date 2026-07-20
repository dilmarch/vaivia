"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
    EXPENSE_CATEGORIES,
    getLocalDateKey,
    normalizeCurrency,
    normalizeExpenseCategory,
    parseMoney,
    type BudgetParticipantKind,
    type SplitMethod,
    type TripBudgetCategory,
    type TripBudgetLineItem,
} from "@/lib/budget";
import {
    asUntypedSupabase,
    getDefaultBudgetLineItems,
    getExchangeRate,
    loadBudgetParticipants,
} from "@/lib/budgetServer";

function getBudgetParticipantValue(
    participant: Awaited<ReturnType<typeof loadBudgetParticipants>>[number]
) {
    if (participant.kind === "member" && participant.tripMemberId) {
        return `member:${participant.tripMemberId}`;
    }
    if (participant.kind === "member" && participant.userId) {
        return `member_user:${participant.userId}`;
    }
    if (participant.kind === "invitation" && participant.invitationId) {
        return `invitation:${participant.invitationId}`;
    }
    if (participant.kind === "family_member" && participant.familyMemberId) {
        return `family_member:${participant.familyMemberId}`;
    }
    return `guest:${participant.guestName || participant.label}`;
}

function getString(formData: FormData, key: string) {
    return String(formData.get(key) || "").trim();
}

function parseParticipantValue(value?: FormDataEntryValue | string | null) {
    const participantValue = String(value || "");
    const separatorIndex = participantValue.indexOf(":");
    const kind = participantValue.slice(0, separatorIndex);
    const id = participantValue.slice(separatorIndex + 1);

    if (kind === "member_user" && id) {
        return { kind: "member" as BudgetParticipantKind, id: `user:${id}` };
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

function participantColumns(participant: {
    kind: BudgetParticipantKind;
    id: string;
}) {
    if (participant.kind === "member") {
        if (participant.id.startsWith("user:")) {
            return {
                participant_kind: "member",
                user_id: participant.id.replace(/^user:/, ""),
            };
        }
        return { participant_kind: "member", trip_member_id: participant.id };
    }

    if (participant.kind === "invitation") {
        return { participant_kind: "invitation", invitation_id: participant.id };
    }

    if (participant.kind === "family_member") {
        return {
            participant_kind: "family_member",
            family_member_id: participant.id,
        };
    }

    return { participant_kind: "guest", guest_name: participant.id };
}

function getSplitMethod(value: string): SplitMethod {
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

async function requireUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be signed in.");

    return { supabase, user };
}

export async function createBudget(formData: FormData) {
    const { supabase, user } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const tripTitle = getString(formData, "trip_title") || "Trip";
    const name = getString(formData, "name") || `${tripTitle} Budget`;
    const reportingCurrency = normalizeCurrency(formData.get("reporting_currency"));
    const totalBudgetAmount = parseMoney(formData.get("total_budget_amount"));

    const { data: budgetRow, error: budgetError } = await db
        .from("trip_budgets")
        .insert({
            trip_id: tripId,
            name,
            reporting_currency: reportingCurrency,
            total_budget_amount: totalBudgetAmount || null,
            is_active: true,
            created_by: user.id,
        })
        .select("id")
        .single();

    if (budgetError || !budgetRow?.id) {
        console.error("Error creating budget:", {
            message: budgetError?.message,
            code: budgetError?.code,
            details: budgetError?.details,
            tripId,
            userId: user.id,
        });
        throw new Error(
            `Could not create budget: ${
                budgetError?.message ?? "Unknown Supabase error"
            }`
        );
    }

    const defaultRows = getDefaultBudgetLineItems(reportingCurrency);
    const categoryRows = defaultRows.map((row) => ({
        trip_id: tripId,
        name: row.name,
        linked_expense_category: row.linked_expense_category,
        sort_order: row.sort_order,
        is_default: true,
        created_by: user.id,
    }));

    const { data: categoryData, error: categoryError } = await db
        .from("trip_budget_categories")
        .upsert(categoryRows, { onConflict: "trip_id,name" })
        .select("*");

    if (categoryError) {
        console.error("Error creating budget categories:", {
            message: categoryError.message,
            code: categoryError.code,
            details: categoryError.details,
            tripId,
        });
        throw new Error(
            `Could not create budget categories: ${
                categoryError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const categoriesByName = new Map(
        ((categoryData || []) as Record<string, unknown>[]).map((category) => [
            String(category.name),
            category,
        ])
    );
    const lineItems = defaultRows.map((row, index) => {
        const amount = parseMoney(formData.get(`category_${index}_amount`));
        const category = categoriesByName.get(row.name);
        return {
            budget_id: budgetRow.id,
            trip_id: tripId,
            category_id: typeof category?.id === "string" ? category.id : null,
            name: row.name,
            linked_expense_category: row.linked_expense_category,
            planned_amount: amount,
            currency: reportingCurrency,
            sort_order: index,
        };
    });

    const { error: lineItemsError } = await db
        .from("trip_budget_line_items")
        .insert(lineItems);

    if (lineItemsError) {
        console.error("Error creating budget line items:", {
            message: lineItemsError.message,
            code: lineItemsError.code,
            details: lineItemsError.details,
            tripId,
        });
        throw new Error(
            `Could not create budget line items: ${
                lineItemsError.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}/budget`);
}

export async function updateBudgetLineItem(formData: FormData) {
    const { supabase } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const lineItemId = getString(formData, "line_item_id");
    const plannedAmount = parseMoney(formData.get("planned_amount"));

    const { error } = await db
        .from("trip_budget_line_items")
        .update({
            planned_amount: plannedAmount,
            updated_at: new Date().toISOString(),
        })
        .eq("id", lineItemId)
        .eq("trip_id", tripId);

    if (error) {
        throw new Error(
            `Could not update budget line item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}/budget`);
}

export async function createExpenseCategory(formData: FormData): Promise<{
    category: TripBudgetCategory;
    lineItem: TripBudgetLineItem | null;
}> {
    const { supabase, user } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const name = getString(formData, "name");
    const linkedExpenseCategory = normalizeExpenseCategory(
        formData.get("linked_expense_category")
    );
    const reportingCurrency = normalizeCurrency(
        formData.get("reporting_currency")
    );
    const shouldCreateBudgetLine =
        getString(formData, "create_budget_line") === "true";
    const plannedAmount = parseMoney(formData.get("planned_amount"));

    if (!tripId) throw new Error("Trip is required.");
    if (!name) throw new Error("Enter a category name.");
    if (name.length > 80) {
        throw new Error("Category names must be 80 characters or fewer.");
    }
    if (shouldCreateBudgetLine && plannedAmount <= 0) {
        throw new Error("Enter a budget amount greater than zero.");
    }

    const { data: existingCategory, error: existingCategoryError } = await db
        .from("trip_budget_categories")
        .select("*")
        .eq("trip_id", tripId)
        .eq("name", name)
        .maybeSingle();

    if (existingCategoryError) {
        throw new Error(
            `Could not check budget categories: ${
                existingCategoryError.message ?? "Unknown Supabase error"
            }`
        );
    }

    let categoryRow = existingCategory as Record<string, unknown> | null;

    if (categoryRow) {
        const { data, error } = await db
            .from("trip_budget_categories")
            .update({
                is_archived: false,
                updated_at: new Date().toISOString(),
            })
            .eq("id", String(categoryRow.id))
            .eq("trip_id", tripId)
            .select("*")
            .single();

        if (error || !data) {
            throw new Error(
                `Could not restore budget category: ${
                    error?.message ?? "Unknown Supabase error"
                }`
            );
        }
        categoryRow = data as Record<string, unknown>;
    } else {
        const { data: lastCategory } = await db
            .from("trip_budget_categories")
            .select("sort_order")
            .eq("trip_id", tripId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextSortOrder = Number(lastCategory?.sort_order || 0) + 1;
        const { data, error } = await db
            .from("trip_budget_categories")
            .insert({
                trip_id: tripId,
                name,
                linked_expense_category: linkedExpenseCategory,
                sort_order: nextSortOrder,
                is_default: false,
                is_archived: false,
                created_by: user.id,
            })
            .select("*")
            .single();

        if (error || !data) {
            throw new Error(
                `Could not create budget category: ${
                    error?.message ?? "Unknown Supabase error"
                }`
            );
        }
        categoryRow = data as Record<string, unknown>;
    }

    const category: TripBudgetCategory = {
        id: String(categoryRow.id),
        trip_id: String(categoryRow.trip_id),
        name: String(categoryRow.name),
        linked_expense_category: normalizeExpenseCategory(
            String(categoryRow.linked_expense_category || "other")
        ),
        sort_order: Number(categoryRow.sort_order || 0),
        is_default: categoryRow.is_default === true,
        is_archived: categoryRow.is_archived === true,
    };
    let lineItem: TripBudgetLineItem | null = null;

    if (shouldCreateBudgetLine) {
        const { data: activeBudget, error: activeBudgetError } = await db
            .from("trip_budgets")
            .select("id")
            .eq("trip_id", tripId)
            .eq("is_active", true)
            .maybeSingle();

        if (activeBudgetError) {
            throw new Error(
                `Could not load the trip budget: ${
                    activeBudgetError.message ?? "Unknown Supabase error"
                }`
            );
        }

        let budgetId = typeof activeBudget?.id === "string" ? activeBudget.id : "";

        if (!budgetId) {
            const { data: createdBudget, error: budgetError } = await db
                .from("trip_budgets")
                .insert({
                    trip_id: tripId,
                    name: "Trip budget",
                    reporting_currency: reportingCurrency,
                    total_budget_amount: null,
                    is_active: true,
                    created_by: user.id,
                })
                .select("id")
                .single();

            if (budgetError || !createdBudget?.id) {
                throw new Error(
                    `Could not create the trip budget: ${
                        budgetError?.message ?? "Unknown Supabase error"
                    }`
                );
            }
            budgetId = String(createdBudget.id);
        }

        const { data: existingLineItem, error: existingLineItemError } = await db
            .from("trip_budget_line_items")
            .select("*")
            .eq("trip_id", tripId)
            .eq("budget_id", budgetId)
            .eq("category_id", category.id)
            .limit(1)
            .maybeSingle();

        if (existingLineItemError) {
            throw new Error(
                `Could not check the budget line: ${
                    existingLineItemError.message ?? "Unknown Supabase error"
                }`
            );
        }

        let lineRow: Record<string, unknown> | null = null;

        if (existingLineItem) {
            const { data, error } = await db
                .from("trip_budget_line_items")
                .update({
                    name: category.name,
                    linked_expense_category: category.linked_expense_category,
                    planned_amount: plannedAmount,
                    currency: reportingCurrency,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", String(existingLineItem.id))
                .eq("trip_id", tripId)
                .select("*")
                .single();

            if (error || !data) {
                throw new Error(
                    `Could not update the budget line: ${
                        error?.message ?? "Unknown Supabase error"
                    }`
                );
            }
            lineRow = data as Record<string, unknown>;
        } else {
            const { data: lastLineItem } = await db
                .from("trip_budget_line_items")
                .select("sort_order")
                .eq("budget_id", budgetId)
                .order("sort_order", { ascending: false })
                .limit(1)
                .maybeSingle();
            const nextSortOrder = Number(lastLineItem?.sort_order || 0) + 1;
            const { data, error } = await db
                .from("trip_budget_line_items")
                .insert({
                    budget_id: budgetId,
                    trip_id: tripId,
                    category_id: category.id,
                    name: category.name,
                    linked_expense_category: category.linked_expense_category,
                    planned_amount: plannedAmount,
                    currency: reportingCurrency,
                    sort_order: nextSortOrder,
                })
                .select("*")
                .single();

            if (error || !data) {
                throw new Error(
                    `Could not create the budget line: ${
                        error?.message ?? "Unknown Supabase error"
                    }`
                );
            }
            lineRow = data as Record<string, unknown>;
        }

        lineItem = {
            id: String(lineRow.id),
            budget_id: String(lineRow.budget_id),
            trip_id: String(lineRow.trip_id),
            category_id:
                typeof lineRow.category_id === "string"
                    ? lineRow.category_id
                    : null,
            name: String(lineRow.name),
            linked_expense_category: normalizeExpenseCategory(
                String(lineRow.linked_expense_category || "other")
            ),
            planned_amount: Number(lineRow.planned_amount || 0),
            currency: normalizeCurrency(String(lineRow.currency || "CAD")),
            notes: typeof lineRow.notes === "string" ? lineRow.notes : null,
            sort_order: Number(lineRow.sort_order || 0),
        };
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);

    return { category, lineItem };
}

async function resolveBudgetCategory({
    db,
    tripId,
    budgetCategoryId,
    fallbackCategory,
}: {
    db: ReturnType<typeof asUntypedSupabase>;
    tripId: string;
    budgetCategoryId: string;
    fallbackCategory: ReturnType<typeof normalizeExpenseCategory>;
}) {
    if (!budgetCategoryId) {
        return { id: null, category: fallbackCategory };
    }

    const { data, error } = await db
        .from("trip_budget_categories")
        .select("id,linked_expense_category,is_archived")
        .eq("id", budgetCategoryId)
        .eq("trip_id", tripId)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Could not load budget category: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    if (!data || data.is_archived === true) {
        throw new Error("Choose an active budget category.");
    }

    return {
        id: String(data.id),
        category: normalizeExpenseCategory(String(data.linked_expense_category)),
    };
}

export async function updateBudget(formData: FormData) {
    const { supabase } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const budgetId = getString(formData, "budget_id");
    const name = getString(formData, "name") || "Trip budget";
    const reportingCurrency = normalizeCurrency(formData.get("reporting_currency"));
    const totalBudgetAmount = parseMoney(formData.get("total_budget_amount"));

    if (!tripId || !budgetId) throw new Error("Budget is required.");

    const { error: budgetError } = await db
        .from("trip_budgets")
        .update({
            name,
            reporting_currency: reportingCurrency,
            total_budget_amount: totalBudgetAmount || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", budgetId)
        .eq("trip_id", tripId);

    if (budgetError) {
        throw new Error(
            `Could not update budget: ${
                budgetError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const existingLineIds = formData
        .getAll("line_item_id")
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    for (const lineItemId of existingLineIds) {
        const categoryId = getString(formData, `line_${lineItemId}_category_id`);
        const nameValue = getString(formData, `line_${lineItemId}_name`);
        const plannedAmount = parseMoney(
            formData.get(`line_${lineItemId}_planned_amount`)
        );
        const shouldDelete =
            String(formData.get(`line_${lineItemId}_delete`) || "") === "on";
        const remapCategoryId = getString(
            formData,
            `line_${lineItemId}_remap_category_id`
        );

        if (shouldDelete) {
            if (categoryId && !remapCategoryId) {
                const { data: existingExpenses } = await db
                    .from("trip_expenses")
                    .select("id")
                    .eq("trip_id", tripId)
                    .eq("budget_category_id", categoryId)
                    .is("deleted_at", null)
                    .limit(1);

                if (Array.isArray(existingExpenses) && existingExpenses.length > 0) {
                    throw new Error(
                        "Remap expenses before removing this budget category."
                    );
                }
            }

            if (categoryId && remapCategoryId) {
                const remapCategory = await resolveBudgetCategory({
                    db,
                    tripId,
                    budgetCategoryId: remapCategoryId,
                    fallbackCategory: "other",
                });
                const { error: remapError } = await db
                    .from("trip_expenses")
                    .update({
                        budget_category_id: remapCategory.id,
                        category: remapCategory.category,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("trip_id", tripId)
                    .eq("budget_category_id", categoryId);

                if (remapError) {
                    throw new Error(
                        `Could not remap expenses: ${
                            remapError.message ?? "Unknown Supabase error"
                        }`
                    );
                }
            }

            const { error: deleteLineError } = await db
                .from("trip_budget_line_items")
                .delete()
                .eq("id", lineItemId)
                .eq("trip_id", tripId);

            if (deleteLineError) {
                throw new Error(
                    `Could not delete budget category: ${
                        deleteLineError.message ?? "Unknown Supabase error"
                    }`
                );
            }

            if (categoryId) {
                await db
                    .from("trip_budget_categories")
                    .update({
                        is_archived: true,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", categoryId)
                    .eq("trip_id", tripId);
            }

            continue;
        }

        const { error: lineError } = await db
            .from("trip_budget_line_items")
            .update({
                name: nameValue || "Budget category",
                planned_amount: plannedAmount,
                currency: reportingCurrency,
                updated_at: new Date().toISOString(),
            })
            .eq("id", lineItemId)
            .eq("trip_id", tripId);

        if (lineError) {
            throw new Error(
                `Could not update budget category: ${
                    lineError.message ?? "Unknown Supabase error"
                }`
            );
        }

        if (categoryId) {
            await db
                .from("trip_budget_categories")
                .update({
                    name: nameValue || "Budget category",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", categoryId)
                .eq("trip_id", tripId);
        }
    }

    const newNames = formData
        .getAll("new_category_name")
        .map((value) => String(value || "").trim());
    const newAmounts = formData.getAll("new_category_amount");
    const sortOffset = existingLineIds.length;

    for (let index = 0; index < newNames.length; index += 1) {
        const newName = newNames[index];
        if (!newName) continue;

        const { data: category, error: categoryError } = await db
            .from("trip_budget_categories")
            .upsert(
                {
                    trip_id: tripId,
                    name: newName,
                    linked_expense_category: "other",
                    sort_order: sortOffset + index,
                    is_default: false,
                    is_archived: false,
                },
                { onConflict: "trip_id,name" }
            )
            .select("id")
            .single();

        if (categoryError || !category?.id) {
            throw new Error(
                `Could not add budget category: ${
                    categoryError?.message ?? "Unknown Supabase error"
                }`
            );
        }

        const { error: lineError } = await db.from("trip_budget_line_items").insert({
            budget_id: budgetId,
            trip_id: tripId,
            category_id: category.id,
            name: newName,
            linked_expense_category: "other",
            planned_amount: parseMoney(newAmounts[index]),
            currency: reportingCurrency,
            sort_order: sortOffset + index,
        });

        if (lineError) {
            throw new Error(
                `Could not add budget line item: ${
                    lineError.message ?? "Unknown Supabase error"
                }`
            );
        }
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);
}

export async function createExpense(formData: FormData) {
    const { supabase, user } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const expenseDate = getString(formData, "expense_date") || getLocalDateKey();
    const description = getString(formData, "description");
    const fallbackCategory = normalizeExpenseCategory(formData.get("category"));
    const budgetCategory = await resolveBudgetCategory({
        db,
        tripId,
        budgetCategoryId: getString(formData, "budget_category_id"),
        fallbackCategory,
    });
    const category = budgetCategory.category;
    const amount = parseMoney(formData.get("amount"));
    const currency = normalizeCurrency(formData.get("currency"));
    const reportingCurrency = normalizeCurrency(formData.get("reporting_currency"));
    const manualExchangeRate = parseMoney(formData.get("manual_exchange_rate"));
    const splitMethod = getSplitMethod(getString(formData, "split_method"));
    const paidBy =
        splitMethod === "just_me"
            ? { kind: "member" as BudgetParticipantKind, id: `user:${user.id}` }
            : parseParticipantValue(formData.get("paid_by"));
    const sourceType = getString(formData, "source_type") || "manual";
    const transportationItemId = getString(formData, "transportation_item_id");
    const itineraryEventId = getString(formData, "itinerary_event_id");
    const accommodationId = getString(formData, "accommodation_id");
    const notes = getString(formData, "notes");

    if (!tripId) throw new Error("Trip is required.");
    if (!description) throw new Error("Description is required.");
    if (amount <= 0) throw new Error("Amount must be greater than 0.");
    if (!EXPENSE_CATEGORIES.includes(category)) {
        throw new Error("Choose a valid expense category.");
    }

    let fetchedExchangeRate: number | null = null;
    let exchangeRateUsed = manualExchangeRate > 0 ? manualExchangeRate : 0;

    if (exchangeRateUsed <= 0) {
        try {
            const exchangeRate = await getExchangeRate({
                date: expenseDate,
                fromCurrency: currency,
                toCurrency: reportingCurrency,
            });
            fetchedExchangeRate = exchangeRate.rate;
            exchangeRateUsed = exchangeRate.rate;
        } catch (error) {
            console.error("Error fetching exchange rate:", {
                error,
                tripId,
                expenseDate,
                currency,
                reportingCurrency,
            });
            throw new Error(
                "Could not fetch the exchange rate. Enter a manual exchange rate to save this expense."
            );
        }
    }

    const expensePayload: Record<string, unknown> = {
        trip_id: tripId,
        expense_date: expenseDate,
        transaction_date: expenseDate,
        description,
        category,
        budget_category_id: budgetCategory.id,
        amount,
        currency,
        original_amount: amount,
        original_currency: currency,
        reporting_currency: reportingCurrency,
        fetched_exchange_rate: fetchedExchangeRate,
        manual_exchange_rate: manualExchangeRate > 0 ? manualExchangeRate : null,
        exchange_rate_used: exchangeRateUsed,
        exchange_rate_is_manual: manualExchangeRate > 0,
        split_method: splitMethod,
        source_type: sourceType,
        transportation_item_id: transportationItemId || null,
        itinerary_event_id: itineraryEventId || null,
        accommodation_id: accommodationId || null,
        notes: notes || null,
        created_by: user.id,
    };

    if (paidBy) {
        if (paidBy.kind === "member") {
            if (paidBy.id.startsWith("user:")) {
                expensePayload.paid_by_user_id = paidBy.id.replace(/^user:/, "");
            } else {
                const participants = await loadBudgetParticipants(tripId, user.id);
                const payer = participants.find(
                    (participant) =>
                        participant.kind === "member" &&
                        participant.tripMemberId === paidBy.id
                );
                expensePayload.paid_by_user_id = payer?.userId || null;
                expensePayload.paid_by_trip_member_id = paidBy.id;
            }
        } else if (paidBy.kind === "invitation") {
            expensePayload.paid_by_invitation_id = paidBy.id;
        } else if (paidBy.kind === "family_member") {
            expensePayload.paid_by_family_member_id = paidBy.id;
        } else {
            expensePayload.paid_by_guest_name = paidBy.id;
        }
    }

    const { data: expenseRow, error: expenseError } = await db
        .from("trip_expenses")
        .insert(expensePayload)
        .select("id")
        .single();

    if (expenseError || !expenseRow?.id) {
        console.error("Error creating expense:", {
            message: expenseError?.message,
            code: expenseError?.code,
            details: expenseError?.details,
            payload: expensePayload,
        });
        throw new Error(
            `Could not create expense: ${
                expenseError?.message ?? "Unknown Supabase error"
            }`
        );
    }

    const expenseId = String(expenseRow.id);
    const formParticipants = formData
        .getAll("included_participants")
        .map(parseParticipantValue)
        .filter((participant): participant is NonNullable<typeof participant> =>
            Boolean(participant)
        );
    const selectedParticipants =
        splitMethod === "just_me"
            ? [{ kind: "member" as BudgetParticipantKind, id: `user:${user.id}` }]
            : formParticipants;

    if (selectedParticipants.length === 0) {
        throw new Error("Select at least one person to split this expense.");
    }

    let splitAmounts: number[] = [];
    let splitPercentages: Array<number | null> = selectedParticipants.map(() => null);

    if (splitMethod === "just_me") {
        splitAmounts = [amount];
    } else if (splitMethod === "equal") {
        splitAmounts = splitEvenly(amount, selectedParticipants.length);
    } else if (splitMethod === "exact") {
        splitAmounts = selectedParticipants.map((participant) =>
            parseMoney(formData.get(`split_amount_${participant.kind}_${participant.id}`))
        );
        const total = roundMoney(splitAmounts.reduce((sum, value) => sum + value, 0));
        if (Math.abs(total - amount) > 0.01) {
            throw new Error("Exact split amounts must add up to the expense total.");
        }
    } else {
        splitPercentages = selectedParticipants.map((participant) =>
            parseMoney(
                formData.get(`split_percentage_${participant.kind}_${participant.id}`)
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

    const splitRows = selectedParticipants.map((participant, index) => ({
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

    const { error: splitsError } = await db
        .from("trip_expense_splits")
        .insert(splitRows);

    if (splitsError) {
        console.error("Error creating expense splits:", {
            message: splitsError.message,
            code: splitsError.code,
            details: splitsError.details,
            tripId,
            expenseId,
            splitRows,
        });
        throw new Error(
            `Could not create expense splits: ${
                splitsError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const receipt = formData.get("receipt");
    if (receipt instanceof File && receipt.size > 0) {
        const allowedTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
        ]);

        if (!allowedTypes.has(receipt.type)) {
            throw new Error("Receipt must be a JPG, PNG, WebP, or PDF file.");
        }

        if (receipt.size > 10 * 1024 * 1024) {
            throw new Error("Receipt must be 10 MB or smaller.");
        }

        const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${tripId}/${expenseId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await db.storage
            .from("expense-receipts")
            .upload(storagePath, receipt, {
                contentType: receipt.type,
                upsert: true,
            });

        if (uploadError) {
            throw new Error(
                `Could not upload receipt: ${
                    uploadError.message ?? "Unknown Supabase error"
                }`
            );
        }

        const { error: receiptError } = await db
            .from("trip_expense_receipts")
            .insert({
                expense_id: expenseId,
                trip_id: tripId,
                storage_bucket: "expense-receipts",
                storage_path: storagePath,
                file_name: receipt.name,
                mime_type: receipt.type,
                file_size_bytes: receipt.size,
                uploaded_by: user.id,
            });

        if (receiptError) {
            throw new Error(
                `Could not save receipt metadata: ${
                    receiptError.message ?? "Unknown Supabase error"
                }`
            );
        }
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);
}

export async function createExpenseSettlement(formData: FormData) {
    const { supabase, user } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const paidByParticipantValue = getString(
        formData,
        "paid_by_participant_value"
    );
    const receivedByParticipantValue = getString(
        formData,
        "received_by_participant_value"
    );
    const amount = parseMoney(formData.get("amount"));
    const reportingCurrency = normalizeCurrency(
        formData.get("reporting_currency")
    );
    const settledOn = getString(formData, "settled_on") || getLocalDateKey();

    if (!tripId) throw new Error("Trip is required.");
    if (amount <= 0) throw new Error("Enter an amount greater than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settledOn)) {
        throw new Error("Choose a valid settlement date.");
    }
    if (
        !paidByParticipantValue ||
        !receivedByParticipantValue ||
        paidByParticipantValue === receivedByParticipantValue
    ) {
        throw new Error("Choose two different people for the settlement.");
    }

    const participants = await loadBudgetParticipants(tripId, user.id);
    const allowedParticipantValues = new Set(
        participants.map(getBudgetParticipantValue)
    );

    if (
        !allowedParticipantValues.has(paidByParticipantValue) ||
        !allowedParticipantValues.has(receivedByParticipantValue)
    ) {
        throw new Error("Choose current trip participants for the settlement.");
    }

    const { error } = await db.from("trip_expense_settlements").insert({
        trip_id: tripId,
        paid_by_participant_value: paidByParticipantValue,
        received_by_participant_value: receivedByParticipantValue,
        amount,
        reporting_currency: reportingCurrency,
        settled_on: settledOn,
        created_by: user.id,
    });

    if (error) {
        throw new Error(
            `Could not save settlement: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);
}

export async function updateExpense(formData: FormData) {
    const { supabase, user } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const expenseId = getString(formData, "expense_id");
    const expenseDate = getString(formData, "expense_date") || getLocalDateKey();
    const description = getString(formData, "description");
    const fallbackCategory = normalizeExpenseCategory(formData.get("category"));
    const budgetCategory = await resolveBudgetCategory({
        db,
        tripId,
        budgetCategoryId: getString(formData, "budget_category_id"),
        fallbackCategory,
    });
    const category = budgetCategory.category;
    const amount = parseMoney(formData.get("amount"));
    const currency = normalizeCurrency(formData.get("currency"));
    const reportingCurrency = normalizeCurrency(formData.get("reporting_currency"));
    const manualExchangeRate = parseMoney(formData.get("manual_exchange_rate"));
    const splitMethod = getSplitMethod(getString(formData, "split_method"));
    const paidBy =
        splitMethod === "just_me"
            ? { kind: "member" as BudgetParticipantKind, id: `user:${user.id}` }
            : parseParticipantValue(formData.get("paid_by"));
    const sourceType = getString(formData, "source_type") || "manual";
    const transportationItemId = getString(formData, "transportation_item_id");
    const itineraryEventId = getString(formData, "itinerary_event_id");
    const accommodationId = getString(formData, "accommodation_id");
    const notes = getString(formData, "notes");

    if (!tripId) throw new Error("Trip is required.");
    if (!expenseId) throw new Error("Expense is required.");
    if (!description) throw new Error("Description is required.");
    if (amount <= 0) throw new Error("Amount must be greater than 0.");
    if (!EXPENSE_CATEGORIES.includes(category)) {
        throw new Error("Choose a valid expense category.");
    }

    let fetchedExchangeRate: number | null = null;
    let exchangeRateUsed = manualExchangeRate > 0 ? manualExchangeRate : 0;

    if (exchangeRateUsed <= 0) {
        try {
            const exchangeRate = await getExchangeRate({
                date: expenseDate,
                fromCurrency: currency,
                toCurrency: reportingCurrency,
            });
            fetchedExchangeRate = exchangeRate.rate;
            exchangeRateUsed = exchangeRate.rate;
        } catch (error) {
            console.error("Error fetching exchange rate for expense update:", {
                error,
                tripId,
                expenseId,
                expenseDate,
                currency,
                reportingCurrency,
            });
            throw new Error(
                "Could not fetch the exchange rate. Enter a manual exchange rate to save this expense."
            );
        }
    }

    const expensePayload: Record<string, unknown> = {
        expense_date: expenseDate,
        transaction_date: expenseDate,
        description,
        category,
        budget_category_id: budgetCategory.id,
        amount,
        currency,
        original_amount: amount,
        original_currency: currency,
        reporting_currency: reportingCurrency,
        fetched_exchange_rate: fetchedExchangeRate,
        manual_exchange_rate: manualExchangeRate > 0 ? manualExchangeRate : null,
        exchange_rate_used: exchangeRateUsed,
        exchange_rate_is_manual: manualExchangeRate > 0,
        split_method: splitMethod,
        source_type: sourceType,
        transportation_item_id: transportationItemId || null,
        itinerary_event_id: itineraryEventId || null,
        accommodation_id: accommodationId || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
    };

    expensePayload.paid_by_user_id = null;
    expensePayload.paid_by_trip_member_id = null;
    expensePayload.paid_by_invitation_id = null;
    expensePayload.paid_by_family_member_id = null;
    expensePayload.paid_by_guest_name = null;

    if (paidBy) {
        if (paidBy.kind === "member") {
            if (paidBy.id.startsWith("user:")) {
                expensePayload.paid_by_user_id = paidBy.id.replace(/^user:/, "");
            } else {
                const participants = await loadBudgetParticipants(tripId, user.id);
                const payer = participants.find(
                    (participant) =>
                        participant.kind === "member" &&
                        participant.tripMemberId === paidBy.id
                );
                expensePayload.paid_by_user_id = payer?.userId || null;
                expensePayload.paid_by_trip_member_id = paidBy.id;
            }
        } else if (paidBy.kind === "invitation") {
            expensePayload.paid_by_invitation_id = paidBy.id;
        } else if (paidBy.kind === "family_member") {
            expensePayload.paid_by_family_member_id = paidBy.id;
        } else {
            expensePayload.paid_by_guest_name = paidBy.id;
        }
    }

    const { error: expenseError } = await db
        .from("trip_expenses")
        .update(expensePayload)
        .eq("id", expenseId)
        .eq("trip_id", tripId);

    if (expenseError) {
        console.error("Error updating expense:", {
            message: expenseError.message,
            code: expenseError.code,
            details: expenseError.details,
            tripId,
            expenseId,
            payload: expensePayload,
        });
        throw new Error(
            `Could not update expense: ${
                expenseError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const formParticipants = formData
        .getAll("included_participants")
        .map(parseParticipantValue)
        .filter((participant): participant is NonNullable<typeof participant> =>
            Boolean(participant)
        );
    const selectedParticipants =
        splitMethod === "just_me"
            ? [{ kind: "member" as BudgetParticipantKind, id: `user:${user.id}` }]
            : formParticipants;

    if (selectedParticipants.length === 0) {
        throw new Error("Select at least one person to split this expense.");
    }

    let splitAmounts: number[] = [];
    let splitPercentages: Array<number | null> = selectedParticipants.map(() => null);

    if (splitMethod === "just_me") {
        splitAmounts = [amount];
    } else if (splitMethod === "equal") {
        splitAmounts = splitEvenly(amount, selectedParticipants.length);
    } else if (splitMethod === "exact") {
        splitAmounts = selectedParticipants.map((participant) =>
            parseMoney(formData.get(`split_amount_${participant.kind}_${participant.id}`))
        );
        const total = roundMoney(splitAmounts.reduce((sum, value) => sum + value, 0));
        if (Math.abs(total - amount) > 0.01) {
            throw new Error("Exact split amounts must add up to the expense total.");
        }
    } else {
        splitPercentages = selectedParticipants.map((participant) =>
            parseMoney(
                formData.get(`split_percentage_${participant.kind}_${participant.id}`)
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

    const { error: deleteSplitsError } = await db
        .from("trip_expense_splits")
        .delete()
        .eq("expense_id", expenseId)
        .eq("trip_id", tripId);

    if (deleteSplitsError) {
        throw new Error(
            `Could not update expense splits: ${
                deleteSplitsError.message ?? "Unknown Supabase error"
            }`
        );
    }

    const splitRows = selectedParticipants.map((participant, index) => ({
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

    const { error: splitsError } = await db
        .from("trip_expense_splits")
        .insert(splitRows);

    if (splitsError) {
        throw new Error(
            `Could not save expense splits: ${
                splitsError.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);
}

export async function deleteExpense(formData: FormData) {
    const { supabase } = await requireUser();
    const db = asUntypedSupabase(supabase);
    const tripId = getString(formData, "trip_id");
    const expenseId = getString(formData, "expense_id");

    const { error } = await db
        .from("trip_expenses")
        .update({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", expenseId)
        .eq("trip_id", tripId);

    if (error) {
        throw new Error(
            `Could not delete expense: ${error.message ?? "Unknown Supabase error"}`
        );
    }

    revalidatePath(`/trips/${tripId}/budget`);
    revalidatePath(`/trips/${tripId}/budget/expenses`);
}
