import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileJson,
  mobileOptions,
} from "@/lib/mobileApi/server";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  const { trips, error } = await loadActiveMemberTrips(
    context.supabase,
    context.user.id,
  );

  if (error) {
    console.error("Mobile trips request failed:", {
      userId: context.user.id,
      message: error.message,
      code: error.code,
    });
    return mobileJson(request, { error: "Could not load trips" }, { status: 500 });
  }

  const mobileTrips: MobileTripSummary[] = trips.map((trip) => ({
    id: trip.id,
    slug: trip.slug || "",
    title: trip.title || "Untitled trip",
    destination: trip.destination || null,
    start_date: trip.viewerStartDate || trip.start_date || null,
    end_date: trip.viewerEndDate || trip.end_date || null,
    cover_image_url: trip.cover_image_url || trip.trip_cover_image_url || null,
    membershipRole: trip.membershipRole || null,
  }));

  return mobileJson(request, { trips: mobileTrips });
}
