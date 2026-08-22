"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import {
  COMMON_CURRENCIES,
  DEFAULT_BUDGET_CATEGORIES,
  getLocalDateKey,
  type BudgetParticipant,
  type ExpenseCategory,
  type SplitMethod,
  type TripBudget,
  type TripBudgetLineItem,
  type TripExpense,
  type TripExpenseSplit,
} from "@/lib/budget";
import type {
  MobileBudgetMutationInput,
  MobileExpenseMutationInput,
  MobileSettlementMutationInput,
} from "@/lib/mobileApi/contracts";

export type BudgetMutationView = "create-budget" | "edit-budget" | "add-expense" | "edit-expense" | "settle";

const inputClass = "w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] placeholder:text-slate-500 focus:border-lime-300/40 focus:bg-white/[0.12]";

function participantValue(participant: BudgetParticipant) {
  if (participant.kind === "member" && participant.tripMemberId) return `member:${participant.tripMemberId}`;
  if (participant.kind === "member" && participant.userId) return `member_user:${participant.userId}`;
  if (participant.kind === "invitation" && participant.invitationId) return `invitation:${participant.invitationId}`;
  if (participant.kind === "family_member" && participant.familyMemberId) return `family_member:${participant.familyMemberId}`;
  return `guest:${participant.guestName || participant.label}`;
}

function splitParticipantValue(split: TripExpenseSplit) {
  if (split.trip_member_id) return `member:${split.trip_member_id}`;
  if (split.user_id) return `member_user:${split.user_id}`;
  if (split.invitation_id) return `invitation:${split.invitation_id}`;
  if (split.family_member_id) return `family_member:${split.family_member_id}`;
  return `guest:${split.guest_name || ""}`;
}

function expensePayerValue(expense?: TripExpense | null) {
  if (expense?.paid_by_trip_member_id) return `member:${expense.paid_by_trip_member_id}`;
  if (expense?.paid_by_user_id) return `member_user:${expense.paid_by_user_id}`;
  if (expense?.paid_by_invitation_id) return `invitation:${expense.paid_by_invitation_id}`;
  if (expense?.paid_by_family_member_id) return `family_member:${expense.paid_by_family_member_id}`;
  return expense?.paid_by_guest_name ? `guest:${expense.paid_by_guest_name}` : "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">{label}</span><div className="mt-2">{children}</div></label>;
}

function Shell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatedModal onClose={onClose} panelClassName="max-w-4xl" labelledBy="budget-mutation-title">
      {({ requestClose }) => <>
        <div className="vaivia-modal-header flex items-start justify-between gap-4">
          <div><p className="vaivia-modal-eyebrow">{eyebrow}</p><h2 id="budget-mutation-title" className="vaivia-modal-title">{title}</h2></div>
          <button type="button" onClick={requestClose} className="vaivia-modal-close" aria-label={`Close ${title.toLowerCase()}`}><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        {children}
      </>}
    </AnimatedModal>
  );
}

