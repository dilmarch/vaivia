import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalQuickAdd from "@/components/GlobalQuickAdd";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import BudgetFeatureClient, {
    AddExpenseModal,
} from "@/components/budget/BudgetFeatureClient";
import type { BudgetParticipant, TripExpense } from "@/lib/budget";
import type { TripAudienceOption } from "@/lib/tripAudience";

const routerPush = vi.fn();
const { createExpenseCategoryMock } = vi.hoisted(() => ({
    createExpenseCategoryMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/accommodations",
    useRouter: () => ({
        push: routerPush,
        replace: vi.fn(),
        refresh: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/budget", () => ({
    createBudget: vi.fn(),
    createExpense: vi.fn(),
    createExpenseCategory: createExpenseCategoryMock,
    createExpenseSettlement: vi.fn(),
    deleteExpense: vi.fn(),
    updateBudget: vi.fn(),
    updateExpense: vi.fn(),
}));

const audienceOptions: TripAudienceOption[] = [
    {
        kind: "member",
        id: "member-a",
        displayName: "Alex",
        isCurrentUser: true,
        status: "accepted",
    },
    {
        kind: "member",
        id: "member-b",
        displayName: "Blair",
        status: "accepted",
    },
];

const participants: BudgetParticipant[] = [
    {
        id: "member-a",
        kind: "member",
        label: "Alex",
        tripMemberId: "member-a",
        userId: "user-a",
        isCurrentUser: true,
    },
    {
        id: "member-b",
        kind: "member",
        label: "Blair",
        tripMemberId: "member-b",
        userId: "user-b",
    },
];

function jsonResponse(body: unknown) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    );
}

