import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_BUDGET_CATEGORIES,
  EXPENSE_CATEGORIES,
  getLocalDateKey,
  normalizeCurrency,
  normalizeExpenseCategory,
  parseMoney,
  type BudgetParticipant,
  type BudgetParticipantKind,
  type ExpenseCategory,
  type SplitMethod,
} from "@/lib/budget";
import {
  asUntypedSupabase,
  getExchangeRateWithClient,
  loadBudgetParticipantsWithClient,
  normalizeBudget,
  normalizeBudgetLineItem,
  normalizeExpense,
  normalizeExpenseSettlement,
  normalizeExpenseSplit,
} from "@/lib/budgetServer";
import type { Database } from "@/src/types/supabase";

type BudgetSupabase = SupabaseClient<Database>;

export class BudgetMutationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "validation_error"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "operation_failed",
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "BudgetMutationError";
  }
}

export type BudgetLineInput = {
  id?: string | null;
  categoryId?: string | null;
  name: string;
  plannedAmount: number | string | null;
  linkedExpenseCategory?: ExpenseCategory | null;
  remove?: boolean;
  remapCategoryId?: string | null;
};

export type BudgetMutationInput = {
  name?: string | null;
  reportingCurrency?: string | null;
  totalBudgetAmount?: number | string | null;
  lines?: BudgetLineInput[];
};

export type ExpenseSplitInput = {
  participantValue: string;
  amount?: number | string | null;
  percentage?: number | string | null;
};

export type ExpenseMutationInput = {
  description: string;
  expenseDate?: string | null;
  category?: ExpenseCategory | null;
  budgetCategoryId?: string | null;
  amount: number | string;
  currency?: string | null;
  reportingCurrency?: string | null;
  manualExchangeRate?: number | string | null;
  splitMethod?: SplitMethod | null;
  paidBy?: string | null;
  splits?: ExpenseSplitInput[];
  notes?: string | null;
  sourceType?: "manual" | "transportation" | "itinerary_event" | "accommodation";
  transportationItemId?: string | null;
  itineraryEventId?: string | null;
  accommodationId?: string | null;
};

export type SettlementMutationInput = {
  paidByParticipantValue: string;
  receivedByParticipantValue: string;
  amount: number | string;
  reportingCurrency?: string | null;
  settledOn?: string | null;
};