export function BudgetEditorPresentation({
  mode,
  tripTitle,
  budget,
  lineItems,
  defaultCurrency,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: {
  mode: "create-budget" | "edit-budget";
  tripTitle: string;
  budget: TripBudget | null;
  lineItems: TripBudgetLineItem[];
  defaultCurrency: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: MobileBudgetMutationInput) => void | Promise<void>;
}) {
  type EditorLine = { id: string; category_id: string | null; name: string; linked_expense_category: ExpenseCategory; planned_amount: number | string; remove: boolean; remapCategoryId: string };
  const initialLines: EditorLine[] = mode === "edit-budget" ? lineItems.map((line) => ({ id: line.id, category_id: line.category_id || null, name: line.name, linked_expense_category: line.linked_expense_category, planned_amount: line.planned_amount, remove: false, remapCategoryId: "" })) : DEFAULT_BUDGET_CATEGORIES.map((line, index) => ({ id: `new-${index}`, category_id: null, name: line.name, linked_expense_category: line.linkedExpenseCategory, planned_amount: 0, remove: false, remapCategoryId: "" }));
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await onSubmit({
      budgetId: budget?.id,
      tripTitle,
      name: String(values.get("name") || ""),
      reportingCurrency: String(values.get("reportingCurrency") || defaultCurrency),
      totalBudgetAmount: String(values.get("totalBudgetAmount") || ""),
      lines: lines.map((line) => ({
        id: line.id.startsWith("new-") ? null : line.id,
        categoryId: line.category_id,
        name: line.name,
        plannedAmount: line.planned_amount,
        linkedExpenseCategory: line.linked_expense_category,
        remove: line.remove,
        remapCategoryId: line.remapCategoryId,
      })),
    });
  }
  return <Shell title={mode === "create-budget" ? "Create budget" : "Edit budget"} eyebrow="Trip money" onClose={onClose}>
    <form onSubmit={(event) => void submit(event)} className="vaivia-modal-body space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><div className="md:col-span-2"><Field label="Budget name"><input name="name" defaultValue={budget?.name || `${tripTitle} Budget`} className={inputClass} /></Field></div><Field label="Reporting currency"><select name="reportingCurrency" defaultValue={budget?.reporting_currency || defaultCurrency} className={inputClass}>{COMMON_CURRENCIES.map((currency) => <option key={currency} value={currency} className="bg-slate-950">{currency}</option>)}</select></Field></div>
      <Field label="Total budget"><input name="totalBudgetAmount" inputMode="decimal" defaultValue={budget?.total_budget_amount ?? ""} className={inputClass} /></Field>
      <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-white">Budget categories</p><button type="button" onClick={() => setLines((current) => [...current, { id: `new-${crypto.randomUUID()}`, category_id: null, name: "", linked_expense_category: "other" as ExpenseCategory, planned_amount: 0, remove: false, remapCategoryId: "" }])} className="rounded-full border border-lime-300/25 bg-lime-300/10 px-4 py-2 text-xs font-black text-lime-100"><Plus className="mr-1 inline h-3.5 w-3.5" />Add category</button></div>
        {lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 md:grid-cols-[1fr_8rem_auto]">
          <input aria-label="Category name" value={line.name} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className={inputClass} />
          <input aria-label={`${line.name || "Category"} planned amount`} inputMode="decimal" value={line.planned_amount} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, planned_amount: event.target.value } : item))} className={inputClass} />
          <button type="button" onClick={() => line.id.startsWith("new-") ? setLines((current) => current.filter((_, itemIndex) => itemIndex !== index)) : setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, remove: !item.remove } : item))} className="rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-black text-red-100">{line.remove ? "Keep" : "Remove"}</button>
          {line.remove && !line.id.startsWith("new-") ? <select aria-label="Move existing expenses to" value={line.remapCategoryId} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, remapCategoryId: event.target.value } : item))} className={`${inputClass} md:col-span-3`}><option value="" className="bg-slate-950">Move existing expenses if required</option>{lines.filter((other) => other.id !== line.id && !other.remove && !other.id.startsWith("new-")).map((other) => <option key={other.id} value={other.category_id || ""} className="bg-slate-950">{other.name}</option>)}</select> : null}
        </div>)}
      </div>
      {errorMessage ? <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/60 p-3 text-sm font-bold text-red-100">{errorMessage}</p> : null}
      <div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions"><button type="submit" disabled={isSubmitting} className="vaivia-modal-button-primary disabled:opacity-60">{isSubmitting ? "Saving…" : "Save budget"}</button></div>
    </form>
  </Shell>;
}

