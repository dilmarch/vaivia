import {
  deleteIdeaForUser,
  parseIdeaMutationInput,
  setIdeaAttendedForUser,
  updateIdeaForUser,
} from "@/lib/ideas/mutations";
import { ideaMutationErrorResponse } from "@/lib/ideas/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ ideaId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "PATCH, DELETE, OPTIONS");
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { ideaId } = await params;
  const body = await readJsonObject(request);
  const tripId = String(body?.tripId || "").trim();
  if (!body || !tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip and idea details are required." });
  try {
    const idea = body.operation === "attended"
      ? await setIdeaAttendedForUser({ supabase: context.supabase, userId: context.user.id, tripId, ideaId, attended: body.attended === true })
      : await updateIdeaForUser({ supabase: context.supabase, userId: context.user.id, tripId, ideaId, input: parseIdeaMutationInput(body) });
    return mobileSuccess(request, { idea });
  } catch (error) {
    return ideaMutationErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { ideaId } = await params;
  const body = await readJsonObject(request);
  const tripId = String(body?.tripId || "").trim();
  if (!tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip is required." });
  try {
    return mobileSuccess(request, await deleteIdeaForUser({ supabase: context.supabase, userId: context.user.id, tripId, ideaId }));
  } catch (error) {
    return ideaMutationErrorResponse(request, error);
  }
}
