import { createSettlementForUser, parseSettlementMutationInput } from "@/lib/budget/mutations";
import { budgetMutationErrorResponse } from "@/lib/budget/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const body = (await readJsonObject(request)) || {};
  const tripId = typeof body.tripId === "string" ? body.tripId.trim() : "";
  if (!tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip is required." });
  try {
    return mobileSuccess(request, await createSettlementForUser({ supabase: context.supabase, userId: context.user.id, tripId, input: parseSettlementMutationInput(body) }), { status: 201 });
  } catch (error) {
    return budgetMutationErrorResponse(request, error);
  }
}
