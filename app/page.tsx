import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import DashboardHero from "@/components/DashboardHero";
import TripDashboardClient, {
  type DashboardPassportStamp,
  type DashboardProfileSummary,
  type DashboardTrip,
  type DashboardWishlistItem,
} from "@/components/TripDashboardClient";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import {
  isCountdownUnit,
  type CountdownUnit,
} from "@/lib/countdownDisplay";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { createClient } from "@/lib/supabase/server";
import {
  buildTripCoverPayloadFromForm,
  cleanupReplacedTripCover,
  deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import {
  addValidatedTripSlugToPayload,
  getTripSlugErrorMessage,
  isTripSlugConflictError,
} from "@/lib/tripSlugUpdate";
import { getUserProfileDefaults } from "@/lib/userProfileDefaults";

export const metadata: Metadata = {
  title: "Dashboard – VIVIA",
};

type TripUpdatePayload = {
  title: string;
  slug?: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  cover_image_url?: string | null;
  cover_image_source?: string | null;
  cover_image_storage_path?: string | null;
  cover_image_unsplash_id?: string | null;
  cover_image_photographer_name?: string | null;
  cover_image_photographer_url?: string | null;
};

type DashboardPlanning = NonNullable<DashboardTrip["planning"]>;
type DashboardAccommodationSummary = NonNullable<
  DashboardPlanning["accommodations"]
>[number];
type DashboardTransportationSummary = NonNullable<
  DashboardPlanning["transportation"]
>[number];

type DashboardCountdownTarget = {
  tripTitle: string;
  targetTitle: string;
  targetDateIso: string;
};

function getDateTimeIso(date?: string | null, time?: string | null) {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00`;
}

function getYearFromDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getFullYear());
}

function shuffleDashboardItems<TItem>(items: TItem[]) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [
      shuffledItems[randomIndex],
      shuffledItems[index],
    ];
  }

  return shuffledItems;
}

function isFutureIso(value: string, now = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > now.getTime();
}

function getFutureCountdownTarget(
  preferredTarget: DashboardCountdownTarget | null,
  fallbackTarget: DashboardCountdownTarget | null,
  now: Date
) {
  if (
    preferredTarget?.targetDateIso &&
    isFutureIso(preferredTarget.targetDateIso, now)
  ) {
    return preferredTarget;
  }

  if (
    fallbackTarget?.targetDateIso &&
    isFutureIso(fallbackTarget.targetDateIso, now)
  ) {
    return fallbackTarget;
  }

  return null;
}

async function loadDashboardCountdownTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trips: DashboardTrip[]
): Promise<DashboardCountdownTarget | null> {
  const now = new Date();
  const targetItineraryIds = trips
    .filter((trip) => trip.countdown_target_type === "itinerary_item")
    .map((trip) => trip.countdown_target_id || trip.countdown_target_itinerary_item_id)
    .filter((id): id is string => Boolean(id));
  const targetTransportationIds = trips
    .filter((trip) => trip.countdown_target_type === "transportation_item")
    .map((trip) => trip.countdown_target_id)
    .filter((id): id is string => Boolean(id));
  const [itineraryResult, transportationResult] = await Promise.all([
    targetItineraryIds.length > 0
      ? supabase
          .from("itinerary_items")
          .select("id,title,item_date,start_time")
          .in("id", targetItineraryIds)
      : Promise.resolve({ data: [], error: null }),
    targetTransportationIds.length > 0
      ? supabase
          .from("transportation_items")
          .select("id,title,departure_date,departure_time,transport_number")
          .in("id", targetTransportationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itineraryResult.error) {
    console.warn("Could not load dashboard countdown itinerary targets:", {
      message: itineraryResult.error.message,
      code: itineraryResult.error.code,
      details: itineraryResult.error.details,
      hint: itineraryResult.error.hint,
    });
  }

  if (transportationResult.error) {
    console.warn("Could not load dashboard countdown transportation targets:", {
      message: transportationResult.error.message,
      code: transportationResult.error.code,
      details: transportationResult.error.details,
      hint: transportationResult.error.hint,
    });
  }

  const itineraryTargets = new Map(
    ((itineraryResult.data || []) as Array<{
      id: string;
      title?: string | null;
      item_date?: string | null;
      start_time?: string | null;
    }>).map((item) => [item.id, item])
  );
  const transportationTargets = new Map(
    ((transportationResult.data || []) as Array<{
      id: string;
      title?: string | null;
      departure_date?: string | null;
      departure_time?: string | null;
      transport_number?: string | null;
    }>).map((item) => [item.id, item])
  );
  const candidates = trips
    .map((trip): DashboardCountdownTarget | null => {
      const tripTitle = trip.title || "Untitled trip";
      const fallbackTarget = getDateTimeIso(trip.start_date)
        ? {
            tripTitle,
            targetTitle: "Trip begins",
            targetDateIso: getDateTimeIso(trip.start_date) as string,
          }
        : null;
      let preferredTarget: DashboardCountdownTarget | null = null;

      if (trip.countdown_target_type === "itinerary_item") {
        const id = trip.countdown_target_id || trip.countdown_target_itinerary_item_id;
        const target = id ? itineraryTargets.get(id) : null;
        const itemDateIso = getDateTimeIso(target?.item_date, target?.start_time);
        if (itemDateIso) {
          preferredTarget = {
            tripTitle,
            targetTitle: target?.title || "Itinerary item",
            targetDateIso: itemDateIso,
          };
        }
      } else if (trip.countdown_target_type === "transportation_item") {
        const target = trip.countdown_target_id
          ? transportationTargets.get(trip.countdown_target_id)
          : null;
        const itemDateIso = getDateTimeIso(
          target?.departure_date,
          target?.departure_time
        );
        if (itemDateIso) {
          preferredTarget = {
            tripTitle,
            targetTitle:
              target?.transport_number || target?.title || "Transportation",
            targetDateIso: itemDateIso,
          };
        }
      }

      return getFutureCountdownTarget(preferredTarget, fallbackTarget, now);
    })
    .filter((target): target is DashboardCountdownTarget => Boolean(target));

  return (
    candidates.sort(
      (a, b) =>
        new Date(a.targetDateIso).getTime() -
        new Date(b.targetDateIso).getTime()
    )[0] || null
  );
}

async function addDashboardPlanningData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trips: DashboardTrip[]
) {
  const tripIds = trips.map((trip) => trip.id).filter(Boolean);

  if (tripIds.length === 0) return trips;

  const [accommodationsResult, transportationResult] = await Promise.all([
    supabase
      .from("trip_accommodations")
      .select("id,trip_id,check_in_date,check_out_date,status,city,region,country")
      .in("trip_id", tripIds),
    supabase
      .from("transportation_items")
      .select(
        "id,trip_id,departure_location,arrival_location,status,title,transport_type"
      )
      .in("trip_id", tripIds),
  ]);

  if (accommodationsResult.error) {
    console.warn("Could not load dashboard accommodation tasks:", {
      message: accommodationsResult.error.message,
      code: accommodationsResult.error.code,
      details: accommodationsResult.error.details,
      hint: accommodationsResult.error.hint,
    });
  }

  if (transportationResult.error) {
    console.warn("Could not load dashboard transportation tasks:", {
      message: transportationResult.error.message,
      code: transportationResult.error.code,
      details: transportationResult.error.details,
      hint: transportationResult.error.hint,
    });
  }

  const accommodationsByTripId = new Map<
    string,
    DashboardAccommodationSummary[]
  >();
  const transportationByTripId = new Map<
    string,
    DashboardTransportationSummary[]
  >();

  (
    (accommodationsResult.data || []) as Array<
      DashboardAccommodationSummary & {
        trip_id?: string | null;
      }
    >
  ).forEach((stay) => {
    if (!stay.trip_id) return;
    const stays = accommodationsByTripId.get(stay.trip_id) || [];
    stays.push(stay);
    accommodationsByTripId.set(stay.trip_id, stays);
  });

  (
    (transportationResult.data || []) as Array<
      DashboardTransportationSummary & {
        trip_id?: string | null;
      }
    >
  ).forEach((item) => {
    if (!item.trip_id) return;
    const items = transportationByTripId.get(item.trip_id) || [];
    items.push(item);
    transportationByTripId.set(item.trip_id, items);
  });

  return trips.map((trip) => ({
    ...trip,
    planning: {
      accommodations: accommodationsByTripId.get(trip.id) || [],
      transportation: transportationByTripId.get(trip.id) || [],
    },
  }));
}

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || "";

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("column") &&
      (message.includes("cover_image_url") ||
        message.includes("cover_image_source") ||
        message.includes("cover_image_storage_path") ||
        message.includes("cover_image_unsplash_id") ||
        message.includes("cover_image_photographer") ||
        message.includes("schema cache")))
  );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
  const {
    cover_image_url,
    cover_image_source,
    cover_image_storage_path,
    cover_image_unsplash_id,
    cover_image_photographer_name,
    cover_image_photographer_url,
    ...fallbackPayload
  } = payload;

  void cover_image_url;
  void cover_image_source;
  void cover_image_storage_path;
  void cover_image_unsplash_id;
  void cover_image_photographer_name;
  void cover_image_photographer_url;

  return fallbackPayload;
}

async function updateTrip(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const tripId = formData.get("trip_id") as string;
  const title = formData.get("title") as string;
  const slug = String(formData.get("slug") || "");
  const destination = formData.get("destination") as string;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const notes = formData.get("notes") as string;
  const { data: existingTripCover, error: existingTripCoverError } = await supabase
    .from("trips")
    .select("id,cover_image_source,cover_image_storage_path")
    .eq("id", tripId)
    .maybeSingle();

  if (existingTripCoverError || !existingTripCover) {
    console.error("Error loading existing trip cover:", existingTripCoverError);
    throw new Error("Could not update trip");
  }

  let coverPayload: Partial<TripUpdatePayload> = {};
  let uploadedStoragePath: string | null | undefined = null;
  try {
    const coverResult = await buildTripCoverPayloadFromForm({
      supabase,
      userId: user.id,
      tripId,
      formData,
    });
    coverPayload = coverResult.payload;
    uploadedStoragePath = coverResult.uploadedStoragePath;
  } catch (error) {
    console.error("Error preparing trip cover:", error);
    throw error;
  }

  const payload: TripUpdatePayload = {
    title,
    destination,
    start_date: startDate || null,
    end_date: endDate || null,
    notes,
    ...coverPayload,
  };
  await addValidatedTripSlugToPayload(supabase, payload, {
    tripId,
    submittedSlug: slug,
    fallbackTitle: title,
  });

  let { error } = await supabase
    .from("trips")
    .update(payload)
    .eq("id", tripId);

  if (error && isMissingTripCoverColumnError(error)) {
    console.warn(
      "Optional trip cover column is missing. Falling back to legacy trip fields.",
      error
    );
    ({ error } = await supabase
      .from("trips")
      .update(removeTripCoverColumn(payload))
      .eq("id", tripId));
  }

  if (error) {
    await deleteOwnedTripCoverObject({
      supabase,
      userId: user.id,
      storagePath: uploadedStoragePath,
    });
    console.error("Error updating trip:", error);
    if (isTripSlugConflictError(error)) {
      throw new Error(getTripSlugErrorMessage(error));
    }
    throw new Error("Could not update trip");
  }

  await cleanupReplacedTripCover({
    supabase,
    userId: user.id,
    oldCover: existingTripCover,
    nextPayload: coverPayload,
  });

  await supabase.rpc("notify_trip_members", {
    target_trip_id: tripId,
    notification_type: "trip_updated",
    notification_title: "Trip updated",
    notification_body: "A trip detail was updated.",
    notification_metadata: {
      changedArea: "trip",
    },
  });

  redirect("/");
}

async function deleteTrip(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const tripId = formData.get("trip_id") as string;

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    console.error("Error finding trip to delete:", tripError);
    throw new Error("Could not delete trip");
  }

  const { count: activeMemberCount, error: memberCountError } = await supabase
    .from("trip_members")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("status", "active");

  if (!memberCountError && (activeMemberCount || 0) > 1) {
    throw new Error("Shared trips cannot be deleted. Leave the trip instead.");
  }

  const { error: itineraryError } = await supabase
    .from("itinerary_items")
    .delete()
    .eq("trip_id", tripId);

  if (itineraryError) {
    console.error("Error deleting trip itinerary items:", itineraryError);
    throw new Error("Could not delete trip itinerary items");
  }

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", tripId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error deleting trip:", error);
    throw new Error("Could not delete trip");
  }

  redirect("/");
}

async function TripsDashboard() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { trips, error } = await loadActiveMemberTrips(supabase, user.id);

  if (error) {
    console.error("Error loading trips:", error);
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("first_name,last_name,username,email,avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("Could not load dashboard user profile:", {
      message: profileError.message,
      code: profileError.code,
      details: profileError.details,
      hint: profileError.hint,
      userId: user.id,
    });
  }

  const { data: preferences, error: preferencesError } = await supabase
    .from("user_preferences")
    .select("countdown_display_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  if (preferencesError) {
    console.warn("Could not load dashboard countdown preference:", {
      message: preferencesError.message,
      code: preferencesError.code,
      details: preferencesError.details,
      hint: preferencesError.hint,
      userId: user.id,
    });
  }

  const authProfileDefaults = getUserProfileDefaults(user);
  const dashboardName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    authProfileDefaults.first_name ||
    profile?.username ||
    authProfileDefaults.username ||
    profile?.email?.split("@")[0] ||
    authProfileDefaults.email?.split("@")[0] ||
    "traveller";

  const dashboardTrips = await addDashboardPlanningData(
    supabase,
    (trips || []) as DashboardTrip[]
  );
  const rawCountdownDisplayMode =
    typeof preferences?.countdown_display_mode === "string"
      ? preferences.countdown_display_mode
      : null;
  const countdownUnit: CountdownUnit = isCountdownUnit(rawCountdownDisplayMode)
    ? rawCountdownDisplayMode
    : "days";
  const dashboardCountdownTarget = await loadDashboardCountdownTarget(
    supabase,
    dashboardTrips
  );
  const { data: passportStampRows, error: passportStampError } = await supabase
    .from("user_passport_stamps")
    .select(
      "id,country_code,country_name,flag_emoji,first_visited_on,stamped_at,created_at,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag,port_of_entry_name"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (passportStampError) {
    console.warn("Could not load dashboard passport stamps:", {
      message: passportStampError.message,
      code: passportStampError.code,
      details: passportStampError.details,
      hint: passportStampError.hint,
      userId: user.id,
    });
  }

  const { data: wishlistRows, error: wishlistError } = await supabase
    .from("user_travel_bucket_list")
    .select(
      "id,place_label,city,region,country_name,country_code,flag_emoji,status,completed_at,created_at"
    )
    .eq("user_id", user.id)
    .order("status", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12);

  if (wishlistError) {
    console.warn("Could not load dashboard travel wishlist:", {
      message: wishlistError.message,
      code: wishlistError.code,
      details: wishlistError.details,
      hint: wishlistError.hint,
      userId: user.id,
    });
  }

  const dashboardPassportStamps: DashboardPassportStamp[] =
    shuffleDashboardItems(passportStampRows || []).map((stamp) => ({
      id: String(stamp.id),
      countryCode: String(stamp.country_code || "").trim().toUpperCase(),
      countryName:
        stamp.stamp_display_country_name ||
        stamp.country_name ||
        String(stamp.country_code || "Passport"),
      flagEmoji: stamp.stamp_display_flag || stamp.flag_emoji || null,
      firstVisitYear:
        getYearFromDate(stamp.first_visited_on) ||
        getYearFromDate(stamp.stamped_at) ||
        getYearFromDate(stamp.created_at),
      welcomeLabel:
        stamp.welcome_label_snapshot || stamp.arrival_label_snapshot || null,
      airportCode:
        stamp.first_entry_iata_code || stamp.first_entry_icao_code || null,
      airportCity: stamp.first_entry_city || null,
      portOfEntryName:
        stamp.port_of_entry_name || stamp.first_entry_airport_name || null,
    }));

  const dashboardProfile: DashboardProfileSummary = {
    name: dashboardName,
    username: profile?.username || authProfileDefaults.username || null,
    email: profile?.email || authProfileDefaults.email || null,
    avatarUrl: profile?.avatar_url || authProfileDefaults.avatar_url || null,
  };

  const dashboardWishlistItems: DashboardWishlistItem[] = (wishlistRows || []).map(
    (item) => ({
      id: String(item.id),
      placeLabel:
        item.place_label ||
        [item.city, item.region, item.country_name].filter(Boolean).join(", ") ||
        "Wishlist place",
      city: item.city || null,
      region: item.region || null,
      countryName: item.country_name || item.country_code || null,
      flagEmoji: item.flag_emoji || null,
      status: item.status === "completed" ? "completed" : "in_progress",
      completedAt: item.completed_at || null,
    })
  );

  return (
    <main className="min-h-screen bg-[#0c0115] text-white">
      <div className="space-y-1.5">
        <DashboardHero
          name={dashboardName}
          countdownTarget={dashboardCountdownTarget}
          countdownUnit={countdownUnit}
        />

        <div className="mx-4 md:mx-8">
          <TripDashboardClient
            trips={dashboardTrips}
            passportStamps={dashboardPassportStamps}
            profile={dashboardProfile}
            wishlistItems={dashboardWishlistItems}
            currentUserId={user.id}
            updateTripAction={updateTrip}
            deleteTripAction={deleteTrip}
          />
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <DelayedVaiviaLoadingScreen
          title="Preparing your trips"
          subtitle="Getting everything ready for your next adventure."
        />
      }
    >
      <TripsDashboard />
    </Suspense>
  );
}
