import type { MobileItineraryItem } from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import {
  deleteItineraryItemForUser,
  parseItineraryMutationInput,
  updateItineraryItemForUser,
} from "@/lib/itinerary/mutations";
import { itineraryMutationErrorResponse } from "@/lib/itinerary/mobileResponse";
import { FALLBACK_CATEGORY_COLOR } from "@/lib/itineraryCategories";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ itemId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, PATCH, DELETE, OPTIONS");
}

function toMobileItem(row: Record<string, unknown>, people: MobileItineraryItem["people"] = []): MobileItineraryItem {
  return {
    ...(row as unknown as MobileItineraryItem),
    source: "itinerary",
    source_id: String(row.id),
    category_name: String(row.category || "Other"),
    category_color_hex: FALLBACK_CATEGORY_COLOR,
    people,
  };
}

function tripIdFrom(request: Request, body?: Record<string, unknown> | null) {
  return String(body?.tripId || new URL(request.url).searchParams.get("tripId") || "").trim();
}

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const tripId = tripIdFrom(request);
  if (!tripId) return mobileError(request, { status: 422, code: "validation_error", message: "Trip is required." });
  const [itemResult, categoriesResult, expenseResult, participantResult] = await Promise.all([
    context.supabase.from("itinerary_items").select("*").eq("id", itemId).eq("trip_id", tripId).maybeSingle(),
    context.supabase.from("user_categories").select("id,name,color_key").eq("user_id", context.user.id).order("name", { ascending: true }),
    context.supabase.from("trip_expenses").select("amount,currency").eq("trip_id", tripId).eq("itinerary_event_id", itemId).eq("source_type", "itinerary_event").maybeSingle(),
    context.supabase.from("trip_item_participants").select("participant_kind,trip_member_id,invitation_id,family_member_id,guest_name").eq("trip_id", tripId).eq("item_type", "itinerary").eq("item_id", itemId),
  ]);
  if (itemResult.error || !itemResult.data) return mobileError(request, { status: 404, code: "not_found", message: "Itinerary item not found." });
  const { data: trip } = await context.supabase.from("trips").select("id,title,start_date,end_date").eq("id", tripId).maybeSingle();
  if (!trip) return mobileError(request, { status: 404, code: "not_found", message: "Trip not found." });
  const item = toMobileItem({
    ...itemResult.data,
    cost: expenseResult.data?.amount ?? null,
    currency: expenseResult.data?.currency ?? null,
    audienceSelections: (participantResult.data || []).map((participant) => {
      if (participant.participant_kind === "member" && participant.trip_member_id) return `member:${participant.trip_member_id}`;
      if (participant.participant_kind === "invitation" && participant.invitation_id) return `invitation:${participant.invitation_id}`;
      if (participant.participant_kind === "family_member" && participant.family_member_id) return `family_member:${participant.family_member_id}`;
      return participant.guest_name ? `guest:${participant.guest_name}` : "";
    }).filter(Boolean),
  });
  return mobileSuccess(request, { trip, item, categories: categoriesResult.data || [] });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const body = await readJsonObject(request);
  const tripId = tripIdFrom(request, body);
  try {
    const item = await updateItineraryItemForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      itemId,
      input: parseItineraryMutationInput(body),
    });
    return mobileSuccess(request, { item: toMobileItem(item) });
  } catch (error) {
    return itineraryMutationErrorResponse(request, error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { itemId } = await params;
  const body = await readJsonObject(request);
  const tripId = tripIdFrom(request, body);
  try {
    return mobileSuccess(request, await deleteItineraryItemForUser({ supabase: context.supabase, userId: context.user.id, tripId, itemId }));
  } catch (error) {
    return itineraryMutationErrorResponse(request, error);
  }
}
