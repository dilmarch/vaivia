import { authenticateMobileRequest, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { loadTripCollaboration } from "@/lib/trips/collaboration";
import { tripMutationErrorResponse } from "@/lib/trips/mobileResponse";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  try {
    return mobileSuccess(
      request,
      await loadTripCollaboration({
        supabase: context.supabase,
        userId: context.user.id,
        tripId,
      }),
    );
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}
