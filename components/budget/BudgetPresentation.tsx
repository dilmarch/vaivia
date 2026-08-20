"use client";

import { Fragment, type ReactNode } from "react";
import {
  Banknote,
  ChartPie,
  Copy,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_EXPENSE_CATEGORY_LABELS,
  calculateBudgetTotals,
  calculateCategoryActuals,
  formatCurrency,
  formatPercent,
  getExpenseReportingAmount,
  type BudgetParticipant,
  type ExpenseCategory,
  type TripBudget,
  type TripBudgetLineItem,
  type TripExpense,
  type TripExpenseSettlement,
  type TripExpenseSplit,
} from "@/lib/budget";
import { getCurrencyMetadata } from "@/lib/currency";
import { getInitials } from "@/lib/travelers";

export type BudgetPresentationMode = "budget" | "expenses";

export type BudgetSettlement = {
  fromValue: string;
  from: string;
  toValue: string;
  to: string;
  amount: number;
};

export type BudgetPresentationData = {
  tripId: string;
  tripTitle: string;
  budget: TripBudget | null;
  lineItems: TripBudgetLineItem[];
  expenses: TripExpense[];
  splits?: TripExpenseSplit[];
  settlementPayments?: TripExpenseSettlement[];
  participants: BudgetParticipant[];
  defaultCurrency: string;
};

type TabActionProps = {
  children: ReactNode;
  className: string;
  "aria-current"?: "page";
};

export type BudgetPresentationActions = {
  onCreateBudget?: () => void;
  onEditBudget?: () => void;
  onAddExpense?: () => void;
  onSettleUp?: (suggestedSettlement?: BudgetSettlement) => void;
  onEditExpense?: (expense: TripExpense) => void;
  onDuplicateExpense?: (expense: TripExpense) => void;
  onDeleteExpense?: (expense: TripExpense) => void;
  onModeChange?: (mode: BudgetPresentationMode) => void;
  renderTabAction?: (
    mode: BudgetPresentationMode,
    props: TabActionProps,
  ) => ReactNode;
};

const CURRENCY_FLAG_MAP: Record<string, string> = {
  AUD: "🇦🇺",
  BRL: "🇧🇷",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  KRW: "🇰🇷",
  MXN: "🇲🇽",
  NZD: "🇳🇿",
  THB: "🇹🇭",
  TWD: "🇹🇼",
  USD: "🇺🇸",
  VND: "🇻🇳",
};

const EXPENSE_CHART_COLORS = [
  "#bef264",
  "#22d3ee",
  "#c084fc",
  "#fb7185",
  "#fbbf24",
  "#60a5fa",
  "#a3e635",
];

export function CurrencyHeroSummaryPresentation({
  currency,
}: {
  currency: string;
}) {
  const metadata = getCurrencyMetadata(currency);
  const code = metadata?.code || currency;

  return (
    <div className="flex h-30 w-28 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-xl shadow-black/20 sm:h-32 sm:w-32">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/70 text-2xl ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] sm:h-12 sm:w-12 sm:text-3xl">
        <span aria-hidden="true">{CURRENCY_FLAG_MAP[code] || "💱"}</span>
      </div>
      <div className="min-w-0 text-center leading-tight">
        <div className="line-clamp-1 text-sm font-black text-white">{code}</div>
        <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-400">
          {metadata?.name || "Currency"}
        </div>
      </div>
    </div>
  );
}

function participantValue(participant: BudgetParticipant) {
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

function getBudgetParticipantLabel(participant?: BudgetParticipant | null) {
  if (!participant) return null;
  return participant.isCurrentUser ? "Me" : participant.label;
}

function getPayerParticipant(
  expense: TripExpense,
  participants: BudgetParticipant[],
) {
  return participants.find((participant) => {
    if (
      participant.kind === "member" &&
      participant.tripMemberId === expense.paid_by_trip_member_id
    ) {
      return true;
    }
    if (
      participant.kind === "member" &&
      participant.userId === expense.paid_by_user_id
    ) {
      return true;
    }
    if (
      participant.kind === "invitation" &&
      participant.invitationId === expense.paid_by_invitation_id
    ) {
      return true;
    }
    return (
      participant.kind === "family_member" &&
      participant.familyMemberId === expense.paid_by_family_member_id
    );
  });
}

function getPayerLabel(expense: TripExpense, participants: BudgetParticipant[]) {
  return (
    getBudgetParticipantLabel(getPayerParticipant(expense, participants)) ||
    expense.paid_by_guest_name ||
    "Someone"
  );
}

function ParticipantAvatar({
  participant,
  label,
}: {
  participant?: BudgetParticipant | null;
  label: string;
}) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_18px_rgba(0,0,0,0.22)]">
      {participant?.avatarUrl ? (
        // Shared browser presentation supports Next.js and Capacitor.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={participant.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(label)
      )}
    </span>
  );
}

