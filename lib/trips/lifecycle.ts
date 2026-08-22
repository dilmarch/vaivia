import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDateRangeOrdered } from "@/lib/dateRange";
import {
  buildTripCoverPayloadFromForm,
  cleanupReplacedTripCover,
  deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import { syncTripDestinationsFromForm } from "@/lib/tripDestinations";
import { slugifyTripTitle } from "@/lib/tripRoutes";
import {
  addValidatedTripSlugToPayload,
  getTripSlugErrorMessage,
  isTripSlugConflictError,
} from "@/lib/tripSlugUpdate";
import type { Database } from "@/src/types/supabase";

type TripSupabase = SupabaseClient<Database>;

export class TripLifecycleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "validation_error"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "storage_error"
      | "operation_failed",
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "TripLifecycleError";
  }
}

export type TripLegInput = {
  id?: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  countryCode?: string | null;
  placeId?: string | null;
};

export type TripLifecycleInput = {
  title: string;
  slug?: string;
  destination?: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
  destinations?: Array<{
    label: string;
    placeId?: string | null;
    countryCode?: string | null;
    countryName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  legs?: TripLegInput[];
  initialInviteIdentifiers?: string[];
  initialFamilyMemberIds?: string[];
  countdownTargetType?: "itinerary_item" | "transportation_item" | null;
  countdownTargetId?: string | null;
};

type TripUpdatePayload = Database["public"]["Tables"]["trips"]["Update"];

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uniqueStrings(values: unknown, max = 50) {
  return Array.isArray(values)
    ? Array.from(
        new Set(
          values
            .map((value) => clean(value, 255))
            .filter(Boolean),
        ),
      ).slice(0, max)
    : [];
}

function validateDates(startDate: string, endDate: string, field = "endDate") {
  if (!isDateRangeOrdered(startDate, endDate)) {
    throw new TripLifecycleError(
      "Trip end date cannot be before its start date.",
      "validation_error",
      422,
      { [field]: ["Trip end date cannot be before its start date."] },
    );
  }
}

function normalizeInput(input: TripLifecycleInput) {
  const title = clean(input.title, 180);
  const destination = clean(input.destination, 500);
  const startDate = clean(input.startDate, 10);
  const endDate = clean(input.endDate, 10);
  if (!title) {
    throw new TripLifecycleError("Add a trip title.", "validation_error", 422, {
      title: ["Add a trip title."],
    });
  }
  validateDates(startDate, endDate);
  const legs = (input.legs || []).slice(0, 25).map((leg, index) => {
    const name = clean(leg.name, 180);
    const legStart = clean(leg.startDate, 10);
    const legEnd = clean(leg.endDate, 10);
    if (!name) {
      throw new TripLifecycleError(
        `Destination ${index + 1} needs a name.`,
        "validation_error",
        422,
      );
    }
    validateDates(legStart, legEnd, `legs.${index}.endDate`);
    return {
      id: clean(leg.id, 80) || undefined,
      name,
      startDate: legStart || null,
      endDate: legEnd || null,
      countryCode: clean(leg.countryCode, 2).toUpperCase() || null,
      placeId: clean(leg.placeId, 255) || null,
    };
  });
  for (let index = 1; index < legs.length; index += 1) {
    const previous = legs[index - 1];
    const current = legs[index];
    if (previous.startDate && current.startDate && current.startDate < previous.startDate) {
      throw new TripLifecycleError(
        "Trip destinations must be ordered by arrival date.",
        "validation_error",
        422,
      );
    }
  }
  return {
    title,
    slug: clean(input.slug, 100),
    destination: destination || legs.map((leg) => leg.name).join(", "),
    startDate: startDate || legs[0]?.startDate || "",
    endDate: endDate || legs.at(-1)?.endDate || "",
    notes: clean(input.notes, 10_000),
    legs,
    destinations: (input.destinations || [])
      .slice(0, 25)
      .map((item) => ({
        label: clean(item.label, 200),
        placeId: clean(item.placeId, 255) || null,
        countryCode: clean(item.countryCode, 2).toUpperCase() || null,
        countryName: clean(item.countryName, 120) || null,
        latitude: typeof item.latitude === "number" ? item.latitude : null,
        longitude: typeof item.longitude === "number" ? item.longitude : null,
      }))
      .filter((item) => item.label),
    initialInviteIdentifiers: uniqueStrings(input.initialInviteIdentifiers),
    initialFamilyMemberIds: uniqueStrings(input.initialFamilyMemberIds),
    countdownTargetType:
      input.countdownTargetType === "itinerary_item" ||
      input.countdownTargetType === "transportation_item"
        ? input.countdownTargetType
        : null,
    countdownTargetId: clean(input.countdownTargetId, 80) || null,
  };
}

async function requireTripAccess(
  supabase: TripSupabase,
  tripId: string,
  userId: string,
  ownerOnly = false,
) {
  const { data: trip, error } = await supabase
    .from("trips")
    .select("id,user_id,archived_at,cover_image_source,cover_image_storage_path")
    .eq("id", tripId)
    .maybeSingle();
  if (error || !trip) {
    throw new TripLifecycleError("Trip not found.", "not_found", 404);
  }
  if (ownerOnly && trip.user_id !== userId) {
    throw new TripLifecycleError(
      "Only the trip owner can do that.",
      "forbidden",
      403,
    );
  }
  return trip;
}

function destinationsFormData(input: ReturnType<typeof normalizeInput>) {
  const formData = new FormData();
  formData.set("destination", input.destination);
  if (input.destinations.length) {
    formData.set("destination_places_json", JSON.stringify(input.destinations));
  }
  return formData;
}

async function replaceTripLegs({
  supabase,
  userId,
  tripId,
  legs,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  legs: ReturnType<typeof normalizeInput>["legs"];
}) {
  const { data: existing, error: existingError } = await supabase
    .from("trip_legs")
    .select("id")
    .eq("trip_id", tripId);
  if (existingError) {
    throw new TripLifecycleError("Could not load trip destinations.", "operation_failed", 500);
  }
  const retainedIds = new Set<string>();
  for (const [sortOrder, leg] of legs.entries()) {
    const payload = {
      trip_id: tripId,
      name: leg.name,
      city_name: leg.name,
      start_date: leg.startDate,
      end_date: leg.endDate,
      country_code: /^[A-Z]{2}$/.test(leg.countryCode || "") ? leg.countryCode : null,
      google_place_id: leg.placeId,
      leg_type: "custom",
      sort_order: sortOrder,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (leg.id) {
      const { data, error } = await supabase
        .from("trip_legs")
        .update(payload)
        .eq("id", leg.id)
        .eq("trip_id", tripId)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        throw new TripLifecycleError("Could not update trip destinations.", "operation_failed", 500);
      }
      retainedIds.add(data.id);
    } else {
      const { data, error } = await supabase
        .from("trip_legs")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        throw new TripLifecycleError("Could not add trip destination.", "operation_failed", 500);
      }
      retainedIds.add(data.id);
    }
  }
  const removableIds = (existing || [])
    .map((row) => row.id)
    .filter((id) => !retainedIds.has(id));
  if (removableIds.length) {
    const { error } = await supabase
      .from("trip_legs")
      .delete()
      .eq("trip_id", tripId)
      .in("id", removableIds);
    if (error) {
      throw new TripLifecycleError("Could not remove old trip destinations.", "conflict", 409);
    }
  }
}

