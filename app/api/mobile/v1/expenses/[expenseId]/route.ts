import {
  deleteExpenseForUser,
  duplicateExpenseForUser,
  parseExpenseMutationInput,
  updateExpenseForUser,
} from "@/lib/budget/mutations";
import { budgetMutationErrorResponse } from "@/lib/budget/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ expenseId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, PATCH, DELETE, OPTIONS");
}

function tripIdFrom(body: Record<string, unknown>) {
  return typeof body.tripId === "string" ? body.tripId.trim() : "";
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { expenseId } = await params;
  const body = (await readJsonObject(request)) || {};
  const tripId = tripIdFrom(body);
  if (!tripId || body.operation !== "duplicate") return mobileError(request, { status: 422, code: "validation_error", message: "Trip and duplicate operation are required." });
  try {
    return mobileSuccess(request, await duplicateExpenseForUser({ supabase: context.supabase, userId: context.user.id, tripId, expenseId }), { status: 201 });
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { expenseId } = await params;
  const body = (await readJsonObject(request)) || {};
  const tripId = tripIdFrom(body);
  try {
    return mobileSuccess(request, await updateExpenseForUser({ supabase: context.supabase, userId: context.user.id, tripId, expenseId, input: parseExpenseMutationInput(body) }));
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { expenseId } = await params;
  const body = (await readJsonObject(request)) || {};
  const tripId = tripIdFrom(body);
  try {
    return mobileSuccess(request, await deleteExpenseForUser({ supabase: context.supabase, userId: context.user.id, tripId, expenseId }));
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}