function getParticipantValueForSplit(split: TripExpenseSplit) {
  if (split.participant_kind === "member" && split.trip_member_id) {
    return `member:${split.trip_member_id}`;
  }
  if (split.participant_kind === "member" && split.user_id) {
    return `member_user:${split.user_id}`;
  }
  if (split.participant_kind === "invitation" && split.invitation_id) {
    return `invitation:${split.invitation_id}`;
  }
  if (split.participant_kind === "family_member" && split.family_member_id) {
    return `family_member:${split.family_member_id}`;
  }
  return `guest:${split.guest_name || ""}`;
}

function getExpensePayerValue(expense: TripExpense) {
  if (expense.paid_by_trip_member_id) {
    return `member:${expense.paid_by_trip_member_id}`;
  }
  if (expense.paid_by_user_id) return `member_user:${expense.paid_by_user_id}`;
  if (expense.paid_by_invitation_id) {
    return `invitation:${expense.paid_by_invitation_id}`;
  }
  if (expense.paid_by_family_member_id) {
    return `family_member:${expense.paid_by_family_member_id}`;
  }
  return expense.paid_by_guest_name
    ? `guest:${expense.paid_by_guest_name}`
    : "";
}

function getSplitReportingAmount(
  split: TripExpenseSplit,
  expenseById: Map<string, TripExpense>,
) {
  const reportingAmount = Number(split.amount_in_reporting_currency);
  const splitAmount = Number(split.split_amount || 0);
  if (
    Number.isFinite(reportingAmount) &&
    (reportingAmount !== 0 || splitAmount === 0)
  ) {
    return reportingAmount;
  }
  const rate = Number(
    expenseById.get(split.expense_id)?.exchange_rate_used || 1,
  );
  return Number.isFinite(splitAmount * rate) ? splitAmount * rate : 0;
}

function getParticipantLabelFromValue(
  value: string,
  participants: BudgetParticipant[],
) {
  const participant = participants.find(
    (option) => participantValue(option) === value,
  );
  const participantLabel = getBudgetParticipantLabel(participant);
  if (participantLabel) return participantLabel;
  if (value.startsWith("guest:")) return value.replace(/^guest:/, "") || "Guest";
  return "Someone";
}

