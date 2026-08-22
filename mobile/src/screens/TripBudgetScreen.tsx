import { useEffect, useRef, useState } from "react";
import {
  BudgetFeaturePresentation,
  BudgetLoadingPresentation,
  type BudgetPresentationMode,
} from "@/components/budget/BudgetPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import {
  BudgetEditorPresentation,
  ExpenseEditorPresentation,
  SettlementEditorPresentation,
} from "@/components/budget/BudgetMutationPresentation";
import type { BudgetSettlement } from "@/components/budget/BudgetPresentation";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripBudgetScreen({
  apiClient,
  tripId,
  editorAction,
  onEditorAction,
  onEditorClose,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  editorAction?: string;
  onEditorAction?: (action: string) => void;
  onEditorClose?: () => void;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [mode, setMode] = useState<BudgetPresentationMode>("budget");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [suggestedSettlement, setSuggestedSettlement] = useState<BudgetSettlement | null>(null);
  const mutationKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    mutationKeyRef.current = crypto.randomUUID();
    setMutationError("");
  }, [editorAction]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");
    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load trip budget.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip budget"
          />
        </header>
        <BudgetLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Budget unavailable"
          message={errorMessage || "This trip budget could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const selectedExpenseId = editorAction?.startsWith("edit-expense:") || editorAction?.startsWith("duplicate-expense:")
    ? editorAction.split(":")[1]
    : null;
  const selectedExpense = selectedExpenseId ? data.budget.expenses.find((expense) => expense.id === selectedExpenseId) || null : null;
  const selectedSplits = selectedExpenseId ? data.budget.splits.filter((split) => split.expense_id === selectedExpenseId) : [];

  async function mutate(operation: () => Promise<unknown>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMutationError("");
    try {
      await operation();
      setReloadKey((key) => key + 1);
      onEditorClose?.();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The budget change could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={data.trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
        >
          <TripHeaderTitlePresentation
            tripTitle={data.trip.title || "Untitled trip"}
            pageLabel="Budget"
          />
        </TripHeaderPresentation>
      </header>

      <BudgetFeaturePresentation
        mode={mode}
        data={{
          tripId,
          tripTitle:
            data.trip.title || data.trip.destination || "Untitled trip",
          ...data.budget,
        }}
        actions={{
          onModeChange: setMode,
          onCreateBudget: () => onEditorAction?.("create-budget"),
          onEditBudget: () => onEditorAction?.("edit-budget"),
          onAddExpense: () => onEditorAction?.("add-expense"),
          onSettleUp: (suggested) => {
            setSuggestedSettlement(suggested || null);
            onEditorAction?.("settle");
          },
          onEditExpense: (expense) => onEditorAction?.(`edit-expense:${expense.id}`),
          onDuplicateExpense: (expense) => onEditorAction?.(`duplicate-expense:${expense.id}`),
          onDeleteExpense: (expense) => {
            if (!window.confirm(`Delete “${expense.description}”? This cannot be undone.`)) return;
            void mutate(() => apiClient.deleteExpense(tripId, expense.id, { idempotencyKey: `delete-expense:${expense.id}` }));
          },
        }}
      />
      {editorAction === "create-budget" || editorAction === "edit-budget" ? (
        <BudgetEditorPresentation
          mode={editorAction}
          tripTitle={data.trip.title || data.trip.destination || "Trip"}
          budget={data.budget.budget}
          lineItems={data.budget.lineItems}
          defaultCurrency={data.budget.defaultCurrency}
          isSubmitting={isSubmitting}
          errorMessage={mutationError}
          onClose={() => onEditorClose?.()}
          onSubmit={(input) => void mutate(() => editorAction === "create-budget" ? apiClient.createBudget(tripId, input, { idempotencyKey: mutationKeyRef.current }) : apiClient.updateBudget(tripId, input, { idempotencyKey: mutationKeyRef.current }))}
        />
      ) : null}
      {editorAction === "add-expense" || selectedExpense ? (
        <ExpenseEditorPresentation
          tripId={tripId}
          reportingCurrency={data.budget.budget?.reporting_currency || data.budget.defaultCurrency}
          lineItems={data.budget.lineItems}
          participants={data.budget.participants}
          expense={selectedExpense}
          expenseSplits={selectedSplits}
          isSubmitting={isSubmitting}
          errorMessage={mutationError}
          onClose={() => onEditorClose?.()}
          onSubmit={(input) => void mutate(() => editorAction?.startsWith("edit-expense:") && selectedExpense ? apiClient.updateExpense(tripId, selectedExpense.id, input, { idempotencyKey: mutationKeyRef.current }) : apiClient.createExpense(tripId, input, { idempotencyKey: mutationKeyRef.current }))}
        />
      ) : null}
      {editorAction === "settle" ? (
        <SettlementEditorPresentation
          tripId={tripId}
          reportingCurrency={data.budget.budget?.reporting_currency || data.budget.defaultCurrency}
          participants={data.budget.participants}
          suggested={suggestedSettlement}
          isSubmitting={isSubmitting}
          errorMessage={mutationError}
          onClose={() => onEditorClose?.()}
          onSubmit={(input) => void mutate(() => apiClient.createSettlement(input, { idempotencyKey: mutationKeyRef.current }))}
        />
      ) : null}
    </main>
  );
}
