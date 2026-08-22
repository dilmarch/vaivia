import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import {
  parseItineraryMutationInput,
  updateItineraryItemForUser,
} from "@/lib/itinerary/mutations";
import { itineraryMutationErrorResponse } from "@/lib/itinerary/mobileResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ itemId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return mobileError(request, { status: 422, code: "validation_error", message: "Cover upload is invalid." });
  }
  const tripId = String(formData.get("tripId") || "").trim();
  const rawInput = String(formData.get("input") || "");
  try {
    const item = await updateItineraryItemForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      itemId,
      input: parseItineraryMutationInput(JSON.parse(rawInput)),
      coverFormData: formData,
    });
    return mobileSuccess(request, { item });
  } catch (error) {
    return itineraryMutationErrorResponse(request, error);
  }
}