export function calculateBudgetSettlements({
  expenses,
  splits,
  participants,
  settlementPayments,
}: {
  expenses: TripExpense[];
  splits: TripExpenseSplit[];
  participants: BudgetParticipant[];
  settlementPayments: TripExpenseSettlement[];
}) {
  const balances = new Map<
    string,
    { value: string; label: string; amount: number }
  >();
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const ensureBalance = (value: string) => {
    if (!balances.has(value)) {
      balances.set(value, {
        value,
        label: getParticipantLabelFromValue(value, participants),
        amount: 0,
      });
    }
    return balances.get(value)!;
  };

  participants.forEach((participant) => ensureBalance(participantValue(participant)));
  expenses.forEach((expense) => {
    const payerValue = getExpensePayerValue(expense);
    if (payerValue) {
      ensureBalance(payerValue).amount += getExpenseReportingAmount(expense);
    }
  });
  splits.forEach((split) => {
    const value = getParticipantValueForSplit(split);
    if (value) {
      ensureBalance(value).amount -= getSplitReportingAmount(split, expenseById);
    }
  });
  settlementPayments.forEach((settlement) => {
    ensureBalance(settlement.paid_by_participant_value).amount += Number(
      settlement.amount || 0,
    );
    ensureBalance(settlement.received_by_participant_value).amount -= Number(
      settlement.amount || 0,
    );
  });

  const debtors = [...balances.values()]
    .filter((balance) => balance.amount < -0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map((balance) => ({ ...balance, amount: Math.abs(balance.amount) }));
  const creditors = [...balances.values()]
    .filter((balance) => balance.amount > 0.01)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map((balance) => ({ ...balance }));
  const settlements: BudgetSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount >= 0.01) {
      settlements.push({
        fromValue: debtor.value,
        from: debtor.label,
        toValue: creditor.value,
        to: creditor.label,
        amount,
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < 0.01) debtorIndex += 1;
    if (creditor.amount < 0.01) creditorIndex += 1;
  }
  return settlements;
}

function BudgetTabsPresentation({
  mode,
  onModeChange,
  renderTabAction,
}: Pick<BudgetPresentationActions, "onModeChange" | "renderTabAction"> & {
  mode: BudgetPresentationMode;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-xl shadow-black/20">
      {(["budget", "expenses"] as const).map((tabMode) => {
        const props: TabActionProps = {
          children: tabMode === "budget" ? "Budget" : "Expenses",
          className: `rounded-full px-5 py-2 text-sm font-black transition ${
            mode === tabMode
              ? "bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.22)]"
              : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
          }`,
          ...(mode === tabMode ? { "aria-current": "page" as const } : {}),
        };
        return renderTabAction ? (
          renderTabAction(tabMode, props)
        ) : (
          <button
            key={tabMode}
            type="button"
            onClick={() => onModeChange?.(tabMode)}
            {...props}
          />
        );
      })}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
        {label}
      </p>
      <p
        className={`mt-3 text-3xl font-black tracking-tight ${
          tone === "good"
            ? "text-lime-200"
            : tone === "warning"
              ? "text-amber-200"
              : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RunningTotalPresentation({
  settlements,
  participants,
  reportingCurrency,
  onSettleUp,
}: {
  settlements: BudgetSettlement[];
  participants: BudgetParticipant[];
  reportingCurrency: string;
  onSettleUp?: (suggestedSettlement?: BudgetSettlement) => void;
}) {
  const settlementDisabled = participants.length < 2 || !onSettleUp;
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 text-white shadow-2xl shadow-black/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
            Running total
          </p>
          <h2 className="mt-2 text-2xl font-black">Who owes whom</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold text-slate-400">
            Net of expenses, assigned splits, and recorded payments
          </p>
          <button
            type="button"
            onClick={() => onSettleUp?.(settlements[0])}
            disabled={settlementDisabled}
            title={!onSettleUp ? "Settlement recording unavailable" : undefined}
            className="rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Settle up
          </button>
        </div>
      </div>
      {settlements.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {settlements.map((settlement) => (
            <div
              key={`${settlement.from}-${settlement.to}-${settlement.amount}`}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
            >
              <p className="text-sm font-black text-white">
                {settlement.from} owes {settlement.to}
              </p>
              <p className="mt-2 text-xl font-black text-amber-200">
                {formatCurrency(settlement.amount, reportingCurrency)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-300">
          Everyone is settled up.
        </p>
      )}
    </div>
  );
}

function ExpenseCategoryPieChartPresentation({
  expenses,
  reportingCurrency,
}: {
  expenses: TripExpense[];
  reportingCurrency: string;
}) {
  const amounts = expenses.reduce<Map<ExpenseCategory, number>>(
    (totals, expense) => {
      totals.set(
        expense.category,
        (totals.get(expense.category) || 0) +
          getExpenseReportingAmount(expense),
      );
      return totals;
    },
    new Map(),
  );
  const entries = Array.from(amounts.entries())
    .filter(([, amount]) => amount > 0)
    .sort(([, firstAmount], [, secondAmount]) => secondAmount - firstAmount);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (total <= 0) return null;

  let cursor = 0;
  const segments = entries.map(([, amount], index) => {
    const start = cursor;
    cursor += (amount / total) * 100;
    return `${EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length]} ${start}% ${cursor}%`;
  });

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
          Category distribution
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Where the trip money went
        </h2>
      </div>
      <div className="mt-6 grid items-center gap-6 md:grid-cols-[minmax(12rem,18rem)_1fr]">
        <div
          role="img"
          aria-label={`Expense distribution across ${entries.length} categories`}
          className="mx-auto aspect-square w-full max-w-64 rounded-full border-4 border-[#140a1f] bg-clip-padding shadow-[0_0_40px_rgba(var(--vaivia-neon-rgb),0.12)]"
          style={{ backgroundImage: `conic-gradient(${segments.join(", ")})` }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map(([category, amount], index) => (
            <div
              key={category}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length],
                  }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-black text-white">
                  {DEFAULT_EXPENSE_CATEGORY_LABELS[category]}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-white">
                  {formatCurrency(amount, reportingCurrency)}
                </p>
                <p className="text-[11px] font-bold text-slate-400">
                  {formatPercent((amount / total) * 100)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BudgetDashboardPresentation({
  data,
  actions,
}: {
  data: BudgetPresentationData;
  actions: BudgetPresentationActions;
}) {
  const {
    tripTitle,
    budget,
    lineItems,
    expenses,
    splits = [],
    settlementPayments = [],
    participants,
    defaultCurrency,
  } = data;
  const totals = calculateBudgetTotals({ budget, lineItems, expenses });
  const categoryActuals = calculateCategoryActuals(expenses);
  const reportingCurrency = budget?.reporting_currency || defaultCurrency || "CAD";
  const progressWidth = `${Math.min(Math.max(totals.percentUsed, 0), 100)}%`;
  const settlements = calculateBudgetSettlements({
    expenses,
    splits,
    participants,
    settlementPayments,
  });

  return (
    <section className="space-y-6" data-budget-presentation="budget">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-lime-300">
            {tripTitle}
          </p>
          <h1 className="mt-2 text-5xl font-black tracking-tight text-white">
            Budget
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            Reporting in {reportingCurrency}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BudgetTabsPresentation mode="budget" {...actions} />
          {budget ? (
            <button
              type="button"
              onClick={actions.onEditBudget}
              disabled={!actions.onEditBudget}
              title={!actions.onEditBudget ? "Budget editing unavailable" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white transition hover:border-lime-300/30 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit budget
            </button>
          ) : null}
          <button
            type="button"
            onClick={actions.onAddExpense}
            disabled={!actions.onAddExpense}
            title={!actions.onAddExpense ? "Expense creation unavailable" : undefined}
            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add expense
          </button>
        </div>
      </div>

      {!budget ? (
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-white shadow-2xl shadow-black/30">
            <ChartPie className="h-10 w-10 text-lime-300" />
            <h2 className="mt-4 text-2xl font-black">No budget yet.</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">
              You can still track expenses now. Create a budget when you&apos;re
              ready to compare spending against a plan.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={actions.onCreateBudget}
                disabled={!actions.onCreateBudget}
                className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create budget
              </button>
              <button
                type="button"
                onClick={actions.onAddExpense}
                disabled={!actions.onAddExpense}
                className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add expense
              </button>
            </div>
          </div>
          {expenses.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                  label="Total expenses"
                  value={formatCurrency(totals.spent, reportingCurrency)}
                />
                <SummaryCard label="Expenses" value={String(expenses.length)} />
                <SummaryCard label="Reporting currency" value={reportingCurrency} />
              </div>
              <RunningTotalPresentation
                settlements={settlements}
                participants={participants}
                reportingCurrency={reportingCurrency}
                onSettleUp={actions.onSettleUp}
              />
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                      Expense tally
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      Spending so far
                    </h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm font-black text-white">
                    No planned budget
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(categoryActuals)
                    .sort(([, first], [, second]) => second - first)
                    .map(([category, amount]) => (
                      <div
                        key={category}
                        className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                          {DEFAULT_EXPENSE_CATEGORY_LABELS[
                            category as ExpenseCategory
                          ] || "Other"}
                        </p>
                        <p className="mt-2 text-xl font-black text-white">
                          {formatCurrency(amount, reportingCurrency)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard
              label="Total budget"
              value={formatCurrency(totals.budgeted, reportingCurrency)}
            />
            <SummaryCard
              label="Total spent"
              value={formatCurrency(totals.spent, reportingCurrency)}
            />
            <SummaryCard
              label="Remaining"
              value={formatCurrency(totals.remaining, reportingCurrency)}
              tone={totals.remaining >= 0 ? "good" : "warning"}
            />
            <SummaryCard
              label="Percent used"
              value={formatPercent(totals.percentUsed)}
              tone={totals.percentUsed > 90 ? "warning" : "neutral"}
            />
          </div>
          <RunningTotalPresentation
            settlements={settlements}
            participants={participants}
            reportingCurrency={reportingCurrency}
            onSettleUp={actions.onSettleUp}
          />
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                  Budget tracker
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {formatCurrency(totals.spent, reportingCurrency)} spent
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm font-black text-white">
                {formatPercent(totals.percentUsed)}
              </span>
            </div>
            <div className="mt-6 h-5 overflow-hidden rounded-full bg-slate-950/80 shadow-inner shadow-black/40">
              <div
                className="h-full rounded-full bg-lime-300 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.32)] transition-all"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/30">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-xl font-black text-white">Category budgets</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left">
                <thead className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Budgeted</th>
                    <th className="px-5 py-3">Actual</th>
                    <th className="px-5 py-3">Remaining</th>
                    <th className="px-5 py-3">Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-sm">
                  {lineItems.map((item) => {
                    const actual =
                      categoryActuals[
                        item.category_id || item.linked_expense_category
                      ] || 0;
                    const remaining = Number(item.planned_amount || 0) - actual;
                    const percent =
                      item.planned_amount > 0
                        ? (actual / Number(item.planned_amount)) * 100
                        : actual > 0
                          ? 100
                          : 0;
                    const isOverBudget = actual > Number(item.planned_amount || 0);
                    const categoryProgressWidth = `${Math.min(
                      Math.max(percent, 0),
                      100,
                    )}%`;
                    return (
                      <Fragment key={item.id}>
                        <tr className="text-white">
                          <td className="px-5 pb-2 pt-4 font-bold">{item.name}</td>
                          <td className="px-5 pb-2 pt-4">
                            {formatCurrency(item.planned_amount, reportingCurrency)}
                          </td>
                          <td
                            className={`px-5 pb-2 pt-4 font-bold ${isOverBudget ? "text-red-300" : ""}`}
                          >
                            {formatCurrency(actual, reportingCurrency)}
                          </td>
                          <td
                            className={`px-5 pb-2 pt-4 ${isOverBudget ? "text-red-300" : ""}`}
                          >
                            {formatCurrency(remaining, reportingCurrency)}
                          </td>
                          <td
                            className={`px-5 pb-2 pt-4 font-bold ${isOverBudget ? "text-red-300" : ""}`}
                          >
                            {formatPercent(percent)}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="px-5 pb-4 pt-1">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-950/80 shadow-inner shadow-black/40">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isOverBudget
                                    ? "bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.28)]"
                                    : "bg-lime-300 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.24)]"
                                }`}
                                style={{ width: categoryProgressWidth }}
                              />
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ExpenseActionButton({
  label,
  title,
  onClick,
  tone = "neutral",
  children,
}: {
  label: string;
  title: string;
  onClick?: () => void;
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "border-red-300/20 bg-red-300/10 text-red-100 hover:bg-red-300/20"
          : "border-white/10 bg-white/[0.08] text-slate-100 hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white"
      }`}
      aria-label={label}
      title={onClick ? title : `${title} unavailable`}
    >
      {children}
    </button>
  );
}

function ExpensesDashboardPresentation({
  data,
  actions,
}: {
  data: BudgetPresentationData;
  actions: BudgetPresentationActions;
}) {
  const {
    tripTitle,
    budget,
    lineItems,
    expenses,
    splits = [],
    settlementPayments = [],
    participants,
    defaultCurrency,
  } = data;
  const reportingCurrency = budget?.reporting_currency || defaultCurrency || "CAD";
  const totalSpent = expenses.reduce(
    (sum, expense) => sum + getExpenseReportingAmount(expense),
    0,
  );
  const settlements = calculateBudgetSettlements({
    expenses,
    splits,
    participants,
    settlementPayments,
  });

  return (
    <section className="space-y-6" data-budget-presentation="expenses">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-lime-300">
            {tripTitle}
          </p>
          <h1 className="mt-2 text-5xl font-black tracking-tight text-white">
            Expenses
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            Stable reporting totals use stored exchange rates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BudgetTabsPresentation mode="expenses" {...actions} />
          <button
            type="button"
            onClick={actions.onAddExpense}
            disabled={!actions.onAddExpense}
            title={!actions.onAddExpense ? "Expense creation unavailable" : undefined}
            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add expense
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          label="Total spent"
          value={formatCurrency(totalSpent, reportingCurrency)}
        />
        <SummaryCard label="Expenses" value={String(expenses.length)} />
      </div>
      <RunningTotalPresentation
        settlements={settlements}
        participants={participants}
        reportingCurrency={reportingCurrency}
        onSettleUp={actions.onSettleUp}
      />
      <ExpenseCategoryPieChartPresentation
        expenses={expenses}
        reportingCurrency={reportingCurrency}
      />
      {expenses.length === 0 ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-white shadow-2xl shadow-black/30">
          <Receipt className="h-10 w-10 text-lime-300" />
          <h2 className="mt-4 text-2xl font-black">No expenses yet.</h2>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            Add costs as you book or pay for things. The original amount and
            currency stay preserved.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/30">
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-left">
              <thead className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Original</th>
                  <th className="px-5 py-3">Rate</th>
                  <th className="px-5 py-3">Reporting</th>
                  <th className="px-5 py-3">Paid by</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {expenses.map((expense) => {
                  const payer = getPayerParticipant(expense, participants);
                  const payerLabel = getPayerLabel(expense, participants);
                  return (
                    <tr key={expense.id} className="text-white">
                      <td className="px-5 py-4 font-semibold text-lime-100">
                        {expense.expense_date}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold">{expense.description}</span>
                        <span className="mt-1 block text-xs uppercase tracking-wide text-slate-500">
                          {expense.source_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {lineItems.find(
                          (item) => item.category_id === expense.budget_category_id,
                        )?.name || DEFAULT_EXPENSE_CATEGORY_LABELS[expense.category]}
                      </td>
                      <td className="px-5 py-4">
                        {formatCurrency(expense.amount, expense.currency)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono">
                          {expense.exchange_rate_used}
                        </span>
                        {expense.exchange_rate_is_manual ? (
                          <span className="ml-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase text-amber-100">
                            Manual
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-black">
                        {formatCurrency(
                          getExpenseReportingAmount(expense),
                          expense.reporting_currency,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 py-1.5 pl-1.5 pr-3 text-sm font-black text-white">
                          <ParticipantAvatar participant={payer} label={payerLabel} />
                          <span className="max-w-36 truncate">{payerLabel}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <ExpenseActionButton
                            label={`Edit expense ${expense.description}`}
                            title="Edit expense"
                            onClick={
                              actions.onEditExpense
                                ? () => actions.onEditExpense?.(expense)
                                : undefined
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </ExpenseActionButton>
                          <ExpenseActionButton
                            label={`Duplicate expense ${expense.description}`}
                            title="Duplicate expense"
                            onClick={
                              actions.onDuplicateExpense
                                ? () => actions.onDuplicateExpense?.(expense)
                                : undefined
                            }
                          >
                            <Copy className="h-4 w-4" />
                          </ExpenseActionButton>
                          <ExpenseActionButton
                            label={`Delete expense ${expense.description}`}
                            title="Delete expense"
                            tone="danger"
                            onClick={
                              actions.onDeleteExpense
                                ? () => actions.onDeleteExpense?.(expense)
                                : undefined
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </ExpenseActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function BudgetFeaturePresentation({
  mode,
  data,
  actions = {},
}: {
  mode: BudgetPresentationMode;
  data: BudgetPresentationData;
  actions?: BudgetPresentationActions;
}) {
  return (
    <section className="px-4 pb-24 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3 text-sm font-bold text-slate-400">
          <Banknote className="h-5 w-5 text-lime-300" />
          <span>Trip money</span>
          <span className="h-px flex-1 bg-white/10" />
          <FileText className="h-5 w-5 text-slate-500" />
        </div>
        {mode === "budget" ? (
          <BudgetDashboardPresentation data={data} actions={actions} />
        ) : (
          <ExpensesDashboardPresentation data={data} actions={actions} />
        )}
      </div>
    </section>
  );
}

export function BudgetLoadingPresentation() {
  return (
    <section
      className="px-4 pb-24 text-white md:px-8"
      role="status"
      aria-label="Loading trip budget"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-6 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.06] motion-reduce:animate-none" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.06] motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
