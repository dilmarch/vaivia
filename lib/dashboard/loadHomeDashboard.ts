import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isCountdownUnit, type CountdownUnit } from "@/lib/countdownDisplay";
import type {
  DashboardCountdownTarget,
  DashboardData,
  DashboardEvent,
  DashboardLoadResult,
  DashboardPassportStamp,
  DashboardTrip,
  DashboardWishlistItem,
} from "@/lib/dashboard/contracts";
import { eventLocationLabel } from "@/lib/events/format";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { getUserProfileDefaults } from "@/lib/userProfileDefaults";
import type { Database } from "@/src/types/supabase";

type DashboardClient = SupabaseClient<Database>;
type Planning = NonNullable<DashboardTrip["planning"]>;
type Accommodation = NonNullable<Planning["accommodations"]>[number];
type Transportation = NonNullable<Planning["transportation"]>[number];

function dateTimeIso(date?: string | null, time?: string | null) {
  return date ? `${date}T${time || "00:00"}:00` : null;
}

function yearFromDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : String(date.getFullYear());
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function displayDateRange(trip: DashboardTrip) {
  if ((trip.viewerAssignedLegCount || 0) > 0) {
    return {
      startDate: trip.viewerStartDate || null,
      endDate: trip.viewerEndDate || trip.viewerStartDate || null,
    };
  }
  if (trip.viewerTripMemberId && (trip.memberProfiles || []).length > 0) {
    return { startDate: null, endDate: null };
  }
  return {
    startDate: trip.start_date || null,
    endDate: trip.end_date || trip.start_date || null,
  };
}

async function addPlanningData(client: DashboardClient, trips: DashboardTrip[]) {
  const tripIds = trips.map((trip) => trip.id).filter(Boolean);
  if (!tripIds.length) return trips;
  const [staysResult, transportResult] = await Promise.all([
    client
      .from("trip_accommodations")
      .select("id,trip_id,check_in_date,check_out_date,status,city,region,country")
      .eq("is_planning_option", false)
      .in("trip_id", tripIds),
    client
      .from("transportation_items")
      .select("id,trip_id,departure_location,arrival_location,status,title,transport_type")
      .in("trip_id", tripIds),
  ]);
  if (staysResult.error) {
    console.warn("Could not load dashboard stay tasks:", {
      message: staysResult.error.message,
      code: staysResult.error.code,
    });
  }
  if (transportResult.error) {
    console.warn("Could not load dashboard transportation tasks:", {
      message: transportResult.error.message,
      code: transportResult.error.code,
    });
  }
  const staysByTrip = new Map<string, Accommodation[]>();
  const transportByTrip = new Map<string, Transportation[]>();
  for (const stay of (staysResult.data || []) as Array<Accommodation & { trip_id?: string | null }>) {
    if (!stay.trip_id) continue;
    staysByTrip.set(stay.trip_id, [...(staysByTrip.get(stay.trip_id) || []), stay]);
  }
  for (const item of (transportResult.data || []) as Array<Transportation & { trip_id?: string | null }>) {
    if (!item.trip_id) continue;
    transportByTrip.set(item.trip_id, [...(transportByTrip.get(item.trip_id) || []), item]);
  }
  return trips.map((trip) => ({
    ...trip,
    planning: {
      accommodations: staysByTrip.get(trip.id) || [],
      transportation: transportByTrip.get(trip.id) || [],
    },
  }));
}

