import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAccommodation } from "@/app/actions/accommodations";
import AccommodationManager from "@/components/accommodations/AccommodationManager";
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
    type TripAccommodation,
} from "@/lib/accommodations";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
};

async function updateAccommodation(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const accommodationId = String(formData.get("accommodation_id") || "");
    const payload = buildAccommodationPayload(formData, tripId);
    const validationErrors = validateAccommodationPayload(payload);

    if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(" "));
    }

    const { trip_id: _tripId, ...updatePayload } = payload;
    void _tripId;

    const { error } = await supabase
        .from("trip_accommodations")
        .update(updatePayload)
        .eq("id", accommodationId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating accommodation:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: updatePayload,
            accommodationId,
            userId: user.id,
        });
        throw new Error(
            `Could not update accommodation: ${getAccommodationErrorMessage(
                error.message
            )}`
        );
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
}

async function deleteAccommodation(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const accommodationId = String(formData.get("accommodation_id") || "");

    const { error } = await supabase
        .from("trip_accommodations")
        .delete()
        .eq("id", accommodationId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error deleting accommodation:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            accommodationId,
            userId: user.id,
        });
        throw new Error(
            `Could not delete accommodation: ${getAccommodationErrorMessage(
                error.message
            )}`
        );
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
}

export default async function TripAccommodationsPage({ params }: PageProps) {
    const { tripId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,title,destination")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const { data: accommodations, error } = await supabase
        .from("trip_accommodations")
        .select("*")
        .eq("trip_id", tripId)
        .order("check_in_date", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Error loading accommodations:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            userId: user.id,
        });
    }

    return (
        <main className="min-h-screen vaivia-page-bg px-4 pb-24 pt-8 text-white md:px-8 md:pb-12 md:pl-32">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30 md:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-lime-300">
                        VAIVIA
                    </p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                        {trip.title || "Trip"} accommodations
                    </h1>
                    {trip.destination ? (
                        <p className="mt-3 text-sm font-bold text-slate-400">
                            {trip.destination}
                        </p>
                    ) : null}
                </header>

                {error ? (
                    <div className="rounded-[1.5rem] border border-red-300/30 bg-red-950/70 p-5 text-sm font-semibold text-red-50">
                        Could not load accommodations right now.
                    </div>
                ) : null}

                <AccommodationManager
                    tripId={tripId}
                    accommodations={(accommodations || []) as TripAccommodation[]}
                    createAction={createAccommodation}
                    updateAction={updateAccommodation}
                    deleteAction={deleteAccommodation}
                />
            </div>
        </main>
    );
}
