import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import DashboardHero from "@/components/DashboardHero";
import TripDashboardClient, {
  type DashboardTrip,
} from "@/components/TripDashboardClient";
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
    redirect("/sign-in");
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
    .eq("id", tripId)
    .eq("user_id", user.id);

  if (error && isMissingTripCoverColumnError(error)) {
    console.warn(
      "Optional trip cover column is missing. Falling back to legacy trip fields.",
      error
    );
    ({ error } = await supabase
      .from("trips")
      .update(removeTripCoverColumn(payload))
      .eq("id", tripId)
      .eq("user_id", user.id));
  }

  if (error) {
    console.error("Error updating trip:", error);
    throw new Error("Could not update trip");
  }

  redirect("/");
}

async function deleteTrip(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const tripId = formData.get("trip_id") as string;

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("user_id", user.id)
    .single();

  if (tripError || !trip) {
    console.error("Error finding trip to delete:", tripError);
    throw new Error("Could not delete trip");
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
    redirect("/sign-in");
  }

  const { data: trips, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: true });

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
  const fullProfileName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fullAuthName = [
    authProfileDefaults.first_name,
    authProfileDefaults.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const dashboardName =
    fullProfileName ||
    fullAuthName ||
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
