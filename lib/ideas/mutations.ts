import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IDEA_CATEGORIES,
  IDEA_DAY_VALUES,
  IDEA_TIME_OF_DAY_VALUES,
  normalizeIdeaAgePolicy,
  normalizeIdeaReaction,
  normalizeIdeaTicketPolicy,
  type IdeaReactionType,
} from "@/lib/tripIdeas";
import { createItineraryItemForUser, type ItineraryMutationInput } from "@/lib/itinerary/mutations";
import { resolveTripLegIdForLocation } from "@/lib/tripLegs";
import type { NotepadLocation } from "@/lib/notepadEntries";
import type { Database } from "@/src/types/supabase";

type IdeasSupabase = SupabaseClient<Database>;
type IdeaInsert = Database["public"]["Tables"]["trip_ideas"]["Insert"];
type IdeaRow = Database["public"]["Tables"]["trip_ideas"]["Row"];

export class IdeaMutationError extends Error {
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
    this.name = "IdeaMutationError";
  }
}

export type IdeaMutationInput = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  daysOfWeek?: string[];
  availabilityStartDate?: string | null;
  availabilityEndDate?: string | null;
  timeOfDay?: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  location?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  locationLat?: number | string | null;
  locationLng?: number | string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  locationCountryCode?: string | null;
  locationPostalCode?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  url?: string | null;
  estimatedCost?: number | string | null;
  currency?: string | null;
  is24Hours?: boolean;
  ticketPolicy?: string | null;
  agePolicy?: string | null;
  dressCode?: string | null;
  isPrivate?: boolean;
  tripLegId?: string | null;
};

export type IdeaNotepadInput = {
  entries: string[];
  locations: NotepadLocation[];
};

export type IdeaToItineraryInput = Pick<
  ItineraryMutationInput,
  "itemDate" | "startTime" | "endTime" | "timezone" | "timezoneSource"
>;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unique(values: unknown, allowed?: readonly string[], max = 100) {
  if (!Array.isArray(values)) return [];
  const normalized = values.map((value) => clean(value, 255)).filter(Boolean);
  return Array.from(new Set(allowed ? normalized.filter((value) => allowed.includes(value)) : normalized)).slice(0, max);
}

