import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import NewTripForm, {
    type CreateTripFormState,
    type NewTripInviteOption,
} from "@/components/NewTripForm";
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

type TripMatrixLeg = {
    name: string;
    startDate: string | null;
    endDate: string | null;
};

function parseInitialInviteIdentifiers(formData: FormData) {
    return Array.from(
        new Set(
            formData
                .getAll("initial_invites")
                .flatMap((value) => String(value || "").split(","))
                .map((value) => value.trim())
                .filter(Boolean)
        )
    );
}

function parseInitialFamilyMemberIds(formData: FormData) {
    return Array.from(
        new Set(
            formData
                .getAll("initial_family_member_ids")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );
}

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

function normalizeMatrixValue(value: FormDataEntryValue | null) {
    return String(value || "").trim();
}

function getTripDateDestinationMatrix(formData: FormData) {
    const dateMode = normalizeMatrixValue(formData.get("date_mode"));
    const knowsDates = dateMode === "known";

    if (!knowsDates) {
        return {
            knowsDates,
            destination: normalizeMatrixValue(formData.get("destination")),
            startDate: "",
            endDate: "",
            legs: [] as TripMatrixLeg[],
            validationError: "",
        };
    }

    const startDestination = normalizeMatrixValue(
        formData.get("matrix_start_destination")
    );
    const startPlaceId = normalizeMatrixValue(formData.get("matrix_start_place_id"));
    const startDate = normalizeMatrixValue(formData.get("matrix_start_date"));
    const nextRows = Array.from({ length: 6 }, (_, index) => {
        const name = normalizeMatrixValue(
            formData.get(`matrix_next_destination_${index}`)
        );
        const placeId = normalizeMatrixValue(
            formData.get(`matrix_next_place_id_${index}`)
        );
        const arrivalDate = normalizeMatrixValue(
            formData.get(`matrix_next_arrival_date_${index}`)
        );

        return {
            name,
            placeId,
            arrivalDate,
        };
    }).filter((row) => row.name || row.arrivalDate);
    const returnDestination =
        normalizeMatrixValue(formData.get("matrix_return_destination")) ||
        startDestination;
    const returnPlaceId =
        normalizeMatrixValue(formData.get("matrix_return_place_id")) ||
        (returnDestination === startDestination ? startPlaceId : "");
    const returnDate = normalizeMatrixValue(formData.get("matrix_return_date"));
    const missingValidatedDestination = [
        { name: startDestination, placeId: startPlaceId },
        ...nextRows.map((row) => ({ name: row.name, placeId: row.placeId })),
        { name: returnDestination, placeId: returnPlaceId },
    ].some((row) => row.name && !row.placeId);
    const timelineRows = [
        {
            name: startDestination,
            date: startDate,
        },
        ...nextRows.map((row) => ({
            name: row.name,
            date: row.arrivalDate,
        })),
        {
            name: returnDestination,
            date: returnDate,
        },
    ].filter((row) => row.name || row.date);
    const destination = timelineRows
        .map((row) => row.name)
        .filter(Boolean)
        .filter((name, index, values) => values.indexOf(name) === index)
        .join(", ");
    const legs = timelineRows
        .filter((row) => row.name)
        .map((row, index): TripMatrixLeg => {
            const nextDate = timelineRows[index + 1]?.date || null;

            return {
                name: row.name,
                startDate: row.date || null,
                endDate: nextDate,
            };
        });

    return {
        knowsDates,
        destination,
        startDate,
        endDate: returnDate,
        legs,
        validationError: missingValidatedDestination
            ? "Choose each destination from the Google location list."
            : "",
    };
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
    const matrix = getTripDateDestinationMatrix(formData);
    const destination = matrix.destination;
    const startDate = matrix.startDate;
    const endDate = matrix.endDate;
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

    if (matrix.validationError) {
        return {
            error: matrix.validationError,
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
        if (matrix.legs.length > 0) {
            const now = new Date().toISOString();
            const { error: legsError } = await supabase.from("trip_legs").insert(
                matrix.legs.map((leg) => ({
                    trip_id: createdTrip.id,
                    name: leg.name,
                    city_name: leg.name,
                    start_date: leg.startDate,
                    end_date: leg.endDate,
                    leg_type: "custom",
                    created_by: user.id,
                    updated_at: now,
                }))
            );

            if (legsError) {
                console.error("Error creating trip date matrix legs:", {
                    message: legsError.message,
                    code: legsError.code,
                    details: legsError.details,
                    hint: legsError.hint,
                    tripId: createdTrip.id,
                });
            }
        }

        const initialInviteIdentifiers = parseInitialInviteIdentifiers(formData);
        if (initialInviteIdentifiers.length > 0) {
            for (const inviteeIdentifier of initialInviteIdentifiers) {
                const { error: inviteError } = await supabase.rpc(
                    "create_trip_invitation",
                    {
                        target_trip_id: createdTrip.id,
                        invitee_identifier: inviteeIdentifier,
                        consent_confirmed: true,
                    }
                );

                if (inviteError) {
                    console.warn("Could not create initial trip invite:", {
                        message: inviteError.message,
                        code: inviteError.code,
                        details: inviteError.details,
                        hint: inviteError.hint,
                        tripId: createdTrip.id,
                        inviteeIdentifier,
                    });
                }
            }
        }

        const initialFamilyMemberIds = parseInitialFamilyMemberIds(formData);
        if (initialFamilyMemberIds.length > 0) {
            const { error: familyMembersError } = await supabase
                .from("trip_family_members")
                .upsert(
                    initialFamilyMemberIds.map((familyMemberId) => ({
                        trip_id: createdTrip.id,
                        family_member_id: familyMemberId,
                        added_by: user.id,
                        status: "going",
                        updated_at: new Date().toISOString(),
                    })),
                    { onConflict: "trip_id,family_member_id" }
                );

            if (familyMembersError) {
                console.warn("Could not add initial family members to trip:", {
                    message: familyMembersError.message,
                    code: familyMembersError.code,
                    details: familyMembersError.details,
                    hint: familyMembersError.hint,
                    tripId: createdTrip.id,
                    initialFamilyMemberIds,
                });
            }
        }

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
    const { data: friendships, error: friendshipsError } = await supabase
        .from("user_friendships")
        .select("requester_user_id,addressee_user_id,status")
        .or(`requester_user_id.eq.${user.id},addressee_user_id.eq.${user.id}`)
        .eq("status", "accepted");

    if (friendshipsError) {
        console.warn("Could not load friends for new trip invites:", {
            message: friendshipsError.message,
            code: friendshipsError.code,
            details: friendshipsError.details,
            hint: friendshipsError.hint,
            userId: user.id,
        });
    }

    const friendIds = Array.from(
        new Set(
            ((friendships || []) as Array<{
                requester_user_id?: string | null;
                addressee_user_id?: string | null;
            }>)
                .map((friendship) =>
                    friendship.requester_user_id === user.id
                        ? friendship.addressee_user_id
                        : friendship.requester_user_id
                )
                .filter(
                    (friendId): friendId is string =>
                        Boolean(friendId) && friendId !== user.id
                )
        )
    );
    const { data: friendProfiles, error: friendProfilesError } =
        friendIds.length > 0
            ? await supabase
                  .from("connected_public_user_profiles")
                  .select("id,first_name,last_name,username,avatar_url")
                  .in("id", friendIds)
            : { data: [], error: null };

    if (friendProfilesError) {
        console.warn("Could not load friend profiles for new trip invites:", {
            message: friendProfilesError.message,
            code: friendProfilesError.code,
            details: friendProfilesError.details,
            hint: friendProfilesError.hint,
            userId: user.id,
        });
    }

    const friendInviteOptions: NewTripInviteOption[] = (
        (friendProfiles || []) as Array<{
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            username?: string | null;
            avatar_url?: string | null;
        }>
    ).map((friend) => {
        const name =
            [friend.first_name, friend.last_name].filter(Boolean).join(" ").trim() ||
            friend.username ||
            "VAIVIA friend";

        return {
            id: friend.id,
            name,
            secondaryLabel: friend.username ? `@${friend.username}` : null,
            avatarUrl: friend.avatar_url || null,
            identifier: friend.username || null,
        };
    });
    const { data: familyMembers, error: familyMembersError } = await supabase
        .from("user_family_members")
        .select("id,name,relationship,avatar_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (familyMembersError) {
        console.warn("Could not load family members for new trip invites:", {
            message: familyMembersError.message,
            code: familyMembersError.code,
            details: familyMembersError.details,
            hint: familyMembersError.hint,
            userId: user.id,
        });
    }

    const familyInviteOptions: NewTripInviteOption[] = (
        (familyMembers || []) as Array<{
            id: string;
            name: string;
            relationship?: string | null;
            avatar_url?: string | null;
        }>
    ).map((member) => ({
        id: member.id,
        name: member.name,
        secondaryLabel: member.relationship || "Family member",
        avatarUrl: member.avatar_url || null,
    }));

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
                    inviteOptions={{
                        friends: friendInviteOptions,
                        familyMembers: familyInviteOptions,
                    }}
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
