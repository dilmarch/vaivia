import type {
  MobileItineraryItem,
  MobileTripSummary,
} from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileJson,
  mobileOptions,
} from "@/lib/mobileApi/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  const { tripId } = await params;
  const { data: trip, error: tripError } = await context.supabase
    .from("trips")
    .select(
      "id,slug,title,destination,start_date,end_date,cover_image_url,notes,user_id",
    )
    .eq("id", tripId)
    .maybeSingle();

  if (tripError) {
    console.error("Mobile trip detail request failed:", {
      userId: context.user.id,
      tripId,
      message: tripError.message,
      code: tripError.code,
    });
    return mobileJson(request, { error: "Could not load trip" }, { status: 500 });
  }

  if (!trip) {
    return mobileJson(request, { error: "Trip not found" }, { status: 404 });
  }

  const [itineraryResult, transportationResult] = await Promise.all([
    context.supabase
      .from("itinerary_items")
      .select(
        "id,trip_id,title,item_date,end_date,start_time,end_time,category,status,location,notes,cover_image_url",
      )
      .eq("trip_id", trip.id)
      .order("item_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("transportation_items")
      .select(
        "id,trip_id,title,transport_type,departure_date,arrival_date,departure_time,arrival_time,departure_location,arrival_location,status,notes,sort_order",
      )
      .eq("trip_id", trip.id)
      .order("departure_date", { ascending: true, nullsFirst: false })
      .order("departure_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  if (itineraryResult.error || transportationResult.error) {
    const requestError = itineraryResult.error || transportationResult.error;
    console.error("Mobile itinerary request failed:", {
      userId: context.user.id,
      tripId,
      message: requestError?.message,
      code: requestError?.code,
    });
    return mobileJson(
      request,
      { error: "Could not load itinerary" },
      { status: 500 },
    );
  }

  const mobileTrip: MobileTripSummary & { notes: string | null } = {
    id: trip.id,
    slug: trip.slug,
    title: trip.title,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cover_image_url: trip.cover_image_url,
    notes: trip.notes,
    membershipRole: trip.user_id === context.user.id ? "owner" : "member",
  };

  const itineraryItems: MobileItineraryItem[] = (itineraryResult.data || []).map(
    (item) => ({ ...item, source: "itinerary" }),
  );
  const transportationItems: MobileItineraryItem[] = (
    transportationResult.data || []
  ).map((item) => {
    const routeLabel = [item.departure_location, item.arrival_location]
      .filter(Boolean)
      .join(" → ");
    const transportLabel = item.transport_type
      ? item.transport_type.replaceAll("_", " ")
      : "Transportation";

    return {
      id: `transportation:${item.id}`,
      trip_id: item.trip_id,
      title: item.title || (routeLabel ? `${transportLabel}: ${routeLabel}` : transportLabel),
      item_date: item.departure_date || item.arrival_date || trip.start_date || "",
      end_date: item.arrival_date,
      start_time: item.departure_time,
      end_time: item.arrival_time,
      category: "transportation",
      status: item.status,
      location: routeLabel || null,
      notes: item.notes,
      cover_image_url: null,
      source: "transportation",
    };
  });
  const mobileItinerary = [...itineraryItems, ...transportationItems].sort(
    (left, right) =>
      left.item_date.localeCompare(right.item_date) ||
      String(left.start_time || "99:99").localeCompare(
        String(right.start_time || "99:99"),
      ),
  );

  return mobileJson(request, {
    trip: mobileTrip,
    itinerary: mobileItinerary,
  });
}
