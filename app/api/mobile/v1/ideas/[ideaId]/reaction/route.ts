import { normalizeIdeaReaction } from "@/lib/tripIdeas";
import { toggleIdeaReactionForUser } from "@/lib/ideas/mutations";
import { ideaMutationErrorResponse } from "@/lib/ideas/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ ideaId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "PUT, OPTIONS");
}

export async function PUT(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { ideaId } = await params;
  const body = await readJsonObject(request);
  const tripId = String(body?.tripId || "").trim();
  const reaction = normalizeIdeaReaction(body?.reaction);
  if (!tripId || !reaction) return mobileError(request, { status: 422, code: "validation_error", message: "Trip and reaction are required." });
  try {
    return mobileSuccess(request, await toggleIdeaReactionForUser({ supabase: context.supabase, userId: context.user.id, tripId, ideaId, reaction }));
  } catch (error) {
    return ideaMutationErrorResponse(request, error);
  }
}
