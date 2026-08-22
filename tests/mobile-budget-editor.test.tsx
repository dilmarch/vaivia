import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseEditorPresentation } from "@/components/budget/BudgetMutationPresentation";

afterEach(cleanup);

describe("shared mobile budget mutation presentation", () => {
  it("submits payer, participants, currency, and exact split values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpenseEditorPresentation
        tripId="trip-1"
        reportingCurrency="CAD"
        lineItems={[{
          id: "line-1", budget_id: "budget-1", trip_id: "trip-1", category_id: "category-1",
          name: "Food", linked_expense_category: "food", planned_amount: 200, currency: "CAD", sort_order: 0,
        }]}
        participants={[
          { id: "member-1", kind: "member", label: "Alex", userId: "user-1", tripMemberId: "member-1", isCurrentUser: true },
          { id: "member-2", kind: "member", label: "Blair", userId: "user-2", tripMemberId: "member-2" },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Dinner" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10.01" } });
    fireEvent.change(screen.getByLabelText("Split method"), { target: { value: "exact" } });
    expect(screen.getByRole("checkbox", { name: /Blair/ })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Alex amount"), { target: { value: "5.01" } });
    fireEvent.change(screen.getByLabelText("Blair amount"), { target: { value: "5.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      description: "Dinner",
      amount: "10.01",
      reportingCurrency: "CAD",
      splitMethod: "exact",
      paidBy: "member:member-1",
      splits: [
        { participantValue: "member:member-1", amount: "5.01" },
        { participantValue: "member:member-2", amount: "5.00" },
      ],
    });
  });
});
