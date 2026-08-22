import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import type { MobileTransportationMutationInput } from "@/lib/mobileApi/contracts";
import { replaceTripItemParticipants } from "@/lib/tripAudienceServer";
import type { ParsedTripAudience } from "@/lib/tripAudience";
import type { Database } from "@/src/types/supabase";

type TransportClient = SupabaseClient<Database>;
type TransportPersistenceError = { code?: string; message?: string; details?: string; hint?: string };
type UntypedTransportClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => { select: (columns: string) => { single: () => Promise<{ data: Record<string, unknown> | null; error: TransportPersistenceError | null }> } };
    update: (payload: Record<string, unknown>) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => Promise<{ error: TransportPersistenceError | null }> } };
  };
};
const TRANSPORT_TYPES = new Set([
  "flight", "train", "bus", "ferry", "car", "rental_car", "rideshare",
  "taxi", "subway", "tram", "walking", "other",
]);
const TRANSPORT_STATUSES = new Set(["planned", "booked", "confirmed", "cancelled", "completed"]);
const PAID_STATUSES = new Set(["unpaid", "paid", "partial", "refunded"]);

export class TransportMutationError extends Error {
  constructor(
    message: string,
    readonly code: "validation_error" | "forbidden" | "not_found" | "conflict" | "operation_failed",
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "TransportMutationError";
  }
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max = 500) {
  return clean(value, max) || null;
}

function date(value: unknown) {
  const text = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : "";
}

function time(value: unknown) {
  const text = clean(value, 8);
  return !text || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text) ? text : "invalid";
}

function number(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : Number.NaN;
}

function url(value: unknown) {
  const text = clean(value, 2_000);
  if (!text) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function unique(values: unknown, max = 100) {
  return Array.isArray(values)
    ? Array.from(new Set(values.map((value) => clean(value, 255)).filter(Boolean))).slice(0, max)
    : [];
}

function audience(input: MobileTransportationMutationInput): ParsedTripAudience {
  return {
    audienceMode: input.audienceMode === "custom" || input.audienceMode === "just_me" ? input.audienceMode : "everyone",
    memberIds: unique(input.participants?.memberIds),
    invitationIds: unique(input.participants?.invitationIds),
    familyMemberIds: unique(input.participants?.familyMemberIds),
    guestNames: unique(input.participants?.guestNames, 25),
  };
}

function missingColumnName(error: TransportPersistenceError) {
  const text = `${error.message || ""} ${error.details || ""}`;
  return text.match(/'([^']+)' column/)?.[1] || text.match(/column "([^"]+)"/)?.[1] || "";
}

export async function insertTransportationPayloadWithFallback({ supabase, payload }: { supabase: TransportClient; payload: Record<string, unknown> }) {
  const client = supabase as unknown as UntypedTransportClient;
  let attempt = { ...payload };
  let lastError: TransportPersistenceError | null = null;
  for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
    const { data, error } = await client.from("transportation_items").insert(attempt).select("*").single();
    if (!error) return { data, error: null };
    lastError = error;
    if (error.code !== "42703" && error.code !== "PGRST204") break;
    const column = missingColumnName(error);
    if (!column || !(column in attempt) || column === "is_private" || column === "audience_mode") break;
    const { [column]: _removed, ...next } = attempt;
    void _removed;
    attempt = next;
  }
  return { data: null, error: lastError };
}

export async function updateTransportationPayloadWithFallback({ supabase, tripId, itemId, payload }: { supabase: TransportClient; tripId: string; itemId: string; payload: Record<string, unknown> }) {
  const client = supabase as unknown as UntypedTransportClient;
  let attempt = { ...payload };
  let lastError: TransportPersistenceError | null = null;
  for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
    const { error } = await client.from("transportation_items").update(attempt).eq("id", itemId).eq("trip_id", tripId);
    if (!error) return null;
    lastError = error;
    if (error.code !== "42703" && error.code !== "PGRST204") break;
    const column = missingColumnName(error);
    if (!column || !(column in attempt) || column === "is_private" || column === "audience_mode") break;
    const { [column]: _removed, ...next } = attempt;
    void _removed;
    attempt = next;
  }
  return lastError;
}

async function requireTripAccess(supabase: TransportClient, tripId: string, userId: string) {
  const { data: trip, error } = await supabase.from("trips").select("id,user_id,archived_at").eq("id", tripId).maybeSingle();
  if (error || !trip) throw new TransportMutationError("Trip not found.", "not_found", 404);
  if (trip.archived_at) throw new TransportMutationError("Archived trips cannot be changed.", "conflict", 409);
  if (trip.user_id === userId) return;
  const { data: membership } = await supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", userId).in("status", ["active", "accepted"]).maybeSingle();
  if (!membership) throw new TransportMutationError("You cannot change this trip.", "forbidden", 403);
}

