import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
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

            <a
              href="/trips/new"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New Trip
            </a>
          </div>

          {trips && trips.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {trips.map((trip) => (
                <a
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="rounded-xl border border-slate-200 p-5 transition hover:border-slate-400 hover:shadow-sm"
                >
                  <h3 className="text-lg font-semibold text-slate-900">
                    {trip.title}
                  </h3>

                  {trip.destination && (
                    <p className="mt-1 text-sm text-slate-600">
                      {trip.destination}
                    </p>
                  )}

                  <p className="mt-3 text-sm text-slate-500">
                    {trip.start_date || "No start date"} →{" "}
                    {trip.end_date || "No end date"}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <h3 className="text-lg font-medium text-slate-900">
                No trips yet
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Create your first VAIVIA trip to start planning.
              </p>
              <a
                href="/trips/new"
                className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Create first trip
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}