beforeEach(() => {
    routerPush.mockClear();
    createExpenseCategoryMock.mockReset();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("expense entry", () => {
    it("selects every trip participant when equal split is chosen on linked costs", () => {
        render(
            <CostAllocationFields
                amount="100"
                participants={audienceOptions}
                currentUserTripMemberId="member-a"
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /equal split/i }));

        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(2);
        checkboxes.forEach((checkbox) => {
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeEnabled();
        });
    });

    it("selects every trip participant when equal split is chosen in add expense", () => {
        render(
            <AddExpenseModal
                tripId="trip-a"
                reportingCurrency="CAD"
                participants={participants}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /equal split/i }));

        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes).toHaveLength(2);
        checkboxes.forEach((checkbox) => expect(checkbox).toBeChecked());
    });

    it("creates and selects an additional category with an optional budget line", async () => {
        createExpenseCategoryMock.mockResolvedValueOnce({
            category: {
                id: "category-tours",
                trip_id: "trip-a",
                name: "Tours",
                linked_expense_category: "entertainment",
                sort_order: 2,
                is_default: false,
                is_archived: false,
            },
            lineItem: {
                id: "line-tours",
                budget_id: "budget-a",
                trip_id: "trip-a",
                category_id: "category-tours",
                name: "Tours",
                linked_expense_category: "entertainment",
                planned_amount: 300,
                currency: "CAD",
                sort_order: 2,
            },
        });

        render(
            <AddExpenseModal
                tripId="trip-a"
                reportingCurrency="CAD"
                expenseCategories={[
                    {
                        id: "category-food",
                        trip_id: "trip-a",
                        name: "Food",
                        linked_expense_category: "food",
                        sort_order: 1,
                        is_default: true,
                        is_archived: false,
                    },
                ]}
                participants={participants}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Add another category" })
        );
        fireEvent.change(screen.getByLabelText("Category name"), {
            target: { value: "Tours" },
        });
        fireEvent.change(screen.getByLabelText("Group under"), {
            target: { value: "entertainment" },
        });
        fireEvent.click(
            screen.getByRole("checkbox", {
                name: /set a budget for this category/i,
            })
        );
        fireEvent.change(screen.getByLabelText("Budget amount (CAD)"), {
            target: { value: "300" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Create category" })
        );

        await waitFor(() =>
            expect(createExpenseCategoryMock).toHaveBeenCalledTimes(1)
        );
        const submittedFormData = createExpenseCategoryMock.mock
            .calls[0][0] as FormData;
        expect(submittedFormData.get("name")).toBe("Tours");
        expect(submittedFormData.get("linked_expense_category")).toBe(
            "entertainment"
        );
        expect(submittedFormData.get("create_budget_line")).toBe("true");
        expect(submittedFormData.get("planned_amount")).toBe("300");
        await waitFor(() =>
            expect(screen.getByLabelText("Category")).toHaveValue(
                "category-tours"
            )
        );
    });

    it("opens add expense in place from quick add without routing away", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                jsonResponse({
                    tripId: "trip-a",
                    reportingCurrency: "CAD",
                    budgetCategories: [],
                    participants,
                })
            )
        );

        render(
            <GlobalQuickAdd
                trips={[{ id: "trip-a", title: "Japan", slug: "japan" }]}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Open quick add menu" })
        );
        fireEvent.click(screen.getByRole("button", { name: "Add expense" }));

        await screen.findByRole("heading", { name: "Add expense" });
        expect(routerPush).not.toHaveBeenCalled();
    });

    it("shows linked expense controls on scheduled events and equally selects everyone", () => {
        render(
            <ItineraryItemForm
                tripId="trip-a"
                initialItem={{
                    title: "Museum visit",
                    item_date: "2026-07-19",
                }}
                submitAction={vi.fn()}
                audienceOptions={audienceOptions}
                currentUserTripMemberId="member-a"
                onClose={vi.fn()}
            />
        );

        const expensesHeading = screen.getByRole("heading", {
            name: "Expenses",
        });
        const expensesSection = expensesHeading.closest("section");
        expect(expensesSection).not.toBeNull();

        const expenseControls = within(expensesSection as HTMLElement);
        fireEvent.change(expenseControls.getByLabelText("Amount, optional"), {
            target: { value: "120" },
        });
        fireEvent.click(
            expenseControls.getByRole("button", { name: /equal split/i })
        );

        const participantCheckboxes = expenseControls.getAllByRole("checkbox");
        expect(participantCheckboxes).toHaveLength(2);
        participantCheckboxes.forEach((checkbox) => {
            expect(checkbox).toBeChecked();
        });
    });

    it("matches a new scheduled event timezone to its itinerary date and allows an override", () => {
        const submitAction = vi.fn();
        const view = render(
            <ItineraryItemForm
                tripId="trip-a"
                submitAction={submitAction}
                itineraryTimezoneHints={{
                    "2026-09-02": "America/Toronto",
                }}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Add itinerary item" })
        );
        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-09-02" },
        });

        const timezoneSelect = screen.getByLabelText("Time zone");
        expect(timezoneSelect).toHaveValue("America/Toronto");
        expect(
            screen.getByText(
                "Time zone matched to this date from your itinerary. You can override it."
            )
        ).toBeInTheDocument();

        fireEvent.change(timezoneSelect, {
            target: { value: "America/Vancouver" },
        });

        expect(timezoneSelect).toHaveValue("America/Vancouver");
        expect(
            screen.getByText("You can manually override the time zone.")
        ).toBeInTheDocument();

        view.rerender(
            <ItineraryItemForm
                tripId="trip-a"
                submitAction={submitAction}
                itineraryTimezoneHints={{
                    "2026-09-02": "America/Toronto",
                }}
            />
        );

        expect(timezoneSelect).toHaveValue("America/Vancouver");
    });
});