export function normalizeTransportationMutationInput(input: MobileTransportationMutationInput) {
  const fieldErrors: Record<string, string[]> = {};
  const transportType = clean(input.transportType, 40).replace("airplane", "flight");
  const departureDate = date(input.departureDate);
  const arrivalDate = date(input.arrivalDate);
  const departureTime = time(input.departureTime);
  const arrivalTime = time(input.arrivalTime);
  const departureLocation = clean(input.departureLocation, 500);
  const arrivalLocation = clean(input.arrivalLocation, 500);
  const cost = number(input.cost, 0, 100_000_000);
  const departureLat = number(input.departureLat, -90, 90);
  const departureLng = number(input.departureLng, -180, 180);
  const arrivalLat = number(input.arrivalLat, -90, 90);
  const arrivalLng = number(input.arrivalLng, -180, 180);
  if (!TRANSPORT_TYPES.has(transportType)) fieldErrors.transportType = ["Choose a supported transportation type."];
  if (!departureDate) fieldErrors.departureDate = ["Choose a valid departure date."];
  if (arrivalDate && arrivalDate < departureDate) fieldErrors.arrivalDate = ["Arrival cannot be before departure."];
  if (departureTime === "invalid") fieldErrors.departureTime = ["Choose a valid departure time."];
  if (arrivalTime === "invalid") fieldErrors.arrivalTime = ["Choose a valid arrival time."];
  if (!departureLocation) fieldErrors.departureLocation = ["Add a departure location."];
  if (!arrivalLocation) fieldErrors.arrivalLocation = ["Add an arrival location."];
  if ([cost, departureLat, departureLng, arrivalLat, arrivalLng].some(Number.isNaN)) fieldErrors.location = ["Check the cost and coordinates."];
  if (Object.keys(fieldErrors).length) throw new TransportMutationError("Check the transportation details and try again.", "validation_error", 422, fieldErrors);
  const status = TRANSPORT_STATUSES.has(clean(input.status, 20)) ? clean(input.status, 20) : "planned";
  const paidStatus = PAID_STATUSES.has(clean(input.paidStatus, 20)) ? clean(input.paidStatus, 20) : null;
  const providerName = nullable(input.providerName || (transportType === "flight" ? input.title : null), 200);
  const transportNumber = nullable(input.transportNumber, 80);
  const title = clean(input.title, 240) || `${transportType.replaceAll("_", " ")}: ${departureLocation} to ${arrivalLocation}`;
  const routeStops = (input.routeStops || []).slice(0, 20).map((stop, index) => ({ order: index, label: clean(stop.label, 300), placeId: nullable(stop.placeId, 255) })).filter((stop) => stop.label);
  const parsedAudience = audience(input);
  const currency = cost === null ? null : clean(input.currency, 3).toUpperCase();
  if (cost !== null && !/^[A-Z]{3}$/.test(currency || "")) throw new TransportMutationError("Choose a valid currency.", "validation_error", 422, { currency: ["Choose a valid currency."] });
  return {
    parsedAudience,
    cost,
    payload: {
      title,
      transport_type: transportType,
      status,
      transport_number: transportNumber,
      provider_name: providerName,
      provider_code: nullable(input.providerCode, 20),
      provider_url: url(input.providerUrl),
      reservation_code: nullable(input.reservationCode, 120),
      booking_url: url(input.bookingUrl),
      departure_date: departureDate,
      arrival_date: arrivalDate || null,
      departure_time: departureTime || null,
      arrival_time: arrivalTime || null,
      departure_location: departureLocation,
      arrival_location: arrivalLocation,
      departure_formatted_address: nullable(input.departureFormattedAddress, 1_000),
      arrival_formatted_address: nullable(input.arrivalFormattedAddress, 1_000),
      departure_google_place_id: nullable(input.departureGooglePlaceId, 255),
      arrival_google_place_id: nullable(input.arrivalGooglePlaceId, 255),
      departure_lat: departureLat,
      departure_lng: departureLng,
      arrival_lat: arrivalLat,
      arrival_lng: arrivalLng,
      departure_timezone: nullable(input.departureTimezone, 100),
      arrival_timezone: nullable(input.arrivalTimezone, 100),
      departure_terminal: nullable(input.departureTerminal, 80),
      arrival_terminal: nullable(input.arrivalTerminal, 80),
      departure_gate: nullable(input.departureGate, 40),
      arrival_gate: nullable(input.arrivalGate, 40),
      departure_platform: nullable(input.departurePlatform, 40),
      arrival_platform: nullable(input.arrivalPlatform, 40),
      seat_number: nullable(input.seatNumber, 80),
      cabin_class: nullable(input.cabinClass, 80),
      fare_class: nullable(input.fareClass, 80),
      baggage_info: nullable(input.baggageInfo, 1_000),
      preferred_ride_provider: nullable(input.preferredRideProvider, 100),
      cost,
      currency,
      paid_status: paidStatus,
      notes: nullable(input.notes, 20_000),
      is_private: Boolean(input.isPrivate || parsedAudience.audienceMode === "just_me"),
      audience_mode: parsedAudience.audienceMode,
      trip_leg_id: nullable(input.tripLegId, 80),
      route_stops: routeStops,
    } satisfies Database["public"]["Tables"]["transportation_items"]["Update"],
  };
}

