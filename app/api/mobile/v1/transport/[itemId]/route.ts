import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { readJsonObject } from "@/lib/trips/mobileResponse";
import { deleteTransportationForUser, parseTransportationMutationInput, updateTransportationForUser } from "@/lib/transport/mutations";
import { travelMutationErrorResponse } from "@/lib/travel/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ itemId: string }> };
export function OPTIONS(request: Request) { return mobileOptions(request, "GET, PATCH, DELETE, OPTIONS"); }
function tripIdFrom(request: Request, body?: Record<string, unknown> | null) { return String(body?.tripId || new URL(request.url).searchParams.get("tripId") || "").trim(); }

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const tripId = tripIdFrom(request);
  if (!tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip is required." });
  const [itemResult, participantResult] = await Promise.all([
    context.supabase.from("transportation_items").select("*").eq("id", itemId).eq("trip_id", tripId).maybeSingle(),
    context.supabase.from("trip_item_participants").select("participant_kind,trip_member_id,invitation_id,family_member_id,guest_name").eq("trip_id", tripId).eq("item_type", "transportation").eq("item_id", itemId),
  ]);
  if (itemResult.error || !itemResult.data) return mobileError(request, { status: 404, code: "not_found", message: "Transportation not found." });
  return mobileSuccess(request, { item: itemResult.data, participants: participantResult.data || [] });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const body = await readJsonObject(request);
  const tripId = tripIdFrom(request, body);
  try {
    const item = await updateTransportationForUser({ supabase: context.supabase, userId: context.user.id, tripId, itemId, input: parseTransportationMutationInput(body) });
    return mobileSuccess(request, { item });
  } catch (error) { return travelMutationErrorResponse(request, error); }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const body = await readJsonObject(request);
  try { return mobileSuccess(request, await deleteTransportationForUser({ supabase: context.supabase, userId: context.user.id, tripId: tripIdFrom(request, body), itemId })); }
  catch (error) { return travelMutationErrorResponse(request, error); }
}
