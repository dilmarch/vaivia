import { addIdeaToItineraryForUser } from "@/lib/ideas/mutations";
import { ideaMutationErrorResponse } from "@/lib/ideas/mobileResponse";
import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ ideaId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { ideaId } = await params;
  const body = await readJsonObject(request);
  const tripId = String(body?.tripId || "").trim();
  if (!body || !tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip and itinerary details are required." });
  try {
    const item = await addIdeaToItineraryForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      ideaId,
      input: {
        itemDate: String(body.itemDate || ""),
        startTime: typeof body.startTime === "string" ? body.startTime : null,
        endTime: typeof body.endTime === "string" ? body.endTime : null,
        timezone: typeof body.timezone === "string" ? body.timezone : null,
        timezoneSource: typeof body.timezoneSource === "string" ? body.timezoneSource : "manual",
      },
    });
    return mobileSuccess(request, { item }, { status: 201 });
  } catch (error) {
    return ideaMutationErrorResponse(request, error);
  }
}
