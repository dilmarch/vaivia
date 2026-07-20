"use client";

import { useId, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createExpenseCategory } from "@/app/actions/budget";
import {
    DEFAULT_EXPENSE_CATEGORY_LABELS,
    type ExpenseCategory,
    type TripBudgetCategory,
} from "@/lib/budget";

const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none transition [color-scheme:dark] placeholder:text-slate-500 focus:border-lime-300/40 focus:bg-white/[0.12]";
const labelClass =
    "text-xs font-black uppercase tracking-[0.18em] text-lime-200";

type ExpenseCategoryPickerProps = {
    tripId: string;
    reportingCurrency: string;
    categories: TripBudgetCategory[];
    defaultBudgetCategoryId?: string | null;
    defaultExpenseCategory: ExpenseCategory;
};

export function ExpenseCategoryPicker({
    tripId,
    reportingCurrency,
    categories,
    defaultBudgetCategoryId = null,
    defaultExpenseCategory,
}: ExpenseCategoryPickerProps) {
    const fieldId = useId();
    const [availableCategories, setAvailableCategories] =
        useState<TripBudgetCategory[]>(categories);
    const initialCategoryId =
        (defaultBudgetCategoryId &&
        categories.some((category) => category.id === defaultBudgetCategoryId)
            ? defaultBudgetCategoryId
            : categories.find(
                  (category) =>
                      category.linked_expense_category === defaultExpenseCategory
              )?.id) ||
        categories[0]?.id ||
        "";
    const [selectedCategoryId, setSelectedCategoryId] =
        useState(initialCategoryId);
    const [fallbackCategory, setFallbackCategory] =
        useState<ExpenseCategory>(defaultExpenseCategory);
    const [isCreating, setIsCreating] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryType, setNewCategoryType] =
        useState<ExpenseCategory>(defaultExpenseCategory);
    const [shouldCreateBudgetLine, setShouldCreateBudgetLine] = useState(false);
    const [plannedAmount, setPlannedAmount] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const selectedCategory = availableCategories.find(
        (category) => category.id === selectedCategoryId
    );
    const submittedExpenseCategory =
        selectedCategory?.linked_expense_category || fallbackCategory;

    function closeCreator() {
        setIsCreating(false);
        setError("");
    }

    function saveCategory() {
        const name = newCategoryName.trim();
        const budgetAmount = Number(plannedAmount);

        if (!name) {
            setError("Enter a category name.");
            return;
        }
        if (
            shouldCreateBudgetLine &&
            (!Number.isFinite(budgetAmount) || budgetAmount <= 0)
        ) {
            setError("Enter a budget amount greater than zero.");
            return;
        }

        setError("");
        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("trip_id", tripId);
                formData.set("name", name);
                formData.set("linked_expense_category", newCategoryType);
                formData.set("reporting_currency", reportingCurrency);
                formData.set(
                    "create_budget_line",
                    shouldCreateBudgetLine ? "true" : "false"
                );
                if (shouldCreateBudgetLine) {
                    formData.set("planned_amount", plannedAmount);
                }

                const result = await createExpenseCategory(formData);
                setAvailableCategories((current) => {
                    const withoutSavedCategory = current.filter(
                        (category) => category.id !== result.category.id
                    );
                    return [...withoutSavedCategory, result.category].sort(
                        (first, second) => first.sort_order - second.sort_order
                    );
                });
                setSelectedCategoryId(result.category.id);
                setFallbackCategory(result.category.linked_expense_category);
                setNewCategoryName("");
                setPlannedAmount("");
                setShouldCreateBudgetLine(false);
                setIsCreating(false);
            } catch (saveError) {
                setError(
                    saveError instanceof Error
                        ? saveError.message
                        : "Could not create the category."
                );
            }
        });
    }

    return (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
            <input
                type="hidden"
                name="budget_category_id"
                value={selectedCategoryId}
            />
            <input
                type="hidden"
                name="category"
                value={submittedExpenseCategory}
            />
            <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-56 flex-1" htmlFor={`${fieldId}-category`}>
                    <span className={labelClass}>Category</span>
                    {availableCategories.length > 0 ? (
                        <select
                            id={`${fieldId}-category`}
                            value={selectedCategoryId}
                            onChange={(event) =>
                                setSelectedCategoryId(event.target.value)
                            }
                            className={`mt-2 ${inputClass}`}
                        >
                            {availableCategories.map((category) => (
                                <option
                                    key={category.id}
                                    value={category.id}
                                    className="bg-slate-950 text-white"
                                >
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select
                            id={`${fieldId}-category`}
                            value={fallbackCategory}
                            onChange={(event) =>
                                setFallbackCategory(
                                    event.target.value as ExpenseCategory
                                )
                            }
                            className={`mt-2 ${inputClass}`}
                        >
                            {Object.entries(
                                DEFAULT_EXPENSE_CATEGORY_LABELS
                            ).map(([value, label]) => (
                                <option
                                    key={value}
                                    value={value}
                                    className="bg-slate-950 text-white"
                                >
                                    {label}
                                </option>
                            ))}
                        </select>
                    )}
                </label>
                <button
                    type="button"
                    onClick={() => {
                        setIsCreating((current) => !current);
                        setError("");
                    }}
                    aria-expanded={isCreating}
                    className="inline-flex items-center gap-2 rounded-2xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100 transition hover:border-lime-300/50 hover:bg-lime-300/15"
                >
                    {isCreating ? (
                        <X className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isCreating
                        ? "Cancel new category"
                        : availableCategories.length > 0
                          ? "Add another category"
                          : "Add a category"}
                </button>
            </div>

            {isCreating ? (
                <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label htmlFor={`${fieldId}-name`}>
                            <span className={labelClass}>Category name</span>
                            <input
                                id={`${fieldId}-name`}
                                value={newCategoryName}
                                onChange={(event) =>
                                    setNewCategoryName(event.target.value)
                                }
                                maxLength={80}
                                placeholder="e.g. Tours"
                                className={`mt-2 ${inputClass}`}
                            />
                        </label>
                        <label htmlFor={`${fieldId}-type`}>
                            <span className={labelClass}>Group under</span>
                            <select
                                id={`${fieldId}-type`}
                                value={newCategoryType}
                                onChange={(event) =>
                                    setNewCategoryType(
                                        event.target.value as ExpenseCategory
                                    )
                                }
                                className={`mt-2 ${inputClass}`}
                            >
                                {Object.entries(
                                    DEFAULT_EXPENSE_CATEGORY_LABELS
                                ).map(([value, label]) => (
                                    <option
                                        key={value}
                                        value={value}
                                        className="bg-slate-950 text-white"
                                    >
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <input
                            type="checkbox"
                            checked={shouldCreateBudgetLine}
                            onChange={(event) =>
                                setShouldCreateBudgetLine(event.target.checked)
                            }
                            className="mt-1 h-4 w-4 accent-lime-300"
                        />
                        <span>
                            <span className="block text-sm font-black text-white">
                                Set a budget for this category
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-slate-400">
                                This adds a planned line to the trip budget. If no
                                budget exists yet, VAIVIA will create one.
                            </span>
                        </span>
                    </label>

                    {shouldCreateBudgetLine ? (
                        <label
                            className="block max-w-sm"
                            htmlFor={`${fieldId}-planned-amount`}
                        >
                            <span className={labelClass}>
                                Budget amount ({reportingCurrency})
                            </span>
                            <input
                                id={`${fieldId}-planned-amount`}
                                value={plannedAmount}
                                onChange={(event) =>
                                    setPlannedAmount(event.target.value)
                                }
                                inputMode="decimal"
                                placeholder="0.00"
                                className={`mt-2 ${inputClass}`}
                            />
                        </label>
                    ) : null}

                    {error ? (
                        <p
                            role="alert"
                            className="rounded-2xl border border-red-300/20 bg-red-300/10 p-3 text-sm font-semibold text-red-100"
                        >
                            {error}
                        </p>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeCreator}
                            disabled={isPending}
                            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/[0.1] disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={saveCategory}
                            disabled={isPending}
                            className="rounded-2xl bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-60"
                        >
                            {isPending ? "Creating…" : "Create category"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