describe("expense reporting", () => {
    it("uses VAIVIA-styled participant menus in the settle up modal", async () => {
        const expense: TripExpense = {
            id: "expense-a",
            trip_id: "trip-a",
            expense_date: "2026-07-19",
            description: "Museum",
            category: "entertainment",
            amount: 100,
            currency: "CAD",
            reporting_currency: "CAD",
            exchange_rate_used: 1,
            exchange_rate_is_manual: false,
            amount_in_reporting_currency: 100,
            paid_by_trip_member_id: "member-a",
            split_method: "equal",
            source_type: "manual",
        };

        render(
            <BudgetFeatureClient
                tripId="trip-a"
                tripTitle="Japan"
                budget={null}
                lineItems={[]}
                expenses={[expense]}
                splits={[
                    {
                        id: "split-a",
                        expense_id: "expense-a",
                        trip_id: "trip-a",
                        participant_kind: "member",
                        trip_member_id: "member-a",
                        split_amount: 50,
                        currency: "CAD",
                        amount_in_reporting_currency: 50,
                        is_included: true,
                    },
                    {
                        id: "split-b",
                        expense_id: "expense-a",
                        trip_id: "trip-a",
                        participant_kind: "member",
                        trip_member_id: "member-b",
                        split_amount: 50,
                        currency: "CAD",
                        amount_in_reporting_currency: 50,
                        is_included: true,
                    },
                ]}
                participants={participants}
                defaultCurrency="CAD"
                mode="expenses"
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Settle up" }));

        const dialog = screen.getByRole("dialog", { name: "Settle up" });
        expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();

        const sentByTrigger = within(dialog).getByRole("button", {
            name: "Sent by: Blair",
        });
        const sentToTrigger = within(dialog).getByRole("button", {
            name: "Sent to: Me",
        });
        expect(sentByTrigger).toHaveClass("rounded-2xl", "bg-white/[0.08]");
        expect(sentToTrigger).toHaveClass("rounded-2xl", "bg-white/[0.08]");
        const cancelButton = within(dialog).getByRole("button", {
            name: "Cancel",
        });
        expect(cancelButton).toHaveClass("vaivia-settle-up-cancel");
        expect(cancelButton.closest(".vaivia-settle-up-footer")).not.toBeNull();

        fireEvent.keyDown(sentByTrigger, { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitemradio", { name: "Me" }));

        expect(
            within(dialog).getByRole("button", { name: "Sent by: Me" })
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Sent to: Blair" })
        ).toBeInTheDocument();
        expect(
            dialog.querySelector<HTMLInputElement>(
                'input[name="paid_by_participant_value"]'
            )?.value
        ).toBe("member:member-a");
        expect(
            dialog.querySelector<HTMLInputElement>(
                'input[name="received_by_participant_value"]'
            )?.value
        ).toBe("member:member-b");
    });

    it("applies recorded settlements and renders the category distribution", async () => {
        const expense: TripExpense = {
            id: "expense-a",
            trip_id: "trip-a",
            expense_date: "2026-07-19",
            description: "Museum",
            category: "entertainment",
            amount: 100,
            currency: "CAD",
            reporting_currency: "CAD",
            exchange_rate_used: 1,
            exchange_rate_is_manual: false,
            amount_in_reporting_currency: 100,
            paid_by_trip_member_id: "member-a",
            split_method: "equal",
            source_type: "manual",
        };

        render(
            <BudgetFeatureClient
                tripId="trip-a"
                tripTitle="Japan"
                budget={null}
                lineItems={[]}
                expenses={[expense]}
                splits={[
                    {
                        id: "split-a",
                        expense_id: "expense-a",
                        trip_id: "trip-a",
                        participant_kind: "member",
                        trip_member_id: "member-a",
                        split_amount: 50,
                        currency: "CAD",
                        amount_in_reporting_currency: 50,
                        is_included: true,
                    },
                    {
                        id: "split-b",
                        expense_id: "expense-a",
                        trip_id: "trip-a",
                        participant_kind: "member",
                        trip_member_id: "member-b",
                        split_amount: 50,
                        currency: "CAD",
                        amount_in_reporting_currency: 50,
                        is_included: true,
                    },
                ]}
                settlementPayments={[
                    {
                        id: "settlement-a",
                        trip_id: "trip-a",
                        paid_by_participant_value: "member:member-b",
                        received_by_participant_value: "member:member-a",
                        amount: 50,
                        reporting_currency: "CAD",
                        settled_on: "2026-07-19",
                        created_by: "user-b",
                    },
                ]}
                participants={participants}
                defaultCurrency="CAD"
                mode="expenses"
            />
        );

        expect(screen.getByText("Everyone is settled up.")).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Where the trip money went" })
        ).toBeInTheDocument();
        expect(
            screen.getByRole("img", {
                name: "Expense distribution across 1 categories",
            })
        ).toHaveClass("border-[#140a1f]", "bg-clip-padding");
        expect(screen.getAllByText("Entertainment").length).toBeGreaterThan(0);
    });
});
