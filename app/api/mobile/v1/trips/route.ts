import {
  loadActiveMemberTrips,
  loadArchivedMemberTrips,
} from "@/lib/sharedTrips";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileError,
  mobileJson,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";
import { createTripForUser, parseTripLifecycleInput } from "@/lib/trips/lifecycle";
import { readJsonObject, tripMutationErrorResponse } from "@/lib/trips/mobileResponse";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, OPTIONS");
}

export async function POST(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  const body = await readJsonObject(request);
  if (!body) {
    return mobileError(request, {
      status: 400,
      code: "validation_error",
      message: "Trip details are required.",
    });
  }
  try {
    const trip = await createTripForUser({
      supabase: context.supabase,
      userId: context.user.id,
      input: parseTripLifecycleInput(body),
    });
    return mobileSuccess(request, { trip }, { status: 201 });
  } catch (error) {
    return tripMutationErrorResponse(request, error);
  }
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  const [activeResult, archivedResult] = await Promise.all([
    loadActiveMemberTrips(context.supabase, context.user.id),
    loadArchivedMemberTrips(context.supabase, context.user.id),
  ]);
  const error = activeResult.error || archivedResult.error;

  if (error) {
    console.error("Mobile trips request failed:", {
      userId: context.user.id,
      message: error.message,
      code: error.code,
    });
    return mobileJson(request, { error: "Could not load trips" }, { status: 500 });
  }

  const tripsById = new Map(
    [...activeResult.trips, ...archivedResult.trips].map((trip) => [
      trip.id,
      trip,
    ]),
  );
  const mobileTrips: MobileTripSummary[] = Array.from(tripsById.values()).map((trip) => ({
    id: trip.id,
    slug: trip.slug || "",
    title: trip.title || "Untitled trip",
    destination: trip.destination || null,
    start_date: trip.viewerStartDate || trip.start_date || null,
    end_date: trip.viewerEndDate || trip.end_date || null,
    cover_image_url: trip.cover_image_url || trip.trip_cover_image_url || null,
    archived_at: trip.archived_at || null,
    membershipRole: trip.membershipRole || null,
    viewerTripMemberId: trip.viewerTripMemberId || null,
    viewerAssignedLegCount: trip.viewerAssignedLegCount || 0,
    viewerStartDate: trip.viewerStartDate || null,
    viewerEndDate: trip.viewerEndDate || null,
    memberProfiles: trip.memberProfiles || [],
  }));

  return mobileJson(request, { trips: mobileTrips });
}
