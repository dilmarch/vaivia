import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItineraryItemForm from "@/components/ItineraryItemForm";

type PageProps = {
    params: Promise<{
        tripId: string;
        itemId: string;
    }>;
};

async function updateItineraryItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const itemId = formData.get("item_id") as string;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const status = formData.get("status") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
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
    const notes = formData.get("notes") as string;

    const { error } = await supabase
        .from("itinerary_items")
        .update({
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
        })
        .eq("id", itemId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating itinerary item:", error);
        throw new Error("Could not update itinerary item");
    }

    redirect(`/trips/${tripId}`);
}

export default async function EditItineraryItemPage({ params }: PageProps) {
    const { tripId, itemId } = await params;

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

    const { data: item, error: itemError } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("id", itemId)
        .eq("trip_id", tripId)
        .single();

    if (itemError || !item) {
        notFound();
    }

    async function updateWithItemId(formData: FormData) {
        "use server";
        formData.set("item_id", itemId);
        await updateItineraryItem(formData);
    }

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <a
                    href={`/trips/${trip.id}`}
                    className="text-sm text-slate-600 hover:text-slate-900"
                >
                    ← Back to {trip.title}
                </a>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-slate-900">
                        Edit itinerary item
                    </h1>
                    <p className="mt-2 text-slate-600">{trip.title}</p>
                </header>

                <ItineraryItemForm
                    tripId={trip.id}
                    submitAction={updateWithItemId}
                    initialItem={item}
                    submitLabel="Save changes"
                />
            </div>
        </main>
    );
}