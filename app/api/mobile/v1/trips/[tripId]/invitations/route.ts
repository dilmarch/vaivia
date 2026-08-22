import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import {
  cancelTripInvitation,
  createTripInvitation,
  updateInvitationLegs,
} from "@/lib/trips/collaboration";
import { readJsonObject, tripMutationErrorResponse } from "@/lib/trips/mobileResponse";
import { processExternalInviteEmailOutbox } from "@/lib/externalInviteEmails";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, PATCH, DELETE, OPTIONS");
}

async function requestContext(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return { response: auth } as const;
  const { tripId } = await context.params;
  const body = await readJsonObject(request);
  if (!body) {
    return {
      response: mobileError(request, {
        status: 400,
        code: "validation_error",
        message: "Invitation details are required.",
      }),
    } as const;
  }
  return { auth, tripId, body } as const;
}

export async function POST(request: Request, context: RouteContext) {
  const value = await requestContext(request, context);
  if ("response" in value) return value.response;
  try {
    const result = await createTripInvitation({
      supabase: value.auth.supabase,
      userId: value.auth.user.id,
      tripId: value.tripId,
      input: value.body,
    });
    try {
      await processExternalInviteEmailOutbox(10);
    } catch (error) {
      console.warn("Mobile trip invitation email processing was deferred:", {
        message: error instanceof Error ? error.message : "Unknown processing error",
      });
    }
    return mobileSuccess(request, result, { status: 201 });
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const value = await requestContext(request, context);
  if ("response" in value) return value.response;
  try {
    return mobileSuccess(request, await updateInvitationLegs({
      supabase: value.auth.supabase,
      userId: value.auth.user.id,
      tripId: value.tripId,
      invitationId: typeof value.body.invitationId === "string" ? value.body.invitationId : "",
      legIds: Array.isArray(value.body.legIds) ? value.body.legIds.filter((id): id is string => typeof id === "string") : [],
    }));
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const value = await requestContext(request, context);
  if ("response" in value) return value.response;
  try {
    return mobileSuccess(request, await cancelTripInvitation({
      supabase: value.auth.supabase,
      userId: value.auth.user.id,
      tripId: value.tripId,
      invitationId: typeof value.body.invitationId === "string" ? value.body.invitationId : "",
    }));
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}