function budgetForm(input: MobileTransportationMutationInput) {
  const form = new FormData();
  form.set("split_method", "equal");
  for (const id of unique(input.participants?.memberIds)) form.append("audience_member_ids", id);
  for (const id of unique(input.participants?.invitationIds)) form.append("audience_invitation_ids", id);
  for (const id of unique(input.participants?.familyMemberIds)) form.append("audience_family_member_ids", id);
  for (const name of unique(input.participants?.guestNames, 25)) form.append("audience_guest_names", name);
  return form;
}

async function replaceParticipants(supabase: TransportClient, tripId: string, itemId: string, parsedAudience: ParsedTripAudience) {
  const error = await replaceTripItemParticipants({ supabase, tripId, itemType: "transportation", itemId, audience: parsedAudience });
  if (error) throw new TransportMutationError("Transportation was saved, but assignments could not be updated.", "operation_failed", 500);
}

export async function createTransportationForUser({ supabase, userId, tripId, input }: { supabase: TransportClient; userId: string; tripId: string; input: MobileTransportationMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const normalized = normalizeTransportationMutationInput(input);
  const { data, error } = await insertTransportationPayloadWithFallback({ supabase, payload: { ...normalized.payload, trip_id: tripId, created_by: userId } });
  if (error || !data) throw new TransportMutationError("Could not create transportation.", "operation_failed", 500);
  const itemId = typeof data.id === "string" ? data.id : "";
  if (!itemId) throw new TransportMutationError("Could not create transportation.", "operation_failed", 500);
  try {
    await replaceParticipants(supabase, tripId, itemId, normalized.parsedAudience);
  } catch (error) {
    await supabase.from("transportation_items").delete().eq("id", itemId).eq("trip_id", tripId);
    throw error;
  }
  try {
    await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "transportation", sourceId: itemId, amount: normalized.cost, currency: normalized.payload.currency, expenseDate: normalized.payload.departure_date, description: normalized.payload.title || "Transportation", formData: budgetForm(input) });
  } catch { /* The web workflow also keeps the transport when optional budget sync fails. */ }
  return data;
}

export async function updateTransportationForUser({ supabase, userId, tripId, itemId, input }: { supabase: TransportClient; userId: string; tripId: string; itemId: string; input: MobileTransportationMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const existing = await supabase.from("transportation_items").select("id").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  if (existing.error || !existing.data) throw new TransportMutationError("Transportation not found.", "not_found", 404);
  const normalized = normalizeTransportationMutationInput(input);
  const error = await updateTransportationPayloadWithFallback({ supabase, tripId, itemId, payload: normalized.payload });
  if (error) throw new TransportMutationError("Could not update transportation.", "operation_failed", 500);
  const { data } = await supabase.from("transportation_items").select("*").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  if (!data) throw new TransportMutationError("Transportation not found.", "not_found", 404);
  await replaceParticipants(supabase, tripId, itemId, normalized.parsedAudience);
  try {
    await syncAutoBudgetExpense({ supabase, userId, tripId, sourceType: "transportation", sourceId: itemId, amount: normalized.cost, currency: normalized.payload.currency, expenseDate: normalized.payload.departure_date, description: normalized.payload.title || "Transportation", formData: budgetForm(input) });
  } catch { /* Preserve successful transport updates when optional budget sync fails. */ }
  return data;
}

export async function deleteTransportationForUser({ supabase, userId, tripId, itemId }: { supabase: TransportClient; userId: string; tripId: string; itemId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const { data, error } = await supabase.from("transportation_items").delete().eq("id", itemId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error) throw new TransportMutationError("Could not delete transportation.", "operation_failed", 500);
  if (!data) throw new TransportMutationError("Transportation not found.", "not_found", 404);
  return { deleted: true as const, itemId };
}

export function parseTransportationMutationInput(value: unknown): MobileTransportationMutationInput {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MobileTransportationMutationInput : { transportType: "", departureDate: "", departureLocation: "", arrivalLocation: "" };
}
