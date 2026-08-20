"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import {
    BudgetFeaturePresentation,
    type BudgetSettlement,
} from "@/components/budget/BudgetPresentation";
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
                                placeholder="Use a negative amount for a refund"
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
    suggestedSettlement?: BudgetSettlement;
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

function BudgetDashboard(props: BudgetFeatureProps) {
    const {
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
    } = props;
    const [isCreatingBudget, setIsCreatingBudget] = useState(false);
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [isAddingExpense, setIsAddingExpense] = useState(false);
    const [settlementDialog, setSettlementDialog] = useState<{
        suggestedSettlement?: BudgetSettlement;
    } | null>(null);
    const reportingCurrency =
        budget?.reporting_currency || defaultCurrency || "CAD";
    const routeSegment = tripRouteSegment || tripId;

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
            {settlementDialog ? (
                <SettleUpModal
                    tripId={tripId}
                    participants={participants}
                    reportingCurrency={reportingCurrency}
                    suggestedSettlement={settlementDialog.suggestedSettlement}
                    onClose={() => setSettlementDialog(null)}
                />
            ) : null}
            <BudgetFeaturePresentation
                mode="budget"
                data={{
                    tripId,
                    tripTitle,
                    budget,
                    lineItems,
                    expenses,
                    splits,
                    settlementPayments,
                    participants,
                    defaultCurrency,
                }}
                actions={{
                    onCreateBudget: () => setIsCreatingBudget(true),
                    onEditBudget: budget
                        ? () => setIsEditingBudget(true)
                        : undefined,
                    onAddExpense: () => setIsAddingExpense(true),
                    onSettleUp: (suggestedSettlement) =>
                        setSettlementDialog({ suggestedSettlement }),
                    renderTabAction: (mode, tabProps) => (
                        <Link
                            key={mode}
                            href={
                                mode === "budget"
                                    ? `/trips/${routeSegment}/budget`
                                    : `/trips/${routeSegment}/budget/expenses`
                            }
                            {...tabProps}
                        />
                    ),
                }}
            />
        </>
    );
}

function ExpensesDashboard(props: BudgetFeatureProps) {
    const {
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
    } = props;
    const searchParams = useSearchParams();
    const [isAddingExpense, setIsAddingExpense] = useState(false);
    const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
    const [duplicatingExpense, setDuplicatingExpense] =
        useState<TripExpense | null>(null);
    const [deletingExpense, setDeletingExpense] = useState<TripExpense | null>(null);
    const [settlementDialog, setSettlementDialog] = useState<{
        suggestedSettlement?: BudgetSettlement;
    } | null>(null);
    const reportingCurrency =
        budget?.reporting_currency || defaultCurrency || "CAD";
    const routeSegment = tripRouteSegment || tripId;

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
            {settlementDialog ? (
                <SettleUpModal
                    tripId={tripId}
                    participants={participants}
                    reportingCurrency={reportingCurrency}
                    suggestedSettlement={settlementDialog.suggestedSettlement}
                    onClose={() => setSettlementDialog(null)}
                />
            ) : null}
            <BudgetFeaturePresentation
                mode="expenses"
                data={{
                    tripId,
                    tripTitle,
                    budget,
                    lineItems,
                    expenses,
                    splits,
                    settlementPayments,
                    participants,
                    defaultCurrency,
                }}
                actions={{
                    onAddExpense: () => setIsAddingExpense(true),
                    onSettleUp: (suggestedSettlement) =>
                        setSettlementDialog({ suggestedSettlement }),
                    onEditExpense: setEditingExpense,
                    onDuplicateExpense: setDuplicatingExpense,
                    onDeleteExpense: setDeletingExpense,
                    renderTabAction: (mode, tabProps) => (
                        <Link
                            key={mode}
                            href={
                                mode === "budget"
                                    ? `/trips/${routeSegment}/budget`
                                    : `/trips/${routeSegment}/budget/expenses`
                            }
                            {...tabProps}
                        />
                    ),
                }}
            />
        </>
    );
}

export default function BudgetFeatureClient(props: BudgetFeatureProps) {
    return props.mode === "budget" ? (
        <BudgetDashboard {...props} />
    ) : (
        <ExpensesDashboard {...props} />
    );
}
