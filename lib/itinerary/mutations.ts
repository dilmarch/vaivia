import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import {
  buildItineraryCoverPayloadFromForm,
  cleanupReplacedItineraryCover,
  deleteItineraryCoverObject,
} from "@/lib/itineraryCovers";
import { FALLBACK_CATEGORY_LABEL } from "@/lib/itineraryCategories";
import type { ParsedTripAudience, TripAudienceMode } from "@/lib/tripAudience";
import { replaceTripItemParticipants } from "@/lib/tripAudienceServer";
import type { Database } from "@/src/types/supabase";

type ItinerarySupabase = SupabaseClient<Database>;

export class ItineraryMutationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "validation_error"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "operation_failed",
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ItineraryMutationError";
  }
}

export type ItineraryParticipantInput = {
  memberIds?: string[];
  invitationIds?: string[];
  familyMemberIds?: string[];
  guestNames?: string[];
};

export type ItineraryMutationInput = {
  title: string;
  categoryId?: string | null;
  category?: string | null;
  status?: "tentative" | "confirmed";
  itemDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  location?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  url?: string | null;
  ticketWebsite?: string | null;
  locationWebsite?: string | null;
  notes?: string | null;
  isPrivate?: boolean;
  audienceMode?: TripAudienceMode;
  participants?: ItineraryParticipantInput;
  tripLegId?: string | null;
  cost?: number | string | null;
  currency?: string | null;
  splitMethod?: "equal" | "exact" | "percentage" | "just_me";
  includedParticipants?: string[];
  coverImageUrl?: string | null;
  removeCover?: boolean;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unique(values: unknown, max = 100) {
  return Array.isArray(values)
    ? Array.from(new Set(values.map((value) => clean(value, 255)).filter(Boolean))).slice(0, max)
    : [];
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isTime(value: string) {
  return !value || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function safeUrl(value: unknown) {
  const text = clean(value, 4000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? text : null;
  } catch {
    return null;
  }
}

function normalizeAudience(input: ItineraryMutationInput): ParsedTripAudience {
  const audienceMode: TripAudienceMode =
    input.audienceMode === "custom" || input.audienceMode === "just_me"
      ? input.audienceMode
      : "everyone";
  return {
    audienceMode,
    memberIds: unique(input.participants?.memberIds),
    invitationIds: unique(input.participants?.invitationIds),
    familyMemberIds: unique(input.participants?.familyMemberIds),
    guestNames: unique(input.participants?.guestNames, 25),
  };
}

function normalizeInput(input: ItineraryMutationInput) {
  const title = clean(input.title, 240);
  const itemDate = clean(input.itemDate, 10);
  const endDate = clean(input.endDate, 10);
  const startTime = clean(input.startTime, 8);
  const endTime = clean(input.endTime, 8);
  const fieldErrors: Record<string, string[]> = {};
  if (!title) fieldErrors.title = ["Add a title."];
  if (!isDate(itemDate)) fieldErrors.itemDate = ["Choose a valid date."];
  if (endDate && (!isDate(endDate) || endDate < itemDate)) {
    fieldErrors.endDate = ["End date cannot be before the start date."];
  }
  if (!isTime(startTime)) fieldErrors.startTime = ["Choose a valid start time."];
  if (!isTime(endTime)) fieldErrors.endTime = ["Choose a valid end time."];
  if (Object.keys(fieldErrors).length) {
    throw new ItineraryMutationError(
      "Check the itinerary details and try again.",
      "validation_error",
      422,
      fieldErrors,
    );
  }
  const costText = typeof input.cost === "number" ? String(input.cost) : clean(input.cost, 32).replaceAll(",", "");
  const cost = costText ? Number(costText) : null;
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    throw new ItineraryMutationError("Cost must be a positive number.", "validation_error", 422, {
      cost: ["Cost must be a positive number."],
    });
  }
  return {
    title,
    itemDate,
    endDate: endDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    categoryId: clean(input.categoryId, 80) || null,
    category: clean(input.category, 100) || FALLBACK_CATEGORY_LABEL,
    status: input.status === "confirmed" ? "confirmed" : "tentative",
    timezone: clean(input.timezone, 100) || null,
    timezoneSource: clean(input.timezoneSource, 40) || "manual",
    location: clean(input.location, 500),
    formattedAddress: clean(input.formattedAddress, 1000) || null,
    googlePlaceId: clean(input.googlePlaceId, 255) || null,
    locationLat: typeof input.locationLat === "number" && Number.isFinite(input.locationLat) ? input.locationLat : null,
    locationLng: typeof input.locationLng === "number" && Number.isFinite(input.locationLng) ? input.locationLng : null,
    url: safeUrl(input.ticketWebsite || input.url),
    ticketWebsite: safeUrl(input.ticketWebsite),
    locationWebsite: safeUrl(input.locationWebsite),
    notes: clean(input.notes, 20_000),
    isPrivate: Boolean(input.isPrivate),
    audience: normalizeAudience(input),
    tripLegId: clean(input.tripLegId, 80) || null,
    cost,
    currency: clean(input.currency, 3).toUpperCase() || null,
    splitMethod:
      input.splitMethod === "exact" || input.splitMethod === "percentage" || input.splitMethod === "just_me"
        ? input.splitMethod
        : "equal",
    includedParticipants: unique(input.includedParticipants),
    coverImageUrl: safeUrl(input.coverImageUrl),
    removeCover: Boolean(input.removeCover),
  };
}

async function requireTripAccess(supabase: ItinerarySupabase, tripId: string, userId: string) {
  const { data: trip, error } = await supabase
    .from("trips")
    .select("id,user_id,archived_at")
    .eq("id", tripId)
    .maybeSingle();
  if (error || !trip) throw new ItineraryMutationError("Trip not found.", "not_found", 404);
  if (trip.archived_at) throw new ItineraryMutationError("Archived trips cannot be changed.", "conflict", 409);
  if (trip.user_id === userId) return;
  const { data: membership } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();
  if (!membership) throw new ItineraryMutationError("You cannot change this trip.", "forbidden", 403);
}

async function resolveCategory(supabase: ItinerarySupabase, userId: string, categoryId: string | null, fallback: string) {
  if (!categoryId || categoryId === "__shared__") return { category_id: null, category: fallback };
  const { data } = await supabase
    .from("user_categories")
    .select("id,name")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { category_id: data.id, category: data.name } : { category_id: null, category: fallback };
}

async function resolveLeg(supabase: ItinerarySupabase, tripId: string, explicit: string | null, itemDate: string) {
  if (explicit) {
    const { data } = await supabase.from("trip_legs").select("id").eq("id", explicit).eq("trip_id", tripId).maybeSingle();
    if (data) return data.id;
  }
  const { data } = await supabase
    .from("trip_legs")
    .select("id,start_date,end_date,sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  return (data || []).find((leg) => (!leg.start_date || leg.start_date <= itemDate) && (!leg.end_date || leg.end_date >= itemDate))?.id || null;
}

function expenseFormData(input: ReturnType<typeof normalizeInput>) {
  const form = new FormData();
  form.set("split_method", input.splitMethod);
  input.includedParticipants.forEach((participant) => form.append("included_participants", participant));
  return form;
}

function inputFromFormData(formData: FormData): ItineraryMutationInput {
  return {
    title: String(formData.get("title") || ""),
    categoryId: String(formData.get("category_id") || ""),
    category: String(formData.get("category") || FALLBACK_CATEGORY_LABEL),
    status: formData.get("status") === "confirmed" ? "confirmed" : "tentative",
    itemDate: String(formData.get("item_date") || ""),
    endDate: String(formData.get("end_date") || ""),
    startTime: String(formData.get("start_time") || ""),
    endTime: String(formData.get("end_time") || ""),
    timezone: String(formData.get("timezone") || ""),
    timezoneSource: String(formData.get("timezone_source") || "manual"),
    location: String(formData.get("location") || ""),
    formattedAddress: String(formData.get("formatted_address") || ""),
    googlePlaceId: String(formData.get("google_place_id") || ""),
    locationLat: formData.get("location_lat") ? Number(formData.get("location_lat")) : null,
    locationLng: formData.get("location_lng") ? Number(formData.get("location_lng")) : null,
    url: String(formData.get("url") || ""),
    ticketWebsite: String(formData.get("ticket_website") || ""),
    locationWebsite: String(formData.get("location_website") || ""),
    notes: String(formData.get("notes") || ""),
    isPrivate: formData.get("is_private") === "on" || formData.get("is_private") === "true",
    audienceMode: String(formData.get("audience_mode") || "everyone") as TripAudienceMode,
    participants: {
      memberIds: formData.getAll("audience_member_ids").map(String),
      invitationIds: formData.getAll("audience_invitation_ids").map(String),
      familyMemberIds: formData.getAll("audience_family_member_ids").map(String),
      guestNames: formData.getAll("audience_guest_names").map(String),
    },
    tripLegId: String(formData.get("trip_leg_id") || ""),
    cost: String(formData.get("cost") || ""),
    currency: String(formData.get("currency") || ""),
    splitMethod: String(formData.get("split_method") || "equal") as ItineraryMutationInput["splitMethod"],
    includedParticipants: formData.getAll("included_participants").map(String),
    coverImageUrl: String(formData.get("cover_image_url") || ""),
    removeCover: formData.get("cover_remove") === "true",
  };
}

async function persistParticipants({ supabase, tripId, itemId, input }: { supabase: ItinerarySupabase; tripId: string; itemId: string; input: ReturnType<typeof normalizeInput> }) {
  const error = await replaceTripItemParticipants({
    supabase,
    tripId,
    itemType: "itinerary",
    itemId,
    audience: input.audience,
  });
  if (error) throw new ItineraryMutationError("Could not update itinerary participants.", "operation_failed", 500);
}

export async function createItineraryItemForUser({ supabase, userId, tripId, input, coverFormData, sourceFormData }: { supabase: ItinerarySupabase; userId: string; tripId: string; input: ItineraryMutationInput; coverFormData?: FormData; sourceFormData?: FormData }) {
  await requireTripAccess(supabase, tripId, userId);
  const normalized = normalizeInput(input);
  const category = await resolveCategory(supabase, userId, normalized.categoryId, normalized.category);
  const tripLegId = await resolveLeg(supabase, tripId, normalized.tripLegId, normalized.itemDate);
  const cover = coverFormData
    ? await buildItineraryCoverPayloadFromForm({ supabase, userId, tripId, formData: coverFormData })
    : normalized.removeCover
      ? { payload: { cover_image_url: null, cover_image_source: null, cover_image_storage_path: null } }
      : normalized.coverImageUrl
        ? { payload: { cover_image_url: normalized.coverImageUrl, cover_image_source: "external", cover_image_storage_path: null } }
        : { payload: {} };
  const payload: Database["public"]["Tables"]["itinerary_items"]["Insert"] = {
    trip_id: tripId,
    created_by: userId,
    title: normalized.title,
    ...category,
    status: normalized.status,
    item_date: normalized.itemDate,
    end_date: normalized.endDate,
    start_time: normalized.startTime,
    end_time: normalized.endTime,
    timezone: normalized.timezone,
    timezone_source: normalized.timezoneSource,
    location: normalized.location,
    formatted_address: normalized.formattedAddress,
    google_place_id: normalized.googlePlaceId,
    location_lat: normalized.locationLat,
    location_lng: normalized.locationLng,
    url: normalized.url,
    ticket_website: normalized.ticketWebsite,
    location_website: normalized.locationWebsite,
    notes: normalized.notes,
    is_private: normalized.isPrivate,
    audience_mode: normalized.audience.audienceMode,
    trip_leg_id: tripLegId,
    ...cover.payload,
  };
  const { data, error } = await supabase.from("itinerary_items").insert(payload).select("*").single();
  if (error || !data) {
    if ("uploadedStoragePath" in cover && cover.uploadedStoragePath) await deleteItineraryCoverObject({ supabase, storagePath: cover.uploadedStoragePath });
    throw new ItineraryMutationError("Could not create itinerary item.", error?.code === "23505" ? "conflict" : "operation_failed", error?.code === "23505" ? 409 : 500);
  }
  await persistParticipants({ supabase, tripId, itemId: data.id, input: normalized });
  await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "itinerary_event", sourceId: data.id, amount: normalized.cost, currency: normalized.currency, expenseDate: normalized.itemDate, description: normalized.title, formData: sourceFormData || expenseFormData(normalized) });
  if (!normalized.isPrivate) {
    await supabase.rpc("notify_trip_members", { target_trip_id: tripId, notification_type: "trip_item_added", notification_title: "Trip item added", notification_body: `${normalized.title} was added to the trip.`, notification_metadata: { itemType: "itinerary_item" }, target_item_type: "itinerary", target_item_ids: [data.id] });
  }
  return data;
}

export async function updateItineraryItemForUser({ supabase, userId, tripId, itemId, input, coverFormData, sourceFormData }: { supabase: ItinerarySupabase; userId: string; tripId: string; itemId: string; input: ItineraryMutationInput; coverFormData?: FormData; sourceFormData?: FormData }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data: existing, error: existingError } = await supabase.from("itinerary_items").select("*").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  if (existingError || !existing) throw new ItineraryMutationError("Itinerary item not found.", "not_found", 404);
  const normalized = normalizeInput(input);
  const category = await resolveCategory(supabase, userId, normalized.categoryId, normalized.category);
  const tripLegId = await resolveLeg(supabase, tripId, normalized.tripLegId, normalized.itemDate);
  const cover = coverFormData
    ? await buildItineraryCoverPayloadFromForm({ supabase, userId, tripId, formData: coverFormData })
    : normalized.removeCover
      ? { payload: { cover_image_url: null, cover_image_source: null, cover_image_storage_path: null } }
      : normalized.coverImageUrl && normalized.coverImageUrl !== existing.cover_image_url
        ? { payload: { cover_image_url: normalized.coverImageUrl, cover_image_source: "external", cover_image_storage_path: null } }
        : { payload: {} };
  const payload: Database["public"]["Tables"]["itinerary_items"]["Update"] = {
    title: normalized.title,
    ...category,
    status: normalized.status,
    item_date: normalized.itemDate,
    end_date: normalized.endDate,
    start_time: normalized.startTime,
    end_time: normalized.endTime,
    timezone: normalized.timezone,
    timezone_source: normalized.timezoneSource,
    location: normalized.location,
    formatted_address: normalized.formattedAddress,
    google_place_id: normalized.googlePlaceId,
    location_lat: normalized.locationLat,
    location_lng: normalized.locationLng,
    url: normalized.url,
    ticket_website: normalized.ticketWebsite,
    location_website: normalized.locationWebsite,
    notes: normalized.notes,
    is_private: normalized.isPrivate,
    audience_mode: normalized.audience.audienceMode,
    trip_leg_id: tripLegId,
    ...cover.payload,
  };
  const { data, error } = await supabase.from("itinerary_items").update(payload).eq("id", itemId).eq("trip_id", tripId).select("*").maybeSingle();
  if (error || !data) {
    if ("uploadedStoragePath" in cover && cover.uploadedStoragePath) await deleteItineraryCoverObject({ supabase, storagePath: cover.uploadedStoragePath });
    throw new ItineraryMutationError("Could not update itinerary item.", "operation_failed", 500);
  }
  await cleanupReplacedItineraryCover({ supabase, oldCover: existing, nextPayload: cover.payload });
  await persistParticipants({ supabase, tripId, itemId, input: normalized });
  await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "itinerary_event", sourceId: itemId, amount: normalized.cost, currency: normalized.currency, expenseDate: normalized.itemDate, description: normalized.title, formData: sourceFormData || expenseFormData(normalized) });
  return data;
}

export async function deleteItineraryItemForUser({ supabase, userId, tripId, itemId }: { supabase: ItinerarySupabase; userId: string; tripId: string; itemId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data: existing } = await supabase.from("itinerary_items").select("id,cover_image_source,cover_image_storage_path").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  if (!existing) throw new ItineraryMutationError("Itinerary item not found.", "not_found", 404);
  const { data, error } = await supabase.from("itinerary_items").delete().eq("id", itemId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) throw new ItineraryMutationError("Could not delete itinerary item.", "operation_failed", 500);
  if (existing.cover_image_source === "upload") await deleteItineraryCoverObject({ supabase, storagePath: existing.cover_image_storage_path });
  return { deleted: true as const, itemId };
}

export function parseItineraryMutationInput(value: unknown): ItineraryMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ItineraryMutationError("Itinerary details are required.", "validation_error", 422);
  }
  return value as ItineraryMutationInput;
}

export function parseItineraryFormData(formData: FormData) {
  return inputFromFormData(formData);
}
