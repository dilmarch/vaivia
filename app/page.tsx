import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import DashboardHero from "@/components/DashboardHero";
import TripDashboardClient, {
  type DashboardTrip,
} from "@/components/TripDashboardClient";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { createClient } from "@/lib/supabase/server";
import { getUserProfileDefaults } from "@/lib/userProfileDefaults";

export const metadata: Metadata = {
  title: "Dashboard – VIVIA",
};

type TripUpdatePayload = {
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  cover_image_url?: string | null;
};

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || "";

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("column") &&
      (message.includes("cover_image_url") ||
        message.includes("schema cache")))
  );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
  const { cover_image_url, ...fallbackPayload } = payload;

  void cover_image_url;

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
  const destination = formData.get("destination") as string;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const tripCoverImageUrl = String(formData.get("cover_image_url") || "").trim();
  const notes = formData.get("notes") as string;

  const payload: TripUpdatePayload = {
    title,
    destination,
    start_date: startDate || null,
    end_date: endDate || null,
    cover_image_url: tripCoverImageUrl || null,
    notes,
  };

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
    console.error("Error updating trip:", error);
    throw new Error("Could not update trip");
  }

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
    .select("first_name,last_name,username,email")
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

  const authProfileDefaults = getUserProfileDefaults(user);
  const dashboardName =
    profile?.first_name ||
    authProfileDefaults.first_name ||
    profile?.username ||
    authProfileDefaults.username ||
    profile?.email?.split("@")[0] ||
    authProfileDefaults.email?.split("@")[0] ||
    "traveller";

  return (
    <main className="min-h-screen bg-[#0c0115] text-white">
      <div className="space-y-1.5">
        <DashboardHero name={dashboardName} />

        <div className="mx-4 md:mx-8">
          <TripDashboardClient
            trips={(trips || []) as DashboardTrip[]}
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
        <main className="min-h-screen bg-slate-950 px-6 py-10">
          <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300 shadow-sm">
            Loading trips...
          </div>
        </main>
      }
    >
      <TripsDashboard />
    </Suspense>
  );
}
