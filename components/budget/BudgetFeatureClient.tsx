"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Banknote,
    ChartPie,
    Copy,
    FileText,
    Pencil,
    Plus,
    Receipt,
    Trash2,
    X,
} from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import { BudgetParticipantDropdown } from "@/components/budget/BudgetParticipantDropdown";
import { ExpenseCategoryPicker } from "@/components/budget/ExpenseCategoryPicker";
import { DateInput } from "@/components/ui/date-input";
import {
    createBudget,
    createExpense,
    createExpenseSettlement,
    deleteExpense,
    updateExpense,
    updateBudget,
} from "@/app/actions/budget";
import {
    COMMON_CURRENCIES,
    DEFAULT_BUDGET_CATEGORIES,
    DEFAULT_EXPENSE_CATEGORY_LABELS,
    calculateBudgetTotals,
    calculateCategoryActuals,
    formatCurrency,
    formatPercent,
    getLocalDateKey,
    type BudgetParticipant,
    type ExpenseCategory,
    type SplitMethod,
    type TripBudget,
    type TripBudgetCategory,
    type TripBudgetLineItem,
    type TripExpense,
    type TripExpenseSettlement,
    type TripExpenseSplit,
} from "@/lib/budget";
import { getInitials } from "@/lib/travelers";

type BudgetFeatureProps = {
    tripId: string;
    tripRouteSegment?: string;
    tripTitle: string;
    budget: TripBudget | null;
    lineItems: TripBudgetLineItem[];
    expenseCategories?: TripBudgetCategory[];
    expenses: TripExpense[];
    splits?: TripExpenseSplit[];
    settlementPayments?: TripExpenseSettlement[];
    participants: BudgetParticipant[];
    defaultCurrency: string;
    mode: "budget" | "expenses";
};

type ExpenseModalMode = "add" | "edit" | "duplicate";

type Settlement = {
    fromValue: string;
    from: string;
    toValue: string;
    to: string;
    amount: number;
};

const splitMethodOptions: Array<{
    value: SplitMethod;
    label: string;
    description: string;
}> = [
    {
        value: "just_me",
        label: "Just me",
        description: "Paid by you and assigned only to you.",
    },
    {
        value: "equal",
        label: "Equal split",
        description: "Divide evenly between selected people.",
    },
    {
        value: "exact",
        label: "Exact amounts",
        description: "Enter a specific amount for each person.",
    },
    {
        value: "percentage",
        label: "Percentages",
        description: "Assign each person a percentage.",
    },
];

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
    participants: BudgetParticipant[]
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
        if (
            participant.kind === "family_member" &&
            participant.familyMemberId === expense.paid_by_family_member_id
        ) {
            return true;
        }
        return false;
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

function getExpensePayerValue(expense?: TripExpense | null) {
    if (!expense) return "";
    if (expense.paid_by_trip_member_id) return `member:${expense.paid_by_trip_member_id}`;
    if (expense.paid_by_user_id) return `member_user:${expense.paid_by_user_id}`;
    if (expense.paid_by_invitation_id) return `invitation:${expense.paid_by_invitation_id}`;
    if (expense.paid_by_family_member_id) {
        return `family_member:${expense.paid_by_family_member_id}`;
    }
    if (expense.paid_by_guest_name) return `guest:${expense.paid_by_guest_name}`;
    return "";
}

function getExpenseReportingAmount(expense: TripExpense) {
    const reportingAmount = Number(expense.amount_in_reporting_currency);
    if (Number.isFinite(reportingAmount) && reportingAmount > 0) {
        return reportingAmount;
    }

    const amount = Number(expense.amount || 0);
    const rate = Number(expense.exchange_rate_used || 1);
    return Number.isFinite(amount * rate) ? amount * rate : 0;
}

function getSplitReportingAmount(
    split: TripExpenseSplit,
    expenseById: Map<string, TripExpense>
) {
    const reportingAmount = Number(split.amount_in_reporting_currency);
    if (Number.isFinite(reportingAmount) && reportingAmount > 0) {
        return reportingAmount;
    }

    const expense = expenseById.get(split.expense_id);
    const splitAmount = Number(split.split_amount || 0);
    const rate = Number(expense?.exchange_rate_used || 1);

    return Number.isFinite(splitAmount * rate) ? splitAmount * rate : 0;
}

function getParticipantLabelFromValue(
    value: string,
    participants: BudgetParticipant[]
) {
    const participant = participants.find(
        (option) => participantValue(option) === value
    );
    const participantLabel = getBudgetParticipantLabel(participant);
    if (participantLabel) return participantLabel;

    if (value.startsWith("guest:")) return value.replace(/^guest:/, "") || "Guest";
    return "Someone";
}

