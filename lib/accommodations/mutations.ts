import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import type { MobileStayMutationInput } from "@/lib/mobileApi/contracts";
import { replaceTripItemParticipants } from "@/lib/tripAudienceServer";
import type { ParsedTripAudience } from "@/lib/tripAudience";
import type { Database } from "@/src/types/supabase";

type StayClient = SupabaseClient<Database>;
const STAY_TYPES = new Set(["hotel", "motel", "home_rental", "hostel", "friend_family", "other"]);
const STAY_STATUSES = new Set(["tentative", "booked", "cancelled"]);

export class StayMutationError extends Error {
  constructor(
    message: string,
    readonly code: "validation_error" | "forbidden" | "not_found" | "conflict" | "operation_failed",
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "StayMutationError";
  }
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function nullable(value: unknown, max = 500) { return clean(value, max) || null; }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function validTime(value: string) { return !value || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value); }
function numeric(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : Number.NaN;
}
function safeUrl(value: unknown) {
  const text = clean(value, 2_000);
  if (!text) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}
function unique(values: unknown, max = 100) {
  return Array.isArray(values) ? Array.from(new Set(values.map((value) => clean(value, 255)).filter(Boolean))).slice(0, max) : [];
}
function audience(input: MobileStayMutationInput): ParsedTripAudience {
  return {
    audienceMode: input.audienceMode === "custom" || input.audienceMode === "just_me" ? input.audienceMode : "everyone",
    memberIds: unique(input.participants?.memberIds),
    invitationIds: unique(input.participants?.invitationIds),
    familyMemberIds: unique(input.participants?.familyMemberIds),
    guestNames: unique(input.participants?.guestNames, 25),
  };
}
async function requireTripAccess(supabase: StayClient, tripId: string, userId: string) {
  const { data: trip, error } = await supabase.from("trips").select("id,user_id,archived_at").eq("id", tripId).maybeSingle();
  if (error || !trip) throw new StayMutationError("Trip not found.", "not_found", 404);
  if (trip.archived_at) throw new StayMutationError("Archived trips cannot be changed.", "conflict", 409);
  if (trip.user_id === userId) return;
  const { data: membership } = await supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", userId).in("status", ["active", "accepted"]).maybeSingle();
  if (!membership) throw new StayMutationError("You cannot change this trip.", "forbidden", 403);
}

