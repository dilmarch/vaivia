import {
  createExpenseForUser,
  parseExpenseMutationInput,
} from "@/lib/budget/mutations";
import { budgetMutationErrorResponse } from "@/lib/budget/mobileResponse";
import { authenticateMobileRequest, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  const body = (await readJsonObject(request)) || {};
  try {
    const result = await createExpenseForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      input: parseExpenseMutationInput(body),
    });
    return mobileSuccess(request, result, { status: 201 });
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}
