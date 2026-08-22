import { authenticateMobileRequest, mobileError, mobileOptions, mobileSuccess } from "@/lib/mobileApi/server";
import { deleteStayForUser, parseStayMutationInput, promoteStayForUser, updateStayForUser } from "@/lib/accommodations/mutations";
import { readJsonObject } from "@/lib/trips/mobileResponse";
import { travelMutationErrorResponse } from "@/lib/travel/mobileResponse";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ stayId: string }> };
export function OPTIONS(request: Request) { return mobileOptions(request, "GET, PATCH, DELETE, OPTIONS"); }
function tripIdFrom(request: Request, body?: Record<string, unknown> | null) { return String(body?.tripId || new URL(request.url).searchParams.get("tripId") || "").trim(); }
export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { stayId } = await params;
  const tripId = tripIdFrom(request);
  if (!tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip is required." });
  const [stayResult, participantResult] = await Promise.all([
    context.supabase.from("trip_accommodations").select("*").eq("id", stayId).eq("trip_id", tripId).maybeSingle(),
    context.supabase.from("trip_item_participants").select("participant_kind,trip_member_id,invitation_id,family_member_id,guest_name").eq("trip_id", tripId).eq("item_type", "accommodation").eq("item_id", stayId),
  ]);
  if (stayResult.error || !stayResult.data) return mobileError(request, { status: 404, code: "not_found", message: "Stay not found." });
  return mobileSuccess(request, { stay: stayResult.data, participants: participantResult.data || [] });
}
export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { stayId } = await params;
  const body = await readJsonObject(request);
  const options = { supabase: context.supabase, userId: context.user.id, tripId: tripIdFrom(request, body), stayId, input: parseStayMutationInput(body) };
  try {
    const stay = body?.operation === "promote" ? await promoteStayForUser(options) : await updateStayForUser(options);
    return mobileSuccess(request, { stay });
  } catch (error) { return travelMutationErrorResponse(request, error); }
}
export async function DELETE(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { stayId } = await params;
  const body = await readJsonObject(request);
  try { return mobileSuccess(request, await deleteStayForUser({ supabase: context.supabase, userId: context.user.id, tripId: tripIdFrom(request, body), stayId })); }
  catch (error) { return travelMutationErrorResponse(request, error); }
}