export function normalizeStayMutationInput(input: MobileStayMutationInput) {
  const fieldErrors: Record<string, string[]> = {};
  const hotelName = clean(input.hotelName, 240);
  const checkInDate = clean(input.checkInDate, 10);
  const checkOutDate = clean(input.checkOutDate, 10);
  const freeCancellationEndsOn = clean(input.freeCancellationEndsOn, 10);
  const checkInTimeStart = clean(input.checkInTimeStart, 8);
  const checkInTimeEnd = clean(input.checkInTimeEnd, 8);
  const checkOutTime = clean(input.checkOutTime, 8);
  const accommodationType = STAY_TYPES.has(clean(input.accommodationType, 30)) ? clean(input.accommodationType, 30) : "other";
  const status = STAY_STATUSES.has(clean(input.status, 20)) ? clean(input.status, 20) : "tentative";
  const cost = numeric(input.cost, 0.01, 100_000_000);
  const latitude = numeric(input.latitude, -90, 90);
  const longitude = numeric(input.longitude, -180, 180);
  if (!hotelName) fieldErrors.hotelName = ["Stay name is required."];
  if (!validDate(checkInDate)) fieldErrors.checkInDate = ["Choose a valid check-in date."];
  if (!validDate(checkOutDate) || checkOutDate <= checkInDate) fieldErrors.checkOutDate = ["Check-out must be after check-in."];
  if (freeCancellationEndsOn && (!validDate(freeCancellationEndsOn) || freeCancellationEndsOn > checkInDate)) fieldErrors.freeCancellationEndsOn = ["Free cancellation must end on or before check-in."];
  if (![checkInTimeStart, checkInTimeEnd, checkOutTime].every(validTime)) fieldErrors.times = ["Choose valid stay times."];
  if (checkInTimeStart && checkInTimeEnd && checkInTimeEnd <= checkInTimeStart) fieldErrors.checkInTimeEnd = ["Check-in end must be after its start."];
  if ([cost, latitude, longitude].some(Number.isNaN)) fieldErrors.location = ["Check the cost and coordinates."];
  const website = safeUrl(input.website);
  const bookingUrl = safeUrl(input.bookingUrl);
  if (clean(input.website) && !website) fieldErrors.website = ["Enter a valid website."];
  if (clean(input.bookingUrl) && !bookingUrl) fieldErrors.bookingUrl = ["Enter a valid booking link."];
  if (Object.keys(fieldErrors).length) throw new StayMutationError("Check the stay details and try again.", "validation_error", 422, fieldErrors);
  const parsedAudience = audience(input);
  const currency = cost === null ? null : clean(input.currency, 3).toUpperCase();
  if (cost !== null && !/^[A-Z]{3}$/.test(currency || "")) throw new StayMutationError("Choose a valid currency.", "validation_error", 422, { currency: ["Choose a valid currency."] });
  return {
    cost,
    parsedAudience,
    payload: {
      hotel_name: hotelName,
      accommodation_type: accommodationType as Database["public"]["Enums"]["accommodation_type"],
      status: status as Database["public"]["Enums"]["accommodation_status"],
      google_place_id: nullable(input.googlePlaceId, 255),
      google_maps_url: safeUrl(input.googleMapsUrl),
      address: nullable(input.address, 1_000),
      address_line_1: nullable(input.addressLine1, 500),
      address_line_2: nullable(input.addressLine2, 500),
      city: nullable(input.city, 160),
      region: nullable(input.region, 160),
      country: nullable(input.country, 160),
      postal_code: nullable(input.postalCode, 40),
      latitude,
      longitude,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      free_cancellation_ends_on: freeCancellationEndsOn || null,
      check_in_time_start: checkInTimeStart || null,
      check_in_time_end: checkInTimeEnd || null,
      check_out_time: checkOutTime || null,
      website,
      booking_url: bookingUrl,
      is_planning_option: Boolean(input.isPlanningOption),
      cost,
      currency,
      is_private: Boolean(input.isPrivate || parsedAudience.audienceMode === "just_me"),
      audience_mode: parsedAudience.audienceMode,
      notes: nullable(input.notes, 20_000),
      trip_leg_id: nullable(input.tripLegId, 80),
    } satisfies Database["public"]["Tables"]["trip_accommodations"]["Update"],
  };
}

function budgetForm(input: MobileStayMutationInput) {
  const form = new FormData();
  form.set("split_method", "equal");
  for (const id of unique(input.participants?.memberIds)) form.append("audience_member_ids", id);
  for (const id of unique(input.participants?.invitationIds)) form.append("audience_invitation_ids", id);
  for (const id of unique(input.participants?.familyMemberIds)) form.append("audience_family_member_ids", id);
  for (const name of unique(input.participants?.guestNames, 25)) form.append("audience_guest_names", name);
  return form;
}
async function replaceParticipants(supabase: StayClient, tripId: string, itemId: string, parsedAudience: ParsedTripAudience, planning: boolean) {
  if (planning || parsedAudience.audienceMode === "everyone") {
    const error = await replaceTripItemParticipants({ supabase, tripId, itemType: "accommodation", itemId, audience: { ...parsedAudience, audienceMode: "everyone" } });
    if (error) throw new StayMutationError("Stay was saved, but assignments could not be updated.", "operation_failed", 500);
    return;
  }
  const error = await replaceTripItemParticipants({ supabase, tripId, itemType: "accommodation", itemId, audience: parsedAudience });
  if (error) throw new StayMutationError("Stay was saved, but assignments could not be updated.", "operation_failed", 500);
}

export async function createStayForUser({ supabase, userId, tripId, input }: { supabase: StayClient; userId: string; tripId: string; input: MobileStayMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const normalized = normalizeStayMutationInput(input);
  const { data, error } = await supabase.from("trip_accommodations").insert({ ...normalized.payload, trip_id: tripId, created_by: userId }).select("*").single();
  if (error || !data) throw new StayMutationError("Could not create stay.", "operation_failed", 500);
  try { await replaceParticipants(supabase, tripId, data.id, normalized.parsedAudience, Boolean(normalized.payload.is_planning_option)); }
  catch (error) { await supabase.from("trip_accommodations").delete().eq("id", data.id).eq("trip_id", tripId); throw error; }
  if (!normalized.payload.is_planning_option) {
    try { await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "accommodation", sourceId: data.id, amount: normalized.cost, currency: normalized.payload.currency, expenseDate: normalized.payload.check_in_date, description: normalized.payload.hotel_name || "Stay", formData: budgetForm(input) }); } catch { /* Preserve the stay if optional budget sync fails. */ }
  }
  return data;
}

