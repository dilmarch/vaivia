"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import { AddExpenseModal } from "@/components/budget/BudgetFeatureClient";
import type {
    BudgetParticipant,
    TripBudgetCategory,
    TripBudgetLineItem,
} from "@/lib/budget";

type ExpenseFormContext = {
    tripId: string;
    reportingCurrency: string;
    budgetCategories: TripBudgetLineItem[];
    expenseCategories: TripBudgetCategory[];
    participants: BudgetParticipant[];
};

export default function QuickAddExpenseModal({
    tripId,
    onClose,
}: {
    tripId: string;
    onClose: () => void;
}) {
    const [context, setContext] = useState<ExpenseFormContext | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function loadContext() {
            try {
                const response = await fetch(
                    `/api/trips/${encodeURIComponent(tripId)}/expense-form`,
                    { cache: "no-store", signal: controller.signal }
                );
                const payload = (await response.json()) as
                    | ExpenseFormContext
                    | { error?: string };

                if (!response.ok || !("participants" in payload)) {
                    throw new Error(
                        "error" in payload && payload.error
                            ? payload.error
                            : "Could not load the expense form."
                    );
                }

                setContext(payload);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Could not load the expense form."
                );
            }
        }

        void loadContext();
        return () => controller.abort();
    }, [tripId]);

    if (context) {
        return (
            <AddExpenseModal
                tripId={context.tripId}
                reportingCurrency={context.reportingCurrency}
                budgetCategories={context.budgetCategories}
                expenseCategories={context.expenseCategories}
                participants={context.participants}
                onClose={onClose}
            />
        );
    }

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-lg"
            labelledBy="quick-add-expense-loading-title"
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Budget</p>
                            <h2
                                id="quick-add-expense-loading-title"
                                className="vaivia-modal-title"
                            >
                                Add expense
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close add expense"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="vaivia-modal-body">
                        {error ? (
                            <p className="rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm font-semibold text-red-100">
                                {error}
                            </p>
                        ) : (
                            <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm font-semibold text-slate-300">
                                Loading trip members and budget details…
                            </p>
                        )}
                    </div>
                </>
            )}
        </AnimatedModal>
    );
}
