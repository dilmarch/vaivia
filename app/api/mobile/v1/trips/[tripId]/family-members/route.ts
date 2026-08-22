import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { setTripFamilyMember } from "@/lib/trips/collaboration";
import { readJsonObject, tripMutationErrorResponse } from "@/lib/trips/mobileResponse";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, DELETE, OPTIONS");
}

async function mutate(request: Request, context: RouteContext, included: boolean) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = await readJsonObject(request);
  if (!body || typeof body.familyMemberId !== "string") {
    return mobileError(request, { status: 400, code: "validation_error", message: "Family member is required." });
  }
  try {
    return mobileSuccess(request, await setTripFamilyMember({
      supabase: auth.supabase,
      userId: auth.user.id,
      tripId: (await context.params).tripId,
      familyMemberId: body.familyMemberId,
      included,
    }));
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}

export function POST(request: Request, context: RouteContext) {
  return mutate(request, context, true);
}

export function DELETE(request: Request, context: RouteContext) {
  return mutate(request, context, false);
}
