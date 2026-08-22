import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import { updateTripForUser } from "@/lib/trips/lifecycle";
import { tripMutationErrorResponse } from "@/lib/trips/mobileResponse";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, DELETE, OPTIONS");
}

async function updateCover(request: Request, context: RouteContext, remove: boolean) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const { tripId } = await context.params;
  let formData: FormData;
  try {
    formData = remove ? new FormData() : await request.formData();
  } catch {
    return mobileError(request, {
      status: 400,
      code: "validation_error",
      message: "A valid cover image is required.",
    });
  }
  if (remove) formData.set("cover_remove", "true");
  const { data: trip, error } = await auth.supabase
    .from("trips")
    .select("title,slug,destination,start_date,end_date,notes")
    .eq("id", tripId)
    .maybeSingle();
  if (error || !trip) {
    return mobileError(request, { status: 404, code: "not_found", message: "Trip not found." });
  }
  try {
    const updatedTrip = await updateTripForUser({
      supabase: auth.supabase,
      userId: auth.user.id,
      tripId,
      input: {
        title: trip.title,
        slug: trip.slug,
        destination: trip.destination || "",
        startDate: trip.start_date,
        endDate: trip.end_date,
        notes: trip.notes || "",
      },
      coverFormData: formData,
    });
    return mobileSuccess(request, { trip: updatedTrip });
  } catch (mutationError) {
    return tripMutationErrorResponse(request, mutationError);
  }
}

export function POST(request: Request, context: RouteContext) {
  return updateCover(request, context, false);
}

export function DELETE(request: Request, context: RouteContext) {
  return updateCover(request, context, true);
}
