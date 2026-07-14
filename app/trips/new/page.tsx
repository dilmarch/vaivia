import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import NewTripForm, { type CreateTripFormState } from "@/components/NewTripForm";
import {
    buildTripCoverPayloadFromForm,
    cleanupReplacedTripCover,
    deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import {
    loadOnboardingProgress,
    markOnboardingStepCompleted,
} from "@/lib/onboarding";
import { slugifyTripTitle } from "@/lib/tripRoutes";

type TripPayload = {
    user_id: string;
    title: string;
    slug: string;
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

function removeTripCoverColumn(payload: TripPayload) {
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

async function createTrip(
    _state: CreateTripFormState,
    formData: FormData
): Promise<CreateTripFormState> {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const title = String(formData.get("title") || "").trim();
    const { count: existingTripCount, error: tripCountError } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
    const nextTripNumber = (existingTripCount ?? 0) + 1;
    const requestedSlug = slugifyTripTitle(
        String(formData.get("slug") || title),
        nextTripNumber
    );
    const slugWasManual = String(formData.get("slug_was_manual") || "") === "true";
    const destination = formData.get("destination") as string;
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;
    const notes = formData.get("notes") as string;

    if (!title) {
        return {
            fieldErrors: {
                title: "Add a trip title.",
            },
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    if (tripCountError) {
        console.error("Error checking trip count:", tripCountError);
        return {
            error: "Could not prepare a trip link for this trip.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const { data: availableSlug, error: slugError } = await supabase.rpc(
        "get_available_trip_slug",
        {
            base_slug: requestedSlug,
            excluded_trip_id: null,
        }
    );

    if (slugError) {
        console.error("Error checking trip slug:", slugError);
        return {
            error: "Could not check whether that trip link is available.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const finalSlug =
        typeof availableSlug === "string" && availableSlug
            ? availableSlug
            : requestedSlug;

    if (slugWasManual && finalSlug !== requestedSlug) {
        return {
            fieldErrors: {
                slug: "That trip link is already in use. Choose a unique slug.",
            },
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const payload: TripPayload = {
        user_id: user.id,
        title,
        slug: finalSlug,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        notes,
    };

    let { data: createdTrip, error } = await supabase
        .from("trips")
        .insert(payload)
        .select("id,cover_image_source,cover_image_storage_path")
        .single();

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn(
            "Optional trip cover column is missing. Falling back to legacy trip fields.",
            error
        );
        const fallbackResult = await supabase
            .from("trips")
            .insert(removeTripCoverColumn(payload))
            .select("id,cover_image_source,cover_image_storage_path")
            .single();
        createdTrip = fallbackResult.data;
        error = fallbackResult.error;
    }

    if (error) {
        console.error("Error creating trip:", error);
        return {
            error:
                error.code === "23505"
                    ? "That trip link is already in use. Choose a unique slug."
                    : "Could not create trip.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    if (createdTrip?.id) {
        let uploadedStoragePath: string | null | undefined = null;
        try {
            const coverResult = await buildTripCoverPayloadFromForm({
                supabase,
                userId: user.id,
                tripId: createdTrip.id,
                formData,
            });
            uploadedStoragePath = coverResult.uploadedStoragePath;

            if (Object.keys(coverResult.payload).length > 0) {
                const { error: coverError } = await supabase
                    .from("trips")
                    .update(coverResult.payload)
                    .eq("id", createdTrip.id);

                if (coverError) throw coverError;

                await cleanupReplacedTripCover({
                    supabase,
                    userId: user.id,
                    oldCover: createdTrip,
                    nextPayload: coverResult.payload,
                });
            }
        } catch (coverError) {
            await deleteOwnedTripCoverObject({
                supabase,
                userId: user.id,
                storagePath: uploadedStoragePath,
            });
            console.error("Error saving trip cover:", coverError);
            return {
                error:
                    coverError instanceof Error
                        ? coverError.message
                        : "Could not save trip cover.",
                values: {
                    title,
                    slug: requestedSlug,
                },
            };
        }
    }

    await markOnboardingStepCompleted({
        supabase,
        userId: user.id,
        step: "create_trip",
        nextStep: "add_first_item",
    });

    redirect(`/trips/${finalSlug}?tab=itinerary&onboarding=first-item`);
}

async function NewTripContent() {
    await connection();

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { count: existingTripCount } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
    const nextTripNumber = (existingTripCount ?? 0) + 1;
    const { data: onboardingProgress } = await loadOnboardingProgress(
        supabase,
        user.id
    );
    const isOnboardingTripCreate =
        onboardingProgress?.status === "in_progress" &&
        onboardingProgress.current_step === "create_trip";

    return (
        <main className="min-h-screen bg-[#0c0115] px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <Link href="/" className="text-sm font-semibold text-lime-200 hover:text-lime-100">
                    ← Back to dashboard
                </Link>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-bold uppercase tracking-[0.35em] text-lime-200/80">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-black text-white">
                        New Trip
                    </h1>
                    <p className="mt-2 text-slate-300">
                        Add the basic details for your trip.
                    </p>
                </header>

                <NewTripForm
                    action={createTrip}
                    nextTripNumber={nextTripNumber}
                    isOnboarding={isOnboardingTripCreate}
                />
            </div>
        </main>
    );
}

export default function NewTripPage() {
    return (
        <Suspense
            fallback={
                <DelayedVaiviaLoadingScreen
                    title="Preparing your trip form"
                    subtitle="Getting the details ready for your next adventure."
                    compact
                />
            }
        >
            <NewTripContent />
        </Suspense>
    );
}
