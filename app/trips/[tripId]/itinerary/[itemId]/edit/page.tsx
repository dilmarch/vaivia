import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import TransportationEditForm from "@/components/TransportationEditForm";

type PageProps = {
    params: Promise<{
        tripId: string;
        itemId: string;
    }>;
};

type ItineraryItemUpdatePayload = {
    title: string;
    category: string;
    status: string;
    item_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string;
    formatted_address: string | null;
    google_place_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
    timezone: string | null;
    timezone_source: string;
    url: string | null;
    notes: string;
    ticket_website?: string | null;
    location_website?: string | null;
    cover_image_url?: string | null;
};

type TransportationItemUpdatePayload = Record<string, string | number | null>;

function isMissingOptionalColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("ticket_website") ||
                message.includes("location_website") ||
                message.includes("cover_image_url") ||
                message.includes("schema cache")))
    );
}

function removeOptionalLinkColumns(payload: ItineraryItemUpdatePayload) {
    const { ticket_website, location_website, cover_image_url, ...fallbackPayload } =
        payload;

    void ticket_website;
    void location_website;
    void cover_image_url;

    return fallbackPayload;
}

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
    const ticketWebsite = formData.get("ticket_website") as string;
    const locationWebsite = formData.get("location_website") as string;
    const coverImageUrl = formData.get("cover_image_url") as string;
    const url = ticketWebsite || (formData.get("url") as string);
    const notes = formData.get("notes") as string;

    const payload: ItineraryItemUpdatePayload = {
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
        ticket_website: ticketWebsite || null,
        location_website: locationWebsite || null,
        cover_image_url: coverImageUrl || null,
        notes,
    };

    let { error } = await supabase
        .from("itinerary_items")
        .update(payload)
        .eq("id", itemId)
        .eq("trip_id", tripId);

    if (error && isMissingOptionalColumnError(error)) {
        console.warn(
            "Optional itinerary link columns are missing. Falling back to legacy url column.",
            error
        );
        ({ error } = await supabase
            .from("itinerary_items")
            .update(removeOptionalLinkColumns(payload))
            .eq("id", itemId)
            .eq("trip_id", tripId));
    }

    if (error) {
        console.error("Error updating itinerary item:", error);
        throw new Error("Could not update itinerary item");
    }

    redirect(`/trips/${tripId}`);
}

async function updateTransportationItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const rawItemId = formData.get("item_id") as string;
    const itemId = rawItemId.replace("transportation:", "");
    const departureLocation = formData.get("departure_location") as string;
    const arrivalLocation = formData.get("arrival_location") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const status = formData.get("status") as string;
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const duration = formData.get("duration") as string;
    const notes = formData.get("notes") as string;
    const title = flightNumber
        ? `${flightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
        : `Airplane: ${departureLocation || "Departure"} to ${
              arrivalLocation || "Arrival"
          }`;
    const payload: TransportationItemUpdatePayload = {
        title,
        status: status || "tentative",
        item_date: itemDate || null,
        date: itemDate || null,
        departure_date: itemDate || null,
        arrival_date: endDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        departure_time: startTime || null,
        end_time: endTime || null,
        arrival_time: endTime || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        location: [departureLocation, arrivalLocation].filter(Boolean).join(" → "),
        departure_timezone: departureTimezone || null,
        arrival_timezone: arrivalTimezone || null,
        timezone: departureTimezone || null,
        airline_name: airlineName || null,
        airline_code: airlineCode || null,
        flight_number: flightNumber || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        notes,
    };

    const { error } = await supabase
        .from("transportation_items")
        .update(payload)
        .eq("id", itemId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating transportation item:", error);
        throw new Error("Could not update transportation item");
    }

    redirect(`/trips/${tripId}`);
}

async function EditItineraryItemContent({
    params,
}: PageProps) {
    await connection();

    const { tripId, itemId: rawRouteItemId } = await params;
    const itemId = decodeURIComponent(rawRouteItemId);

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

    const isTransportationItem = itemId.startsWith("transportation:");
    const normalizedTransportationItemId = itemId.replace("transportation:", "");
    const { data: item, error: itemError } = isTransportationItem
        ? await supabase
              .from("transportation_items")
              .select("*")
              .eq("id", normalizedTransportationItemId)
              .eq("trip_id", tripId)
              .single()
        : await supabase
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

    async function updateTransportationWithItemId(formData: FormData) {
        "use server";
        formData.set("item_id", itemId);
        await updateTransportationItem(formData);
    }

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <Link
                    href={`/trips/${trip.id}`}
                    className="text-sm text-slate-600 hover:text-slate-900"
                >
                    ← Back to {trip.title}
                </Link>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-slate-900">
                        Edit itinerary item
                    </h1>
                    <p className="mt-2 text-slate-600">{trip.title}</p>
                </header>

                {isTransportationItem ? (
                    <TransportationEditForm
                        tripId={trip.id}
                        itemId={itemId}
                        submitAction={updateTransportationWithItemId}
                        initialItem={item}
                    />
                ) : (
                    <ItineraryItemForm
                        tripId={trip.id}
                        submitAction={updateWithItemId}
                        initialItem={item}
                        submitLabel="Save changes"
                    />
                )}
            </div>
        </main>
    );
}

export default function EditItineraryItemPage({ params }: PageProps) {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-slate-50 px-6 py-10">
                    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                        Loading itinerary item...
                    </div>
                </main>
            }
        >
            <EditItineraryItemContent params={params} />
        </Suspense>
    );
}
