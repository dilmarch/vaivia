import type {
  MobileItineraryItem,
  MobileTripOverview,
  MobileTripOverviewStay,
  MobileTripOverviewTransportation,
  MobileTripSummary,
} from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileJson,
  mobileOptions,
} from "@/lib/mobileApi/server";
import { getIataAirportCode } from "@/lib/airportCodes";
import { getTransportationModeEmoji } from "@/lib/transportationModes";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

type TransportationRow = {
  id: string;
  trip_id: string;
  title: string | null;
  transport_type: string;
  transport_number: string | null;
  departure_date: string | null;
  arrival_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  departure_location: string | null;
  arrival_location: string | null;
  status: string | null;
  notes: string | null;
  sort_order: number | null;
};

type AccommodationRow = {
  id: string;
  hotel_name: string;
  status: string;
  city: string | null;
  region: string | null;
  country: string | null;
  check_in_date: string;
  check_out_date: string;
};

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

function getInitials(label: string) {
  return (
    label
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function getFlagEmoji(countryCode?: string | null) {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";
  return normalized
    .split("")
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
    .join("");
}

function stripLeadingFlag(value: string) {
  return value.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
}

function getCompactRouteLocationLabel(value?: string | null) {
  const location = String(value || "").trim();
  if (!location) return "";
  const airportCode = getIataAirportCode(location);
  if (!airportCode) return location;
  const city = location
    .split(",")
    .map((part) => part.trim())
    .find(
      (part, index) =>
        index > 0 &&
        !/\b(airport|terminal|aerodrome|airfield|international|regional)\b/i.test(
          part,
        ) &&
        !/^[A-Z]{2,3}$/i.test(part),
    );
  return city ? `${airportCode} ${city}` : airportCode;
}

function formatJourneyTime(value?: string | null) {
  const [hours, minutes] = String(value || "").split(":");
  return hours && minutes ? `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}` : "";
}

function getJourneyDateTime(
  date?: string | null,
  time?: string | null,
  endOfDay = false,
) {
  if (!date) return null;
  return new Date(`${date}T${formatJourneyTime(time) || (endOfDay ? "23:59" : "00:00")}:00`);
}

function getPauseLabel(current: TransportationRow, next?: TransportationRow) {
  if (!next) return null;
  const currentEnd = getJourneyDateTime(
    current.arrival_date || current.departure_date,
    current.arrival_time,
    true,
  );
  const nextStart = getJourneyDateTime(next.departure_date, next.departure_time);
  if (!currentEnd || !nextStart) return null;
  const totalHours = Math.round((nextStart.getTime() - currentEnd.getTime()) / 3_600_000);
  if (totalHours <= 0) return null;
  const days = Math.max(1, Math.round(totalHours / 24));
  const duration =
    totalHours >= 24
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${totalHours} hour${totalHours === 1 ? "" : "s"}`;
  const location =
    getCompactRouteLocationLabel(current.arrival_location) || "your connection";
  return `${duration} in ${location}`;
}

function toOverviewTransportation(
  items: TransportationRow[],
): MobileTripOverviewTransportation[] {
  return items.slice(0, 3).map((item, index, visibleItems) => {
    const departureLabel = getCompactRouteLocationLabel(item.departure_location);
    const arrivalLabel = getCompactRouteLocationLabel(item.arrival_location);
    const route = [departureLabel, arrivalLabel].filter(Boolean).join(" → ");
    const startTime = formatJourneyTime(item.departure_time);
    const endTime = formatJourneyTime(item.arrival_time);
    const timeRange =
      startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime;
    const detail = [timeRange, item.transport_number?.trim().toUpperCase()]
      .filter(Boolean)
      .join(" · ");

    return {
      id: item.id,
      modeEmoji: getTransportationModeEmoji(item.transport_type),
      departureLabel: departureLabel || null,
      arrivalLabel: arrivalLabel || null,
      summary: `${getTransportationModeEmoji(item.transport_type)} ${
        route || item.title || "Transportation"
      }`,
      detail: detail || null,
      pauseLabel: getPauseLabel(item, visibleItems[index + 1]),
    };
  });
}

function compareDates(left?: string | null, right?: string | null) {
  return String(left || "").localeCompare(String(right || ""));
}

function isBookedStatus(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  return !normalized || ["booked", "confirmed", "reserved", "paid", "active"].includes(normalized);
}

function buildStayTimeline({
  accommodations,
  tripStartDate,
  tripEndDate,
}: {
  accommodations: AccommodationRow[];
  tripStartDate: string | null;
  tripEndDate: string | null;
}): MobileTripOverviewStay[] {
  const sorted = accommodations
    .filter((stay) => stay.status !== "cancelled")
    .sort((left, right) => compareDates(left.check_in_date, right.check_in_date));
  const entries: MobileTripOverviewStay[] = [];
  let cursorDate = tripStartDate || sorted[0]?.check_in_date || null;

  sorted.forEach((stay) => {
    if (cursorDate && compareDates(cursorDate, stay.check_in_date) < 0) {
      entries.push({
        id: `missing:${cursorDate}:${stay.check_in_date}`,
        checkInDate: cursorDate,
        checkOutDate: stay.check_in_date,
        label: "nothing booked",
        kind: "missing",
        omitCheckIn: entries.at(-1)?.checkOutDate === cursorDate,
      });
    }
    const location = [stay.city, stay.region, stay.country].filter(Boolean).join(", ");
    const booked = isBookedStatus(stay.status);
    entries.push({
      id: stay.id,
      checkInDate: stay.check_in_date,
      checkOutDate: stay.check_out_date,
      label: booked
        ? [stay.hotel_name || "Stay", location || null].filter(Boolean).join(" · ")
        : "tentative, nothing booked",
      kind: booked ? "booked" : "tentative",
      omitCheckIn: entries.at(-1)?.checkOutDate === stay.check_in_date,
    });
    if (!cursorDate || compareDates(cursorDate, stay.check_out_date) < 0) {
      cursorDate = stay.check_out_date;
    }
  });

  if (cursorDate && tripEndDate && compareDates(cursorDate, tripEndDate) < 0) {
    entries.push({
      id: `missing:${cursorDate}:${tripEndDate}`,
      checkInDate: cursorDate,
      checkOutDate: tripEndDate,
      label: "nothing booked",
      kind: "missing",
      omitCheckIn: entries.at(-1)?.checkOutDate === cursorDate,
    });
  }
  return entries;
}

export async function GET(request: Request, { params }: RouteContext) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  const { tripId } = await params;
  const { data: trip, error: tripError } = await context.supabase
    .from("trips")
    .select(
      "id,slug,title,destination,start_date,end_date,cover_image_url,cover_image_source,cover_image_storage_path,cover_image_photographer_name,cover_image_photographer_url,notes,user_id",
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

  const [
    itineraryResult,
    transportationResult,
    accommodationResult,
    memberResult,
    invitationResult,
    familyMembershipResult,
    legResult,
    budgetResult,
    budgetLineItemResult,
    expenseResult,
  ] = await Promise.all([
    context.supabase
      .from("itinerary_items")
      .select("id,trip_id,title,item_date,end_date,start_time,end_time,category,status,location,notes,cover_image_url")
      .eq("trip_id", trip.id)
      .order("item_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("transportation_items")
      .select("id,trip_id,title,transport_type,transport_number,departure_date,arrival_date,departure_time,arrival_time,departure_location,arrival_location,status,notes,sort_order")
      .eq("trip_id", trip.id)
      .order("departure_date", { ascending: true, nullsFirst: false })
      .order("departure_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("trip_accommodations")
      .select("id,hotel_name,status,city,region,country,check_in_date,check_out_date")
      .eq("trip_id", trip.id)
      .eq("is_planning_option", false)
      .order("check_in_date", { ascending: true }),
    context.supabase
      .from("trip_members")
      .select("id,user_id,role,status,created_at")
      .eq("trip_id", trip.id)
      .eq("status", "active"),
    context.supabase
      .from("trip_invitations")
      .select("id,invited_email,invited_username,status,created_at")
      .eq("trip_id", trip.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    context.supabase
      .from("trip_family_members")
      .select("id,family_member_id,status")
      .eq("trip_id", trip.id)
      .eq("status", "going"),
    context.supabase
      .from("trip_legs")
      .select("id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order")
      .eq("trip_id", trip.id)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("trip_budgets")
      .select("id,reporting_currency,total_budget_amount,is_active")
      .eq("trip_id", trip.id)
      .eq("is_active", true)
      .maybeSingle(),
    context.supabase
      .from("trip_budget_line_items")
      .select("planned_amount,currency")
      .eq("trip_id", trip.id),
    context.supabase
      .from("trip_expenses")
      .select("amount,amount_in_reporting_currency,reporting_currency,currency")
      .eq("trip_id", trip.id)
      .is("deleted_at", null),
  ]);

  const requiredError =
    itineraryResult.error ||
    transportationResult.error ||
    accommodationResult.error ||
    memberResult.error ||
    invitationResult.error ||
    familyMembershipResult.error ||
    legResult.error ||
    budgetResult.error ||
    budgetLineItemResult.error ||
    expenseResult.error;
  if (requiredError) {
    console.error("Mobile trip overview request failed:", {
      userId: context.user.id,
      tripId,
      message: requiredError.message,
      code: requiredError.code,
    });
    return mobileJson(request, { error: "Could not load trip overview" }, { status: 500 });
  }

  const memberRows = memberResult.data || [];
  const memberUserIds = Array.from(
    new Set([trip.user_id, ...memberRows.map((member) => member.user_id)].filter(Boolean)),
  ) as string[];
  const familyIds = (familyMembershipResult.data || []).map((member) => member.family_member_id);
  const viewerMembership = memberRows.find((member) => member.user_id === context.user.id);
  const legIds = (legResult.data || []).map((leg) => leg.id);

  const [profileResult, familyResult, viewerLegResult, signedCoverResult] = await Promise.all([
    memberUserIds.length
      ? context.supabase
          .from("connected_public_user_profiles")
          .select("id,first_name,last_name,username,avatar_url")
          .in("id", memberUserIds)
      : Promise.resolve({ data: [], error: null }),
    familyIds.length
      ? context.supabase
          .from("user_family_members")
          .select("id,name,avatar_url")
          .in("id", familyIds)
      : Promise.resolve({ data: [], error: null }),
    viewerMembership && legIds.length
      ? context.supabase
          .from("trip_member_legs")
          .select("trip_leg_id,is_joining,start_date,end_date")
          .eq("trip_id", trip.id)
          .eq("trip_member_id", viewerMembership.id)
          .eq("is_joining", true)
      : Promise.resolve({ data: [], error: null }),
    trip.cover_image_source === "upload" && trip.cover_image_storage_path
      ? context.supabase.storage
          .from("trip-covers")
          .createSignedUrl(trip.cover_image_storage_path, 10 * 60)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const secondaryError = profileResult.error || familyResult.error || viewerLegResult.error;
  if (secondaryError) {
    console.error("Mobile trip overview people request failed:", {
      userId: context.user.id,
      tripId,
      message: secondaryError.message,
      code: secondaryError.code,
    });
    return mobileJson(request, { error: "Could not load trip overview" }, { status: 500 });
  }

  const profilesById = new Map((profileResult.data || []).map((profile) => [profile.id, profile]));
  const going = memberUserIds.map((userId) => {
    const profile = profilesById.get(userId);
    const label =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      profile?.username ||
      "Trip member";
    return {
      id: userId,
      label,
      avatarUrl: profile?.avatar_url || null,
      initial: getInitials(label),
    };
  });
  const familyById = new Map((familyResult.data || []).map((member) => [member.id, member]));
  (familyMembershipResult.data || []).forEach((membership) => {
    const member = familyById.get(membership.family_member_id);
    if (!member) return;
    going.push({
      id: membership.id,
      label: member.name,
      avatarUrl: member.avatar_url,
      initial: getInitials(member.name),
    });
  });
  const invited = (invitationResult.data || []).map((invitation) => {
    const label = invitation.invited_username || invitation.invited_email || "Invited guest";
    return {
      id: invitation.id,
      label,
      avatarUrl: null,
      initial: getInitials(label),
    };
  });

  const viewerLegIds = new Set((viewerLegResult.data || []).map((leg) => leg.trip_leg_id));
  const visibleLegs = viewerLegIds.size
    ? (legResult.data || []).filter((leg) => viewerLegIds.has(leg.id))
    : legResult.data || [];
  const locations = visibleLegs
    .filter((leg) => leg.leg_type !== "accommodation")
    .map((leg) => ({
      id: leg.id,
      flag: leg.icon_emoji || getFlagEmoji(leg.country_code) || "🏳️",
      label: leg.city_name || leg.name,
      startDate: leg.start_date,
      endDate: leg.end_date,
    }));
  if (locations.length === 0) {
    String(trip.destination || "")
      .split(",")
      .map((destination) => destination.trim())
      .filter(Boolean)
      .forEach((destination, index) => {
        const flag = destination.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "🏳️";
        locations.push({
          id: `destination-${index}`,
          flag,
          label: stripLeadingFlag(destination),
          startDate: null,
          endDate: null,
        });
      });
  }

  const viewerLegs = viewerLegResult.data || [];
  const isGroupTripForDateScope =
    memberUserIds.length > 1 || invited.length > 0 || going.length > memberUserIds.length;
  const displayStartDate = viewerLegs.length
    ? viewerLegs.reduce<string | null>(
        (earliest, leg) =>
          leg.start_date && (!earliest || leg.start_date < earliest) ? leg.start_date : earliest,
        null,
      )
    : isGroupTripForDateScope && viewerMembership
      ? null
      : trip.start_date;
  const displayEndDate = viewerLegs.length
    ? viewerLegs.reduce<string | null>((latest, leg) => {
        const endDate = leg.end_date || leg.start_date;
        return endDate && (!latest || endDate > latest) ? endDate : latest;
      }, null)
    : isGroupTripForDateScope && viewerMembership
      ? null
      : trip.end_date || trip.start_date;

  const budget = budgetResult.data;
  const budgeted =
    budget?.total_budget_amount ??
    (budgetLineItemResult.data || []).reduce(
      (total, lineItem) => total + Number(lineItem.planned_amount || 0),
      0,
    );
  const spent = (expenseResult.data || []).reduce(
    (total, expense) =>
      total + Number(expense.amount_in_reporting_currency || expense.amount || 0),
    0,
  );
  const overview: MobileTripOverview = {
    locations,
    going,
    invited,
    displayStartDate,
    displayEndDate,
    missingDateLabel: viewerLegs.length ? "Click to Add Dates" : "Add a leg",
    transportation: toOverviewTransportation(
      (transportationResult.data || []) as TransportationRow[],
    ),
    stays: buildStayTimeline({
      accommodations: (accommodationResult.data || []) as AccommodationRow[],
      tripStartDate: displayStartDate,
      tripEndDate: displayEndDate,
    }),
    budget: {
      currency:
        budget?.reporting_currency ||
        budgetLineItemResult.data?.[0]?.currency ||
        expenseResult.data?.[0]?.reporting_currency ||
        expenseResult.data?.[0]?.currency ||
        "CAD",
      budgeted,
      spent,
      hasBudget: Boolean(budget || budgetLineItemResult.data?.length),
    },
  };

  const signedCoverUrl =
    "signedUrl" in (signedCoverResult.data || {})
      ? (signedCoverResult.data as { signedUrl?: string }).signedUrl || null
      : null;
  const mobileTrip: MobileTripSummary & {
    notes: string | null;
    cover_image_source: string | null;
    cover_image_photographer_name: string | null;
    cover_image_photographer_url: string | null;
  } = {
    id: trip.id,
    slug: trip.slug,
    title: trip.title,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cover_image_url:
      trip.cover_image_source === "upload"
        ? signedCoverUrl
        : trip.cover_image_url,
    cover_image_source: trip.cover_image_source,
    cover_image_photographer_name: trip.cover_image_photographer_name,
    cover_image_photographer_url: trip.cover_image_photographer_url,
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
    const transportLabel = item.transport_type.replaceAll("_", " ");
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
      source: "transportation" as const,
    };
  });
  const mobileItinerary = [...itineraryItems, ...transportationItems].sort(
    (left, right) =>
      left.item_date.localeCompare(right.item_date) ||
      String(left.start_time || "99:99").localeCompare(String(right.start_time || "99:99")),
  );

  return mobileJson(request, { trip: mobileTrip, overview, itinerary: mobileItinerary });
}
