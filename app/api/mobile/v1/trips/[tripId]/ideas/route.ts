import {
  createIdeaForUser,
  createIdeasFromNotepadForUser,
  parseIdeaMutationInput,
} from "@/lib/ideas/mutations";
import { ideaMutationErrorResponse } from "@/lib/ideas/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
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
  const body = await readJsonObject(request);
  if (!body) return mobileError(request, { status: 400, code: "validation_error", message: "Idea details are required." });
  try {
    if (body.operation === "bulk") {
      const ideas = await createIdeasFromNotepadForUser({
        supabase: context.supabase,
        userId: context.user.id,
        tripId,
        input: {
          entries: Array.isArray(body.entries) ? body.entries.map(String) : [],
          locations: Array.isArray(body.locations) ? body.locations as never[] : [],
        },
      });
      return mobileSuccess(request, { ideas }, { status: 201 });
    }
    const idea = await createIdeaForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      input: parseIdeaMutationInput(body),
    });
    return mobileSuccess(request, { idea }, { status: 201 });
  } catch (error) {
    return ideaMutationErrorResponse(request, error);
  }
}