export function ExpenseEditorPresentation({ tripId, reportingCurrency, lineItems, participants, expense, expenseSplits, isSubmitting, errorMessage, onClose, onSubmit }: { tripId: string; reportingCurrency: string; lineItems: TripBudgetLineItem[]; participants: BudgetParticipant[]; expense?: TripExpense | null; expenseSplits?: TripExpenseSplit[]; isSubmitting?: boolean; errorMessage?: string; onClose: () => void; onSubmit: (input: MobileExpenseMutationInput) => void | Promise<void> }) {
  const currentParticipant = participants.find((participant) => participant.isCurrentUser) || participants[0];
  const currentValue = currentParticipant ? participantValue(currentParticipant) : "";
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(expense?.split_method || "just_me");
  const savedValues = useMemo(() => new Set((expenseSplits || []).map(splitParticipantValue)), [expenseSplits]);
  const [selected, setSelected] = useState(() => new Set(
    expense?.split_method === "just_me"
      ? currentValue ? [currentValue] : []
      : savedValues.size
        ? savedValues
        : participants.map(participantValue),
  ));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await onSubmit({
      description: String(values.get("description") || ""), expenseDate: String(values.get("expenseDate") || ""), budgetCategoryId: String(values.get("budgetCategoryId") || ""), category: String(values.get("category") || "other") as ExpenseCategory, amount: String(values.get("amount") || ""), currency: String(values.get("currency") || reportingCurrency), reportingCurrency, manualExchangeRate: String(values.get("manualExchangeRate") || ""), splitMethod, paidBy: String(values.get("paidBy") || currentValue), notes: String(values.get("notes") || ""),
      splits: Array.from(selected).map((value) => ({ participantValue: value, amount: String(values.get(`amount:${value}`) || ""), percentage: String(values.get(`percentage:${value}`) || "") })),
    });
  }
  return <Shell title={expense ? "Edit expense" : "Add expense"} eyebrow="Trip money" onClose={onClose}>
    <form onSubmit={(event) => void submit(event)} className="vaivia-modal-body space-y-5">
      <input type="hidden" value={tripId} readOnly />
      <Field label="Description"><input name="description" required defaultValue={expense?.description || ""} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Date"><input name="expenseDate" type="date" defaultValue={expense?.transaction_date || expense?.expense_date || getLocalDateKey()} className={inputClass} /></Field><Field label="Budget category"><select name="budgetCategoryId" defaultValue={expense?.budget_category_id || ""} className={inputClass}><option value="" className="bg-slate-950">Other</option>{lineItems.map((line) => <option key={line.id} value={line.category_id || ""} className="bg-slate-950">{line.name}</option>)}</select></Field></div>
      <input type="hidden" name="category" value={lineItems.find((line) => line.category_id === expense?.budget_category_id)?.linked_expense_category || expense?.category || "other"} />
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Amount"><input name="amount" required inputMode="decimal" defaultValue={expense?.original_amount ?? expense?.amount ?? ""} className={inputClass} /></Field><Field label="Currency"><select name="currency" defaultValue={expense?.original_currency || expense?.currency || reportingCurrency} className={inputClass}>{COMMON_CURRENCIES.map((currency) => <option key={currency} value={currency} className="bg-slate-950">{currency}</option>)}</select></Field><Field label="Manual rate"><input name="manualExchangeRate" inputMode="decimal" defaultValue={expense?.manual_exchange_rate || ""} placeholder="Automatic" className={inputClass} /></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Paid by"><select name="paidBy" defaultValue={expensePayerValue(expense) || currentValue} disabled={splitMethod === "just_me"} className={inputClass}>{participants.map((participant) => <option key={participant.id} value={participantValue(participant)} className="bg-slate-950">{participant.isCurrentUser ? "Me" : participant.label}</option>)}</select></Field><Field label="Split method"><select value={splitMethod} onChange={(event) => setSplitMethod(event.target.value as SplitMethod)} className={inputClass}><option value="just_me" className="bg-slate-950">Just me</option><option value="equal" className="bg-slate-950">Equal split</option><option value="exact" className="bg-slate-950">Exact amounts</option><option value="percentage" className="bg-slate-950">Percentages</option></select></Field></div>
      {splitMethod !== "just_me" ? <div className="space-y-2 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"><p className="text-sm font-black text-white">Split participants</p>{participants.map((participant) => { const value = participantValue(participant); const saved = (expenseSplits || []).find((split) => splitParticipantValue(split) === value); return <label key={participant.id} className="grid grid-cols-[auto_1fr_7rem] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3"><input type="checkbox" checked={selected.has(value)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; })} /><span className="text-sm font-bold text-white">{participant.isCurrentUser ? "Me" : participant.label}</span>{splitMethod === "exact" ? <input name={`amount:${value}`} aria-label={`${participant.label} amount`} defaultValue={saved?.split_amount ?? ""} inputMode="decimal" className={inputClass} /> : splitMethod === "percentage" ? <input name={`percentage:${value}`} aria-label={`${participant.label} percentage`} defaultValue={saved?.split_percentage ?? ""} inputMode="decimal" className={inputClass} /> : <span />}</label>; })}</div> : null}
      <Field label="Notes"><textarea name="notes" defaultValue={expense?.notes || ""} rows={3} className={inputClass} /></Field>
      {errorMessage ? <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/60 p-3 text-sm font-bold text-red-100">{errorMessage}</p> : null}
      <div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions"><button type="submit" disabled={isSubmitting} className="vaivia-modal-button-primary disabled:opacity-60">{isSubmitting ? "Saving…" : "Save expense"}</button></div>
    </form>
  </Shell>;
}

export function SettlementEditorPresentation({ tripId, reportingCurrency, participants, suggested, isSubmitting, errorMessage, onClose, onSubmit }: { tripId: string; reportingCurrency: string; participants: BudgetParticipant[]; suggested?: { fromValue: string; toValue: string; amount: number } | null; isSubmitting?: boolean; errorMessage?: string; onClose: () => void; onSubmit: (input: MobileSettlementMutationInput) => void | Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = new FormData(event.currentTarget); await onSubmit({ tripId, paidByParticipantValue: String(values.get("paidBy") || ""), receivedByParticipantValue: String(values.get("receivedBy") || ""), amount: String(values.get("amount") || ""), reportingCurrency, settledOn: String(values.get("settledOn") || "") }); }
  return <Shell title="Settle up" eyebrow="Trip balances" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="vaivia-modal-body space-y-5"><Field label="Paid by"><select name="paidBy" defaultValue={suggested?.fromValue || ""} className={inputClass}><option value="" className="bg-slate-950">Choose a person</option>{participants.map((participant) => <option key={participant.id} value={participantValue(participant)} className="bg-slate-950">{participant.isCurrentUser ? "Me" : participant.label}</option>)}</select></Field><Field label="Received by"><select name="receivedBy" defaultValue={suggested?.toValue || ""} className={inputClass}><option value="" className="bg-slate-950">Choose a person</option>{participants.map((participant) => <option key={participant.id} value={participantValue(participant)} className="bg-slate-950">{participant.isCurrentUser ? "Me" : participant.label}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={`Amount (${reportingCurrency})`}><input name="amount" inputMode="decimal" defaultValue={suggested?.amount || ""} className={inputClass} /></Field><Field label="Settlement date"><input name="settledOn" type="date" defaultValue={getLocalDateKey()} className={inputClass} /></Field></div>{errorMessage ? <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/60 p-3 text-sm font-bold text-red-100">{errorMessage}</p> : null}<div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions"><button type="submit" disabled={isSubmitting} className="vaivia-modal-button-primary disabled:opacity-60">{isSubmitting ? "Saving…" : "Record payment"}</button></div></form></Shell>;
}
