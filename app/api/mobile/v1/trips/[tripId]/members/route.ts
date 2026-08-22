import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { removeTripMember, updateTripMemberScope } from "@/lib/trips/collaboration";
import { readJsonObject, tripMutationErrorResponse } from "@/lib/trips/mobileResponse";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "PATCH, DELETE, OPTIONS");
}

async function parse(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return { response: auth } as const;
  const body = await readJsonObject(request);
  if (!body) return {
    response: mobileError(request, { status: 400, code: "validation_error", message: "Member details are required." }),
  } as const;
  return { auth, body, tripId: (await context.params).tripId } as const;
}

export async function PATCH(request: Request, context: RouteContext) {
  const value = await parse(request, context);
  if ("response" in value) return value.response;
  try {
    return mobileSuccess(request, await updateTripMemberScope({
      supabase: value.auth.supabase,
      userId: value.auth.user.id,
      tripId: value.tripId,
      tripMemberId: typeof value.body.tripMemberId === "string" ? value.body.tripMemberId : "",
      startDate: typeof value.body.startDate === "string" ? value.body.startDate : null,
      endDate: typeof value.body.endDate === "string" ? value.body.endDate : null,
      legIds: Array.isArray(value.body.legIds) ? value.body.legIds.filter((id): id is string => typeof id === "string") : [],
    }));
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const value = await parse(request, context);
  if ("response" in value) return value.response;
  try {
    return mobileSuccess(request, await removeTripMember({
      supabase: value.auth.supabase,
      userId: value.auth.user.id,
      tripId: value.tripId,
      memberUserId: typeof value.body.memberUserId === "string" ? value.body.memberUserId : "",
    }));
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}
