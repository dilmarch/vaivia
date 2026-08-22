import {
  createBudgetForUser,
  parseBudgetMutationInput,
  updateBudgetForUser,
} from "@/lib/budget/mutations";
import { budgetMutationErrorResponse } from "@/lib/budget/mobileResponse";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, PATCH, OPTIONS");
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  const body = (await readJsonObject(request)) || {};
  try {
    const result = await createBudgetForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      tripTitle: typeof body.tripTitle === "string" ? body.tripTitle : undefined,
      input: parseBudgetMutationInput(body),
    });
    return mobileSuccess(request, result, { status: 201 });
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  const body = (await readJsonObject(request)) || {};
  const budgetId = typeof body.budgetId === "string" ? body.budgetId.trim() : "";
  if (!budgetId) return mobileError(request, { status: 422, code: "validation_error", message: "Budget is required." });
  try {
    return mobileSuccess(request, await updateBudgetForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      budgetId,
      input: parseBudgetMutationInput(body),
    }));
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}
