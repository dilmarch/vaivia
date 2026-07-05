import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import TripDashboardClient, {
  type DashboardTrip,
} from "@/components/TripDashboardClient";

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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            VAIVIA
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
            My Travel Plans
          </h1>
          <p className="mt-3 text-slate-600">
            Organize trips, itinerary items, work obligations, activities, and
            budgets in one place.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                My Trips
              </h2>
              <p className="text-sm text-slate-500">
                Your saved travel plans will appear here.
              </p>
            </div>

            <Link
              href="/trips/new"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New Trip
            </Link>
          </div>

          <TripDashboardClient
            trips={(trips || []) as DashboardTrip[]}
            updateTripAction={updateTrip}
            deleteTripAction={deleteTrip}
          />
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-6 py-10">
          <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Loading trips...
          </div>
        </main>
      }
    >
      <TripsDashboard />
    </Suspense>
  );
}