export async function createTripForUser({
  supabase,
  userId,
  input,
}: {
  supabase: TripSupabase;
  userId: string;
  input: TripLifecycleInput;
}) {
  const normalized = normalizeInput(input);
  const { count, error: countError } = await supabase
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) {
    throw new TripLifecycleError("Could not prepare the trip.", "operation_failed", 500);
  }
  const requestedSlug = slugifyTripTitle(
    normalized.slug || normalized.title,
    (count || 0) + 1,
  );
  const { data: availableSlug, error: slugError } = await supabase.rpc(
    "get_available_trip_slug",
    { base_slug: requestedSlug, excluded_trip_id: undefined },
  );
  if (slugError) {
    throw new TripLifecycleError("Could not check the trip link.", "operation_failed", 500);
  }
  if (normalized.slug && availableSlug !== requestedSlug) {
    throw new TripLifecycleError(
      "That trip link is already in use. Choose a unique slug.",
      "conflict",
      409,
      { slug: ["That trip link is already in use."] },
    );
  }
  const finalSlug = typeof availableSlug === "string" ? availableSlug : requestedSlug;
  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      user_id: userId,
      title: normalized.title,
      slug: finalSlug,
      destination: normalized.destination,
      start_date: normalized.startDate || null,
      end_date: normalized.endDate || null,
      notes: normalized.notes,
    })
    .select("id,slug,title,destination,start_date,end_date,notes,archived_at")
    .single();
  if (error || !trip) {
    throw new TripLifecycleError(
      isTripSlugConflictError(error)
        ? getTripSlugErrorMessage(error)
        : "Could not create trip.",
      isTripSlugConflictError(error) ? "conflict" : "operation_failed",
      isTripSlugConflictError(error) ? 409 : 500,
    );
  }
  try {
    await syncTripDestinationsFromForm({
      supabase,
      tripId: trip.id,
      formData: destinationsFormData(normalized),
    });
    await replaceTripLegs({
      supabase,
      userId,
      tripId: trip.id,
      legs: normalized.legs,
    });
    if (normalized.initialFamilyMemberIds.length) {
      const { error: familyError } = await supabase.from("trip_family_members").upsert(
        normalized.initialFamilyMemberIds.map((familyMemberId) => ({
          trip_id: trip.id,
          family_member_id: familyMemberId,
          added_by: userId,
          status: "going",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "trip_id,family_member_id" },
      );
      if (familyError) throw familyError;
    }
    for (const identifier of normalized.initialInviteIdentifiers) {
      const { error: inviteError } = await supabase.rpc("create_trip_invitation", {
        target_trip_id: trip.id,
        invitee_identifier: identifier,
        consent_confirmed: true,
      });
      if (inviteError) throw inviteError;
    }
  } catch (setupError) {
    await supabase.from("trips").delete().eq("id", trip.id).eq("user_id", userId);
    console.error("Could not finish trip creation setup:", {
      tripId: trip.id,
      userId,
      message: setupError instanceof Error ? setupError.message : "Unknown setup error",
    });
    throw new TripLifecycleError("Could not finish creating the trip.", "operation_failed", 500);
  }
  return trip;
}

export async function updateTripForUser({
  supabase,
  userId,
  tripId,
  input,
  coverFormData,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  input: TripLifecycleInput;
  coverFormData?: FormData;
}) {
  const existing = await requireTripAccess(supabase, tripId, userId);
  const normalized = normalizeInput(input);
  let coverPayload: TripUpdatePayload = {};
  let uploadedStoragePath: string | null | undefined;
  if (coverFormData) {
    try {
      const result = await buildTripCoverPayloadFromForm({
        supabase,
        userId,
        tripId,
        formData: coverFormData,
      });
      coverPayload = result.payload;
      uploadedStoragePath = result.uploadedStoragePath;
    } catch (error) {
      throw new TripLifecycleError(
        error instanceof Error ? error.message : "Could not prepare the cover.",
        "storage_error",
        422,
      );
    }
  }
  const payload: TripUpdatePayload = {
    title: normalized.title,
    destination: normalized.destination,
    start_date: normalized.startDate || null,
    end_date: normalized.endDate || null,
    notes: normalized.notes,
    ...coverPayload,
  };
  if ("countdownTargetType" in input || "countdownTargetId" in input) {
    const targetType = normalized.countdownTargetType;
    const targetId = normalized.countdownTargetId;
    if (targetType && targetId) {
      const table = targetType === "transportation_item" ? "transportation_items" : "itinerary_items";
      const { data: target, error: targetError } = await supabase
        .from(table)
        .select("id")
        .eq("id", targetId)
        .eq("trip_id", tripId)
        .maybeSingle();
      if (targetError || !target) {
        throw new TripLifecycleError("Choose a valid countdown item from this trip.", "validation_error", 422);
      }
    }
    payload.countdown_target_type = targetType && targetId ? targetType : null;
    payload.countdown_target_id = targetType && targetId ? targetId : null;
    payload.countdown_target_itinerary_item_id =
      targetType === "itinerary_item" && targetId ? targetId : null;
  }
  try {
    await addValidatedTripSlugToPayload(supabase, payload, {
      tripId,
      submittedSlug: normalized.slug,
      fallbackTitle: normalized.title,
    });
  } catch (error) {
    throw new TripLifecycleError(
      error instanceof Error ? error.message : "Could not validate the trip link.",
      "conflict",
      409,
      { slug: [error instanceof Error ? error.message : "Trip link is unavailable."] },
    );
  }
  const { data: trip, error } = await supabase
    .from("trips")
    .update(payload)
    .eq("id", tripId)
    .select("id,slug,title,destination,start_date,end_date,notes,archived_at")
    .maybeSingle();
  if (error || !trip) {
    await deleteOwnedTripCoverObject({ supabase, userId, storagePath: uploadedStoragePath });
    throw new TripLifecycleError(
      isTripSlugConflictError(error) ? getTripSlugErrorMessage(error) : "Could not update trip.",
      isTripSlugConflictError(error) ? "conflict" : "operation_failed",
      isTripSlugConflictError(error) ? 409 : 500,
    );
  }
  await syncTripDestinationsFromForm({
    supabase,
    tripId,
    formData: destinationsFormData(normalized),
  });
  if (input.legs) {
    await replaceTripLegs({ supabase, userId, tripId, legs: normalized.legs });
  }
  await cleanupReplacedTripCover({
    supabase,
    userId,
    oldCover: existing,
    nextPayload: coverPayload,
  });
  await supabase.rpc("notify_trip_members", {
    target_trip_id: tripId,
    notification_type: "trip_updated",
    notification_title: "Trip updated",
    notification_body: "A trip detail was updated.",
    notification_metadata: { changedArea: "trip" },
  });
  return trip;
}

export async function setTripArchivedForOwner({
  supabase,
  userId,
  tripId,
  archived,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  archived: boolean;
}) {
  await requireTripAccess(supabase, tripId, userId, true);
  const { data, error } = await supabase
    .from("trips")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      archived_reason: archived ? "user_archived" : null,
    })
    .eq("id", tripId)
    .eq("user_id", userId)
    .select("id,archived_at")
    .maybeSingle();
  if (error || !data) {
    throw new TripLifecycleError(
      archived ? "Could not archive trip." : "Could not restore trip.",
      "operation_failed",
      500,
    );
  }
  return data;
}