async function loadCountdownTarget(client: DashboardClient, trips: DashboardTrip[]) {
  const itineraryIds = trips
    .filter((trip) => trip.countdown_target_type === "itinerary_item")
    .map((trip) => trip.countdown_target_id || trip.countdown_target_itinerary_item_id)
    .filter((id): id is string => Boolean(id));
  const transportIds = trips
    .filter((trip) => trip.countdown_target_type === "transportation_item")
    .map((trip) => trip.countdown_target_id)
    .filter((id): id is string => Boolean(id));
  const [itineraryResult, transportResult] = await Promise.all([
    itineraryIds.length
      ? client.from("itinerary_items").select("id,title,item_date,start_time").in("id", itineraryIds)
      : Promise.resolve({ data: [], error: null }),
    transportIds.length
      ? client.from("transportation_items").select("id,title,departure_date,departure_time,transport_number").in("id", transportIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itineraryResult.error || transportResult.error) {
    console.warn("Could not load one or more dashboard countdown targets.");
  }
  const itineraryTargets = new Map((itineraryResult.data || []).map((item) => [item.id, item]));
  const transportTargets = new Map((transportResult.data || []).map((item) => [item.id, item]));
  const now = Date.now();
  const candidates = trips.flatMap((trip): DashboardCountdownTarget[] => {
    const dates = displayDateRange(trip);
    const fallbackDate = dateTimeIso(dates.startDate);
    let target: DashboardCountdownTarget | null = fallbackDate
      ? { tripTitle: trip.title || "Untitled trip", targetTitle: "Trip begins", targetDateIso: fallbackDate }
      : null;
    if (trip.countdown_target_type === "itinerary_item") {
      const id = trip.countdown_target_id || trip.countdown_target_itinerary_item_id;
      const item = id ? itineraryTargets.get(id) : null;
      const targetDateIso = dateTimeIso(item?.item_date, item?.start_time);
      if (targetDateIso && new Date(targetDateIso).getTime() > now) {
        target = { tripTitle: trip.title || "Untitled trip", targetTitle: item?.title || "Itinerary item", targetDateIso };
      }
    } else if (trip.countdown_target_type === "transportation_item") {
      const item = trip.countdown_target_id ? transportTargets.get(trip.countdown_target_id) : null;
      const targetDateIso = dateTimeIso(item?.departure_date, item?.departure_time);
      if (targetDateIso && new Date(targetDateIso).getTime() > now) {
        target = {
          tripTitle: trip.title || "Untitled trip",
          targetTitle: item?.transport_number || item?.title || "Transportation",
          targetDateIso,
        };
      }
    }
    return target && new Date(target.targetDateIso).getTime() > now ? [target] : [];
  });
  return candidates.sort((left, right) => left.targetDateIso.localeCompare(right.targetDateIso))[0] || null;
}

type EventJoin = {
  id: string;
  status: string;
  events: Array<{
    slug: string;
    title: string;
    starts_at: string;
    timezone: string;
    venue_type?: string | null;
    venue_name?: string | null;
    city?: string | null;
    region?: string | null;
  }> | {
    slug: string;
    title: string;
    starts_at: string;
    timezone: string;
    venue_type?: string | null;
    venue_name?: string | null;
    city?: string | null;
    region?: string | null;
  } | null;
};

async function loadEvents(client: DashboardClient, userId: string) {
  const select = "id,status,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region)";
  const [tickets, rsvps] = await Promise.all([
    client.from("event_tickets").select(select).eq("owner_user_id", userId).in("status", ["active", "checked_in"]),
    client.from("event_rsvps").select(select).eq("user_id", userId).eq("status", "confirmed"),
  ]);
  if (tickets.error || rsvps.error) {
    console.warn("Could not load one or more dashboard event sources.");
  }
  return [
    ...((tickets.data || []) as unknown as EventJoin[]).map((item) => ({ item, admissionType: "Ticket" as const })),
    ...((rsvps.data || []) as unknown as EventJoin[]).map((item) => ({ item, admissionType: "RSVP" as const })),
  ]
    .flatMap(({ item, admissionType }): DashboardEvent[] => {
      const event = Array.isArray(item.events) ? item.events[0] : item.events;
      if (!event) return [];
      return [{
        id: item.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.starts_at,
        timezone: event.timezone,
        venue: eventLocationLabel(event),
        status: item.status,
        admissionType,
      }];
    })
    .filter((event) => new Date(event.startsAt).getTime() >= Date.now())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 3);
}

export async function loadHomeDashboard(
  client: DashboardClient,
  user: User,
  options: { eventClient?: DashboardClient } = {},
): Promise<DashboardLoadResult> {
  const tripsResult = await loadActiveMemberTrips(client, user.id);
  const trips = await addPlanningData(client, (tripsResult.trips || []) as DashboardTrip[]);
  const [profileResult, preferencesResult, stampsResult, wishlistResult, events] = await Promise.all([
    client.from("user_profiles").select("first_name,last_name,username,email,avatar_url,role").eq("id", user.id).maybeSingle(),
    client.from("user_preferences").select("countdown_display_mode").eq("user_id", user.id).maybeSingle(),
    client.from("user_passport_stamps").select("id,country_code,country_name,flag_emoji,first_visited_on,stamped_at,created_at,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag,port_of_entry_name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    client.from("user_travel_bucket_list").select("id,place_label,city,region,country_name,country_code,flag_emoji,status,completed_at,created_at").eq("user_id", user.id).order("status", { ascending: false }).order("created_at", { ascending: false }).limit(12),
    loadEvents(options.eventClient || client, user.id),
  ]);
  const profile = profileResult.data;
  const defaults = getUserProfileDefaults(user);
  const name = profile?.first_name?.trim() || defaults.first_name || profile?.username || defaults.username || profile?.email?.split("@")[0] || defaults.email?.split("@")[0] || "traveller";
  const rawUnit = preferencesResult.data?.countdown_display_mode;
  const countdownUnit: CountdownUnit = typeof rawUnit === "string" && isCountdownUnit(rawUnit) ? rawUnit : "days";
  const passportStamps: DashboardPassportStamp[] = shuffled(stampsResult.data || []).map((stamp) => ({
    id: String(stamp.id),
    countryCode: String(stamp.country_code || "").trim().toUpperCase(),
    countryName: stamp.stamp_display_country_name || stamp.country_name || String(stamp.country_code || "Passport"),
    flagEmoji: stamp.stamp_display_flag || stamp.flag_emoji || null,
    firstVisitYear: yearFromDate(stamp.first_visited_on) || yearFromDate(stamp.stamped_at) || yearFromDate(stamp.created_at),
    welcomeLabel: stamp.welcome_label_snapshot || stamp.arrival_label_snapshot || null,
    airportCode: stamp.first_entry_iata_code || stamp.first_entry_icao_code || null,
    airportCity: stamp.first_entry_city || null,
    portOfEntryName: stamp.port_of_entry_name || stamp.first_entry_airport_name || null,
  }));
  const wishlistItems: DashboardWishlistItem[] = (wishlistResult.data || []).map((item) => ({
    id: String(item.id),
    placeLabel: item.place_label || [item.city, item.region, item.country_name].filter(Boolean).join(", ") || "Wishlist place",
    city: item.city || null,
    region: item.region || null,
    countryName: item.country_name || item.country_code || null,
    flagEmoji: item.flag_emoji || null,
    status: item.status === "completed" ? "completed" : "in_progress",
    completedAt: item.completed_at || null,
  }));
  const data: DashboardData = {
    name,
    countdownTarget: await loadCountdownTarget(client, trips),
    countdownUnit,
    trips,
    passportStamps,
    profile: {
      name,
      username: profile?.username || defaults.username || null,
      email: profile?.email || defaults.email || null,
      avatarUrl: profile?.avatar_url || defaults.avatar_url || null,
    },
    wishlistItems,
    events,
    canManageEvents: ["event_organizer", "super_admin"].includes(profile?.role || ""),
    currentUserId: user.id,
  };
  return {
    data,
    tripLoadError: tripsResult.error
      ? { message: tripsResult.error.message, code: tripsResult.error.code }
      : null,
  };
}
