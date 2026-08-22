"use server";

import { revalidatePath } from "next/cache";
import {
  budgetInputFromFormData,
  createBudgetForUser,
  createExpenseCategoryForUser,
  createExpenseForUser,
  createSettlementForUser,
  deleteExpenseForUser,
  expenseInputFromFormData,
  settlementInputFromFormData,
  updateBudgetForUser,
  updateBudgetLineForUser,
  updateExpenseForUser,
} from "@/lib/budget/mutations";
import {
  normalizeCurrency,
  normalizeExpenseCategory,
  parseMoney,
  type TripBudgetCategory,
  type TripBudgetLineItem,
} from "@/lib/budget";
import { normalizeBudgetCategory } from "@/lib/budgetServer";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  return { supabase, user };
}

function revalidateBudget(tripId: string) {
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/budget/expenses`);
}

export async function createBudget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await createBudgetForUser({
    supabase,
    userId: user.id,
    tripId,
    tripTitle: text(formData, "trip_title"),
    input: budgetInputFromFormData(formData),
  });
  revalidateBudget(tripId);
}

export async function updateBudget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await updateBudgetForUser({
    supabase,
    userId: user.id,
    tripId,
    budgetId: text(formData, "budget_id"),
    input: budgetInputFromFormData(formData),
  });
  revalidateBudget(tripId);
}

export async function updateBudgetLineItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await updateBudgetLineForUser({
    supabase,
    userId: user.id,
    tripId,
    lineItemId: text(formData, "line_item_id"),
    plannedAmount: text(formData, "planned_amount"),
  });
  revalidateBudget(tripId);
}

export async function createExpenseCategory(formData: FormData): Promise<{
  category: TripBudgetCategory;
  lineItem: TripBudgetLineItem | null;
}> {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  const result = await createExpenseCategoryForUser({
    supabase,
    userId: user.id,
    tripId,
    name: text(formData, "name"),
    linkedExpenseCategory: normalizeExpenseCategory(formData.get("linked_expense_category")),
    reportingCurrency: normalizeCurrency(formData.get("reporting_currency")),
    createBudgetLine: text(formData, "create_budget_line") === "true",
    plannedAmount: parseMoney(formData.get("planned_amount")),
  });
  revalidateBudget(tripId);
  return {
    category: normalizeBudgetCategory(result.category),
    lineItem: result.lineItem,
  };
}

export async function createExpense(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  const receipt = formData.get("receipt");
  await createExpenseForUser({ supabase, userId: user.id, tripId, input: expenseInputFromFormData(formData), receipt: receipt instanceof File ? receipt : null });
  revalidateBudget(tripId);
}

export async function updateExpense(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await updateExpenseForUser({
    supabase,
    userId: user.id,
    tripId,
    expenseId: text(formData, "expense_id"),
    input: expenseInputFromFormData(formData),
  });
  revalidateBudget(tripId);
}

export async function deleteExpense(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await deleteExpenseForUser({ supabase, userId: user.id, tripId, expenseId: text(formData, "expense_id") });
  revalidateBudget(tripId);
}

export async function createExpenseSettlement(formData: FormData) {
  const { supabase, user } = await requireUser();
  const tripId = text(formData, "trip_id");
  await createSettlementForUser({ supabase, userId: user.id, tripId, input: settlementInputFromFormData(formData) });
  revalidateBudget(tripId);
}
