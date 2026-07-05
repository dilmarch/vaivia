import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import TripDestinationPicker from "@/components/TripDestinationPicker";

type TripPayload = {
    user_id: string;
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

function removeTripCoverColumn(payload: TripPayload) {
    const { cover_image_url, ...fallbackPayload } = payload;

    void cover_image_url;

    return fallbackPayload;
}

async function createTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const title = formData.get("title") as string;
    const destination = formData.get("destination") as string;
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;
    const tripCoverImageUrl = String(formData.get("cover_image_url") || "").trim();
    const notes = formData.get("notes") as string;

    const payload: TripPayload = {
        user_id: user.id,
        title,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        cover_image_url: tripCoverImageUrl || null,
        notes,
    };

    let { error } = await supabase.from("trips").insert(payload);

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn(
            "Optional trip cover column is missing. Falling back to legacy trip fields.",
            error
        );
        ({ error } = await supabase.from("trips").insert(removeTripCoverColumn(payload)));
    }

    if (error) {
        console.error("Error creating trip:", error);
        throw new Error("Could not create trip");
    }

    redirect("/");
}

async function NewTripContent() {
    await connection();

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
                    ← Back to dashboard
                </Link>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-bold text-slate-900">
                        New Trip
                    </h1>
                    <p className="mt-2 text-slate-600">
                        Add the basic details for your trip.
                    </p>
                </header>

                <form
                    action={createTrip}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                    <div className="space-y-5">
                        <div>
                            <label
                                htmlFor="title"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Trip title
                            </label>
                            <input
                                id="title"
                                name="title"
                                type="text"
                                required
                                placeholder="Berlin & Asia 2026"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>

                        <TripDestinationPicker inputId="tripCreateDestination" />

                        <div className="grid gap-5 md:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="start_date"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Start date
                                </label>
                                <input
                                    id="start_date"
                                    name="start_date"
                                    type="date"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="end_date"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    End date
                                </label>
                                <input
                                    id="end_date"
                                    name="end_date"
                                    type="date"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="notes"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Notes
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                rows={4}
                                placeholder="Anything important about this trip..."
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-3">
                        <Link
                            href="/"
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                        >
                            Save trip
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}

export default function NewTripPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-slate-50 px-6 py-10">
                    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                        Loading trip form...
                    </div>
                </main>
            }
        >
            <NewTripContent />
        </Suspense>
    );
}