function calculateExpenseBalances({
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

    function ensureBalance(value: string) {
        if (!balances.has(value)) {
            balances.set(value, {
                value,
                label: getParticipantLabelFromValue(value, participants),
                amount: 0,
            });
        }
        return balances.get(value)!;
    }

    participants.forEach((participant) => {
        ensureBalance(participantValue(participant));
    });

    expenses.forEach((expense) => {
        const payerValue = getExpensePayerValue(expense);
        if (payerValue) {
            const payerBalance = ensureBalance(payerValue);
            payerBalance.amount += getExpenseReportingAmount(expense);
        }
    });

    splits.forEach((split) => {
        const value = getParticipantValueForSplit(split);
        if (!value) return;

        const splitBalance = ensureBalance(value);
        splitBalance.amount -= getSplitReportingAmount(split, expenseById);
    });

    settlementPayments.forEach((settlement) => {
        const payerBalance = ensureBalance(settlement.paid_by_participant_value);
        const recipientBalance = ensureBalance(
            settlement.received_by_participant_value
        );
        payerBalance.amount += Number(settlement.amount || 0);
        recipientBalance.amount -= Number(settlement.amount || 0);
    });

    return [...balances.values()]
        .filter((balance) => Math.abs(balance.amount) >= 0.01)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function calculateExpenseSettlements({
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
    const balances = calculateExpenseBalances({
        expenses,
        splits,
        participants,
        settlementPayments,
    });
    const debtors = balances
        .filter((balance) => balance.amount < -0.01)
        .map((balance) => ({ ...balance, amount: Math.abs(balance.amount) }));
    const creditors = balances
        .filter((balance) => balance.amount > 0.01)
        .map((balance) => ({ ...balance }));
    const settlements: Settlement[] = [];
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

function BudgetTabs({
    tripId,
    tripRouteSegment,
    mode,
}: {
    tripId: string;
    tripRouteSegment?: string;
    mode: "budget" | "expenses";
}) {
    const routeSegment = tripRouteSegment || tripId;
    const tabs = [
        { label: "Budget", href: `/trips/${routeSegment}/budget`, value: "budget" },
        {
            label: "Expenses",
            href: `/trips/${routeSegment}/budget/expenses`,
            value: "expenses",
        },
    ] as const;

    return (
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-xl shadow-black/20">
            {tabs.map((tab) => (
                <Link
                    key={tab.value}
                    href={tab.href}
                    className={`rounded-full px-5 py-2 text-sm font-black transition ${
                        mode === tab.value
                            ? "bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.22)]"
                            : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                    }`}
                >
                    {tab.label}
                </Link>
            ))}
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                {label}
            </span>
            <div className="mt-2">{children}</div>
        </label>
    );
}

const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] placeholder:text-slate-500 focus:border-lime-300/40 focus:bg-white/[0.12]";
const selectClass = inputClass;
const budgetModalBodyClass = "vaivia-modal-body space-y-5";

function CreateBudgetModal({
    tripId,
    tripTitle,
    defaultCurrency,
    onClose,
}: {
    tripId: string;
    tripTitle: string;
    defaultCurrency: string;
    onClose: () => void;
}) {
    const [categoryAmounts, setCategoryAmounts] = useState<string[]>(
        DEFAULT_BUDGET_CATEGORIES.map(() => "")
    );
    const [totalBudgetAmount, setTotalBudgetAmount] = useState("");

    function parseBudgetAmount(value: string) {
        const parsed = Number(value.replace(/,/g, "").trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function updateCategoryAmount(index: number, value: string) {
        setCategoryAmounts((currentAmounts) => {
            const nextAmounts = [...currentAmounts];
            nextAmounts[index] = value;
            const total = nextAmounts.reduce(
                (sum, amount) => sum + parseBudgetAmount(amount),
                0
            );
            setTotalBudgetAmount(total > 0 ? total.toFixed(2) : "");
            return nextAmounts;
        });
    }

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-4xl"
            labelledBy="create-budget-title"
        >
            {({ requestClose }) => (
                <>
                <div className="vaivia-modal-header flex items-start justify-between gap-4">
                    <div>
                        <p className="vaivia-modal-eyebrow">Trip money</p>
                        <h2 id="create-budget-title" className="vaivia-modal-title">
                            Create budget
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="vaivia-modal-close"
                        aria-label="Close create budget"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <form
                    action={async (formData) => {
                        await createBudget(formData);
                        requestClose();
                    }}
                    className={budgetModalBodyClass}
                >
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="trip_title" value={tripTitle} />
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="md:col-span-2">
                            <Field label="Budget name">
                                <input
                                    name="name"
                                    defaultValue={`${tripTitle} Budget`}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <Field label="Reporting currency">
                            <select
                                name="reporting_currency"
                                defaultValue={defaultCurrency}
                                className={selectClass}
                            >
                                {COMMON_CURRENCIES.map((currency) => (
                                    <option
                                        key={currency}
                                        value={currency}
                                        className="bg-slate-950 text-white"
                                    >
                                        {currency}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <Field label="Total budget">
                        <input
                            name="total_budget_amount"
                            inputMode="decimal"
                            value={totalBudgetAmount}
                            onChange={(event) =>
                                setTotalBudgetAmount(event.target.value)
                            }
                            placeholder="0.00"
                            className={inputClass}
                        />
                    </Field>
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-sm font-black text-white">
                            Starting categories
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {DEFAULT_BUDGET_CATEGORIES.map((category, index) => (
                                <label
                                    key={category.name}
                                    className="grid grid-cols-[1fr_8rem] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3"
                                >
                                    <span>
                                        <span className="block text-sm font-bold text-white">
                                            {category.name}
                                        </span>
                                    </span>
                                    <input
                                        name={`category_${index}_amount`}
                                        inputMode="decimal"
                                        value={categoryAmounts[index] || ""}
                                        onChange={(event) =>
                                            updateCategoryAmount(
                                                index,
                                                event.target.value
                                            )
                                        }
                                        placeholder="0"
                                        className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-right text-sm font-bold text-white outline-none focus:border-lime-300/40"
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions">
                        <button
                            type="submit"
                            className="vaivia-modal-button-primary"
                        >
                            Save budget
                        </button>
                    </div>
                </form>
                </>
            )}
        </AnimatedModal>
    );
}

function EditBudgetModal({
    tripId,
    budget,
    lineItems,
    expenses,
    onClose,
}: {
    tripId: string;
    budget: TripBudget;
    lineItems: TripBudgetLineItem[];
    expenses: TripExpense[];
    onClose: () => void;
}) {
    const [newCategories, setNewCategories] = useState<
        Array<{ id: string; name: string; amount: string }>
    >([]);
    const [lineAmounts, setLineAmounts] = useState<Record<string, string>>(
        () =>
            Object.fromEntries(
                lineItems.map((item) => [item.id, String(item.planned_amount || "")])
            )
    );
    const [totalBudgetAmount, setTotalBudgetAmount] = useState(
        budget.total_budget_amount === null ? "" : String(budget.total_budget_amount)
    );

    function recalculateTotal(
        nextLineAmounts = lineAmounts,
        nextNewCategories = newCategories
    ) {
        const total = [
            ...Object.values(nextLineAmounts),
            ...nextNewCategories.map((category) => category.amount),
        ].reduce((sum, value) => {
            const parsed = Number(String(value || "").replace(/,/g, "").trim());
            return sum + (Number.isFinite(parsed) ? parsed : 0);
        }, 0);

        setTotalBudgetAmount(total > 0 ? total.toFixed(2) : "");
    }

    function updateLineAmount(lineItemId: string, value: string) {
        setLineAmounts((currentAmounts) => {
            const nextAmounts = { ...currentAmounts, [lineItemId]: value };
            recalculateTotal(nextAmounts);
            return nextAmounts;
        });
    }

    function addNewCategory() {
        setNewCategories((currentCategories) => [
            ...currentCategories,
            { id: crypto.randomUUID(), name: "", amount: "" },
        ]);
    }

    function updateNewCategory(
        categoryId: string,
        field: "name" | "amount",
        value: string
    ) {
        setNewCategories((currentCategories) => {
            const nextCategories = currentCategories.map((category) =>
                category.id === categoryId ? { ...category, [field]: value } : category
            );
            if (field === "amount") recalculateTotal(lineAmounts, nextCategories);
            return nextCategories;
        });
    }

    function removeNewCategory(categoryId: string) {
        setNewCategories((currentCategories) => {
            const nextCategories = currentCategories.filter(
                (category) => category.id !== categoryId
            );
            recalculateTotal(lineAmounts, nextCategories);
            return nextCategories;
        });
    }

    const expenseCountByCategoryId = expenses.reduce<Record<string, number>>(
        (counts, expense) => {
            if (!expense.budget_category_id) return counts;
            counts[expense.budget_category_id] =
                (counts[expense.budget_category_id] || 0) + 1;
            return counts;
        },
        {}
    );
    const expensesByCategoryId = expenses.reduce<Record<string, TripExpense[]>>(
        (groups, expense) => {
            if (!expense.budget_category_id) return groups;
            groups[expense.budget_category_id] = [
                ...(groups[expense.budget_category_id] || []),
                expense,
            ];
            return groups;
        },
        {}
    );

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-5xl"
            labelledBy="edit-budget-title"
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Trip money</p>
                            <h2 id="edit-budget-title" className="vaivia-modal-title">
                                Edit budget
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close edit budget"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <form
                        action={async (formData) => {
                            await updateBudget(formData);
                            requestClose();
                        }}
                        className={budgetModalBodyClass}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="budget_id" value={budget.id} />
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <Field label="Budget name">
                                    <input
                                        name="name"
                                        defaultValue={budget.name}
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                            <Field label="Reporting currency">
                                <select
                                    name="reporting_currency"
                                    defaultValue={budget.reporting_currency}
                                    className={selectClass}
                                >
                                    {COMMON_CURRENCIES.map((currency) => (
                                        <option
                                            key={currency}
                                            value={currency}
                                            className="bg-slate-950 text-white"
                                        >
                                            {currency}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                        <Field label="Total budget">
                            <input
                                name="total_budget_amount"
                                inputMode="decimal"
                                value={totalBudgetAmount}
                                onChange={(event) =>
                                    setTotalBudgetAmount(event.target.value)
                                }
                                className={inputClass}
                            />
                        </Field>
                        <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-black text-white">
                                    Budget categories
                                </p>
                                <button
                                    type="button"
                                    onClick={addNewCategory}
                                    className="rounded-full border border-lime-300/25 bg-lime-300/10 px-4 py-2 text-xs font-black text-lime-100 transition hover:bg-lime-300/20"
                                >
                                    Add category
                                </button>
                            </div>
                            {lineItems.map((item) => {
                                const expenseCount =
                                    item.category_id
                                        ? expenseCountByCategoryId[item.category_id] || 0
                                        : 0;
                                const affectedExpenses = item.category_id
                                    ? expensesByCategoryId[item.category_id] || []
                                    : [];
                                const remapOptions = lineItems.filter(
                                    (option) => option.id !== item.id
                                );

                                return (
                                    <div
                                        key={item.id}
                                        className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 md:grid-cols-[1fr_8rem_auto]"
                                    >
                                        <input
                                            type="hidden"
                                            name="line_item_id"
                                            value={item.id}
                                        />
                                        <input
                                            type="hidden"
                                            name={`line_${item.id}_category_id`}
                                            value={item.category_id || ""}
                                        />
                                        <input
                                            name={`line_${item.id}_name`}
                                            defaultValue={item.name}
                                            className={inputClass}
                                        />
                                        <input
                                            name={`line_${item.id}_planned_amount`}
                                            inputMode="decimal"
                                            value={lineAmounts[item.id] || ""}
                                            onChange={(event) =>
                                                updateLineAmount(
                                                    item.id,
                                                    event.target.value
                                                )
                                            }
                                            className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-right text-sm font-bold text-white outline-none focus:border-lime-300/40"
                                        />
                                        <label className="flex items-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-black text-red-100">
                                            <input
                                                type="checkbox"
                                                name={`line_${item.id}_delete`}
                                                className="h-4 w-4 accent-red-300"
                                            />
                                            Remove
                                        </label>
                                        {expenseCount > 0 ? (
                                            <div className="md:col-span-3">
                                                <label className="block text-xs font-bold text-amber-100">
                                                    {expenseCount} expense
                                                    {expenseCount === 1 ? "" : "s"} use
                                                    this category. Remap before removing:
                                                    <span className="mt-2 block rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-50">
                                                        {affectedExpenses
                                                            .map(
                                                                (expense) =>
                                                                    expense.description
                                                            )
                                                            .join(", ")}
                                                    </span>
                                                    <select
                                                        name={`line_${item.id}_remap_category_id`}
                                                        defaultValue=""
                                                        className={`${selectClass} mt-2`}
                                                    >
                                                        <option
                                                            value=""
                                                            className="bg-slate-950 text-white"
                                                        >
                                                            Choose remap category
                                                        </option>
                                                        {remapOptions.map((option) => (
                                                            <option
                                                                key={option.id}
                                                                value={
                                                                    option.category_id ||
                                                                    ""
                                                                }
                                                                className="bg-slate-950 text-white"
                                                            >
                                                                {option.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                            {newCategories.map((category) => (
                                <div
                                    key={category.id}
                                    className="grid gap-3 rounded-2xl border border-lime-300/20 bg-lime-300/5 p-3 md:grid-cols-[1fr_8rem_auto]"
                                >
                                    <input
                                        name="new_category_name"
                                        value={category.name}
                                        onChange={(event) =>
                                            updateNewCategory(
                                                category.id,
                                                "name",
                                                event.target.value
                                            )
                                        }
                                        placeholder="New category name"
                                        className={inputClass}
                                    />
                                    <input
                                        name="new_category_amount"
                                        inputMode="decimal"
                                        value={category.amount}
                                        onChange={(event) =>
                                            updateNewCategory(
                                                category.id,
                                                "amount",
                                                event.target.value
                                            )
                                        }
                                        placeholder="0"
                                        className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-right text-sm font-bold text-white outline-none focus:border-lime-300/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeNewCategory(category.id)}
                                        className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-100"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions">
                            <button
                                type="submit"
                                className="vaivia-modal-button-primary"
                            >
                                Save budget
                            </button>
                        </div>
                    </form>
                </>
            )}
        </AnimatedModal>
    );
}

export function AddExpenseModal({
    tripId,
    reportingCurrency,
    budgetCategories = [],
    expenseCategories = [],
    participants,
    onClose,
    mode = "add",
    expense = null,
    expenseSplits = [],
    defaultDate,
    defaultDescription = "",
    defaultCategory = "other",
    defaultSourceType = "manual",
    transportationItemId,
    itineraryEventId,
    accommodationId,
}: {
    tripId: string;
    reportingCurrency: string;
    budgetCategories?: TripBudgetLineItem[];
    expenseCategories?: TripBudgetCategory[];
    participants: BudgetParticipant[];
    onClose: () => void;
    mode?: ExpenseModalMode;
    expense?: TripExpense | null;
    expenseSplits?: TripExpenseSplit[];
    defaultDate?: string;
    defaultDescription?: string;
    defaultCategory?: ExpenseCategory;
    defaultSourceType?: string;
    transportationItemId?: string | null;
    itineraryEventId?: string | null;
    accommodationId?: string | null;
}) {
    const [splitMethod, setSplitMethod] = useState<SplitMethod>(
        expense?.split_method || "just_me"
    );
    const isEditing = mode === "edit" && Boolean(expense);
    const isDuplicate = mode === "duplicate";
    const modalTitle = isEditing
        ? "Edit expense"
        : isDuplicate
          ? "Duplicate expense"
          : "Add expense";
    const modalId = isEditing
        ? "edit-expense-title"
        : isDuplicate
          ? "duplicate-expense-title"
          : "add-expense-title";
    const formAction = isEditing ? updateExpense : createExpense;
    const currentUserParticipant =
        participants.find((participant) => participant.isCurrentUser) ||
        participants[0] ||
        null;
    const savedSplitValues = new Set(
        expenseSplits.map(getParticipantValueForSplit).filter(Boolean)
    );
    const hasSavedSplits = savedSplitValues.size > 0;
    const allParticipantValues = participants.map(participantValue);
    const currentUserParticipantValue = currentUserParticipant
        ? participantValue(currentUserParticipant)
        : "";
    const [selectedSplitValues, setSelectedSplitValues] = useState<Set<string>>(
        () => {
            if (expense?.split_method === "just_me") {
                return new Set(
                    currentUserParticipantValue ? [currentUserParticipantValue] : []
                );
            }

            return new Set(
                hasSavedSplits
                    ? Array.from(savedSplitValues)
                    : allParticipantValues
            );
        }
    );
    const payerDefault =
        getExpensePayerValue(expense) ||
        (currentUserParticipant ? participantValue(currentUserParticipant) : "");
    const [selectedPayer, setSelectedPayer] = useState(payerDefault);
    const resolvedDate =
        expense?.transaction_date ||
        expense?.expense_date ||
        defaultDate ||
        getLocalDateKey();
    const resolvedAmount =
        expense?.original_amount ?? expense?.amount ?? "";
    const resolvedCurrency =
        expense?.original_currency ||
        expense?.currency ||
        reportingCurrency;
    const resolvedCategory = expense?.category || defaultCategory;
    const resolvedBudgetCategoryId =
        expense?.budget_category_id ||
        expenseCategories.find(
            (category) => category.linked_expense_category === resolvedCategory
        )?.id ||
        budgetCategories.find(
            (category) => category.linked_expense_category === resolvedCategory
        )?.category_id ||
        "";
    const resolvedExpenseCategories =
        expenseCategories.length > 0
            ? expenseCategories
            : budgetCategories
                  .filter(
                      (category): category is TripBudgetLineItem & {
                          category_id: string;
                      } => Boolean(category.category_id)
                  )
                  .map((category) => ({
                      id: category.category_id,
                      trip_id: category.trip_id,
                      name: category.name,
                      linked_expense_category:
                          category.linked_expense_category,
                      sort_order: category.sort_order,
                      is_default: false,
                      is_archived: false,
                  }));
    const resolvedSourceType = expense?.source_type || defaultSourceType;
    const resolvedTransportationItemId =
        expense?.transportation_item_id || transportationItemId || "";
    const resolvedItineraryEventId =
        expense?.itinerary_event_id || itineraryEventId || "";
    const resolvedAccommodationId = expense?.accommodation_id || accommodationId || "";

    function chooseSplitMethod(nextSplitMethod: SplitMethod) {
        setSplitMethod(nextSplitMethod);

        if (nextSplitMethod === "equal") {
            setSelectedSplitValues(new Set(allParticipantValues));
        } else if (nextSplitMethod === "just_me") {
            setSelectedSplitValues(
                new Set(
                    currentUserParticipantValue
                        ? [currentUserParticipantValue]
                        : []
                )
            );
        }
    }

    function toggleSplitParticipant(value: string, isChecked: boolean) {
        setSelectedSplitValues((current) => {
            const next = new Set(current);
            if (isChecked) next.add(value);
            else next.delete(value);
            return next;
        });
    }

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-4xl"
            labelledBy={modalId}
        >
            {({ requestClose }) => (
                <>
                <div className="vaivia-modal-header flex items-start justify-between gap-4">
                    <div>
                        <p className="vaivia-modal-eyebrow">Budget</p>
                        <h2 id={modalId} className="vaivia-modal-title">
                            {modalTitle}
                        </h2>
                        <p className="mt-2 text-sm text-slate-300">
                            Original amount, currency, exchange rate, and converted
                            reporting amount are stored together.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="vaivia-modal-close"
                        aria-label={`Close ${modalTitle.toLowerCase()}`}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <form
                    action={async (formData) => {
                        await formAction(formData);
                        requestClose();
                    }}
                    className={budgetModalBodyClass}
                >
                    <input type="hidden" name="trip_id" value={tripId} />
                    {isEditing && expense ? (
                        <input type="hidden" name="expense_id" value={expense.id} />
                    ) : null}
                    <input
                        type="hidden"
                        name="reporting_currency"
                        value={reportingCurrency}
                    />
                    <input
                        type="hidden"
                        name="source_type"
                        value={resolvedSourceType}
                    />
                    <input
                        type="hidden"
                        name="transportation_item_id"
                        value={resolvedTransportationItemId}
                    />
                    <input
                        type="hidden"
                        name="itinerary_event_id"
                        value={resolvedItineraryEventId}
                    />
                    <input
                        type="hidden"
                        name="accommodation_id"
                        value={resolvedAccommodationId}
                    />
                    <div className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-semibold text-lime-50">
                        <span className="font-black">Reporting currency:</span>{" "}
                        {reportingCurrency}. VAIVIA will fetch the exchange rate
                        automatically for the transaction date unless you add a
                        manual override.
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Date">
                            <DateInput
                                name="expense_date"
                                defaultValue={resolvedDate}
                                className={inputClass}
                                required
                            />
                        </Field>
                        <Field label="Amount">
                            <input
                                name="amount"
                                inputMode="decimal"
                                defaultValue={resolvedAmount}
                                className={inputClass}
                                required
                            />
                        </Field>
                        <Field label="Transaction currency">
                            <select
                                name="currency"
                                defaultValue={resolvedCurrency}
                                className={selectClass}
                            >
                                {COMMON_CURRENCIES.map((currency) => (
                                    <option
                                        key={currency}
                                        value={currency}
                                        className="bg-slate-950 text-white"
                                    >
                                        {currency}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <details className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                        <summary className="cursor-pointer text-sm font-black text-slate-200">
                            Manual exchange rate override
                        </summary>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                            Leave this blank to use the automatic exchange rate.
                            Only enter a rate if your card, bank, or cash exchange used
                            a different one.
                        </p>
                        <div className="mt-3 max-w-sm">
                            <Field label={`Rate to ${reportingCurrency}`}>
                                <input
                                    name="manual_exchange_rate"
                                    inputMode="decimal"
                                    placeholder="Optional"
                                    defaultValue={
                                        expense?.exchange_rate_is_manual
                                            ? expense.manual_exchange_rate || ""
                                            : ""
                                    }
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                    </details>
                    <Field label="Description">
                        <input
                            name="description"
                            defaultValue={expense?.description || defaultDescription}
                            className={inputClass}
                            required
                        />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <ExpenseCategoryPicker
                                tripId={tripId}
                                reportingCurrency={reportingCurrency}
                                categories={resolvedExpenseCategories}
                                defaultBudgetCategoryId={resolvedBudgetCategoryId}
                                defaultExpenseCategory={resolvedCategory}
                            />
                        </div>
                        <div>
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                Paid by
                            </span>
                            <input type="hidden" name="paid_by" value={selectedPayer} />
                            <div className="mt-2 flex flex-wrap gap-2">
                                {participants.map((participant) => {
                                    const value = participantValue(participant);
                                    const isSelected = selectedPayer === value;
                                    const label =
                                        getBudgetParticipantLabel(participant) ||
                                        participant.label;

                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setSelectedPayer(value)}
                                            className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-left text-sm font-black transition ${
                                                isSelected
                                                    ? "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                                    : "border-white/10 bg-slate-950/50 text-white hover:border-lime-300/30 hover:bg-white/[0.1]"
                                            }`}
                                        >
                                            <ParticipantAvatar
                                                participant={participant}
                                                label={label}
                                            />
                                            <span className="max-w-40 truncate">
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                Split method
                            </span>
                            <input
                                type="hidden"
                                name="split_method"
                                value={splitMethod}
                            />
                            <div className="mt-2 grid gap-2">
                                {splitMethodOptions.map((option) => {
                                    const isSelected = splitMethod === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => chooseSplitMethod(option.value)}
                                            aria-pressed={isSelected}
                                            className={`rounded-2xl border px-3 py-2 text-left transition ${
                                                isSelected
                                                    ? "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                                    : "border-white/10 bg-slate-950/50 text-white hover:border-lime-300/30 hover:bg-white/[0.1]"
                                            }`}
                                        >
                                            <span className="block text-xs font-black">
                                                {option.label}
                                            </span>
                                            <span
                                                className={`mt-1 block text-[11px] font-semibold leading-4 ${
                                                    isSelected
                                                        ? "text-slate-950/70"
                                                        : "text-slate-400"
                                                }`}
                                            >
                                                {option.description}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-sm font-black text-white">
                            Split with
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {splitMethod === "just_me" && currentUserParticipant ? (
                                <input
                                    type="hidden"
                                    name="included_participants"
                                    value={participantValue(currentUserParticipant)}
                                />
                            ) : null}
                            {participants.map((participant) => {
                                const value = participantValue(participant);
                                const label =
                                    getBudgetParticipantLabel(participant) ||
                                    participant.label;
                                const isCurrentUser = participant.isCurrentUser;
                                const isLockedToCurrentUser =
                                    splitMethod === "just_me" && isCurrentUser;
                                return (
                                    <label
                                        key={value}
                                        className={`grid grid-cols-[auto_auto_1fr_8rem] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 ${
                                            splitMethod === "just_me" && !isCurrentUser
                                                ? "opacity-45"
                                                : ""
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            name={
                                                splitMethod === "just_me"
                                                    ? undefined
                                                    : "included_participants"
                                            }
                                            value={value}
                                            checked={selectedSplitValues.has(value)}
                                            onChange={(event) =>
                                                toggleSplitParticipant(
                                                    value,
                                                    event.target.checked
                                                )
                                            }
                                            disabled={splitMethod === "just_me"}
                                            className="h-4 w-4 accent-lime-300"
                                        />
                                        <ParticipantAvatar
                                            participant={participant}
                                            label={label}
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-bold text-white">
                                                {label}
                                            </span>
                                            {participant.secondaryLabel ? (
                                                <span className="block truncate text-xs text-slate-400">
                                                    {participant.secondaryLabel}
                                                </span>
                                            ) : null}
                                        </span>
                                        {splitMethod === "just_me" ? (
                                            <span className={`text-right text-xs font-bold uppercase ${
                                                isLockedToCurrentUser
                                                    ? "text-lime-200"
                                                    : "text-slate-500"
                                            }`}>
                                                {isLockedToCurrentUser ? "Full" : "0"}
                                            </span>
                                        ) : splitMethod === "exact" ? (
                                            <input
                                                name={`split_amount_${participant.kind}_${participant.id}`}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                defaultValue={
                                                    expenseSplits.find(
                                                        (split) =>
                                                            getParticipantValueForSplit(split) ===
                                                            value
                                                    )?.split_amount || ""
                                                }
                                                className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-right text-xs font-bold text-white outline-none"
                                            />
                                        ) : splitMethod === "percentage" ? (
                                            <input
                                                name={`split_percentage_${participant.kind}_${participant.id}`}
                                                inputMode="decimal"
                                                placeholder="%"
                                                defaultValue={
                                                    expenseSplits.find(
                                                        (split) =>
                                                            getParticipantValueForSplit(split) ===
                                                            value
                                                    )?.split_percentage || ""
                                                }
                                                className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-right text-xs font-bold text-white outline-none"
                                            />
                                        ) : (
                                            <span className="text-right text-xs font-bold uppercase text-slate-500">
                                                Equal
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div className={`grid gap-4 ${isEditing ? "" : "md:grid-cols-2"}`}>
                        {!isEditing ? (
                            <Field label="Receipt">
                                <input
                                    type="file"
                                    name="receipt"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    className={inputClass}
                                />
                            </Field>
                        ) : null}
                        <Field label="Notes">
                            <input
                                name="notes"
                                defaultValue={expense?.notes || ""}
                                className={inputClass}
                            />
                        </Field>
                    </div>
                    <div className="vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions">
                        <button
                            type="submit"
                            className="vaivia-modal-button-primary"
                        >
                            {isEditing
                                ? "Save changes"
                                : isDuplicate
                                  ? "Create duplicate"
                                  : "Save expense"}
                        </button>
                    </div>
                </form>
                </>
            )}
        </AnimatedModal>
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

const EXPENSE_CHART_COLORS = [
    "#bef264",
    "#22d3ee",
    "#c084fc",
    "#fb7185",
    "#fbbf24",
    "#60a5fa",
    "#a3e635",
];

function ExpenseCategoryPieChart({
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
                    getExpenseReportingAmount(expense)
            );
            return totals;
        },
        new Map()
    );
    const entries = Array.from(amounts.entries())
        .filter(([, amount]) => amount > 0)
        .sort(([, firstAmount], [, secondAmount]) =>
            secondAmount - firstAmount
        );
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
                    style={{
                        backgroundImage: `conic-gradient(${segments.join(", ")})`,
                    }}
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
                                            EXPENSE_CHART_COLORS[
                                                index % EXPENSE_CHART_COLORS.length
                                            ],
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

function SettleUpModal({
    tripId,
    participants,
    reportingCurrency,
    suggestedSettlement,
    onClose,
}: {
    tripId: string;
    participants: BudgetParticipant[];
    reportingCurrency: string;
    suggestedSettlement?: Settlement;
    onClose: () => void;
}) {
    const participantValues = participants.map(participantValue);
    const currentParticipant =
        participants.find((participant) => participant.isCurrentUser) ||
        participants[0];
    const defaultPayer =
        suggestedSettlement?.fromValue ||
        (currentParticipant ? participantValue(currentParticipant) : "");
    const defaultRecipient =
        suggestedSettlement?.toValue ||
        participantValues.find((value) => value !== defaultPayer) ||
        defaultPayer;
    const [paidBy, setPaidBy] = useState(defaultPayer);
    const [receivedBy, setReceivedBy] = useState(defaultRecipient);
    const participantOptions = participants.map((participant) => ({
        value: participantValue(participant),
        label: getBudgetParticipantLabel(participant) || participant.label,
        avatarLabel: participant.label,
        avatarUrl: participant.avatarUrl,
    }));

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-xl"
            labelledBy="settle-up-title"
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Trip balances</p>
                            <h2 id="settle-up-title" className="vaivia-modal-title">
                                Settle up
                            </h2>
                            <p className="mt-2 text-sm font-semibold text-slate-300">
                                Record money that was sent between trip members.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close settle up"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <form
                        action={async (formData) => {
                            await createExpenseSettlement(formData);
                            requestClose();
                        }}
                        className={budgetModalBodyClass}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input
                            type="hidden"
                            name="reporting_currency"
                            value={reportingCurrency}
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <BudgetParticipantDropdown
                                name="paid_by_participant_value"
                                label="Sent by"
                                options={participantOptions}
                                value={paidBy}
                                onValueChange={(nextPaidBy) => {
                                    setPaidBy(nextPaidBy);
                                    if (nextPaidBy === receivedBy) {
                                        setReceivedBy(
                                            participantValues.find(
                                                (value) => value !== nextPaidBy
                                            ) || nextPaidBy
                                        );
                                    }
                                }}
                            />
                            <BudgetParticipantDropdown
                                name="received_by_participant_value"
                                label="Sent to"
                                options={participantOptions}
                                value={receivedBy}
                                onValueChange={setReceivedBy}
                                disabledValue={paidBy}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={`Amount (${reportingCurrency})`}>
                                <input
                                    name="amount"
                                    inputMode="decimal"
                                    defaultValue={
                                        suggestedSettlement
                                            ? suggestedSettlement.amount.toFixed(2)
                                            : ""
                                    }
                                    placeholder="0.00"
                                    className={inputClass}
                                    required
                                />
                            </Field>
                            <Field label="Date sent">
                                <DateInput
                                    name="settled_on"
                                    defaultValue={getLocalDateKey()}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                        </div>
                        <div className="vaivia-settle-up-footer vaivia-modal-footer sticky bottom-0 -mx-6 vaivia-modal-actions">
                            <button
                                type="button"
                                onClick={requestClose}
                                className="vaivia-settle-up-cancel vaivia-modal-button-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={participants.length < 2 || paidBy === receivedBy}
                                className="vaivia-modal-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Save settlement
                            </button>
                        </div>
                    </form>
                </>
            )}
        </AnimatedModal>
    );
}

function RunningTotalCard({
    tripId,
    settlements,
    participants,
    reportingCurrency,
}: {
    tripId: string;
    settlements: Settlement[];
    participants: BudgetParticipant[];
    reportingCurrency: string;
}) {
    const [isSettlingUp, setIsSettlingUp] = useState(false);

    return (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 text-white shadow-2xl shadow-black/30">
            {isSettlingUp ? (
                <SettleUpModal
                    tripId={tripId}
                    participants={participants}
                    reportingCurrency={reportingCurrency}
                    suggestedSettlement={settlements[0]}
                    onClose={() => setIsSettlingUp(false)}
                />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                        Running total
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                        Who owes whom
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs font-bold text-slate-400">
                        Net of expenses, assigned splits, and recorded payments
                    </p>
                    <button
                        type="button"
                        onClick={() => setIsSettlingUp(true)}
                        disabled={participants.length < 2}
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
                                {formatCurrency(
                                    settlement.amount,
                                    reportingCurrency
                                )}
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

function BudgetDashboard({
    tripId,
    tripRouteSegment,
    tripTitle,
    budget,
    lineItems,
    expenseCategories = [],
    expenses,
    splits = [],
    settlementPayments = [],
    participants,
    defaultCurrency,
}: BudgetFeatureProps) {
    const [isCreatingBudget, setIsCreatingBudget] = useState(false);
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [isAddingExpense, setIsAddingExpense] = useState(false);
    const totals = calculateBudgetTotals({ budget, lineItems, expenses });
    const categoryActuals = calculateCategoryActuals(expenses);
    const reportingCurrency =
        budget?.reporting_currency || defaultCurrency || "CAD";
    const progressWidth = `${Math.min(Math.max(totals.percentUsed, 0), 100)}%`;
    const settlements = calculateExpenseSettlements({
        expenses,
        splits,
        participants,
        settlementPayments,
    });

    return (
        <>
            {isCreatingBudget ? (
                <CreateBudgetModal
                    tripId={tripId}
                    tripTitle={tripTitle}
                    defaultCurrency={defaultCurrency}
                    onClose={() => setIsCreatingBudget(false)}
                />
            ) : null}
            {isEditingBudget && budget ? (
                <EditBudgetModal
                    tripId={tripId}
                    budget={budget}
                    lineItems={lineItems}
                    expenses={expenses}
                    onClose={() => setIsEditingBudget(false)}
                />
            ) : null}
            {isAddingExpense ? (
                <AddExpenseModal
                    tripId={tripId}
                    reportingCurrency={reportingCurrency}
                    budgetCategories={lineItems}
                    expenseCategories={expenseCategories}
                    participants={participants}
                    onClose={() => setIsAddingExpense(false)}
                />
            ) : null}
            <section className="space-y-6">
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
                        <BudgetTabs
                            tripId={tripId}
                            tripRouteSegment={tripRouteSegment}
                            mode="budget"
                        />
                        {budget ? (
                            <button
                                type="button"
                                onClick={() => setIsEditingBudget(true)}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                Edit budget
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setIsAddingExpense(true)}
                            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
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
                            <h2 className="mt-4 text-2xl font-black">
                                No budget yet.
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">
                                You can still track expenses now. Create a budget
                                when you&apos;re ready to compare spending against a
                                plan.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingBudget(true)}
                                    className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
                                >
                                    Create budget
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsAddingExpense(true)}
                                    className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white"
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
                                        value={formatCurrency(
                                            totals.spent,
                                            reportingCurrency
                                        )}
                                    />
                                    <SummaryCard
                                        label="Expenses"
                                        value={String(expenses.length)}
                                    />
                                    <SummaryCard
                                        label="Reporting currency"
                                        value={reportingCurrency}
                                    />
                                </div>
                                <RunningTotalCard
                                    tripId={tripId}
                                    settlements={settlements}
                                    participants={participants}
                                    reportingCurrency={reportingCurrency}
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
                                                        {formatCurrency(
                                                            amount,
                                                            reportingCurrency
                                                        )}
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
                                value={formatCurrency(
                                    totals.budgeted,
                                    reportingCurrency
                                )}
                            />
                            <SummaryCard
                                label="Total spent"
                                value={formatCurrency(totals.spent, reportingCurrency)}
                            />
                            <SummaryCard
                                label="Remaining"
                                value={formatCurrency(
                                    totals.remaining,
                                    reportingCurrency
                                )}
                                tone={totals.remaining >= 0 ? "good" : "warning"}
                            />
                            <SummaryCard
                                label="Percent used"
                                value={formatPercent(totals.percentUsed)}
                                tone={totals.percentUsed > 90 ? "warning" : "neutral"}
                            />
                        </div>
                        <RunningTotalCard
                            tripId={tripId}
                            settlements={settlements}
                            participants={participants}
                            reportingCurrency={reportingCurrency}
                        />
                        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                                        Budget tracker
                                    </p>
                                    <h2 className="mt-2 text-2xl font-black text-white">
                                        {formatCurrency(totals.spent, reportingCurrency)}{" "}
                                        spent
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
                                <h2 className="text-xl font-black text-white">
                                    Category budgets
                                </h2>
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
                                                    item.category_id ||
                                                        item.linked_expense_category
                                                ] || 0;
                                            const remaining =
                                                Number(item.planned_amount || 0) -
                                                actual;
                                            const percent =
                                                item.planned_amount > 0
                                                    ? (actual /
                                                          Number(
                                                              item.planned_amount
                                                          )) *
                                                      100
                                                    : actual > 0
                                                      ? 100
                                                      : 0;
                                            const isOverBudget = actual > Number(
                                                item.planned_amount || 0
                                            );
                                            const categoryProgressWidth = `${Math.min(
                                                Math.max(percent, 0),
                                                100
                                            )}%`;
                                            return (
                                                <Fragment key={item.id}>
                                                    <tr className="text-white">
                                                        <td className="px-5 pb-2 pt-4 font-bold">
                                                            {item.name}
                                                        </td>
                                                        <td className="px-5 pb-2 pt-4">
                                                            {formatCurrency(
                                                                item.planned_amount,
                                                                reportingCurrency
                                                            )}
                                                        </td>
                                                        <td
                                                            className={`px-5 pb-2 pt-4 font-bold ${
                                                                isOverBudget
                                                                    ? "text-red-300"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {formatCurrency(
                                                                actual,
                                                                reportingCurrency
                                                            )}
                                                        </td>
                                                        <td
                                                            className={`px-5 pb-2 pt-4 ${
                                                                isOverBudget
                                                                    ? "text-red-300"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {formatCurrency(
                                                                remaining,
                                                                reportingCurrency
                                                            )}
                                                        </td>
                                                        <td
                                                            className={`px-5 pb-2 pt-4 font-bold ${
                                                                isOverBudget
                                                                    ? "text-red-300"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {formatPercent(percent)}
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="px-5 pb-4 pt-1"
                                                        >
                                                            <div className="h-2 overflow-hidden rounded-full bg-slate-950/80 shadow-inner shadow-black/40">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${
                                                                        isOverBudget
                                                                            ? "bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.28)]"
                                                                            : "bg-lime-300 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.24)]"
                                                                    }`}
                                                                    style={{
                                                                        width: categoryProgressWidth,
                                                                    }}
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
        </>
    );
}

function ExpensesDashboard({
    tripId,
    tripRouteSegment,
    tripTitle,
    budget,
    lineItems,
    expenseCategories = [],
    expenses,
    splits = [],
    settlementPayments = [],
    participants,
    defaultCurrency,
}: BudgetFeatureProps) {
    const searchParams = useSearchParams();
    const [isAddingExpense, setIsAddingExpense] = useState(false);
    const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
    const [duplicatingExpense, setDuplicatingExpense] =
        useState<TripExpense | null>(null);
    const [deletingExpense, setDeletingExpense] = useState<TripExpense | null>(null);
    const reportingCurrency = budget?.reporting_currency || defaultCurrency || "CAD";
    const totalSpent = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount_in_reporting_currency || 0),
        0
    );
    const settlements = calculateExpenseSettlements({
        expenses,
        splits,
        participants,
        settlementPayments,
    });

    useEffect(() => {
        if (searchParams.get("addExpense") === "1") {
            setIsAddingExpense(true);
        }
    }, [searchParams]);

    return (
        <>
            {isAddingExpense ? (
                <AddExpenseModal
                    tripId={tripId}
                    reportingCurrency={reportingCurrency}
                    budgetCategories={lineItems}
                    expenseCategories={expenseCategories}
                    participants={participants}
                    onClose={() => setIsAddingExpense(false)}
                />
            ) : null}
            {editingExpense ? (
                <AddExpenseModal
                    tripId={tripId}
                    reportingCurrency={reportingCurrency}
                    budgetCategories={lineItems}
                    expenseCategories={expenseCategories}
                    participants={participants}
                    mode="edit"
                    expense={editingExpense}
                    expenseSplits={splits.filter(
                        (split) => split.expense_id === editingExpense.id
                    )}
                    onClose={() => setEditingExpense(null)}
                />
            ) : null}
            {duplicatingExpense ? (
                <AddExpenseModal
                    tripId={tripId}
                    reportingCurrency={reportingCurrency}
                    budgetCategories={lineItems}
                    expenseCategories={expenseCategories}
                    participants={participants}
                    mode="duplicate"
                    expense={duplicatingExpense}
                    expenseSplits={splits.filter(
                        (split) => split.expense_id === duplicatingExpense.id
                    )}
                    onClose={() => setDuplicatingExpense(null)}
                />
            ) : null}
            {deletingExpense ? (
                <AnimatedModal
                    onClose={() => setDeletingExpense(null)}
                    panelClassName="max-w-lg"
                    labelledBy="delete-expense-title"
                >
                    {({ requestClose }) => (
                        <>
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div>
                                    <p className="vaivia-modal-eyebrow">Budget</p>
                                    <h2
                                        id="delete-expense-title"
                                        className="vaivia-modal-title"
                                    >
                                        Delete expense?
                                    </h2>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                        This will remove{" "}
                                        <span className="font-black text-white">
                                            {deletingExpense.description}
                                        </span>{" "}
                                        from this trip&apos;s expenses.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="vaivia-modal-close"
                                    aria-label="Close delete expense confirmation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <form
                                action={async (formData) => {
                                    await deleteExpense(formData);
                                    requestClose();
                                }}
                                className="space-y-5 bg-[#05050c] p-6 text-white"
                            >
                                <input type="hidden" name="trip_id" value={tripId} />
                                <input
                                    type="hidden"
                                    name="expense_id"
                                    value={deletingExpense.id}
                                />
                                <div className="rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm font-semibold text-red-100">
                                    Deleting keeps your budget categories intact, but
                                    removes this expense from totals and split balances.
                                </div>
                                <div className="flex flex-wrap justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.14]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="rounded-full bg-red-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(248,113,113,0.2)] transition hover:bg-red-400"
                                    >
                                        Delete expense
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </AnimatedModal>
            ) : null}
            <section className="space-y-6">
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
                        <BudgetTabs
                            tripId={tripId}
                            tripRouteSegment={tripRouteSegment}
                            mode="expenses"
                        />
                        <button
                            type="button"
                            onClick={() => setIsAddingExpense(true)}
                            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
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
                <RunningTotalCard
                    tripId={tripId}
                    settlements={settlements}
                    participants={participants}
                    reportingCurrency={reportingCurrency}
                />
                <ExpenseCategoryPieChart
                    expenses={expenses}
                    reportingCurrency={reportingCurrency}
                />
                {expenses.length === 0 ? (
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-white shadow-2xl shadow-black/30">
                        <Receipt className="h-10 w-10 text-lime-300" />
                        <h2 className="mt-4 text-2xl font-black">
                            No expenses yet.
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-slate-400">
                            Add costs as you book or pay for things. The original
                            amount and currency stay preserved.
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
                                        const payer = getPayerParticipant(
                                            expense,
                                            participants
                                        );
                                        const payerLabel = getPayerLabel(
                                            expense,
                                            participants
                                        );

                                        return (
                                        <tr key={expense.id} className="text-white">
                                            <td className="px-5 py-4 font-semibold text-lime-100">
                                                {expense.expense_date}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="font-bold">
                                                    {expense.description}
                                                </span>
                                                <span className="mt-1 block text-xs uppercase tracking-wide text-slate-500">
                                                    {expense.source_type.replace(
                                                        "_",
                                                        " "
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                {lineItems.find(
                                                    (item) =>
                                                        item.category_id ===
                                                        expense.budget_category_id
                                                )?.name ||
                                                    DEFAULT_EXPENSE_CATEGORY_LABELS[
                                                        expense.category
                                                    ]}
                                            </td>
                                            <td className="px-5 py-4">
                                                {formatCurrency(
                                                    expense.amount,
                                                    expense.currency
                                                )}
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
                                                    expense.amount_in_reporting_currency,
                                                    expense.reporting_currency
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 py-1.5 pl-1.5 pr-3 text-sm font-black text-white">
                                                    <ParticipantAvatar
                                                        participant={payer}
                                                        label={payerLabel}
                                                    />
                                                    <span className="max-w-36 truncate">
                                                        {payerLabel}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingExpense(expense)}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white"
                                                        aria-label={`Edit expense ${expense.description}`}
                                                        title="Edit expense"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDuplicatingExpense(expense)}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white"
                                                        aria-label={`Duplicate expense ${expense.description}`}
                                                        title="Duplicate expense"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setDeletingExpense(expense)
                                                        }
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-300/20 bg-red-300/10 text-red-100 transition hover:bg-red-300/20"
                                                        aria-label={`Delete expense ${expense.description}`}
                                                        title="Delete expense"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
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
        </>
    );
}

export default function BudgetFeatureClient(props: BudgetFeatureProps) {
    return (
        <section className="px-4 pb-24 text-white md:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex items-center gap-3 text-sm font-bold text-slate-400">
                    <Banknote className="h-5 w-5 text-lime-300" />
                    <span>Trip money</span>
                    <span className="h-px flex-1 bg-white/10" />
                    <FileText className="h-5 w-5 text-slate-500" />
                </div>
                {props.mode === "budget" ? (
                    <BudgetDashboard {...props} />
                ) : (
                    <ExpensesDashboard {...props} />
                )}
            </div>
        </section>
    );
}