export async function permanentlyDeleteTripForOwner({
  supabase,
  userId,
  tripId,
  confirmation,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  confirmation: string;
}) {
  await requireTripAccess(supabase, tripId, userId, true);
  if (confirmation !== "DELETE") {
    throw new TripLifecycleError(
      "Type DELETE to permanently delete this trip.",
      "validation_error",
      422,
      { confirmation: ["Type DELETE to confirm."] },
    );
  }
  const { error, count } = await supabase
    .from("trips")
    .delete({ count: "exact" })
    .eq("id", tripId)
    .eq("user_id", userId);
  if (!error && count === 0) {
    throw new TripLifecycleError(
      "Remove active collaborators before permanently deleting this trip.",
      "conflict",
      409,
    );
  }
  if (error || count !== 1) {
    throw new TripLifecycleError("Could not delete trip.", "operation_failed", 500);
  }
  return { deleted: true as const, tripId };
}

export function parseTripLifecycleInput(value: unknown): TripLifecycleInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TripLifecycleError("Trip details are required.", "validation_error", 400);
  }
  const record = value as Record<string, unknown>;
  return {
    title: clean(record.title, 180),
    slug: clean(record.slug, 100),
    destination: clean(record.destination, 500),
    startDate: clean(record.startDate, 10),
    endDate: clean(record.endDate, 10),
    notes: clean(record.notes, 10_000),
    destinations: Array.isArray(record.destinations)
      ? (record.destinations as TripLifecycleInput["destinations"])
      : undefined,
    legs: Array.isArray(record.legs) ? (record.legs as TripLegInput[]) : undefined,
    initialInviteIdentifiers: uniqueStrings(record.initialInviteIdentifiers),
    initialFamilyMemberIds: uniqueStrings(record.initialFamilyMemberIds),
    ...("countdownTargetType" in record || "countdownTargetId" in record
      ? {
          countdownTargetType:
            record.countdownTargetType === "itinerary_item" ||
            record.countdownTargetType === "transportation_item"
              ? record.countdownTargetType
              : null,
          countdownTargetId: clean(record.countdownTargetId, 80) || null,
        }
      : {}),
  };
}
