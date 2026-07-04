import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItineraryItemForm from "@/components/ItineraryItemForm";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
};

async function createItineraryItem(formData: FormData) {
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
    const category = formData.get("category") as string;
    const status = formData.get("status") as string;
    const itemDate = formData.get("item_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const location = formData.get("location") as string;
    const formattedAddress = formData.get("formatted_address") as string;
    const googlePlaceId = formData.get("google_place_id") as string;
    const locationLat = formData.get("location_lat") as string;
    const locationLng = formData.get("location_lng") as string;
    const timezone = formData.get("timezone") as string;
    const timezoneSource = formData.get("timezone_source") as string;
    const url = formData.get("url") as string;
    const endDate = formData.get("end_date") as string;
    const notes = formData.get("notes") as string;

    const { error } = await supabase.from("itinerary_items").insert({
        trip_id: tripId,
        title,
        category,
        status,
        item_date: itemDate,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location,
        formatted_address: formattedAddress || null,
        google_place_id: googlePlaceId || null,
        location_lat: locationLat ? Number(locationLat) : null,
        location_lng: locationLng ? Number(locationLng) : null,
        timezone: timezone || null,
        timezone_source: timezoneSource || "manual",
        url: url || null,
        notes,
    });

    if (error) {
        console.error("Error creating itinerary item:", error);
        throw new Error("Could not create itinerary item");
    }

    redirect(`/trips/${tripId}`);
}

function formatDate(dateString: string) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatTime(timeString: string | null) {
    if (!timeString) return "No time";

    const [hours, minutes] = timeString.split(":");
    const date = new Date();
    date.setHours(Number(hours));
    date.setMinutes(Number(minutes));

    return date.toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
    });
}

function getStatusClasses(status: string) {
    if (status === "confirmed") {
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }

    return "bg-amber-100 text-amber-800 border-amber-200";
}

function getCategoryClasses(category: string) {
    if (category === "travel") {
        return "bg-sky-100 text-sky-800 border-sky-200";
    }

    if (category === "work") {
        return "bg-violet-100 text-violet-800 border-violet-200";
    }

    if (category === "activity") {
        return "bg-teal-100 text-teal-800 border-teal-200";
    }

    return "bg-slate-100 text-slate-800 border-slate-200";
}

export default async function TripDetailPage({ params }: PageProps) {
    const { tripId } = await params;

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const { data: itineraryItems, error: itineraryError } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("item_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (itineraryError) {
        console.error("Error loading itinerary:", itineraryError);
    }

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10">
            <div className="mx-auto max-w-5xl">
                <a href="/" className="text-sm text-slate-600 hover:text-slate-900">
                    ← Back to dashboard
                </a>

                <header className="mt-6 mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                        VAIVIA
                    </p>

                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                        {trip.title}
                    </h1>

                    {trip.destination && (
                        <p className="mt-2 text-lg text-slate-600">{trip.destination}</p>
                    )}

                    <p className="mt-3 text-sm text-slate-500">
                        {trip.start_date || "No start date"} →{" "}
                        {trip.end_date || "No end date"}
                    </p>

                    {trip.notes && (
                        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                            {trip.notes}
                        </p>
                    )}
                </header>

                <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mb-6">
                            <h2 className="text-2xl font-semibold text-slate-900">
                                Itinerary
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Travel plans, work obligations, and activities.
                            </p>
                        </div>

                        {itineraryItems && itineraryItems.length > 0 ? (
                            <div className="space-y-4">
                                {itineraryItems.map((item: any) => (
                                    <article
                                        key={item.id}
                                        className="rounded-xl border border-slate-200 p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-slate-500">
                                                    {formatDate(item.item_date)}
                                                    {item.end_date ? ` → ${formatDate(item.end_date)}` : ""} ·{" "}
                                                    {formatTime(item.start_time)}
                                                    {item.end_time ? ` – ${formatTime(item.end_time)}` : ""}
                                                </p>

                                                {item.timezone && (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Time zone: {item.timezone}
                                                    </p>
                                                )}

                                                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                                                    {item.title}
                                                </h3>

                                                {item.location && (
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        {item.location}
                                                    </p>
                                                )}

                                                {item.formatted_address && (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {item.formatted_address}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${getCategoryClasses(
                                                        item.category
                                                    )}`}
                                                >
                                                    {item.category}
                                                </span>

                                                <span
                                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
                                                        item.status
                                                    )}`}
                                                >
                                                    {item.status}
                                                </span>

                                                <a
                                                    href={`/trips/${trip.id}/itinerary/${item.id}/edit`}
                                                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                >
                                                    Edit
                                                </a>
                                            </div>
                                        </div>

                                        {item.notes && (
                                            <p className="mt-3 text-sm text-slate-600">{item.notes}</p>
                                        )}
                                        {item.url && (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
                                            >
                                                More info
                                            </a>
                                        )}
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                                <h3 className="text-lg font-medium text-slate-900">
                                    No itinerary items yet
                                </h3>
                                <p className="mt-2 text-sm text-slate-500">
                                    Add flights, work obligations, activities, or loose ideas.
                                </p>
                            </div>
                        )}
                    </div>

                    <ItineraryItemForm
                        tripId={trip.id}
                        submitAction={createItineraryItem}
                        submitLabel="Add itinerary item"
                    />
                </section>
            </div>
        </main>
    );
}