import type {
  MobileItineraryEditorResponse,
  MobileItineraryItem,
} from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import {
  createItineraryItemForUser,
  parseItineraryMutationInput,
} from "@/lib/itinerary/mutations";
import { itineraryMutationErrorResponse } from "@/lib/itinerary/mobileResponse";
import { FALLBACK_CATEGORY_COLOR } from "@/lib/itineraryCategories";
import { readJsonObject } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, OPTIONS");
}

function toMobileItem(row: Record<string, unknown>): MobileItineraryItem {
  return {
    ...(row as unknown as MobileItineraryItem),
    source: "itinerary",
    source_id: String(row.id),
    category_name: String(row.category || "Other"),
    category_color_hex: FALLBACK_CATEGORY_COLOR,
    people: [],
  };
}

async function loadEditorData(
  context: Exclude<Awaited<ReturnType<typeof authenticateMobileRequest>>, Response>,
  tripId: string,
): Promise<MobileItineraryEditorResponse | null> {
  const [tripResult, categoriesResult] = await Promise.all([
    context.supabase
      .from("trips")
      .select("id,title,start_date,end_date")
      .eq("id", tripId)
      .maybeSingle(),
    context.supabase
      .from("user_categories")
      .select("id,name,color_key")
      .eq("user_id", context.user.id)
      .order("name", { ascending: true }),
  ]);
  if (tripResult.error || !tripResult.data) {
    return null;
  }
  return {
    trip: tripResult.data,
    item: null,
    categories: categoriesResult.data || [],
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  const result = await loadEditorData(context, tripId);
  if (!result) {
    return mobileError(request, { status: 404, code: "not_found", message: "Trip not found." });
  }
  return mobileSuccess(request, result);
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const { tripId } = await params;
  const body = await readJsonObject(request);
  try {
    const item = await createItineraryItemForUser({
      supabase: context.supabase,
      userId: context.user.id,
      tripId,
      input: parseItineraryMutationInput(body),
    });
    return mobileSuccess(request, { item: toMobileItem(item) }, { status: 201 });
  } catch (error) {
    return itineraryMutationErrorResponse(request, error);
  }
}
