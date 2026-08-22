import { describe, expect, it, vi } from "vitest";
import {
  BudgetMutationError,
  createSettlementForUser,
  calculateBudgetSplitAmounts,
  roundBudgetMoney,
  splitBudgetEvenly,
} from "@/lib/budget/mutations";
import { MobileApiClient } from "@/mobile/src/lib/apiClient";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return builder;
}

describe("shared budget mutation rules", () => {
  it("preserves cents and deterministic remainder assignment", () => {
    expect(splitBudgetEvenly(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(splitBudgetEvenly(-10, 3)).toEqual([-3.33, -3.33, -3.34]);
    expect(roundBudgetMoney(10.005)).toBe(10.01);
    expect(calculateBudgetSplitAmounts(10.01, "percentage", [
      { amount: 0, percentage: 50 },
      { amount: 0, percentage: 50 },
    ]).amounts).toEqual([5.01, 5.01]);
    expect(() => calculateBudgetSplitAmounts(10, "exact", [
      { amount: 4, percentage: 0 },
      { amount: 5, percentage: 0 },
    ])).toThrow("Exact split amounts must add up");
  });

  it("rejects a settlement before insert when the user cannot access the trip", async () => {
    const trip = query({ data: { id: "trip-1", user_id: "owner-1", archived_at: null }, error: null });
    const member = query({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(trip).mockReturnValueOnce(member);
    await expect(createSettlementForUser({
      supabase: { from } as never,
      userId: "outsider-1",
      tripId: "trip-1",
      input: { paidByParticipantValue: "member:a", receivedByParticipantValue: "member:b", amount: 10, reportingCurrency: "CAD" },
    })).rejects.toMatchObject<Partial<BudgetMutationError>>({ status: 403, code: "forbidden" });
    expect(from).toHaveBeenCalledTimes(2);
  });
});

describe("mobile budget API client", () => {
  it("sends authenticated expense mutations to narrow endpoints", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ data: { expense: { id: "expense-1" } } }), { status: 201 }));
    const client = new MobileApiClient({
      baseUrl: "https://vaivia.app",
      getAuthState: () => ({ sessionExists: true, accessToken: "safe-test-token", authenticatedUserId: "user-1" }),
      fetchImplementation,
    });
    await client.createExpense("trip-1", {
      description: "Dinner",
      amount: "10.00",
      currency: "USD",
      reportingCurrency: "CAD",
      manualExchangeRate: "1.34",
      splitMethod: "equal",
      paidBy: "member_user:user-2",
      splits: [
        { participantValue: "member_user:user-1" },
        { participantValue: "member_user:user-2" },
      ],
    }, { idempotencyKey: "expense-submit-1" });
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vaivia.app/api/mobile/v1/trips/trip-1/expenses");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer safe-test-token");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("expense-submit-1");
    expect(JSON.parse(String(init.body))).toMatchObject({
      description: "Dinner",
      currency: "USD",
      reportingCurrency: "CAD",
      manualExchangeRate: "1.34",
      splitMethod: "equal",
      paidBy: "member_user:user-2",
    });
  });

  it("uses scoped endpoints for update, duplicate, delete, budget, and settlement", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const client = new MobileApiClient({ baseUrl: "https://vaivia.app", getAuthState: () => ({ sessionExists: true, accessToken: "token", authenticatedUserId: "user-1" }), fetchImplementation });
    await client.updateBudget("trip-1", { budgetId: "budget-1", name: "Summer" });
    await client.updateExpense("trip-1", "expense-1", { description: "Train", amount: 12 });
    await client.duplicateExpense("trip-1", "expense-1");
    await client.deleteExpense("trip-1", "expense-1");
    await client.createSettlement({ tripId: "trip-1", paidByParticipantValue: "member:a", receivedByParticipantValue: "member:b", amount: 5 });
    expect(fetchImplementation.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "PATCH https://vaivia.app/api/mobile/v1/trips/trip-1/budget",
      "PATCH https://vaivia.app/api/mobile/v1/expenses/expense-1",
      "POST https://vaivia.app/api/mobile/v1/expenses/expense-1",
      "DELETE https://vaivia.app/api/mobile/v1/expenses/expense-1",
      "POST https://vaivia.app/api/mobile/v1/settlements",
    ]);
  });
});
