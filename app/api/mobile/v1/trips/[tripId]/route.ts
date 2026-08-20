import type {
  MobileItineraryItem,
  MobileStayCoverageLeg,
  MobileStayCoverageTraveler,
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
import { buildAccommodationItineraryHolds } from "@/lib/accommodationItineraryHolds";
import { buildFlightDepartureBuffers } from "@/lib/flightDepartureBuffers";
import { getIataAirportCode } from "@/lib/airportCodes";
import {
  FALLBACK_CATEGORY_COLOR,
  FALLBACK_CATEGORY_LABEL,
} from "@/lib/itineraryCategories";
import { getAirlineCodeFromFlightNumber } from "@/lib/airlineIcons";
import { getTransportationModeEmoji } from "@/lib/transportationModes";
import {
  attachIdeaReactions,
  normalizeTripIdea,
  type IdeaReactionUserProfile,
  type TripIdeaReactionRecord,
} from "@/lib/tripIdeas";
import {
  normalizeBudget,
  normalizeBudgetLineItem,
  normalizeExpense,
  normalizeExpenseSettlement,
  normalizeExpenseSplit,
} from "@/lib/budgetServer";
import type { BudgetParticipant } from "@/lib/budget";
import {
  attachFoodMetadata,
  normalizeTripFoodItem,
  type TripFoodReactionRecord,
  type TripFoodTriedRecord,
} from "@/lib/tripFood";
import type { IdeaReactionProfile } from "@/lib/tripIdeas";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { fetchGovernmentTravelAdvisories } from "@/lib/governmentTravelAdvisories";
import { loadTripDestinations } from "@/lib/tripDestinations";
import type { Tables } from "@/src/types/supabase";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

type TransportationRow = Tables<"transportation_items">;
type AccommodationRow = Tables<"trip_accommodations">;

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
  const viewerUserId = context.user.id;
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

  const healthSafetyPromise = Promise.all([
    loadTripDestinations({
      supabase: context.supabase,
      tripId: trip.id,
      legacyDestination: trip.destination,
    }),
    fetchGovernmentTravelAdvisories(),
  ]);

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
    ideaResult,
    foodResult,
    expenseSplitResult,
    expenseSettlementResult,
    financeSettingsResult,
  ] = await Promise.all([
    context.supabase
      .from("itinerary_items")
      .select("id,trip_id,title,item_date,end_date,start_time,end_time,category,category_id,status,location,notes,cover_image_url,timezone,is_private,audience_mode,sort_order")
      .eq("trip_id", trip.id)
      .order("item_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("transportation_items")
      .select("id,trip_id,title,transport_type,transport_number,departure_date,arrival_date,departure_time,arrival_time,departure_location,arrival_location,departure_timezone,arrival_timezone,departure_terminal,arrival_terminal,status,notes,sort_order,provider_name,provider_code,reservation_code,is_private,audience_mode,itinerary_item_id")
      .eq("trip_id", trip.id)
      .order("departure_date", { ascending: true, nullsFirst: false })
      .order("departure_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("trip_accommodations")
      .select("id,trip_id,created_by,hotel_name,status,city,region,country,address,google_maps_url,google_place_id,check_in_date,check_out_date,free_cancellation_ends_on,check_in_time_start,check_in_time_end,check_out_time,accommodation_type,is_private,audience_mode,website,booking_url,cost,currency,notes,trip_leg_id,created_at,updated_at")
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
      .select("id,invited_email,invited_username,status,created_at,invitation_scope")
      .eq("trip_id", trip.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    context.supabase
      .from("trip_family_members")
      .select("id,family_member_id,status")
      .eq("trip_id", trip.id),
    context.supabase
      .from("trip_legs")
      .select("id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order")
      .eq("trip_id", trip.id)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("trip_budgets")
      .select("id,trip_id,name,reporting_currency,total_budget_amount,is_active")
      .eq("trip_id", trip.id)
      .eq("is_active", true)
      .maybeSingle(),
    context.supabase
      .from("trip_budget_line_items")
      .select("id,budget_id,trip_id,category_id,name,linked_expense_category,planned_amount,currency,notes,sort_order")
      .eq("trip_id", trip.id)
      .order("sort_order", { ascending: true }),
    context.supabase
      .from("trip_expenses")
      .select("id,trip_id,expense_date,transaction_date,description,category,budget_category_id,amount,currency,original_amount,original_currency,reporting_currency,fetched_exchange_rate,manual_exchange_rate,exchange_rate_used,exchange_rate_is_manual,amount_in_reporting_currency,paid_by_trip_member_id,paid_by_invitation_id,paid_by_family_member_id,paid_by_user_id,paid_by_guest_name,split_method,source_type,transportation_item_id,itinerary_event_id,accommodation_id,notes,created_at,updated_at")
      .eq("trip_id", trip.id)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false }),
    context.supabase
      .from("trip_ideas")
      .select("id,trip_id,created_by,title,description,category,tags,days_of_week,availability_start_date,availability_end_date,time_of_day,opens_at,closes_at,location,formatted_address,google_place_id,location_city,location_region,location_country,location_country_code,is_24_hours,ticket_policy,age_policy,dress_code,is_private,is_archived,attended,created_at,updated_at")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: true }),
    context.supabase
      .from("trip_food_items")
      .select("id,trip_id,item_type,name,description,region,personal_note,google_place_id,place_source,formatted_address,location_lat,location_lng,primary_place_type,place_types,business_status,regular_opening_hours,website_url,phone_number,google_maps_url,facebook_url,instagram_url,meal_categories,created_by,created_at,updated_at")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("trip_expense_splits")
      .select("id,expense_id,trip_id,participant_kind,trip_member_id,invitation_id,family_member_id,user_id,guest_name,split_amount,split_percentage,currency,amount_in_reporting_currency,is_included")
      .eq("trip_id", trip.id),
    context.supabase
      .from("trip_expense_settlements")
      .select("id,trip_id,paid_by_participant_value,received_by_participant_value,amount,reporting_currency,settled_on,created_by,created_at")
      .eq("trip_id", trip.id)
      .order("settled_on", { ascending: false }),
    context.supabase
      .from("user_finance_settings")
      .select("home_currency")
      .eq("user_id", context.user.id)
      .maybeSingle(),
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
    expenseResult.error ||
    ideaResult.error ||
    foodResult.error ||
    expenseSplitResult.error ||
    expenseSettlementResult.error ||
    financeSettingsResult.error;
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
  const rawItineraryItems = itineraryResult.data || [];
  const rawTransportationItems = transportationResult.data || [];
  const rawIdeas = ((ideaResult.data || []) as Record<string, unknown>[]).map(
    normalizeTripIdea,
  );
  const rawFoodItems = ((foodResult.data || []) as Record<string, unknown>[]).map(
    normalizeTripFoodItem,
  );
  const mobileBudget = normalizeBudget(
    budgetResult.data as Record<string, unknown> | null,
  );
  const mobileBudgetLineItems = (
    (budgetLineItemResult.data || []) as Record<string, unknown>[]
  ).map(normalizeBudgetLineItem);
  const mobileExpenses = (
    (expenseResult.data || []) as Record<string, unknown>[]
  ).map(normalizeExpense);
  const mobileExpenseSplits = (
    (expenseSplitResult.data || []) as Record<string, unknown>[]
  ).map(normalizeExpenseSplit);
  const mobileExpenseSettlements = (
    (expenseSettlementResult.data || []) as Record<string, unknown>[]
  ).map(normalizeExpenseSettlement);
  const itineraryItemIds = rawItineraryItems.map((item) => item.id);
  const transportationItemIds = rawTransportationItems.map((item) => item.id);
  const accommodationIds = (accommodationResult.data || []).map((item) => item.id);
  const categoryIds = Array.from(
    new Set(rawItineraryItems.map((item) => item.category_id).filter(Boolean)),
  ) as string[];
  const participantItemIds = [
    ...itineraryItemIds,
    ...transportationItemIds,
    ...accommodationIds,
  ];
  const ideaIds = rawIdeas.map((idea) => idea.id).filter(Boolean);
  const foodItemIds = rawFoodItems.map((item) => item.id).filter(Boolean);

  const [
    profileResult,
    familyResult,
    viewerLegResult,
    signedCoverResult,
    categoryResult,
    participantResult,
    transportationTravelerResult,
    ideaReactionResult,
    foodReactionResult,
    foodTriedResult,
    coverageMemberLegResult,
    invitationLegResult,
  ] = await Promise.all([
    memberUserIds.length
      ? context.supabase
          .from("connected_public_user_profiles")
          .select("id,first_name,last_name,username,avatar_url")
          .in("id", memberUserIds)
      : Promise.resolve({ data: [], error: null }),
    familyIds.length
      ? context.supabase
          .from("user_family_members")
          .select("id,name,relationship,avatar_url")
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
    categoryIds.length
      ? context.supabase
          .from("user_categories")
          .select("id,name,color_key")
          .in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    participantItemIds.length
      ? context.supabase
          .from("trip_item_participants")
          .select("item_type,item_id,participant_kind,trip_member_id,invitation_id,family_member_id,guest_name,user_id")
          .eq("trip_id", trip.id)
          .in("item_id", participantItemIds)
      : Promise.resolve({ data: [], error: null }),
    transportationItemIds.length
      ? context.supabase
          .from("transportation_item_travelers")
          .select(
            "id,transportation_item_id,user_id,family_member_id,guest_name,created_at",
          )
          .eq("trip_id", trip.id)
          .in("transportation_item_id", transportationItemIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ideaIds.length
      ? context.supabase
          .from("trip_idea_reactions")
          .select("idea_id,user_id,reaction,score")
          .eq("trip_id", trip.id)
          .in("idea_id", ideaIds)
      : Promise.resolve({ data: [], error: null }),
    foodItemIds.length
      ? context.supabase
          .from("trip_food_reactions")
          .select("food_item_id,user_id,reaction,score")
          .eq("trip_id", trip.id)
          .in("food_item_id", foodItemIds)
      : Promise.resolve({ data: [], error: null }),
    foodItemIds.length
      ? context.supabase
          .from("trip_food_tried")
          .select("food_item_id,user_id")
          .eq("trip_id", trip.id)
          .in("food_item_id", foodItemIds)
      : Promise.resolve({ data: [], error: null }),
    legIds.length
      ? context.supabase
          .from("trip_member_legs")
          .select("trip_leg_id,trip_member_id,is_joining,start_date,end_date")
          .eq("trip_id", trip.id)
          .in("trip_leg_id", legIds)
      : Promise.resolve({ data: [], error: null }),
    invitationResult.data?.length && legIds.length
      ? context.supabase
          .from("trip_invitation_legs")
          .select("invitation_id,trip_leg_id,is_included")
          .eq("trip_id", trip.id)
          .eq("is_included", true)
          .in(
            "invitation_id",
            invitationResult.data.map((invitation) => invitation.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const secondaryError =
    profileResult.error ||
    familyResult.error ||
    viewerLegResult.error ||
    categoryResult.error ||
    participantResult.error ||
    transportationTravelerResult.error ||
    ideaReactionResult.error ||
    foodReactionResult.error ||
    foodTriedResult.error ||
    coverageMemberLegResult.error ||
    invitationLegResult.error;
  if (secondaryError) {
    console.error("Mobile trip overview people request failed:", {
      userId: context.user.id,
      tripId,
      message: secondaryError.message,
      code: secondaryError.code,
    });
    return mobileJson(request, { error: "Could not load trip overview" }, { status: 500 });
  }

  const categoryRows = categoryResult.data || [];
  const categoryColorKeys = Array.from(
    new Set(categoryRows.map((category) => category.color_key).filter(Boolean)),
  ) as string[];
  const categoryColorResult = categoryColorKeys.length
    ? await context.supabase
        .from("category_color_options")
        .select("key,hex")
        .in("key", categoryColorKeys)
    : { data: [], error: null };
  if (categoryColorResult.error) {
    console.error("Mobile itinerary category request failed:", {
      userId: context.user.id,
      tripId,
      message: categoryColorResult.error.message,
      code: categoryColorResult.error.code,
    });
    return mobileJson(request, { error: "Could not load trip itinerary" }, { status: 500 });
  }

  const profilesById = new Map((profileResult.data || []).map((profile) => [profile.id, profile]));
  const ideaReactions = (ideaReactionResult.data || []) as TripIdeaReactionRecord[];
  const foodReactions = (foodReactionResult.data || []) as TripFoodReactionRecord[];
  const foodTriedRows = (foodTriedResult.data || []) as TripFoodTriedRecord[];
  const missingReactionProfileIds = Array.from(
    new Set(
      [
        ...ideaReactions.map((reaction) => reaction.user_id),
        ...foodReactions.map((reaction) => reaction.user_id),
        ...foodTriedRows.map((tried) => tried.user_id),
      ]
        .filter((userId) => !profilesById.has(userId)),
    ),
  );
  const additionalReactionProfilesResult = missingReactionProfileIds.length
    ? await context.supabase
        .from("connected_public_user_profiles")
        .select("id,first_name,last_name,username,avatar_url")
        .in("id", missingReactionProfileIds)
    : { data: [], error: null };
  if (additionalReactionProfilesResult.error) {
    console.error("Mobile trip reaction profiles request failed:", {
      userId: context.user.id,
      tripId,
      message: additionalReactionProfilesResult.error.message,
      code: additionalReactionProfilesResult.error.code,
    });
    return mobileJson(request, { error: "Could not load trip reactions" }, { status: 500 });
  }
  const reactionProfiles = [
    ...(profileResult.data || []),
    ...(additionalReactionProfilesResult.data || []),
  ];
  const ideaReactionProfiles = reactionProfiles as IdeaReactionUserProfile[];
  const foodProfilesById = new Map<string, IdeaReactionProfile>();
  reactionProfiles.forEach((profile) => {
    if (!profile.id) return;
    foodProfilesById.set(profile.id, {
      user_id: profile.id,
      avatar_url: profile.avatar_url || null,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
      username: profile.username || null,
    });
  });
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
  (familyMembershipResult.data || [])
    .filter((membership) => membership.status === "going")
    .forEach((membership) => {
    const member = familyById.get(membership.family_member_id);
    if (!member) return;
    going.push({
      id: membership.id,
      label: member.name,
      avatarUrl: member.avatar_url,
      initial: getInitials(member.name),
    });
  });
  const memberByUserId = new Map(
    memberRows.map((member) => [member.user_id, member]),
  );
  const budgetParticipants: BudgetParticipant[] = [
    ...memberUserIds.map((userId) => {
      const profile = profilesById.get(userId);
      const member = memberByUserId.get(userId);
      const label =
        [profile?.first_name, profile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        profile?.username ||
        "Trip member";
      return {
        id: member?.id || `owner:${userId}`,
        kind: "member" as const,
        label,
        secondaryLabel: profile?.username ? `@${profile.username}` : null,
        avatarUrl: profile?.avatar_url || null,
        userId,
        tripMemberId: member?.id || null,
        isCurrentUser: userId === context.user.id,
      };
    }),
    ...(invitationResult.data || []).map((invitation) => {
      const label =
        invitation.invited_username ||
        invitation.invited_email ||
        "Pending invite";
      return {
        id: invitation.id,
        kind: "invitation" as const,
        label,
        secondaryLabel: "Pending invitation",
        invitationId: invitation.id,
      };
    }),
    ...(familyMembershipResult.data || []).map((membership) => {
      const member = familyById.get(membership.family_member_id);
      return {
        id: membership.family_member_id || membership.id,
        kind: "family_member" as const,
        label: member?.name || "Family member",
        secondaryLabel: "Managed by you",
        avatarUrl: member?.avatar_url || null,
        familyMemberId: membership.family_member_id,
      };
    }),
  ];
  const invited = (invitationResult.data || []).map((invitation) => {
    const label = invitation.invited_username || invitation.invited_email || "Invited guest";
    return {
      id: invitation.id,
      label,
      avatarUrl: null,
      initial: getInitials(label),
    };
  });
  const invitationById = new Map(
    (invitationResult.data || []).map((invitation) => [invitation.id, invitation]),
  );
  const memberById = new Map(memberRows.map((member) => [member.id, member]));
  const participantRows = participantResult.data || [];
  const stayAudienceOptions: TripAudienceOption[] = [
    ...memberRows.map((member) => {
      const profile = profilesById.get(member.user_id);
      const displayName =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
        profile?.username ||
        "Trip member";
      return {
        kind: "member" as const,
        id: member.id,
        displayName,
        avatarUrl: profile?.avatar_url || null,
        status: "accepted" as const,
        secondaryLabel: profile?.username ? `@${profile.username}` : null,
        isCurrentUser: member.user_id === context.user.id,
      };
    }),
    ...(invitationResult.data || []).map((invitation) => ({
      kind: "invitation" as const,
      id: invitation.id,
      displayName:
        invitation.invited_username ||
        invitation.invited_email ||
        "Invited guest",
      avatarUrl: null,
      status: "invited" as const,
      secondaryLabel: "Pending invitation",
      isCurrentUser: false,
    })),
    ...(familyMembershipResult.data || [])
      .filter((membership) => membership.status === "going")
      .map((membership) => {
        const familyMember = familyById.get(membership.family_member_id);
        return {
          kind: "family_member" as const,
          id: membership.family_member_id,
          displayName: familyMember?.name || "Family member",
          avatarUrl: familyMember?.avatar_url || null,
          status: "family_member" as const,
          secondaryLabel: familyMember?.relationship || "Family member",
          isCurrentUser: false,
        };
      }),
  ];
  const currentUserTripMemberId =
    stayAudienceOptions.find(
      (option) => option.kind === "member" && option.isCurrentUser,
    )?.id || null;
  const memberUserIdByMembershipId = new Map(
    memberRows.map((member) => [member.id, member.user_id]),
  );
  const invitationLegIdsByInvitationId = new Map<string, string[]>();
  (invitationLegResult.data || []).forEach((row) => {
    if (!row.is_included) return;
    const current = invitationLegIdsByInvitationId.get(row.invitation_id) || [];
    current.push(row.trip_leg_id);
    invitationLegIdsByInvitationId.set(row.invitation_id, current);
  });
  const invitationScopeById = new Map(
    (invitationResult.data || []).map((invitation) => [
      invitation.id,
      invitation.invitation_scope,
    ]),
  );
  const stayCoverageTravelers: MobileStayCoverageTraveler[] =
    stayAudienceOptions.map((option) => ({
      kind: option.kind,
      id: option.id,
      userId:
        option.kind === "member"
          ? memberUserIdByMembershipId.get(option.id) || null
          : null,
      displayName: option.displayName,
      avatarUrl: option.avatarUrl || null,
      secondaryLabel: option.secondaryLabel || null,
      isCurrentUser: option.isCurrentUser,
      requiredLegIds:
        option.kind === "invitation" &&
        invitationScopeById.get(option.id) === "selected_legs"
          ? invitationLegIdsByInvitationId.get(option.id) || []
          : undefined,
    }));
  if (!stayCoverageTravelers.some((traveler) => traveler.isCurrentUser)) {
    const currentProfile = profilesById.get(context.user.id);
    stayCoverageTravelers.unshift({
      kind: "member",
      id: currentUserTripMemberId || `user:${context.user.id}`,
      userId: context.user.id,
      displayName:
        [currentProfile?.first_name, currentProfile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        currentProfile?.username ||
        "You",
      avatarUrl: currentProfile?.avatar_url || null,
      secondaryLabel: currentProfile?.username
        ? `@${currentProfile.username}`
        : null,
      isCurrentUser: true,
    });
  }
  const coverageMemberLegRows = (coverageMemberLegResult.data || []).filter(
    (row) => row.is_joining,
  );
  const stayCoverageLegs: MobileStayCoverageLeg[] = (legResult.data || [])
    .filter((leg) => leg.leg_type !== "accommodation")
    .map((leg) => {
      const joinedRows = coverageMemberLegRows.filter(
        (row) => row.trip_leg_id === leg.id,
      );
      return {
        id: leg.id,
        startDate: leg.start_date || null,
        endDate: leg.end_date || null,
        memberIds: joinedRows.map((row) => row.trip_member_id),
        memberDatesByMemberId: Object.fromEntries(
          joinedRows.map((row) => [
            row.trip_member_id,
            {
              startDate: row.start_date || leg.start_date || null,
              endDate:
                row.end_date ||
                row.start_date ||
                leg.end_date ||
                leg.start_date ||
                null,
            },
          ]),
        ),
      };
    });
  const stayParticipants = participantRows.filter(
    (participant) => participant.item_type === "accommodation",
  );
  const toMobilePerson = ({
    id,
    name,
    avatarUrl,
  }: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  }) => ({
    id,
    name,
    avatar_url: avatarUrl || null,
    initials: getInitials(name),
  });
  const everyonePeople = going.map((person) =>
    toMobilePerson({
      id: person.id,
      name: person.label,
      avatarUrl: person.avatarUrl,
    }),
  );
  const currentUserPerson = everyonePeople.find(
    (person) => person.id === context.user.id,
  ) || toMobilePerson({ id: context.user.id, name: "You" });
  const transportationTravelerRows = transportationTravelerResult.data || [];
  const transportationTravelersByItemId = new Map<
    string,
    ReturnType<typeof toMobilePerson>[]
  >();

  transportationTravelerRows.forEach((traveler) => {
    const profile = traveler.user_id
      ? profilesById.get(traveler.user_id)
      : null;
    const familyMember = traveler.family_member_id
      ? familyById.get(traveler.family_member_id)
      : null;
    const name = profile
      ? [profile.first_name, profile.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || profile.username || "Trip member"
      : familyMember?.name || traveler.guest_name || "Traveller";
    const person = toMobilePerson({
      id:
        traveler.user_id ||
        (traveler.family_member_id
          ? `family:${traveler.family_member_id}`
          : `guest:${traveler.id}`),
      name,
      avatarUrl: profile?.avatar_url || familyMember?.avatar_url,
    });
    const current =
      transportationTravelersByItemId.get(traveler.transportation_item_id) || [];
    current.push(person);
    transportationTravelersByItemId.set(
      traveler.transportation_item_id,
      current,
    );
  });

  function getItemPeople(
    itemType: "itinerary" | "transportation",
    itemId: string,
    audienceMode?: string | null,
    isPrivate?: boolean | null,
  ) {
    if (isPrivate || audienceMode === "just_me") return [currentUserPerson];

    const selectedPeople = participantRows
      .filter((participant) =>
        participant.item_type === itemType && participant.item_id === itemId
      )
      .map((participant) => {
        if (participant.participant_kind === "member" && participant.trip_member_id) {
          const member = memberById.get(participant.trip_member_id);
          const profile = member?.user_id ? profilesById.get(member.user_id) : null;
          if (!member?.user_id) return null;
          const name =
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
            profile?.username ||
            "Trip member";
          return toMobilePerson({
            id: member.user_id,
            name,
            avatarUrl: profile?.avatar_url,
          });
        }
        if (
          participant.participant_kind === "family_member" &&
          participant.family_member_id
        ) {
          const familyMember = familyById.get(participant.family_member_id);
          return familyMember
            ? toMobilePerson({
                id: `family:${familyMember.id}`,
                name: familyMember.name,
                avatarUrl: familyMember.avatar_url,
              })
            : null;
        }
        if (
          participant.participant_kind === "invitation" &&
          participant.invitation_id
        ) {
          const invitation = invitationById.get(participant.invitation_id);
          const name =
            invitation?.invited_username ||
            invitation?.invited_email ||
            "Invited guest";
          return toMobilePerson({
            id: `invitation:${participant.invitation_id}`,
            name,
          });
        }
        if (participant.guest_name) {
          return toMobilePerson({
            id: `guest:${itemType}:${itemId}:${participant.guest_name}`,
            name: participant.guest_name,
          });
        }
        return null;
      })
      .filter((person): person is ReturnType<typeof toMobilePerson> => Boolean(person));

    const uniquePeople = Array.from(
      new Map(selectedPeople.map((person) => [person.id, person])).values(),
    );
    const legacyTransportationPeople =
      itemType === "transportation"
        ? transportationTravelersByItemId.get(itemId) || []
        : [];
    const assignedPeople =
      uniquePeople.length > 0 ? uniquePeople : legacyTransportationPeople;
    if (audienceMode === "custom") return assignedPeople;
    if (uniquePeople.length > 0) return uniquePeople;
    if (everyonePeople.length > 1) return everyonePeople;
    return legacyTransportationPeople.length > 0
      ? legacyTransportationPeople
      : everyonePeople;
  }

  function isTransportationAssignedToViewer(
    itemId: string,
    audienceMode?: string | null,
    isPrivate?: boolean | null,
  ) {
    if (!viewerMembership) return true;
    if (isPrivate || audienceMode === "just_me") return true;
    if (audienceMode !== "custom") return true;

    return (
      participantRows.some(
        (participant) =>
          participant.item_type === "transportation" &&
          participant.item_id === itemId &&
          (participant.trip_member_id === viewerMembership.id ||
            participant.user_id === viewerUserId),
      ) ||
      transportationTravelerRows.some(
        (traveler) =>
          traveler.transportation_item_id === itemId &&
          traveler.user_id === viewerUserId,
      )
    );
  }

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
    viewerTripMemberId: viewerMembership?.id || null,
  };

  const categoryColorByKey = new Map(
    (categoryColorResult.data || []).map((color) => [color.key, color.hex]),
  );
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const itineraryItems: MobileItineraryItem[] = rawItineraryItems.map((item) => {
    const category = item.category_id ? categoryById.get(item.category_id) : null;
    return {
      ...item,
      status: item.status || "planned",
      source: "itinerary" as const,
      source_id: item.id,
      category_name: category?.name || item.category || FALLBACK_CATEGORY_LABEL,
      category_color_hex:
        categoryColorByKey.get(category?.color_key || "") || FALLBACK_CATEGORY_COLOR,
      people: getItemPeople(
        "itinerary",
        item.id,
        item.audience_mode,
        item.is_private,
      ),
    };
  });
  const transportationItems: MobileItineraryItem[] = rawTransportationItems.map((item) => {
    const routeLabel = [item.departure_location, item.arrival_location]
      .filter(Boolean)
      .join(" → ");
    const transportLabel = item.transport_type.replaceAll("_", " ");
    const airlineCode =
      item.provider_code || getAirlineCodeFromFlightNumber(item.transport_number) || null;
    return {
      id: `transportation:${item.id}`,
      source_id: item.id,
      trip_id: item.trip_id,
      title: item.title || (routeLabel ? `${transportLabel}: ${routeLabel}` : transportLabel),
      item_date: item.departure_date || item.arrival_date || trip.start_date || "",
      end_date: item.arrival_date,
      start_time: item.departure_time,
      end_time: item.arrival_time,
      category: "transportation",
      category_id: null,
      category_name: "Transportation",
      category_color_hex: "#38bdf8",
      status: item.status || "tentative",
      location: routeLabel || null,
      notes: item.notes,
      cover_image_url: null,
      timezone: item.departure_timezone,
      is_private: item.is_private,
      audience_mode: item.audience_mode,
      transportation_mode: item.transport_type,
      airline_name: item.provider_name,
      airline_code: airlineCode,
      flight_number: item.transport_number,
      reservation_code: item.reservation_code,
      duration: null,
      departure_location: item.departure_location,
      arrival_location: item.arrival_location,
      departure_timezone: item.departure_timezone,
      arrival_timezone: item.arrival_timezone,
      departure_terminal: item.departure_terminal,
      arrival_terminal: item.arrival_terminal,
      is_assigned_to_viewer: isTransportationAssignedToViewer(
        item.id,
        item.audience_mode,
        item.is_private,
      ),
      people: getItemPeople(
        "transportation",
        item.id,
        item.audience_mode,
        item.is_private,
      ),
      source: "transportation" as const,
    };
  });
  const flightBuffers = buildFlightDepartureBuffers(
    transportationItems.map((item) => ({
      ...item,
      source_table: "transportation_items",
    })),
  ).map(
    (item): MobileItineraryItem => ({
      ...item,
      source: "transportation",
      source_id: item.source_id,
      category_name: "Flight buffer",
      category_color_hex: "#7dd3fc",
      accommodation_hold_kind: null,
    }),
  );
  const accommodationHolds = buildAccommodationItineraryHolds({
    accommodations: (accommodationResult.data || []) as Parameters<
      typeof buildAccommodationItineraryHolds
    >[0]["accommodations"],
    items: [...itineraryItems, ...transportationItems] as Parameters<
      typeof buildAccommodationItineraryHolds
    >[0]["items"],
  }).map(
    (item): MobileItineraryItem => ({
      id: item.id,
      source_id: item.accommodation_id || item.id,
      trip_id: trip.id,
      title: item.title,
      item_date: item.item_date,
      end_date: item.end_date || null,
      start_time: item.start_time || null,
      end_time: item.end_time || null,
      category: item.category,
      category_id: null,
      category_name: item.category_name || "Stay",
      category_color_hex: item.category_color_hex || "#bef264",
      status: item.status,
      location: item.location || null,
      notes: item.notes || null,
      cover_image_url: null,
      timezone: item.timezone || null,
      is_private: Boolean(item.is_private),
      audience_mode: item.audience_mode || "everyone",
      source: "itinerary",
      accommodation_hold_kind: item.accommodation_hold_kind || null,
      people: [],
    }),
  );
  const mobileItinerary = [
    ...itineraryItems,
    ...transportationItems,
    ...flightBuffers,
    ...accommodationHolds,
  ].sort(
    (left, right) =>
      left.item_date.localeCompare(right.item_date) ||
      String(left.start_time || "99:99").localeCompare(String(right.start_time || "99:99")),
  );
  const itineraryTimezones = Array.from(
    new Set(
      mobileItinerary
        .flatMap((item) => [
          item.timezone,
          item.departure_timezone,
          item.arrival_timezone,
        ])
        .filter(Boolean),
    ),
  ) as string[];
  const ideas = attachIdeaReactions({
    ideas: rawIdeas,
    reactions: ideaReactions,
    profiles: ideaReactionProfiles,
    currentUserId: context.user.id,
  }).sort((left, right) => {
    if (left.attended !== right.attended) return left.attended ? 1 : -1;
    const scoreSort = (right.reaction_score || 0) - (left.reaction_score || 0);
    if (scoreSort !== 0) return scoreSort;
    const createdSort = String(right.created_at || "").localeCompare(
      String(left.created_at || ""),
    );
    return createdSort || left.title.localeCompare(right.title);
  });
  const foodItems = attachFoodMetadata({
    items: rawFoodItems,
    reactions: foodReactions,
    triedRows: foodTriedRows,
    profilesById: foodProfilesById,
    currentUserId: context.user.id,
  });
  const [healthSafetyDestinations, healthSafetyAdvisoryResult] =
    await healthSafetyPromise;
  const destinationCountryCodes = new Set(
    healthSafetyDestinations
      .map((destination) => destination.countryCode)
      .filter((countryCode): countryCode is string => Boolean(countryCode)),
  );
  const mobileHealthSafetyAdvisoryResult = healthSafetyAdvisoryResult.ok
    ? {
        ...healthSafetyAdvisoryResult,
        dataset: {
          ...healthSafetyAdvisoryResult.dataset,
          advisories: healthSafetyAdvisoryResult.dataset.advisories.filter(
            (advisory) => destinationCountryCodes.has(advisory.countryCode),
          ),
        },
      }
    : healthSafetyAdvisoryResult;

  return mobileJson(request, {
    trip: mobileTrip,
    overview,
    itinerary: mobileItinerary,
    itineraryTimezones,
    ideas,
    budget: {
      budget: mobileBudget,
      lineItems: mobileBudgetLineItems,
      expenses: mobileExpenses,
      splits: mobileExpenseSplits,
      settlementPayments: mobileExpenseSettlements,
      participants: budgetParticipants,
      defaultCurrency: financeSettingsResult.data?.home_currency || "CAD",
    },
    stays: {
      accommodations: (accommodationResult.data || []) as AccommodationRow[],
      audienceOptions: stayAudienceOptions,
      participants: stayParticipants,
      travelers: stayCoverageTravelers,
      legs: stayCoverageLegs,
      currentUserTripMemberId,
    },
    food: {
      items: foodItems,
    },
    healthSafety: {
      destinations: healthSafetyDestinations,
      advisoryResult: mobileHealthSafetyAdvisoryResult,
    },
  });
}
