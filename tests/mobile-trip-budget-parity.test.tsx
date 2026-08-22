import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";
import { TripBudgetScreen } from "@/mobile/src/screens/TripBudgetScreen";

const detail: MobileTripDetailResponse = {
  trip: {
    id: "trip-1",
    slug: "montreal-weekend",
    title: "Montreal weekend",
    destination: "Montreal, Quebec",
    start_date: "2026-09-10",
    end_date: "2026-09-14",
    cover_image_url: "https://images.example.com/montreal.jpg",
    cover_image_source: "unsplash",
    cover_image_photographer_name: "A Photographer",
    cover_image_photographer_url: "https://example.com/photographer",
    notes: null,
    membershipRole: "owner",
  },
  overview: {
    locations: [],
    going: [],
    invited: [],
    displayStartDate: "2026-09-10",
    displayEndDate: "2026-09-14",
    missingDateLabel: "Add a leg",
    transportation: [],
    stays: [],
    budget: { currency: "CAD", budgeted: 2000, spent: 450, hasBudget: true },
  },
  itinerary: [],
  itineraryTimezones: [],
  ideas: [],
  budget: {
    budget: {
      id: "budget-1",
      trip_id: "trip-1",
      name: "Montreal budget",
      reporting_currency: "CAD",
      total_budget_amount: 2000,
      is_active: true,
    },
    lineItems: [
      {
        id: "line-1",
        budget_id: "budget-1",
        trip_id: "trip-1",
        category_id: "category-1",
        name: "Entertainment",
        linked_expense_category: "entertainment",
        planned_amount: 500,
        currency: "CAD",
        sort_order: 0,
      },
    ],
    expenses: [
      {
        id: "expense-1",
        trip_id: "trip-1",
        expense_date: "2026-09-11",
        description: "Museum tickets",
        category: "entertainment",
        budget_category_id: "category-1",
        amount: 450,
        currency: "CAD",
        reporting_currency: "CAD",
        exchange_rate_used: 1,
        exchange_rate_is_manual: false,
        amount_in_reporting_currency: 450,
        paid_by_trip_member_id: "member-1",
        paid_by_user_id: "user-1",
        split_method: "equal",
        source_type: "manual",
      },
    ],
    splits: [
      {
        id: "split-1",
        expense_id: "expense-1",
        trip_id: "trip-1",
        participant_kind: "member",
        trip_member_id: "member-1",
        split_amount: 225,
        currency: "CAD",
        amount_in_reporting_currency: 225,
        is_included: true,
      },
      {
        id: "split-2",
        expense_id: "expense-1",
        trip_id: "trip-1",
        participant_kind: "member",
        trip_member_id: "member-2",
        split_amount: 225,
        currency: "CAD",
        amount_in_reporting_currency: 225,
        is_included: true,
      },
    ],
    settlementPayments: [],
    participants: [
      {
        id: "member-1",
        kind: "member",
        label: "Alex Rivera",
        userId: "user-1",
        tripMemberId: "member-1",
        isCurrentUser: true,
      },
      {
        id: "member-2",
        kind: "member",
        label: "Blair Chen",
        userId: "user-2",
        tripMemberId: "member-2",
      },
    ],
    defaultCurrency: "CAD",
  },
};

function renderBudget(payload: MobileTripDetailResponse = detail) {
  const apiClient = {
    getTrip: vi.fn().mockResolvedValue(payload),
  } as unknown as MobileApiClient;
  return render(<TripBudgetScreen apiClient={apiClient} tripId="trip-1" />);
}

afterEach(() => cleanup());

describe("mobile Trip Budget strict visual parity", () => {
  it.each([320, 375, 390, 430])(
    "renders the shared responsive Budget presentation at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      renderBudget();

      const budgetHeadings = await screen.findAllByRole("heading", {
        name: "Budget",
      });
      expect(budgetHeadings.at(-1)).toHaveClass(
        "text-5xl",
        "font-black",
        "tracking-tight",
      );
      expect(document.querySelector('[data-budget-presentation="budget"]')).toHaveClass(
        "space-y-6",
      );
      expect(screen.getByText("Total budget")).toHaveClass(
        "tracking-[0.22em]",
      );
      expect(screen.getByText("Category budgets")).toHaveClass("font-black");
      expect(screen.getByRole("table")).toHaveClass("min-w-[720px]");
      expect(screen.getByRole("button", { name: "Edit budget" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Add expense" })).toBeEnabled();
      expect(document.querySelector("main")).toHaveClass("overflow-x-clip");
    },
  );

  it("switches to the exact shared Expenses presentation with chart and rows", async () => {
    renderBudget();
    await screen.findAllByRole("heading", { name: "Budget" });
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));

    expect(screen.getByRole("heading", { name: "Expenses" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Expense distribution across 1 categories",
      }),
    ).toHaveClass("border-[#140a1f]", "bg-clip-padding");
    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-[1080px]");
    expect(within(table).getByText("Museum tickets")).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "Edit expense Museum tickets" }),
    ).toBeEnabled();
    expect(screen.getByText("Blair Chen owes Me")).toBeInTheDocument();
  });

  it("renders the shared no-budget and no-expenses states", async () => {
    renderBudget({
      ...detail,
      budget: {
        ...detail.budget,
        budget: null,
        lineItems: [],
        expenses: [],
        splits: [],
      },
    });
    expect(await screen.findByText("No budget yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    expect(screen.getByText("No expenses yet.")).toBeInTheDocument();
  });
});