export async function updateStayForUser({ supabase, userId, tripId, stayId, input }: { supabase: StayClient; userId: string; tripId: string; stayId: string; input: MobileStayMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const existing = await supabase.from("trip_accommodations").select("id").eq("id", stayId).eq("trip_id", tripId).maybeSingle();
  if (existing.error || !existing.data) throw new StayMutationError("Stay not found.", "not_found", 404);
  const normalized = normalizeStayMutationInput(input);
  const { data, error } = await supabase.from("trip_accommodations").update(normalized.payload).eq("id", stayId).eq("trip_id", tripId).select("*").single();
  if (error || !data) throw new StayMutationError("Could not update stay.", "operation_failed", 500);
  await replaceParticipants(supabase, tripId, stayId, normalized.parsedAudience, Boolean(normalized.payload.is_planning_option));
  if (!normalized.payload.is_planning_option) {
    try { await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "accommodation", sourceId: stayId, amount: normalized.cost, currency: normalized.payload.currency, expenseDate: normalized.payload.check_in_date, description: normalized.payload.hotel_name || "Stay", formData: budgetForm(input) }); } catch { /* Preserve the stay if optional budget sync fails. */ }
  }
  return data;
}

export async function promoteStayForUser(options: Parameters<typeof updateStayForUser>[0]) {
  return updateStayForUser({ ...options, input: { ...options.input, isPlanningOption: false } });
}

export async function deleteStayForUser({ supabase, userId, tripId, stayId }: { supabase: StayClient; userId: string; tripId: string; stayId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data, error } = await supabase.from("trip_accommodations").delete().eq("id", stayId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error) throw new StayMutationError("Could not delete stay.", "operation_failed", 500);
  if (!data) throw new StayMutationError("Stay not found.", "not_found", 404);
  return { deleted: true as const, stayId };
}

export function parseStayMutationInput(value: unknown): MobileStayMutationInput {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MobileStayMutationInput : { hotelName: "", checkInDate: "", checkOutDate: "" };
}

export function stayMutationInputFromFormData(form: FormData): MobileStayMutationInput {
  const strings = (name: string) => form.getAll(name).map(String);
  return {
    hotelName: String(form.get("hotel_name") || ""),
    accommodationType: String(form.get("accommodation_type") || "other"),
    status: String(form.get("status") || "tentative"),
    googlePlaceId: String(form.get("google_place_id") || ""),
    googleMapsUrl: String(form.get("google_maps_url") || ""),
    address: String(form.get("address") || ""),
    addressLine1: String(form.get("address_line_1") || ""),
    addressLine2: String(form.get("address_line_2") || ""),
    city: String(form.get("city") || ""),
    region: String(form.get("region") || ""),
    country: String(form.get("country") || ""),
    postalCode: String(form.get("postal_code") || ""),
    latitude: form.get("latitude") ? Number(form.get("latitude")) : null,
    longitude: form.get("longitude") ? Number(form.get("longitude")) : null,
    checkInDate: String(form.get("check_in_date") || ""),
    checkOutDate: String(form.get("check_out_date") || ""),
    freeCancellationEndsOn: String(form.get("free_cancellation_ends_on") || ""),
    checkInTimeStart: String(form.get("check_in_time_start") || ""),
    checkInTimeEnd: String(form.get("check_in_time_end") || ""),
    checkOutTime: String(form.get("check_out_time") || ""),
    website: String(form.get("website") || ""),
    bookingUrl: String(form.get("booking_url") || ""),
    isPlanningOption: form.get("is_planning_option") === "true" || form.get("is_planning_option") === "on",
    cost: String(form.get("cost") || ""),
    currency: String(form.get("currency") || ""),
    isPrivate: form.get("is_private") === "true" || form.get("is_private") === "on",
    audienceMode: form.get("audience_mode") === "custom" || form.get("audience_mode") === "just_me" ? String(form.get("audience_mode")) as "custom" | "just_me" : "everyone",
    participants: { memberIds: strings("audience_member_ids"), invitationIds: strings("audience_invitation_ids"), familyMemberIds: strings("audience_family_member_ids"), guestNames: strings("audience_guest_names") },
    notes: String(form.get("notes") || ""),
    tripLegId: String(form.get("trip_leg_id") || ""),
  };
}