function validDate(value: string) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function validTime(value: string) {
  return !value || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function numberOrNull(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
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

function normalizeIdeaInput(input: IdeaMutationInput): Omit<IdeaInsert, "trip_id" | "created_by"> {
  const title = clean(input.title, 240);
  const location = clean(input.location, 500);
  const formattedAddress = clean(input.formattedAddress, 1000);
  const availabilityStartDate = clean(input.availabilityStartDate, 10);
  const availabilityEndDate = clean(input.availabilityEndDate, 10);
  const opensAt = clean(input.opensAt, 8);
  const closesAt = clean(input.closesAt, 8);
  const fieldErrors: Record<string, string[]> = {};
  if (!title && !location && !formattedAddress) fieldErrors.location = ["Add a location or name."];
  if (!validDate(availabilityStartDate)) fieldErrors.availabilityStartDate = ["Choose a valid start date."];
  if (!validDate(availabilityEndDate) || (availabilityStartDate && availabilityEndDate && availabilityEndDate < availabilityStartDate)) {
    fieldErrors.availabilityEndDate = ["End date must be on or after the start date."];
  }
  if (!validTime(opensAt)) fieldErrors.opensAt = ["Choose a valid opening time."];
  if (!validTime(closesAt)) fieldErrors.closesAt = ["Choose a valid closing time."];
  const locationLat = numberOrNull(input.locationLat, -90, 90);
  const locationLng = numberOrNull(input.locationLng, -180, 180);
  if (input.locationLat !== null && input.locationLat !== undefined && input.locationLat !== "" && locationLat === null) {
    fieldErrors.locationLat = ["Latitude is invalid."];
  }
  if (input.locationLng !== null && input.locationLng !== undefined && input.locationLng !== "" && locationLng === null) {
    fieldErrors.locationLng = ["Longitude is invalid."];
  }
  if (Object.keys(fieldErrors).length) {
    throw new IdeaMutationError("Check the idea details and try again.", "validation_error", 422, fieldErrors);
  }
  const category = clean(input.category, 100);
  const normalizedCategory = IDEA_CATEGORIES.includes(category as (typeof IDEA_CATEGORIES)[number]) ? category : "Other";
  const estimatedCost = input.estimatedCost === null || input.estimatedCost === undefined || input.estimatedCost === ""
    ? null
    : Number(input.estimatedCost);
  if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    throw new IdeaMutationError("Estimated cost must be a positive number.", "validation_error", 422, { estimatedCost: ["Estimated cost must be a positive number."] });
  }
  return {
    title: title || location || formattedAddress || "Activity idea",
    description: clean(input.description, 20_000) || null,
    category: normalizedCategory,
    tags: unique(input.tags, undefined, 50),
    days_of_week: unique(input.daysOfWeek, IDEA_DAY_VALUES),
    availability_start_date: availabilityStartDate || null,
    availability_end_date: availabilityEndDate || null,
    time_of_day: unique(input.timeOfDay, IDEA_TIME_OF_DAY_VALUES),
    opens_at: input.is24Hours ? "00:00" : opensAt || null,
    closes_at: input.is24Hours ? "23:59" : closesAt || null,
    location: location || null,
    formatted_address: formattedAddress || null,
    google_place_id: clean(input.googlePlaceId, 255) || null,
    location_lat: locationLat,
    location_lng: locationLng,
    location_city: clean(input.locationCity, 255) || null,
    location_region: clean(input.locationRegion, 255) || null,
    location_country: clean(input.locationCountry, 255) || null,
    location_country_code: clean(input.locationCountryCode, 2).toUpperCase() || null,
    location_postal_code: clean(input.locationPostalCode, 32) || null,
    timezone: clean(input.timezone, 100) || null,
    timezone_source: clean(input.timezoneSource, 40) || "manual",
    url: safeUrl(input.url),
    estimated_cost: estimatedCost,
    currency: clean(input.currency, 3).toUpperCase() || "CAD",
    is_24_hours: Boolean(input.is24Hours),
    ticket_policy: normalizeIdeaTicketPolicy(input.ticketPolicy),
    age_policy: normalizeIdeaAgePolicy(input.agePolicy),
    dress_code: clean(input.dressCode, 1000) || null,
    is_private: Boolean(input.isPrivate),
    trip_leg_id: clean(input.tripLegId, 80) || null,
  };
}

async function requireTripAccess(supabase: IdeasSupabase, tripId: string, userId: string) {
  if (!tripId) throw new IdeaMutationError("Trip is required.", "validation_error", 422, { tripId: ["Trip is required."] });
  const { data: trip, error } = await supabase.from("trips").select("id,user_id,archived_at").eq("id", tripId).maybeSingle();
  if (error || !trip) throw new IdeaMutationError("Trip not found.", "not_found", 404);
  if (trip.archived_at) throw new IdeaMutationError("Archived trips cannot be changed.", "conflict", 409);
  if (trip.user_id === userId) return { isOwner: true };
  const { data: member } = await supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", userId).in("status", ["active", "accepted"]).maybeSingle();
  if (!member) throw new IdeaMutationError("You cannot change this trip.", "forbidden", 403);
  return { isOwner: false };
}

async function requireIdea(supabase: IdeasSupabase, tripId: string, ideaId: string) {
  const { data, error } = await supabase.from("trip_ideas").select("*").eq("id", ideaId).eq("trip_id", tripId).maybeSingle();
  if (error || !data) throw new IdeaMutationError("Trip idea not found.", "not_found", 404);
  return data;
}

async function resolveLeg(supabase: IdeasSupabase, tripId: string, input: IdeaMutationInput) {
  return resolveTripLegIdForLocation({
    supabase,
    tripId,
    explicitTripLegId: clean(input.tripLegId, 80),
    city: clean(input.locationCity, 255),
    region: clean(input.locationRegion, 255),
    country: clean(input.locationCountry, 255),
    countryCode: clean(input.locationCountryCode, 2),
  });
}

export async function createIdeaForUser({ supabase, userId, tripId, input }: { supabase: IdeasSupabase; userId: string; tripId: string; input: IdeaMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const payload = normalizeIdeaInput(input);
  payload.trip_leg_id = await resolveLeg(supabase, tripId, input);
  const { data, error } = await supabase.from("trip_ideas").insert({ ...payload, trip_id: tripId, created_by: userId }).select("*").single();
  if (error || !data) throw new IdeaMutationError(error?.code === "23505" ? "This idea already exists." : "Could not create trip idea.", error?.code === "23505" ? "conflict" : "operation_failed", error?.code === "23505" ? 409 : 500);
  if (!data.is_private) {
    await supabase.rpc("notify_trip_members", { target_trip_id: tripId, notification_type: "trip_item_added", notification_title: "Trip idea added", notification_body: `${data.title} was added to the trip.`, notification_metadata: { itemType: "trip_idea" } });
  }
  return data;
}

export async function createIdeasFromNotepadForUser({ supabase, userId, tripId, input }: { supabase: IdeasSupabase; userId: string; tripId: string; input: IdeaNotepadInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const entries = input.entries.map((entry) => clean(entry, 240)).filter(Boolean).slice(0, 30);
  const locations = input.locations.slice(0, 10).map((location) => ({
    ...location,
    key: clean(location.key, 255),
    label: clean(location.label, 500),
    tripLegId: clean(location.tripLegId, 80) || null,
  })).filter((location) => location.key && location.label);
  if (!entries.length || !locations.length) throw new IdeaMutationError("Choose at least one trip city and enter at least one idea.", "validation_error", 422);
  if (entries.length * locations.length > 100) throw new IdeaMutationError("Create no more than 100 idea cards at a time.", "validation_error", 422);
  const requestedLegIds = locations.map((location) => location.tripLegId).filter(Boolean) as string[];
  const validLegIds = new Set<string>();
  if (requestedLegIds.length) {
    const { data } = await supabase.from("trip_legs").select("id").eq("trip_id", tripId).in("id", requestedLegIds);
    (data || []).forEach((row) => validLegIds.add(row.id));
  }
  const payloads: IdeaInsert[] = locations.flatMap((location) => entries.map((title) => ({
    trip_id: tripId,
    created_by: userId,
    title,
    category: "Other",
    tags: [],
    days_of_week: [],
    time_of_day: [],
    location: location.label,
    location_city: clean(location.city, 255) || location.label,
    location_country: clean(location.country, 255) || null,
    location_country_code: clean(location.countryCode, 2).toUpperCase() || null,
    google_place_id: clean(location.googlePlaceId, 255) || null,
    trip_leg_id: location.tripLegId && validLegIds.has(location.tripLegId) ? location.tripLegId : null,
    is_private: false,
    is_archived: false,
    attended: false,
  })));
  const { data, error } = await supabase.from("trip_ideas").insert(payloads).select("*");
  if (error || !data) throw new IdeaMutationError("Could not create all idea cards.", "operation_failed", 500);
  await supabase.rpc("notify_trip_members", { target_trip_id: tripId, notification_type: "trip_item_added", notification_title: "Trip ideas added", notification_body: `${payloads.length} ideas were added from the trip notepad.`, notification_metadata: { itemType: "trip_idea" } });
  return data;
}

export async function updateIdeaForUser({ supabase, userId, tripId, ideaId, input }: { supabase: IdeasSupabase; userId: string; tripId: string; ideaId: string; input: IdeaMutationInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const existing = await requireIdea(supabase, tripId, ideaId);
  if (existing.is_private && existing.created_by !== userId) throw new IdeaMutationError("You cannot edit this private idea.", "forbidden", 403);
  if (input.isPrivate && existing.created_by !== userId) throw new IdeaMutationError("Only the idea creator can make it private.", "forbidden", 403);
  const payload = normalizeIdeaInput(input);
  if (input.url === undefined) payload.url = existing.url;
  if (input.estimatedCost === undefined) payload.estimated_cost = existing.estimated_cost;
  if (input.currency === undefined) payload.currency = existing.currency;
  if (input.timezone === undefined) payload.timezone = existing.timezone;
  if (input.timezoneSource === undefined) payload.timezone_source = existing.timezone_source;
  payload.trip_leg_id = await resolveLeg(supabase, tripId, input);
  const { data, error } = await supabase.from("trip_ideas").update(payload).eq("id", ideaId).eq("trip_id", tripId).select("*").maybeSingle();
  if (error || !data) throw new IdeaMutationError("Could not update trip idea.", "operation_failed", 500);
  return data;
}

export async function deleteIdeaForUser({ supabase, userId, tripId, ideaId }: { supabase: IdeasSupabase; userId: string; tripId: string; ideaId: string }) {
  await requireTripAccess(supabase, tripId, userId);
  const existing = await requireIdea(supabase, tripId, ideaId);
  if (existing.is_private && existing.created_by !== userId) throw new IdeaMutationError("You cannot delete this private idea.", "forbidden", 403);
  const { data, error } = await supabase.from("trip_ideas").delete().eq("id", ideaId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) throw new IdeaMutationError("Could not delete trip idea.", "operation_failed", 500);
  return { deleted: true as const, ideaId };
}

export async function setIdeaAttendedForUser({ supabase, userId, tripId, ideaId, attended }: { supabase: IdeasSupabase; userId: string; tripId: string; ideaId: string; attended: boolean }) {
  await requireTripAccess(supabase, tripId, userId);
  const existing = await requireIdea(supabase, tripId, ideaId);
  if (existing.is_private && existing.created_by !== userId) throw new IdeaMutationError("You cannot change this private idea.", "forbidden", 403);
  const { data, error } = await supabase.from("trip_ideas").update({ attended }).eq("id", ideaId).eq("trip_id", tripId).select("*").maybeSingle();
  if (error || !data) throw new IdeaMutationError("Could not update attended status.", "operation_failed", 500);
  return data;
}

export async function toggleIdeaReactionForUser({ supabase, userId, tripId, ideaId, reaction }: { supabase: IdeasSupabase; userId: string; tripId: string; ideaId: string; reaction: IdeaReactionType }) {
  const access = await requireTripAccess(supabase, tripId, userId);
  if (!access.isOwner) throw new IdeaMutationError("Only the trip owner can react to ideas with the current trip permissions.", "forbidden", 403);
  await requireIdea(supabase, tripId, ideaId);
  const normalized = normalizeIdeaReaction(reaction);
  if (!normalized) throw new IdeaMutationError("Choose a valid reaction.", "validation_error", 422, { reaction: ["Choose a valid reaction."] });
  const { data: existing, error: loadError } = await supabase.from("trip_idea_reactions").select("id,reaction").eq("trip_id", tripId).eq("idea_id", ideaId).eq("user_id", userId).maybeSingle();
  if (loadError) throw new IdeaMutationError("Could not load idea reaction.", "operation_failed", 500);
  if (existing?.reaction === normalized) {
    const { error } = await supabase.from("trip_idea_reactions").delete().eq("id", existing.id).eq("user_id", userId);
    if (error) throw new IdeaMutationError("Could not remove idea reaction.", "operation_failed", 500);
    return { reaction: null };
  }
  const { error } = await supabase.from("trip_idea_reactions").upsert({ trip_id: tripId, idea_id: ideaId, user_id: userId, reaction: normalized }, { onConflict: "idea_id,user_id" });
  if (error) throw new IdeaMutationError("Could not update idea reaction.", "operation_failed", 500);
  return { reaction: normalized };
}

export function ideaToItineraryInput(idea: IdeaRow, input: IdeaToItineraryInput): ItineraryMutationInput {
  return {
    title: idea.title,
    category: "activity",
    status: "tentative",
    itemDate: input.itemDate,
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone,
    timezoneSource: input.timezoneSource,
    location: idea.location,
    formattedAddress: idea.formatted_address,
    googlePlaceId: idea.google_place_id,
    locationLat: idea.location_lat,
    locationLng: idea.location_lng,
    url: idea.url,
    notes: idea.description,
    isPrivate: idea.is_private,
    tripLegId: idea.trip_leg_id,
    sourceIdeaId: idea.id,
  };
}

export async function addIdeaToItineraryForUser({ supabase, userId, tripId, ideaId, input }: { supabase: IdeasSupabase; userId: string; tripId: string; ideaId: string; input: IdeaToItineraryInput }) {
  await requireTripAccess(supabase, tripId, userId);
  const idea = await requireIdea(supabase, tripId, ideaId);
  return createItineraryItemForUser({ supabase, userId, tripId, input: ideaToItineraryInput(idea, input) });
}

export function parseIdeaMutationInput(value: Record<string, unknown> | null): IdeaMutationInput {
  const input = value || {};
  const has = (field: string) => Object.prototype.hasOwnProperty.call(input, field);
  return {
    title: clean(input.title, 240), description: clean(input.description, 20_000), category: clean(input.category, 100),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [], daysOfWeek: Array.isArray(input.daysOfWeek) ? input.daysOfWeek.map(String) : [],
    availabilityStartDate: clean(input.availabilityStartDate, 10), availabilityEndDate: clean(input.availabilityEndDate, 10),
    timeOfDay: Array.isArray(input.timeOfDay) ? input.timeOfDay.map(String) : [], opensAt: clean(input.opensAt, 8), closesAt: clean(input.closesAt, 8),
    location: clean(input.location, 500), formattedAddress: clean(input.formattedAddress, 1000), googlePlaceId: clean(input.googlePlaceId, 255),
    locationLat: input.locationLat as number | string | null, locationLng: input.locationLng as number | string | null,
    locationCity: clean(input.locationCity, 255), locationRegion: clean(input.locationRegion, 255), locationCountry: clean(input.locationCountry, 255),
    locationCountryCode: clean(input.locationCountryCode, 2), locationPostalCode: clean(input.locationPostalCode, 32), timezone: has("timezone") ? clean(input.timezone, 100) : undefined,
    timezoneSource: has("timezoneSource") ? clean(input.timezoneSource, 40) : undefined, url: has("url") ? clean(input.url, 4000) : undefined,
    estimatedCost: has("estimatedCost") ? input.estimatedCost as number | string | null : undefined,
    currency: has("currency") ? clean(input.currency, 3) : undefined, is24Hours: input.is24Hours === true, ticketPolicy: clean(input.ticketPolicy, 40), agePolicy: clean(input.agePolicy, 40),
    dressCode: clean(input.dressCode, 1000), isPrivate: input.isPrivate === true, tripLegId: clean(input.tripLegId, 80),
  };
}

export function parseIdeaFormData(formData: FormData): IdeaMutationInput {
  const stringList = (name: string) => formData.getAll(name).map(String).map((value) => value.trim()).filter(Boolean);
  const tags = clean(formData.get("tags"), 5000).split(",").map((tag) => tag.trim()).filter(Boolean);
  return parseIdeaMutationInput({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    tags,
    daysOfWeek: [...stringList("days_of_week"), ...stringList("days_available")].map((day) => day.toLowerCase()),
    availabilityStartDate: formData.get("availability_start_date"),
    availabilityEndDate: formData.get("availability_end_date"),
    timeOfDay: stringList("time_of_day").map((time) => time.toLowerCase().replaceAll(" ", "_")),
    opensAt: formData.get("opens_at"),
    closesAt: formData.get("closes_at"),
    location: formData.get("location"),
    formattedAddress: formData.get("formatted_address"),
    googlePlaceId: formData.get("google_place_id"),
    locationLat: formData.get("location_lat"),
    locationLng: formData.get("location_lng"),
    locationCity: formData.get("location_city"),
    locationRegion: formData.get("location_region"),
    locationCountry: formData.get("location_country"),
    locationCountryCode: formData.get("location_country_code"),
    locationPostalCode: formData.get("location_postal_code"),
    url: formData.get("url") || formData.get("location_website") || formData.get("location_website_visible"),
    is24Hours: formData.get("is_24_hours") === "on" || formData.get("is_24_hours") === "true",
    ticketPolicy: formData.get("ticket_policy") || formData.get("ticket_type"),
    agePolicy: formData.get("age_policy"),
    dressCode: formData.get("dress_code"),
    isPrivate: formData.get("is_private") === "on" || formData.get("is_private") === "true",
    tripLegId: formData.get("trip_leg_id"),
  });
}