type ParsedParticipant = { kind: BudgetParticipantKind; id: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function money(value: unknown) {
  return parseMoney(typeof value === "number" ? String(value) : String(value ?? ""));
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function roundBudgetMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function splitBudgetEvenly(total: number, count: number) {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

export function calculateBudgetSplitAmounts(
  total: number,
  method: SplitMethod,
  splits: Array<{ amount: number; percentage: number }>,
) {
  let amounts: number[];
  let percentages: Array<number | null> = splits.map(() => null);
  if (method === "just_me") amounts = [total];
  else if (method === "equal") amounts = splitBudgetEvenly(total, splits.length);
  else if (method === "exact") {
    amounts = splits.map((split) => split.amount);
    if (Math.abs(roundBudgetMoney(amounts.reduce((sum, value) => sum + value, 0)) - total) > 0.01) {
      throw new BudgetMutationError("Exact split amounts must add up to the expense total.", "validation_error", 422, { splits: ["Exact amounts must equal the total."] });
    }
  } else {
    percentages = splits.map((split) => split.percentage);
    if (Math.abs(roundBudgetMoney(percentages.reduce<number>((sum, value) => sum + Number(value || 0), 0)) - 100) > 0.01) {
      throw new BudgetMutationError("Percentage splits must add up to 100%.", "validation_error", 422, { splits: ["Percentages must equal 100%."] });
    }
    amounts = percentages.map((percentage) => roundBudgetMoney(total * (Number(percentage) / 100)));
  }
  return { amounts, percentages };
}

export function participantValue(participant: BudgetParticipant) {
  if (participant.kind === "member" && participant.tripMemberId) return `member:${participant.tripMemberId}`;
  if (participant.kind === "member" && participant.userId) return `member_user:${participant.userId}`;
  if (participant.kind === "invitation" && participant.invitationId) return `invitation:${participant.invitationId}`;
  if (participant.kind === "family_member" && participant.familyMemberId) return `family_member:${participant.familyMemberId}`;
  return `guest:${participant.guestName || participant.label}`;
}

function parseParticipant(value: unknown): ParsedParticipant | null {
  const text = clean(value, 500);
  const separator = text.indexOf(":");
  const kind = text.slice(0, separator);
  const id = text.slice(separator + 1);
  if (kind === "member_user" && id) return { kind: "member", id: `user:${id}` };
  if (!id || !["member", "invitation", "family_member", "guest"].includes(kind)) return null;
  return { kind: kind as BudgetParticipantKind, id };
}

function participantColumns(participant: ParsedParticipant) {
  if (participant.kind === "member") {
    return participant.id.startsWith("user:")
      ? { participant_kind: "member", user_id: participant.id.slice(5) }
      : { participant_kind: "member", trip_member_id: participant.id };
  }
  if (participant.kind === "invitation") return { participant_kind: "invitation", invitation_id: participant.id };
  if (participant.kind === "family_member") return { participant_kind: "family_member", family_member_id: participant.id };
  return { participant_kind: "guest", guest_name: participant.id };
}

async function requireTripAccess(supabase: BudgetSupabase, tripId: string, userId: string) {
  if (!tripId) throw new BudgetMutationError("Trip is required.", "validation_error", 422, { tripId: ["Trip is required."] });
  const { data: trip, error } = await supabase.from("trips").select("id,user_id,archived_at").eq("id", tripId).maybeSingle();
  if (error || !trip) throw new BudgetMutationError("Trip not found.", "not_found", 404);
  if (trip.archived_at) throw new BudgetMutationError("Archived trips cannot be changed.", "conflict", 409);
  if (trip.user_id === userId) return;
  const { data: member } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .in("status", ["active", "accepted"])
    .maybeSingle();
  if (!member) throw new BudgetMutationError("You cannot change this trip.", "forbidden", 403);
}

function operationFailure(message: string) {
  return new BudgetMutationError(message, "operation_failed", 500);
}

function normalizeBudgetInput(input: BudgetMutationInput, fallbackName: string) {
  const name = clean(input.name, 120) || fallbackName;
  const reportingCurrency = normalizeCurrency(clean(input.reportingCurrency, 3));
  const total = money(input.totalBudgetAmount);
  const lines = (input.lines || []).slice(0, 100).map((line) => ({
    id: clean(line.id, 80) || null,
    categoryId: clean(line.categoryId, 80) || null,
    name: clean(line.name, 80),
    plannedAmount: money(line.plannedAmount),
    linkedExpenseCategory: normalizeExpenseCategory(line.linkedExpenseCategory),
    remove: Boolean(line.remove),
    remapCategoryId: clean(line.remapCategoryId, 80) || null,
  }));
  if (lines.some((line) => !line.name && !line.remove)) {
    throw new BudgetMutationError("Every budget category needs a name.", "validation_error", 422, { lines: ["Every category needs a name."] });
  }
  return { name, reportingCurrency, total: total || null, lines };
}

export async function createBudgetForUser({
  supabase,
  userId,
  tripId,
  tripTitle,
  input,
}: {
  supabase: BudgetSupabase;
  userId: string;
  tripId: string;
  tripTitle?: string;
  input: BudgetMutationInput;
}) {
  await requireTripAccess(supabase, tripId, userId);
  const db = asUntypedSupabase(supabase);
  const normalized = normalizeBudgetInput(input, `${clean(tripTitle, 120) || "Trip"} Budget`);
  const { data: existing } = await db.from("trip_budgets").select("id").eq("trip_id", tripId).eq("is_active", true).maybeSingle();
  if (existing) throw new BudgetMutationError("This trip already has an active budget.", "conflict", 409);
  const { data: budget, error } = await db.from("trip_budgets").insert({
    trip_id: tripId,
    name: normalized.name,
    reporting_currency: normalized.reportingCurrency,
    total_budget_amount: normalized.total,
    is_active: true,
    created_by: userId,
  }).select("*").single();
  if (error || !budget) throw operationFailure("Could not create budget.");

  const requestedLines = normalized.lines.length
    ? normalized.lines
    : DEFAULT_BUDGET_CATEGORIES.map((category) => ({
        id: null,
        categoryId: null,
        name: category.name,
        plannedAmount: 0,
        linkedExpenseCategory: category.linkedExpenseCategory,
        remove: false,
        remapCategoryId: null,
      }));
  const categoryRows = requestedLines.map((line, index) => ({
    trip_id: tripId,
    name: line.name,
    linked_expense_category: line.linkedExpenseCategory,
    sort_order: index,
    is_default: DEFAULT_BUDGET_CATEGORIES.some((category) => category.name === line.name),
    is_archived: false,
    created_by: userId,
  }));
  const { data: categories, error: categoryError } = await db
    .from("trip_budget_categories")
    .upsert(categoryRows, { onConflict: "trip_id,name" })
    .select("*");
  if (categoryError) throw operationFailure("Could not create budget categories.");
  const byName = new Map(((categories || []) as Record<string, unknown>[]).map((row) => [String(row.name), String(row.id)]));
  const { data: lineRows, error: lineError } = await db.from("trip_budget_line_items").insert(
    requestedLines.map((line, index) => ({
      budget_id: String(budget.id),
      trip_id: tripId,
      category_id: byName.get(line.name) || null,
      name: line.name,
      linked_expense_category: line.linkedExpenseCategory,
      planned_amount: line.plannedAmount,
      currency: normalized.reportingCurrency,
      sort_order: index,
    })),
  ).select("*");
  if (lineError) throw operationFailure("Could not create budget categories.");
  return {
    budget: normalizeBudget(budget as Record<string, unknown>),
    lineItems: ((lineRows || []) as Record<string, unknown>[]).map(normalizeBudgetLineItem),
  };
}

export async function updateBudgetForUser({
  supabase,
  userId,
  tripId,
  budgetId,
  input,
}: {
  supabase: BudgetSupabase;
  userId: string;
  tripId: string;
  budgetId: string;
  input: BudgetMutationInput;
}) {
  await requireTripAccess(supabase, tripId, userId);
  const db = asUntypedSupabase(supabase);
  const normalized = normalizeBudgetInput(input, "Trip budget");
  const { data: budget, error } = await db.from("trip_budgets").update({
    name: normalized.name,
    reporting_currency: normalized.reportingCurrency,
    total_budget_amount: normalized.total,
    updated_at: new Date().toISOString(),
  }).eq("id", budgetId).eq("trip_id", tripId).select("*").maybeSingle();
  if (error || !budget) throw new BudgetMutationError("Budget not found.", "not_found", 404);

  for (const [index, line] of normalized.lines.entries()) {
    if (line.id) {
      const { data: current } = await db.from("trip_budget_line_items").select("id,category_id").eq("id", line.id).eq("trip_id", tripId).eq("budget_id", budgetId).maybeSingle();
      if (!current) throw new BudgetMutationError("Budget category not found.", "not_found", 404);
      if (line.remove) {
        const { data: used } = current.category_id
          ? await db.from("trip_expenses").select("id").eq("trip_id", tripId).eq("budget_category_id", current.category_id).is("deleted_at", null).limit(1)
          : { data: [] };
        if ((used || []).length && !line.remapCategoryId) {
          throw new BudgetMutationError("Choose a category for existing expenses before removing this category.", "validation_error", 422, { remapCategoryId: ["Choose a replacement category."] });
        }
        if ((used || []).length && line.remapCategoryId) {
          const { data: replacement } = await db.from("trip_budget_categories").select("id,linked_expense_category").eq("id", line.remapCategoryId).eq("trip_id", tripId).eq("is_archived", false).maybeSingle();
          if (!replacement) throw new BudgetMutationError("Replacement category not found.", "validation_error", 422);
          const { error: remapError } = await db.from("trip_expenses").update({ budget_category_id: replacement.id, category: replacement.linked_expense_category }).eq("trip_id", tripId).eq("budget_category_id", current.category_id);
          if (remapError) throw operationFailure("Could not move existing expenses.");
        }
        const { error: deleteError } = await db.from("trip_budget_line_items").delete().eq("id", line.id).eq("trip_id", tripId);
        if (deleteError) throw operationFailure("Could not remove budget category.");
        if (current.category_id) await db.from("trip_budget_categories").update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", current.category_id).eq("trip_id", tripId);
        continue;
      }
      const { error: lineError } = await db.from("trip_budget_line_items").update({
        name: line.name,
        planned_amount: line.plannedAmount,
        currency: normalized.reportingCurrency,
        sort_order: index,
        updated_at: new Date().toISOString(),
      }).eq("id", line.id).eq("trip_id", tripId).eq("budget_id", budgetId);
      if (lineError) throw operationFailure("Could not update budget category.");
      if (current.category_id) {
        const { error: categoryError } = await db.from("trip_budget_categories").update({ name: line.name, updated_at: new Date().toISOString() }).eq("id", current.category_id).eq("trip_id", tripId);
        if (categoryError) throw operationFailure("Could not update expense category.");
      }
      continue;
    }
    const { data: category, error: categoryError } = await db.from("trip_budget_categories").insert({
      trip_id: tripId,
      name: line.name,
      linked_expense_category: line.linkedExpenseCategory,
      sort_order: index,
      is_default: false,
      is_archived: false,
      created_by: userId,
    }).select("id").single();
    if (categoryError || !category) throw operationFailure("Could not create budget category.");
    const { error: lineError } = await db.from("trip_budget_line_items").insert({
      budget_id: budgetId,
      trip_id: tripId,
      category_id: category.id,
      name: line.name,
      linked_expense_category: line.linkedExpenseCategory,
      planned_amount: line.plannedAmount,
      currency: normalized.reportingCurrency,
      sort_order: index,
    });
    if (lineError) throw operationFailure("Could not create budget category.");
  }
  return { budget: normalizeBudget(budget as Record<string, unknown>) };
}

async function allowedParticipants(supabase: BudgetSupabase, tripId: string, userId: string) {
  const participants = await loadBudgetParticipantsWithClient(asUntypedSupabase(supabase), tripId, userId);
  return { participants, values: new Set(participants.map(participantValue)) };
}

async function resolveBudgetCategory(supabase: BudgetSupabase, tripId: string, categoryId: string, fallback: ExpenseCategory) {
  if (!categoryId) return { id: null, category: fallback };
  const { data } = await supabase.from("trip_budget_categories").select("id,linked_expense_category,is_archived").eq("id", categoryId).eq("trip_id", tripId).maybeSingle();
  if (!data || data.is_archived) throw new BudgetMutationError("Choose an active budget category.", "validation_error", 422, { budgetCategoryId: ["Choose an active budget category."] });
  return { id: data.id, category: normalizeExpenseCategory(data.linked_expense_category) };
}

async function normalizeExpenseInput(
  supabase: BudgetSupabase,
  tripId: string,
  userId: string,
  input: ExpenseMutationInput,
) {
  const description = clean(input.description, 240);
  const expenseDate = clean(input.expenseDate, 10) || getLocalDateKey();
  const amount = money(input.amount);
  if (!description) throw new BudgetMutationError("Description is required.", "validation_error", 422, { description: ["Description is required."] });
  if (!validDate(expenseDate)) throw new BudgetMutationError("Choose a valid expense date.", "validation_error", 422, { expenseDate: ["Choose a valid date."] });
  if (amount === 0) throw new BudgetMutationError("Amount cannot be zero. Use a negative amount for a refund.", "validation_error", 422, { amount: ["Amount cannot be zero."] });
  const fallbackCategory = normalizeExpenseCategory(input.category);
  if (!EXPENSE_CATEGORIES.includes(fallbackCategory)) throw new BudgetMutationError("Choose a valid expense category.", "validation_error", 422);
  const budgetCategory = await resolveBudgetCategory(supabase, tripId, clean(input.budgetCategoryId, 80), fallbackCategory);
  const currency = normalizeCurrency(input.currency);
  const reportingCurrency = normalizeCurrency(input.reportingCurrency);
  const manualRate = money(input.manualExchangeRate);
  let fetchedRate: number | null = null;
  let rate = manualRate > 0 ? manualRate : 0;
  if (rate <= 0) {
    try {
      const result = await getExchangeRateWithClient(asUntypedSupabase(supabase), { date: expenseDate, fromCurrency: currency, toCurrency: reportingCurrency });
      fetchedRate = result.rate;
      rate = result.rate;
    } catch {
      throw new BudgetMutationError("Could not fetch the exchange rate. Enter a manual exchange rate to save this expense.", "operation_failed", 503);
    }
  }
  const splitMethod: SplitMethod = ["just_me", "exact", "percentage"].includes(String(input.splitMethod)) ? input.splitMethod as SplitMethod : "equal";
  const { participants, values } = await allowedParticipants(supabase, tripId, userId);
  const current = participants.find((participant) => participant.isCurrentUser);
  const currentValue = current ? participantValue(current) : `member_user:${userId}`;
  const payerValue = splitMethod === "just_me" ? currentValue : clean(input.paidBy, 500);
  if (!values.has(payerValue)) throw new BudgetMutationError("Choose a current trip participant as payer.", "validation_error", 422, { paidBy: ["Choose a current trip participant."] });
  const requestedSplits = splitMethod === "just_me" ? [{ participantValue: currentValue }] : (input.splits || []).slice(0, 100);
  if (!requestedSplits.length) throw new BudgetMutationError("Select at least one person to split this expense.", "validation_error", 422, { splits: ["Select at least one person."] });
  const seen = new Set<string>();
  const parsedSplits = requestedSplits.map((split) => {
    const value = clean(split.participantValue, 500);
    const participant = parseParticipant(value);
    if (!participant || !values.has(value) || seen.has(value)) throw new BudgetMutationError("Choose current trip participants for this split.", "validation_error", 422, { splits: ["Choose each participant once."] });
    seen.add(value);
    return { participant, amount: money(split.amount), percentage: money(split.percentage) };
  });
  const { amounts, percentages } = calculateBudgetSplitAmounts(amount, splitMethod, parsedSplits);
  const payer = parseParticipant(payerValue)!;
  return {
    expenseDate,
    description,
    budgetCategory,
    amount,
    currency,
    reportingCurrency,
    manualRate,
    fetchedRate,
    rate,
    splitMethod,
    payer,
    sourceType: input.sourceType || "manual",
    transportationItemId: clean(input.transportationItemId, 80) || null,
    itineraryEventId: clean(input.itineraryEventId, 80) || null,
    accommodationId: clean(input.accommodationId, 80) || null,
    notes: clean(input.notes, 20_000) || null,
    splits: parsedSplits.map((split, index) => ({
      participant: split.participant,
      amount: amounts[index] || 0,
      percentage: percentages[index],
    })),
  };
}

function payerColumns(participant: ParsedParticipant, participants: BudgetParticipant[]) {
  if (participant.kind === "member") {
    if (participant.id.startsWith("user:")) return { paid_by_user_id: participant.id.slice(5) };
    const match = participants.find((candidate) => candidate.tripMemberId === participant.id);
    return { paid_by_trip_member_id: participant.id, paid_by_user_id: match?.userId || null };
  }
  if (participant.kind === "invitation") return { paid_by_invitation_id: participant.id };
  if (participant.kind === "family_member") return { paid_by_family_member_id: participant.id };
  return { paid_by_guest_name: participant.id };
}

async function writeSplits(supabase: BudgetSupabase, tripId: string, expenseId: string, normalized: Awaited<ReturnType<typeof normalizeExpenseInput>>) {
  const rows = normalized.splits.map((split) => ({
    expense_id: expenseId,
    trip_id: tripId,
    ...participantColumns(split.participant),
    split_amount: split.amount,
    split_percentage: split.percentage,
    currency: normalized.currency,
    amount_in_reporting_currency: roundBudgetMoney(split.amount * normalized.rate),
    is_included: true,
  }));
  const { data, error } = await supabase.from("trip_expense_splits").insert(rows).select("*");
  if (error) throw operationFailure("Could not save expense splits.");
  return (data || []).map((row) => normalizeExpenseSplit(row as Record<string, unknown>));
}

export async function createExpenseForUser({ supabase, userId, tripId, input, receipt }: { supabase: BudgetSupabase; userId: string; tripId: string; input: ExpenseMutationInput; receipt?: File | null }) {
  await requireTripAccess(supabase, tripId, userId);
  const normalized = await normalizeExpenseInput(supabase, tripId, userId, input);
  const { participants } = await allowedParticipants(supabase, tripId, userId);
  const { data, error } = await supabase.from("trip_expenses").insert({
    trip_id: tripId,
    expense_date: normalized.expenseDate,
    transaction_date: normalized.expenseDate,
    description: normalized.description,
    category: normalized.budgetCategory.category,
    budget_category_id: normalized.budgetCategory.id,
    amount: normalized.amount,
    currency: normalized.currency,
    original_amount: normalized.amount,
    original_currency: normalized.currency,
    reporting_currency: normalized.reportingCurrency,
    fetched_exchange_rate: normalized.fetchedRate,
    manual_exchange_rate: normalized.manualRate > 0 ? normalized.manualRate : null,
    exchange_rate_used: normalized.rate,
    exchange_rate_is_manual: normalized.manualRate > 0,
    amount_in_reporting_currency: roundBudgetMoney(normalized.amount * normalized.rate),
    split_method: normalized.splitMethod,
    source_type: normalized.sourceType,
    transportation_item_id: normalized.transportationItemId,
    itinerary_event_id: normalized.itineraryEventId,
    accommodation_id: normalized.accommodationId,
    notes: normalized.notes,
    created_by: userId,
    ...payerColumns(normalized.payer, participants),
  }).select("*").single();
  if (error || !data) throw operationFailure("Could not create expense.");
  try {
    const splits = await writeSplits(supabase, tripId, data.id, normalized);
    if (receipt && receipt.size > 0) {
      const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
      if (!allowedTypes.has(receipt.type)) throw new BudgetMutationError("Receipt must be a JPG, PNG, WebP, or PDF file.", "validation_error", 422, { receipt: ["Choose a JPG, PNG, WebP, or PDF."] });
      if (receipt.size > 10 * 1024 * 1024) throw new BudgetMutationError("Receipt must be 10 MB or smaller.", "validation_error", 422, { receipt: ["Receipt must be 10 MB or smaller."] });
      const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${tripId}/${data.id}/${Date.now()}-${safeName}`;
      const db = asUntypedSupabase(supabase);
      const { error: uploadError } = await db.storage.from("expense-receipts").upload(storagePath, receipt, { contentType: receipt.type, upsert: true });
      if (uploadError) throw operationFailure("Could not upload receipt.");
      const { error: receiptError } = await db.from("trip_expense_receipts").insert({ expense_id: data.id, trip_id: tripId, storage_bucket: "expense-receipts", storage_path: storagePath, file_name: receipt.name, mime_type: receipt.type, file_size_bytes: receipt.size, uploaded_by: userId });
      if (receiptError) throw operationFailure("Could not save receipt metadata.");
    }
    return { expense: normalizeExpense(data as Record<string, unknown>), splits };
  } catch (splitError) {
    await supabase.from("trip_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", data.id).eq("trip_id", tripId);
    throw splitError;
  }
}

export async function updateExpenseForUser({ supabase, userId, tripId, expenseId, input }: { supabase: BudgetSupabase; userId: string; tripId: string; expenseId: string; input: ExpenseMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data: current } = await supabase.from("trip_expenses").select("id").eq("id", expenseId).eq("trip_id", tripId).is("deleted_at", null).maybeSingle();
  if (!current) throw new BudgetMutationError("Expense not found.", "not_found", 404);
  const normalized = await normalizeExpenseInput(supabase, tripId, userId, input);
  const { participants } = await allowedParticipants(supabase, tripId, userId);
  const { data, error } = await supabase.from("trip_expenses").update({
    expense_date: normalized.expenseDate,
    transaction_date: normalized.expenseDate,
    description: normalized.description,
    category: normalized.budgetCategory.category,
    budget_category_id: normalized.budgetCategory.id,
    amount: normalized.amount,
    currency: normalized.currency,
    original_amount: normalized.amount,
    original_currency: normalized.currency,
    reporting_currency: normalized.reportingCurrency,
    fetched_exchange_rate: normalized.fetchedRate,
    manual_exchange_rate: normalized.manualRate > 0 ? normalized.manualRate : null,
    exchange_rate_used: normalized.rate,
    exchange_rate_is_manual: normalized.manualRate > 0,
    amount_in_reporting_currency: roundBudgetMoney(normalized.amount * normalized.rate),
    split_method: normalized.splitMethod,
    source_type: normalized.sourceType,
    transportation_item_id: normalized.transportationItemId,
    itinerary_event_id: normalized.itineraryEventId,
    accommodation_id: normalized.accommodationId,
    notes: normalized.notes,
    paid_by_user_id: null,
    paid_by_trip_member_id: null,
    paid_by_invitation_id: null,
    paid_by_family_member_id: null,
    paid_by_guest_name: null,
    ...payerColumns(normalized.payer, participants),
    updated_at: new Date().toISOString(),
  }).eq("id", expenseId).eq("trip_id", tripId).select("*").single();
  if (error || !data) throw operationFailure("Could not update expense.");
  const { error: deleteError } = await supabase.from("trip_expense_splits").delete().eq("expense_id", expenseId).eq("trip_id", tripId);
  if (deleteError) throw operationFailure("Could not update expense splits.");
  const splits = await writeSplits(supabase, tripId, expenseId, normalized);
  return { expense: normalizeExpense(data as Record<string, unknown>), splits };
}

export async function duplicateExpenseForUser({ supabase, userId, tripId, expenseId }: { supabase: BudgetSupabase; userId: string; tripId: string; expenseId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const [{ data: expense }, { data: splitRows }] = await Promise.all([
    supabase.from("trip_expenses").select("*").eq("id", expenseId).eq("trip_id", tripId).is("deleted_at", null).maybeSingle(),
    supabase.from("trip_expense_splits").select("*").eq("expense_id", expenseId).eq("trip_id", tripId),
  ]);
  if (!expense) throw new BudgetMutationError("Expense not found.", "not_found", 404);
  const splitValue = (row: Record<string, unknown>) => {
    if (row.trip_member_id) return `member:${row.trip_member_id}`;
    if (row.user_id) return `member_user:${row.user_id}`;
    if (row.invitation_id) return `invitation:${row.invitation_id}`;
    if (row.family_member_id) return `family_member:${row.family_member_id}`;
    return `guest:${row.guest_name || ""}`;
  };
  return createExpenseForUser({
    supabase,
    userId,
    tripId,
    input: {
      description: String(expense.description),
      expenseDate: getLocalDateKey(),
      category: normalizeExpenseCategory(expense.category),
      budgetCategoryId: expense.budget_category_id,
      amount: Number(expense.original_amount ?? expense.amount),
      currency: expense.original_currency || expense.currency,
      reportingCurrency: expense.reporting_currency,
      manualExchangeRate: expense.manual_exchange_rate,
      splitMethod: expense.split_method as SplitMethod,
      paidBy: expense.paid_by_trip_member_id ? `member:${expense.paid_by_trip_member_id}` : expense.paid_by_user_id ? `member_user:${expense.paid_by_user_id}` : expense.paid_by_invitation_id ? `invitation:${expense.paid_by_invitation_id}` : expense.paid_by_family_member_id ? `family_member:${expense.paid_by_family_member_id}` : `guest:${expense.paid_by_guest_name || ""}`,
      splits: (splitRows || []).map((row) => ({ participantValue: splitValue(row as Record<string, unknown>), amount: row.split_amount, percentage: row.split_percentage })),
      notes: expense.notes,
      sourceType: "manual",
    },
  });
}

export async function deleteExpenseForUser({ supabase, userId, tripId, expenseId }: { supabase: BudgetSupabase; userId: string; tripId: string; expenseId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data, error } = await supabase.from("trip_expenses").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", expenseId).eq("trip_id", tripId).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw operationFailure("Could not delete expense.");
  if (!data) throw new BudgetMutationError("Expense not found.", "not_found", 404);
  return { deleted: true, expenseId };
}

export async function createSettlementForUser({ supabase, userId, tripId, input }: { supabase: BudgetSupabase; userId: string; tripId: string; input: SettlementMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const paidBy = clean(input.paidByParticipantValue, 500);
  const receivedBy = clean(input.receivedByParticipantValue, 500);
  const amount = money(input.amount);
  const settledOn = clean(input.settledOn, 10) || getLocalDateKey();
  if (amount <= 0) throw new BudgetMutationError("Enter an amount greater than zero.", "validation_error", 422, { amount: ["Enter an amount greater than zero."] });
  if (!validDate(settledOn)) throw new BudgetMutationError("Choose a valid settlement date.", "validation_error", 422, { settledOn: ["Choose a valid date."] });
  if (!paidBy || !receivedBy || paidBy === receivedBy) throw new BudgetMutationError("Choose two different people for the settlement.", "validation_error", 422);
  const { values } = await allowedParticipants(supabase, tripId, userId);
  if (!values.has(paidBy) || !values.has(receivedBy)) throw new BudgetMutationError("Choose current trip participants for the settlement.", "validation_error", 422);
  const { data, error } = await supabase.from("trip_expense_settlements").insert({
    trip_id: tripId,
    paid_by_participant_value: paidBy,
    received_by_participant_value: receivedBy,
    amount,
    reporting_currency: normalizeCurrency(input.reportingCurrency),
    settled_on: settledOn,
    created_by: userId,
  }).select("*").single();
  if (error || !data) throw operationFailure("Could not save settlement.");
  return { settlement: normalizeExpenseSettlement(data as Record<string, unknown>) };
}

export async function updateBudgetLineForUser({ supabase, userId, tripId, lineItemId, plannedAmount }: { supabase: BudgetSupabase; userId: string; tripId: string; lineItemId: string; plannedAmount: number | string }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data, error } = await supabase.from("trip_budget_line_items").update({ planned_amount: money(plannedAmount), updated_at: new Date().toISOString() }).eq("id", lineItemId).eq("trip_id", tripId).select("*").maybeSingle();
  if (error) throw operationFailure("Could not update budget category.");
  if (!data) throw new BudgetMutationError("Budget category not found.", "not_found", 404);
  return { lineItem: normalizeBudgetLineItem(data as Record<string, unknown>) };
}

export async function createExpenseCategoryForUser({
  supabase,
  userId,
  tripId,
  name,
  linkedExpenseCategory,
  reportingCurrency,
  createBudgetLine,
  plannedAmount,
}: {
  supabase: BudgetSupabase;
  userId: string;
  tripId: string;
  name: string;
  linkedExpenseCategory?: ExpenseCategory | null;
  reportingCurrency?: string | null;
  createBudgetLine?: boolean;
  plannedAmount?: number | string | null;
}) {
  await requireTripAccess(supabase, tripId, userId);
  const db = asUntypedSupabase(supabase);
  const categoryName = clean(name, 80);
  const amount = money(plannedAmount);
  if (!categoryName) throw new BudgetMutationError("Enter a category name.", "validation_error", 422, { name: ["Enter a category name."] });
  if (createBudgetLine && amount <= 0) throw new BudgetMutationError("Enter a budget amount greater than zero.", "validation_error", 422, { plannedAmount: ["Enter an amount greater than zero."] });
  const { data: existing } = await db.from("trip_budget_categories").select("*").eq("trip_id", tripId).eq("name", categoryName).maybeSingle();
  let category = existing;
  if (category) {
    const result = await db.from("trip_budget_categories").update({ is_archived: false, updated_at: new Date().toISOString() }).eq("id", category.id).eq("trip_id", tripId).select("*").single();
    if (result.error || !result.data) throw operationFailure("Could not restore budget category.");
    category = result.data;
  } else {
    const { data: last } = await db.from("trip_budget_categories").select("sort_order").eq("trip_id", tripId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const result = await db.from("trip_budget_categories").insert({ trip_id: tripId, name: categoryName, linked_expense_category: normalizeExpenseCategory(linkedExpenseCategory), sort_order: Number(last?.sort_order || 0) + 1, is_default: false, is_archived: false, created_by: userId }).select("*").single();
    if (result.error || !result.data) throw operationFailure("Could not create budget category.");
    category = result.data;
  }
  let lineItem = null;
  if (createBudgetLine) {
    const { data: budget } = await db.from("trip_budgets").select("id").eq("trip_id", tripId).eq("is_active", true).maybeSingle();
    if (!budget) throw new BudgetMutationError("Create a trip budget before adding a category budget.", "conflict", 409);
    const { data: existingLine } = await db.from("trip_budget_line_items").select("id,sort_order").eq("budget_id", budget.id).eq("category_id", category.id).eq("trip_id", tripId).maybeSingle();
    const { data: last } = await db.from("trip_budget_line_items").select("sort_order").eq("budget_id", budget.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const values = { name: categoryName, linked_expense_category: normalizeExpenseCategory(linkedExpenseCategory), planned_amount: amount, currency: normalizeCurrency(reportingCurrency), updated_at: new Date().toISOString() };
    const result = existingLine
      ? await db.from("trip_budget_line_items").update(values).eq("id", existingLine.id).eq("trip_id", tripId).select("*").single()
      : await db.from("trip_budget_line_items").insert({ budget_id: budget.id, trip_id: tripId, category_id: category.id, ...values, sort_order: Number(last?.sort_order || 0) + 1 }).select("*").single();
    if (result.error || !result.data) throw operationFailure("Could not create category budget.");
    lineItem = normalizeBudgetLineItem(result.data as Record<string, unknown>);
  }
  return { category: category as Record<string, unknown>, lineItem };
}

export function parseBudgetMutationInput(value: unknown): BudgetMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as BudgetMutationInput;
}

export function parseExpenseMutationInput(value: unknown): ExpenseMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { description: "", amount: 0 };
  return value as ExpenseMutationInput;
}

export function parseSettlementMutationInput(value: unknown): SettlementMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { paidByParticipantValue: "", receivedByParticipantValue: "", amount: 0 };
  return value as SettlementMutationInput;
}

function formText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export function budgetInputFromFormData(formData: FormData): BudgetMutationInput {
  const existingLines = formData.getAll("line_item_id").map((value) => String(value).trim()).filter(Boolean).map((id) => ({
    id,
    categoryId: formText(formData, `line_${id}_category_id`),
    name: formText(formData, `line_${id}_name`),
    plannedAmount: formText(formData, `line_${id}_planned_amount`),
    remove: formText(formData, `line_${id}_delete`) === "on",
    remapCategoryId: formText(formData, `line_${id}_remap_category_id`),
  }));
  const newNames = formData.getAll("new_category_name").map(String);
  const newAmounts = formData.getAll("new_category_amount").map(String);
  const newLines = newNames.map((name, index) => ({ name, plannedAmount: newAmounts[index] || 0, linkedExpenseCategory: "other" as const })).filter((line) => line.name.trim());
  const defaultLines = DEFAULT_BUDGET_CATEGORIES.map((category, index) => ({
    name: category.name,
    plannedAmount: formText(formData, `category_${index}_amount`),
    linkedExpenseCategory: category.linkedExpenseCategory,
  }));
  return {
    name: formText(formData, "name"),
    reportingCurrency: formText(formData, "reporting_currency"),
    totalBudgetAmount: formText(formData, "total_budget_amount"),
    lines: existingLines.length || newLines.length ? [...existingLines, ...newLines] : defaultLines,
  };
}

export function expenseInputFromFormData(formData: FormData): ExpenseMutationInput {
  const splitValues = formData.getAll("included_participants").map(String).filter(Boolean);
  return {
    description: formText(formData, "description"),
    expenseDate: formText(formData, "expense_date"),
    category: normalizeExpenseCategory(formData.get("category")),
    budgetCategoryId: formText(formData, "budget_category_id"),
    amount: formText(formData, "amount"),
    currency: formText(formData, "currency"),
    reportingCurrency: formText(formData, "reporting_currency"),
    manualExchangeRate: formText(formData, "manual_exchange_rate"),
    splitMethod: formText(formData, "split_method") as SplitMethod,
    paidBy: formText(formData, "paid_by"),
    splits: splitValues.map((value) => {
      const participant = parseParticipant(value);
      return {
        participantValue: value,
        amount: participant ? formText(formData, `split_amount_${participant.kind}_${participant.id}`) : 0,
        percentage: participant ? formText(formData, `split_percentage_${participant.kind}_${participant.id}`) : 0,
      };
    }),
    notes: formText(formData, "notes"),
    sourceType: (formText(formData, "source_type") || "manual") as ExpenseMutationInput["sourceType"],
    transportationItemId: formText(formData, "transportation_item_id"),
    itineraryEventId: formText(formData, "itinerary_event_id"),
    accommodationId: formText(formData, "accommodation_id"),
  };
}

export function settlementInputFromFormData(formData: FormData): SettlementMutationInput {
  return {
    paidByParticipantValue: formText(formData, "paid_by_participant_value"),
    receivedByParticipantValue: formText(formData, "received_by_participant_value"),
    amount: formText(formData, "amount"),
    reportingCurrency: formText(formData, "reporting_currency"),
    settledOn: formText(formData, "settled_on"),
  };
}
