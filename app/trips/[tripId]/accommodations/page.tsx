import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAccommodation } from "@/app/actions/accommodations";
import { moveTripItem } from "@/app/actions/moveTripItem";
import { deleteTripLeg, upsertTripLeg } from "@/app/actions/tripLegs";
import AccommodationAreaMaps, {
    type AccommodationAreaMapCity,
    type AccommodationAreaMapPlace,
} from "@/components/accommodations/AccommodationAreaMaps";
import AccommodationCoverageTimeline, {
    type AccommodationCoverageLeg,
    type AccommodationCoverageParticipant,
    type AccommodationCoverageTraveler,
} from "@/components/accommodations/AccommodationCoverageTimeline";
import AccommodationManager from "@/components/accommodations/AccommodationManager";
import AccommodationPageTabs, {
    type AccommodationPageTab,
} from "@/components/accommodations/AccommodationPageTabs";
import TripCountdown from "@/components/TripCountdown";
import TripDocumentTitle from "@/components/TripDocumentTitle";
import TripHeaderCover from "@/components/TripHeaderCover";
import TripLegLocationLine, {
    type TripLegLocation,
    type TripLegMemberOption,
} from "@/components/TripLegLocationLine";
import TripMembersPanel, {
    type TripHeaderFamilyMember,
    type TripHeaderInvitation,
    type TripHeaderMemberLeg,
    type TripHeaderMember,
} from "@/components/TripMembersPanel";
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
    type TripAccommodation,
} from "@/lib/accommodations";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import { createClient } from "@/lib/supabase/server";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import {
    getMapCoordinate,
    hasMappableCoordinatePair,
} from "@/lib/mapCoordinates";
import {
    buildTripCoverPayloadFromForm,
    cleanupReplacedTripCover,
    deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import { getMoveTargetTrips } from "@/lib/tripMove";
import { getTripHref, resolveTripRouteParam } from "@/lib/tripRoutes";
import {
    addValidatedTripSlugToPayload,
    getTripSlugErrorMessage,
    isTripSlugConflictError,
} from "@/lib/tripSlugUpdate";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";
import { sortTripLegLocations } from "@/lib/tripLegLocationOrdering";
import { removeTripMemberAsOwner } from "@/lib/tripMemberRemoval";
import { assertDateRangeOrdered } from "@/lib/dateRange";
import { syncTripDestinationsFromForm } from "@/lib/tripDestinations";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
    searchParams: Promise<{
        tab?: string | string[];
    }>;
};

type TripUpdatePayload = {
    title: string;
    slug?: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
    notes: string;
};

function getFlagEmoji(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";

    return normalized
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getCountryName(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return null;

    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || null;
    } catch {
        return null;
    }
}

function getCountryCodeFromFlag(flag: string) {
    const codePoints = Array.from(flag);
    if (codePoints.length !== 2) return null;

    const countryCode = codePoints
        .map((character) => character.codePointAt(0))
        .filter((codePoint): codePoint is number => Boolean(codePoint))
        .map((codePoint) => String.fromCharCode(codePoint - 127397))
        .join("");

    return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];
    return destination
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getLeadingFlag(destination: string) {
    return destination.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "";
}

function stripLeadingFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
}

function normalizeLocationText(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function locationsMatch(
    base: TripLegLocation,
    candidate?: TripLegLocation | null
) {
    if (!candidate) return false;
    const baseCountryCode = String(base.countryCode || "").toUpperCase();
    const candidateCountryCode = String(candidate.countryCode || "").toUpperCase();

    if (baseCountryCode && candidateCountryCode && baseCountryCode !== candidateCountryCode) {
        return false;
    }

    const baseNames = [base.name, base.cityName, base.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);
    const candidateNames = [candidate.name, candidate.cityName, candidate.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);

    const hasNameMatch = baseNames.some((baseName) =>
        candidateNames.some(
            (candidateName) =>
                candidateName === baseName ||
                candidateName.includes(baseName) ||
                baseName.includes(candidateName)
        )
    );
    if (hasNameMatch) return true;

    return (
        baseNames.length === 0 &&
        candidateNames.length === 0 &&
        Boolean(baseCountryCode) &&
        baseCountryCode === candidateCountryCode
    );
}

function getPendingInvitationLabel(invitation: Record<string, unknown>) {
    const labelCandidates = [
        invitation.invitee_identifier,
        invitation.invitee_email,
        invitation.invited_email,
        invitation.invitee_username,
        invitation.invited_username,
        invitation.email,
        invitation.username,
        invitation.target_email,
        invitation.target_username,
    ];

    const directLabel = labelCandidates.find(
        (candidate): candidate is string =>
            typeof candidate === "string" && candidate.trim().length > 0
    );

    if (directLabel) return directLabel.trim();

    return "Invited guest";
}

function formatTripDate(dateString?: string | null) {
    if (!dateString) return "Not set";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Not set";

    return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function formatShortDate(dateString?: string | null) {
    if (!dateString) return null;
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
    const formatTime = (value?: string | null) => {
        if (!value) return null;
        const [hoursText, minutesText] = value.split(":");
        const hours = Number(hoursText);
        const minutes = Number(minutesText);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(2026, 0, 1, hours, minutes));
    };

    return [formatTime(startTime), formatTime(endTime)].filter(Boolean).join(" - ");
}

function getAreaMapKey(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function buildGoogleMapsUrl(
    latitude: number,
    longitude: number,
    googlePlaceId?: string | null
) {
    const params = new URLSearchParams({
        api: "1",
        query: `${latitude},${longitude}`,
    });

    if (googlePlaceId) params.set("query_place_id", googlePlaceId);

    return `https://www.google.com/maps/search/?${params.toString()}`;
}

type AreaMapGroupAccumulator = AccommodationAreaMapCity & {
    sortOrder: number;
    matchLabels: string[];
};

function findAreaMapGroupKey({
    tripLegId,
    labels,
    legKeyById,
    groups,
}: {
    tripLegId?: string | null;
    labels: Array<string | null | undefined>;
    legKeyById: Map<string, string>;
    groups: Map<string, AreaMapGroupAccumulator>;
}) {
    if (tripLegId && legKeyById.has(tripLegId)) {
        return legKeyById.get(tripLegId) || "";
    }

    const normalizedLabels = labels.map(getAreaMapKey).filter(Boolean);

    for (const [key, group] of groups.entries()) {
        const groupLabels = [group.name, group.countryName, ...group.matchLabels]
            .map(getAreaMapKey)
            .filter(Boolean);

        const hasMatch = normalizedLabels.some((label) =>
            groupLabels.some(
                (groupLabel) =>
                    label === groupLabel ||
                    label.includes(groupLabel) ||
                    groupLabel.includes(label)
            )
        );

        if (hasMatch) return key;
    }

    return normalizedLabels[0] || "";
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
                message.includes("cover_image_photographer_name") ||
                message.includes("cover_image_photographer_url") ||
                message.includes("schema cache")))
    );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
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

async function updateTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const title = String(formData.get("title") || "");
    const slug = String(formData.get("slug") || "");
    const startDate = String(formData.get("start_date") || "");
    const endDate = String(formData.get("end_date") || "");
    assertDateRangeOrdered(
        startDate,
        endDate,
        "Trip end date cannot be before its start date."
    );
    const { data: existingTripCover, error: existingTripCoverError } = await supabase
        .from("trips")
        .select("id,cover_image_source,cover_image_storage_path")
        .eq("id", tripId)
        .maybeSingle();

    if (existingTripCoverError || !existingTripCover) {
        console.error("Error loading existing trip cover:", existingTripCoverError);
        throw new Error("Could not update trip");
    }

    let coverPayload: Partial<TripUpdatePayload> = {};
    let uploadedStoragePath: string | null | undefined = null;
    try {
        const coverResult = await buildTripCoverPayloadFromForm({
            supabase,
            userId: user.id,
            tripId,
            formData,
        });
        coverPayload = coverResult.payload;
        uploadedStoragePath = coverResult.uploadedStoragePath;
    } catch (error) {
        console.error("Error preparing trip cover:", error);
        throw error;
    }

    const payload: TripUpdatePayload = {
        title,
        destination: String(formData.get("destination") || ""),
        start_date: startDate || null,
        end_date: endDate || null,
        notes: String(formData.get("notes") || ""),
        ...coverPayload,
    };
    await addValidatedTripSlugToPayload(supabase, payload, {
        tripId,
        submittedSlug: slug,
        fallbackTitle: title,
    });

    let { error } = await supabase.from("trips").update(payload).eq("id", tripId);

    if (error && isMissingTripCoverColumnError(error)) {
        ({ error } = await supabase
            .from("trips")
            .update(removeTripCoverColumn(payload))
            .eq("id", tripId));
    }

    if (error) {
        await deleteOwnedTripCoverObject({
            supabase,
            userId: user.id,
            storagePath: uploadedStoragePath,
        });
        console.error("Error updating trip from stays page:", error);
        if (isTripSlugConflictError(error)) {
            throw new Error(getTripSlugErrorMessage(error));
        }
        throw new Error("Could not update trip");
    }

    await syncTripDestinationsFromForm({ supabase, tripId, formData });

    await cleanupReplacedTripCover({
        supabase,
        userId: user.id,
        oldCover: existingTripCover,
        nextPayload: coverPayload,
    });

    revalidatePath(`/trips/${tripId}/accommodations`);
}

async function deleteTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");

    const { error } = await supabase
        .from("trips")
        .update({
            archived_at: new Date().toISOString(),
            archived_reason: "user_archived",
        })
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error archiving trip from stays page:", error);
        throw new Error("Could not archive trip");
    }

    redirect("/");
}

async function removeTripMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const memberUserId = String(formData.get("member_user_id") || "");

    if (!tripId || !memberUserId || memberUserId === user.id) {
        throw new Error("Could not remove trip member");
    }

    await removeTripMemberAsOwner({ supabase, tripId, memberUserId });

    revalidatePath(`/trips/${tripId}/accommodations`);
}

async function addTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const familyMemberIds = Array.from(
        new Set(
            formData
                .getAll("family_member_id")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (familyMemberIds.length === 0) return;

    const { error } = await supabase.from("trip_family_members").upsert(
        familyMemberIds.map((familyMemberId) => ({
            trip_id: tripId,
            family_member_id: familyMemberId,
            added_by: user.id,
            status: "going",
            updated_at: new Date().toISOString(),
        })),
        { onConflict: "trip_id,family_member_id" }
    );

    if (error) {
        console.error("Error adding family member to trip:", error);
        throw new Error("Could not add family member to trip");
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
}

async function removeTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const familyMemberId = String(formData.get("family_member_id") || "");

    const { error } = await supabase
        .from("trip_family_members")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("trip_id", tripId)
        .eq("family_member_id", familyMemberId);

    if (error) {
        console.error("Error removing family member from trip:", error);
        throw new Error("Could not remove family member from trip");
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
}

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
        return { ok: false as const, error: validationErrors.join(" ") };
    }

    const { trip_id: _tripId, ...updatePayload } = payload;
    void _tripId;

    const { error } = await supabase
        .from("trip_accommodations")
        .update(updatePayload)
        .eq("id", accommodationId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating stay:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: updatePayload,
            accommodationId,
            userId: user.id,
        });
        return {
            ok: false as const,
            error: `Could not update stay: ${getAccommodationErrorMessage(
                error.message
            )}`,
        };
    }

    if (!payload.is_planning_option) {
        try {
            await syncAutoBudgetExpense({
                supabase,
                userId: user.id,
                tripId,
                sourceType: "accommodation",
                sourceId: accommodationId,
                amount: payload.cost,
                currency: payload.currency,
                expenseDate: payload.check_in_date,
                description: payload.hotel_name,
                formData,
            });
        } catch (budgetError) {
            console.error("Stay updated without budget sync:", {
                message:
                    budgetError instanceof Error
                        ? budgetError.message
                        : String(budgetError),
                tripId,
                accommodationId,
                userId: user.id,
            });
            return {
                ok: false as const,
                error: "Stay saved, but its budget entry could not be updated.",
            };
        }

        const participantsError = await replaceTripItemParticipantsFromForm({
            tripId,
            itemType: "accommodation",
            itemId: accommodationId,
            formData,
        });

        if (participantsError) {
            console.error("Error updating stay participants:", {
                message: participantsError.message,
                code: participantsError.code,
                details: participantsError.details,
                hint: participantsError.hint,
                tripId,
                accommodationId,
            });
            return {
                ok: false as const,
                error: "Stay saved, but its traveler selection could not be updated.",
            };
        }
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
    return { ok: true as const };
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
        console.error("Error deleting stay:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            accommodationId,
            userId: user.id,
        });
        throw new Error(
            `Could not delete stay: ${getAccommodationErrorMessage(
                error.message
            )}`
        );
    }

    revalidatePath(`/trips/${tripId}/accommodations`);
}

async function promoteAccommodationOption(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const accommodationId = String(formData.get("accommodation_id") || "");
    const status = String(formData.get("status") || "tentative");
    const checkInTimeStart = String(
        formData.get("check_in_time_start") || ""
    ).trim();
    const checkInTimeEnd = String(
        formData.get("check_in_time_end") || ""
    ).trim();
    const checkOutTime = String(formData.get("check_out_time") || "").trim();
    const costText = String(formData.get("cost") || "").trim();
    const cost = costText ? Number(costText.replace(/,/g, "")) : null;
    const currency = String(formData.get("currency") || "CAD")
        .trim()
        .toUpperCase();
    const audienceModeValue = String(
        formData.get("audience_mode") || "everyone"
    );
    const audienceMode =
        audienceModeValue === "custom" || audienceModeValue === "just_me"
            ? audienceModeValue
            : "everyone";
    const validStatuses = new Set(["tentative", "booked", "cancelled"]);
    const validTime = (value: string) =>
        !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

    if (!tripId || !accommodationId || !validStatuses.has(status)) {
        return { ok: false as const, error: "Choose a valid stay and status." };
    }
    if (
        !validTime(checkInTimeStart) ||
        !validTime(checkInTimeEnd) ||
        !validTime(checkOutTime)
    ) {
        return { ok: false as const, error: "Choose valid stay times." };
    }
    if (
        checkInTimeStart &&
        checkInTimeEnd &&
        checkInTimeEnd <= checkInTimeStart
    ) {
        return {
            ok: false as const,
            error: "Check-in end time must be after check-in start time.",
        };
    }
    if (cost !== null && (!Number.isFinite(cost) || cost <= 0)) {
        return { ok: false as const, error: "Price must be greater than 0." };
    }
    if (cost !== null && !/^[A-Z]{3}$/.test(currency)) {
        return { ok: false as const, error: "Choose a valid currency." };
    }

    const participantsError = await replaceTripItemParticipantsFromForm({
        tripId,
        itemType: "accommodation",
        itemId: accommodationId,
        formData,
    });

    if (participantsError) {
        return {
            ok: false as const,
            error: "The guest selection could not be saved. Please try again.",
        };
    }

    const { data, error } = await supabase
        .from("trip_accommodations")
        .update({
            is_planning_option: false,
            status: status as "tentative" | "booked" | "cancelled",
            check_in_time_start: checkInTimeStart || null,
            check_in_time_end: checkInTimeEnd || null,
            check_out_time: checkOutTime || null,
            cost,
            currency: cost === null ? null : currency,
            audience_mode: audienceMode,
        })
        .eq("id", accommodationId)
        .eq("trip_id", tripId)
        .eq("is_planning_option", true)
        .select("id, hotel_name, check_in_date, cost, currency")
        .maybeSingle();

    if (error || !data) {
        return {
            ok: false as const,
            error: "This stay option could not be added to the trip.",
        };
    }

    try {
        await syncAutoBudgetExpense({
            supabase,
            userId: user.id,
            tripId,
            sourceType: "accommodation",
            sourceId: data.id,
            amount: data.cost,
            currency: data.currency,
            expenseDate: data.check_in_date,
            description: data.hotel_name,
            formData,
        });
    } catch (budgetError) {
        console.error("Promoted stay saved without budget sync:", {
            message:
                budgetError instanceof Error
                    ? budgetError.message
                    : String(budgetError),
            tripId,
            userId: user.id,
        });
    }

    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/accommodations`);
    return { ok: true as const };
}

export default async function TripAccommodationsPage({
    params,
    searchParams,
}: PageProps) {
    const [{ tripId: tripRouteParam }, resolvedSearchParams] = await Promise.all([
        params,
        searchParams,
    ]);
    const activeAccommodationTab: AccommodationPageTab =
        resolvedSearchParams.tab === "planning" ? "planning" : "stays";
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const resolvedTrip = await resolveTripRouteParam(supabase, tripRouteParam);

    if (resolvedTrip.error || !resolvedTrip.trip) {
        notFound();
    }

    if (resolvedTrip.shouldRedirect) {
        const canonicalHref = getTripHref(resolvedTrip.trip, "/accommodations");
        redirect(
            activeAccommodationTab === "planning"
                ? `${canonicalHref}?tab=planning`
                : canonicalHref
        );
    }

    const tripId = resolvedTrip.tripId;
    const trip = resolvedTrip.trip;

    const { trips: movableTrips } = await loadActiveMemberTrips(supabase, user.id);
    const moveTargetTrips = getMoveTargetTrips({
        trips: movableTrips,
        currentTripId: tripId,
    });

    const tripRecord = trip as {
        id: string;
        slug?: string | null;
        title: string;
        destination?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        notes?: string | null;
        user_id?: string | null;
        created_at?: string | null;
    };
    const accommodationsHref = getTripHref(tripRecord, "/accommodations");

    const { data: tripMemberRows } = await supabase
        .from("trip_members")
        .select("id,user_id,role,status,created_at")
        .eq("trip_id", tripId)
        .eq("status", "active");

    const memberRows = (tripMemberRows || []) as Array<{
        id?: string | null;
        user_id?: string | null;
        role?: string | null;
        created_at?: string | null;
    }>;
    const memberRowsByUserId = new Map(
        memberRows
            .filter((member) => Boolean(member.user_id))
            .map((member) => [member.user_id as string, member])
    );
    const tripMemberUserIds = Array.from(
        new Set(
            [tripRecord.user_id, ...memberRows.map((member) => member.user_id)].filter(
                Boolean
            ) as string[]
        )
    );
    let tripMembers: TripHeaderMember[] = [];

    if (tripMemberUserIds.length > 0) {
        const { data: profileRows } = await supabase
            .from("connected_public_user_profiles")
            .select("id,first_name,last_name,username,avatar_url")
            .in("id", tripMemberUserIds);

        const profilesById = new Map(
            ((profileRows || []) as Array<{
                id: string;
                first_name?: string | null;
                last_name?: string | null;
                username?: string | null;
                avatar_url?: string | null;
            }>).map((profile) => [profile.id, profile])
        );

        tripMembers = tripMemberUserIds.map((memberUserId) => {
            const profile = profilesById.get(memberUserId);
            const membership = memberRowsByUserId.get(memberUserId);

            return {
                trip_member_id: membership?.id || null,
                user_id: memberUserId,
                first_name: profile?.first_name || null,
                last_name: profile?.last_name || null,
                username: profile?.username || null,
                email: null,
                avatar_url: profile?.avatar_url || null,
                joined_at:
                    membership?.created_at ||
                    (memberUserId === tripRecord.user_id
                        ? tripRecord.created_at || null
                        : null),
                role:
                    memberUserId === tripRecord.user_id
                        ? "owner"
                        : membership?.role || null,
            };
        });
    }

    const { data: userFamilyRows } = await supabase
        .from("user_family_members")
        .select("id,user_id,name,relationship,avatar_url,notes,created_at,updated_at")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

    const { data: tripFamilyRows } = await supabase
        .from("trip_family_members")
        .select("id,trip_id,family_member_id,added_by,status,created_at,updated_at")
        .eq("trip_id", tripId)
        .eq("status", "going");

    const savedFamilyMembers = ((userFamilyRows || []) as Array<{
        id: string;
        name: string;
        relationship?: string | null;
        avatar_url?: string | null;
        notes?: string | null;
    }>).map(
        (member): TripHeaderFamilyMember => ({
            id: member.id,
            family_member_id: member.id,
            name: member.name,
            relationship: member.relationship || null,
            avatar_url: member.avatar_url || null,
            notes: member.notes || null,
            status: null,
        })
    );
    const savedFamilyById = new Map(
        savedFamilyMembers.map((member) => [member.family_member_id, member])
    );
    const tripFamilyMembers = ((tripFamilyRows || []) as Array<{
        id: string;
        family_member_id: string;
        created_at?: string | null;
        status?: string | null;
    }>)
        .map((row) => {
            const member = savedFamilyById.get(row.family_member_id);
            if (!member) return null;
            return {
                ...member,
                id: row.id,
                joined_at: row.created_at || null,
                status: row.status || "going",
            };
        })
        .filter(Boolean) as TripHeaderFamilyMember[];

    const { data: pendingInvitationRows } = await supabase
        .from("trip_invitations")
        .select("*")
        .eq("trip_id", tripId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

    const pendingInvitations: TripHeaderInvitation[] = (
        (pendingInvitationRows || []) as Array<Record<string, unknown>>
    ).map((invitation, index) => ({
        id:
            typeof invitation.id === "string"
                ? invitation.id
                : `${tripId}-pending-${index}`,
        label: getPendingInvitationLabel(invitation),
        created_at:
            typeof invitation.created_at === "string"
                ? invitation.created_at
                : null,
        invited_by:
            typeof invitation.invited_by === "string"
                ? invitation.invited_by
                : null,
    }));
    const pendingInvitationIds = (
        (pendingInvitationRows || []) as Array<Record<string, unknown>>
    ).flatMap((invitation) =>
        typeof invitation.id === "string" ? [invitation.id] : []
    );
    const {
        data: pendingInvitationLegRows,
        error: pendingInvitationLegRowsError,
    } = pendingInvitationIds.length > 0
        ? await supabase
              .from("trip_invitation_legs")
              .select("invitation_id,trip_leg_id")
              .eq("trip_id", tripId)
              .eq("is_included", true)
              .in("invitation_id", pendingInvitationIds)
        : { data: [], error: null };

    if (pendingInvitationLegRowsError) {
        console.warn("Could not load pending invitation legs for coverage timeline:", {
            message: pendingInvitationLegRowsError.message,
            code: pendingInvitationLegRowsError.code,
            details: pendingInvitationLegRowsError.details,
            hint: pendingInvitationLegRowsError.hint,
            tripId,
        });
    }

    const pendingInvitationLegIdsByInvitationId = new Map<string, string[]>();
    if (!pendingInvitationLegRowsError) {
        (
            (pendingInvitationLegRows || []) as Array<{
                invitation_id: string;
                trip_leg_id: string;
            }>
        ).forEach((row) => {
            const legIds =
                pendingInvitationLegIdsByInvitationId.get(row.invitation_id) || [];
            legIds.push(row.trip_leg_id);
            pendingInvitationLegIdsByInvitationId.set(row.invitation_id, legIds);
        });
    }
    const pendingInvitationScopeById = new Map(
        ((pendingInvitationRows || []) as Array<Record<string, unknown>>)
            .filter(
                (invitation) =>
                    typeof invitation.id === "string" &&
                    typeof invitation.invitation_scope === "string"
            )
            .map((invitation) => [
                invitation.id as string,
                invitation.invitation_scope as string,
            ])
    );
    const audienceOptions: TripAudienceOption[] = [
        ...(tripMembers
            .map((member): TripAudienceOption | null => {
                const membership = memberRowsByUserId.get(member.user_id);
                if (!membership?.id) return null;
                const displayName =
                    [member.first_name, member.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                    member.username ||
                    "Trip member";

                return {
                    kind: "member",
                    id: membership.id,
                    displayName,
                    avatarUrl: member.avatar_url || null,
                    status: "accepted",
                    secondaryLabel: member.username ? `@${member.username}` : null,
                    isCurrentUser: member.user_id === user.id,
                };
            })
            .filter(Boolean) as TripAudienceOption[]),
        ...pendingInvitations.map(
            (invitation): TripAudienceOption => ({
                kind: "invitation",
                id: invitation.id,
                displayName: invitation.label,
                status: "invited",
                secondaryLabel: "Pending invitation",
            })
        ),
        ...tripFamilyMembers.map(
            (member): TripAudienceOption => ({
                kind: "family_member",
                id: member.family_member_id,
                displayName: member.name,
                avatarUrl: member.avatar_url || null,
                status: "family_member",
                secondaryLabel: member.relationship || "Family member",
            })
        ),
    ];
    const currentUserTripMemberId =
        audienceOptions.find(
            (option) => option.kind === "member" && option.isCurrentUser
        )?.id || null;

    const { data: accommodations, error } = await supabase
        .from("trip_accommodations")
        .select("*")
        .eq("trip_id", tripId)
        .order("check_in_date", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Error loading stays:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            userId: user.id,
        });
    }

    const { data: accommodationParticipantRows, error: participantRowsError } =
        await supabase
            .from("trip_item_participants")
            .select(
                "item_id,participant_kind,trip_member_id,user_id,invitation_id,family_member_id,guest_name"
            )
            .eq("trip_id", tripId)
            .eq("item_type", "accommodation");

    if (participantRowsError) {
        console.warn("Could not load stay travelers for coverage timeline:", {
            message: participantRowsError.message,
            code: participantRowsError.code,
            details: participantRowsError.details,
            hint: participantRowsError.hint,
            tripId,
        });
    }

    const memberUserIdByMembershipId = new Map(
        memberRows
            .filter((member) => Boolean(member.id) && Boolean(member.user_id))
            .map((member) => [member.id as string, member.user_id as string])
    );
    const accommodationCoverageTravelers: AccommodationCoverageTraveler[] =
        audienceOptions.map((option) => ({
            kind: option.kind,
            id: option.id,
            userId:
                option.kind === "member"
                    ? memberUserIdByMembershipId.get(option.id) || null
                    : null,
            displayName: option.displayName,
            avatarUrl: option.avatarUrl || null,
            secondaryLabel: option.secondaryLabel || null,
            isCurrentUser: option.isCurrentUser,
            requiredLegIds:
                option.kind === "invitation" &&
                !pendingInvitationLegRowsError &&
                pendingInvitationScopeById.get(option.id) === "selected_legs"
                    ? pendingInvitationLegIdsByInvitationId.get(option.id) || []
                    : undefined,
        }));

    if (!accommodationCoverageTravelers.some((traveler) => traveler.isCurrentUser)) {
        const currentMember = tripMembers.find((member) => member.user_id === user.id);
        if (currentMember) {
            accommodationCoverageTravelers.unshift({
                kind: "member",
                id: currentMember.trip_member_id || `user:${user.id}`,
                userId: user.id,
                displayName:
                    [currentMember.first_name, currentMember.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                    currentMember.username ||
                    "You",
                avatarUrl: currentMember.avatar_url || null,
                secondaryLabel: currentMember.username
                    ? `@${currentMember.username}`
                    : null,
                isCurrentUser: true,
            });
        }
    }

    const { data: scheduledMapItems, error: scheduledMapItemsError } = await supabase
        .from("itinerary_items")
        .select(
            "id,title,category,status,item_date,start_time,end_time,location,formatted_address,google_place_id,location_lat,location_lng,trip_leg_id"
        )
        .eq("trip_id", tripId)
        .order("item_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (scheduledMapItemsError) {
        console.warn("Could not load scheduled items for stays map:", {
            message: scheduledMapItemsError.message,
            code: scheduledMapItemsError.code,
            details: scheduledMapItemsError.details,
            hint: scheduledMapItemsError.hint,
            tripId,
        });
    }

    const { data: ideaMapItems, error: ideaMapItemsError } = await supabase
        .from("trip_ideas")
        .select(
            "id,title,category,location,formatted_address,google_place_id,location_lat,location_lng,location_city,location_region,location_country,trip_leg_id,is_archived"
        )
        .eq("trip_id", tripId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

    if (ideaMapItemsError) {
        console.warn("Could not load ideas for stays map:", {
            message: ideaMapItemsError.message,
            code: ideaMapItemsError.code,
            details: ideaMapItemsError.details,
            hint: ideaMapItemsError.hint,
            tripId,
        });
    }

    const { data: tripLegRows, error: tripLegsError } = await supabase
        .from("trip_legs")
        .select(
            "id,name,city_name,country_code,google_place_id,icon_emoji,start_date,end_date,leg_type,sort_order"
        )
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });

    if (tripLegsError) {
        console.warn("Could not load trip legs for stays hero:", {
            message: tripLegsError.message,
            code: tripLegsError.code,
            details: tripLegsError.details,
            hint: tripLegsError.hint,
            tripId,
        });
    }

    const manualTripLegIds = ((tripLegRows || []) as Array<{ id?: string | null }>)
        .map((leg) => leg.id)
        .filter(Boolean) as string[];
    let tripMemberLegRows: Array<{
        trip_leg_id: string;
        trip_member_id: string;
        is_joining?: boolean | null;
        start_date?: string | null;
        end_date?: string | null;
    }> = [];

    if (manualTripLegIds.length > 0) {
        const { data: memberLegRows, error: memberLegRowsError } = await supabase
            .from("trip_member_legs")
            .select("trip_leg_id,trip_member_id,is_joining,start_date,end_date")
            .eq("trip_id", tripId)
            .in("trip_leg_id", manualTripLegIds);

        if (memberLegRowsError) {
            console.warn("Could not load trip leg members for stays hero:", {
                message: memberLegRowsError.message,
                code: memberLegRowsError.code,
                details: memberLegRowsError.details,
                hint: memberLegRowsError.hint,
                tripId,
            });
        } else {
            tripMemberLegRows = (memberLegRows || []) as typeof tripMemberLegRows;
        }
    }

    const tripMemberIdsByLegId = new Map<string, string[]>();
    tripMemberLegRows.forEach((row) => {
        if (!row.is_joining) return;
        const current = tripMemberIdsByLegId.get(row.trip_leg_id) || [];
        current.push(row.trip_member_id);
        tripMemberIdsByLegId.set(row.trip_leg_id, current);
    });
    const tripMemberLegDatesByLegAndMember = new Map<
        string,
        { startDate: string | null; endDate: string | null }
    >();
    tripMemberLegRows.forEach((row) => {
        if (!row.is_joining) return;
        tripMemberLegDatesByLegAndMember.set(
            `${row.trip_leg_id}:${row.trip_member_id}`,
            {
                startDate: row.start_date || null,
                endDate: row.end_date || row.start_date || null,
            }
        );
    });

    const manualLocations: TripLegLocation[] = (
        (tripLegRows || []) as Array<{
            id: string;
            name: string;
            city_name?: string | null;
            country_code?: string | null;
            google_place_id?: string | null;
            icon_emoji?: string | null;
            start_date?: string | null;
            end_date?: string | null;
            leg_type?: string | null;
        }>
    )
        .filter((leg) => leg.leg_type !== "accommodation")
        .map((leg) => ({
            id: leg.id,
            source: "manual" as const,
            name: leg.name,
            cityName: leg.city_name || null,
            countryCode: leg.country_code || null,
            googlePlaceId: leg.google_place_id || null,
            iconEmoji: leg.icon_emoji || null,
            startDate: leg.start_date || null,
            endDate: leg.end_date || null,
            canDelete: leg.leg_type === "custom",
            canClearDates: leg.leg_type === "custom",
            memberIds: tripMemberIdsByLegId.get(leg.id) || [],
            memberDatesByMemberId: Object.fromEntries(
                (tripMemberIdsByLegId.get(leg.id) || []).map((memberId) => {
                    const memberDates = tripMemberLegDatesByLegAndMember.get(
                        `${leg.id}:${memberId}`
                    );

                    return [
                        memberId,
                        {
                            startDate: memberDates?.startDate || leg.start_date || null,
                            endDate:
                                memberDates?.endDate ||
                                memberDates?.startDate ||
                                leg.end_date ||
                                leg.start_date ||
                                null,
                        },
                    ];
                })
            ),
        }));

    const destinationLocations: TripLegLocation[] = parseDestinationList(
        tripRecord.destination
    ).map((destination, index) => {
        const flag = getLeadingFlag(destination);
        const countryCode = getCountryCodeFromFlag(flag);
        const cleanDestination = stripLeadingFlag(destination);
        const countryName = getCountryName(countryCode);

        return {
            id: `destination-${index}-${cleanDestination || destination}`,
            source: "destination" as const,
            name: cleanDestination || destination,
            cityName: cleanDestination || destination,
            countryCode,
            countryName,
            iconEmoji: flag || getFlagEmoji(countryCode) || null,
            startDate: null,
            endDate: null,
            memberIds: [],
        };
    });

    const unmatchedManualLocations = manualLocations.filter(
        (manualLocation) =>
            Boolean(manualLocation.googlePlaceId) ||
            !destinationLocations.some((destination) =>
                locationsMatch(destination, manualLocation)
            )
    );

    const mergedDestinationLocations = destinationLocations.map((destination) => {
        const manualMatch = manualLocations.find((location) =>
            !location.googlePlaceId && locationsMatch(destination, location)
        );
        return {
            ...destination,
            persistedLegId: manualMatch?.id || null,
            canClearDates: manualMatch?.canClearDates || false,
            startDate: manualMatch?.startDate || null,
            endDate: manualMatch?.endDate || null,
            memberIds: manualMatch?.memberIds || [],
            memberDatesByMemberId: manualMatch?.memberDatesByMemberId || {},
        };
    });

    const heroLocations = sortTripLegLocations(
        [...mergedDestinationLocations, ...unmatchedManualLocations]
    );
    const visibleHeroLocations = heroLocations.filter((location) => {
        const hasExplicitSavedSelection =
            location.source === "manual" || Boolean(location.persistedLegId);

        if (!hasExplicitSavedSelection || !currentUserTripMemberId) return true;

        return (location.memberIds || []).includes(currentUserTripMemberId);
    });

    const areaMapGroups = new Map<string, AreaMapGroupAccumulator>();
    const areaMapLegKeyById = new Map<string, string>();

    visibleHeroLocations.forEach((location, index) => {
        const cityName = location.cityName || location.name;
        const key =
            getAreaMapKey(
                [
                    cityName,
                    location.countryCode || location.countryName || "",
                ]
                    .filter(Boolean)
                    .join("-")
            ) || `city-${index}`;

        const matchLabels = [
            location.name,
            location.cityName || "",
            location.countryName || "",
            location.countryCode || "",
        ].filter(Boolean);
        const existingGroup = areaMapGroups.get(key);

        if (existingGroup) {
            existingGroup.sortOrder = Math.min(existingGroup.sortOrder, index);
            existingGroup.matchLabels = Array.from(
                new Set([...existingGroup.matchLabels, ...matchLabels])
            );
            existingGroup.countryName =
                existingGroup.countryName || location.countryName || null;
            existingGroup.iconEmoji =
                existingGroup.iconEmoji ||
                location.iconEmoji ||
                getFlagEmoji(location.countryCode) ||
                null;
        } else {
            areaMapGroups.set(key, {
                id: key,
                name: cityName || location.name,
                countryName: location.countryName || null,
                iconEmoji:
                    location.iconEmoji || getFlagEmoji(location.countryCode) || null,
                places: [],
                sortOrder: index,
                matchLabels,
            });
        }

        const group = areaMapGroups.get(key);
        if (group) {
            group.matchLabels = Array.from(
                new Set([
                    ...group.matchLabels,
                    location.id || "",
                    location.persistedLegId || "",
                ].filter(Boolean))
            );
        }

        [
            location.id && location.source === "manual" ? location.id : null,
            location.persistedLegId || null,
        ]
            .filter(Boolean)
            .forEach((legId) => areaMapLegKeyById.set(legId as string, key));
    });

    function ensureAreaMapGroup({
        key,
        name,
        countryName,
        iconEmoji,
        matchLabels,
    }: {
        key: string;
        name: string;
        countryName?: string | null;
        iconEmoji?: string | null;
        matchLabels?: string[];
    }) {
        const normalizedKey = getAreaMapKey(key) || `city-${areaMapGroups.size}`;
        const existing = areaMapGroups.get(normalizedKey);
        if (existing) return existing;

        const group: AreaMapGroupAccumulator = {
            id: normalizedKey,
            name,
            countryName: countryName || null,
            iconEmoji: iconEmoji || null,
            places: [],
            sortOrder: areaMapGroups.size + 100,
            matchLabels: matchLabels || [name],
        };
        areaMapGroups.set(normalizedKey, group);
        return group;
    }

    function addPlaceToAreaMap({
        place,
        tripLegId,
        labels,
        fallbackCityName,
        countryName,
    }: {
        place: AccommodationAreaMapPlace;
        tripLegId?: string | null;
        labels: Array<string | null | undefined>;
        fallbackCityName: string;
        countryName?: string | null;
    }) {
        const matchingKey = findAreaMapGroupKey({
            tripLegId,
            labels,
            legKeyById: areaMapLegKeyById,
            groups: areaMapGroups,
        });
        const group = matchingKey
            ? areaMapGroups.get(matchingKey) ||
              ensureAreaMapGroup({
                  key: matchingKey,
                  name: fallbackCityName,
                  countryName,
                  matchLabels: labels.filter(Boolean) as string[],
              })
            : ensureAreaMapGroup({
                  key: fallbackCityName,
                  name: fallbackCityName,
                  countryName,
                  matchLabels: labels.filter(Boolean) as string[],
              });

        group.places.push(place);
    }

    ((accommodations || []) as TripAccommodation[])
        .filter(
            (accommodation) =>
                accommodation.status !== "cancelled" &&
                hasMappableCoordinatePair(
                    accommodation.latitude,
                    accommodation.longitude
                )
        )
        .forEach((accommodation) => {
            const latitude = getMapCoordinate(accommodation.latitude);
            const longitude = getMapCoordinate(accommodation.longitude);
            if (latitude === null || longitude === null) return;

            const fallbackCityName =
                accommodation.city ||
                accommodation.region ||
                accommodation.country ||
                accommodation.hotel_name;
            const googleMapsUrl =
                accommodation.google_maps_url ||
                buildGoogleMapsUrl(latitude, longitude, accommodation.google_place_id);

            addPlaceToAreaMap({
                tripLegId: accommodation.trip_leg_id || null,
                labels: [
                    accommodation.city,
                    accommodation.region,
                    accommodation.country,
                    accommodation.address,
                    accommodation.hotel_name,
                ],
                fallbackCityName,
                countryName: accommodation.country || null,
                place: {
                    id: `accommodation-${accommodation.id}`,
                    recordId: accommodation.id,
                    type: "accommodation",
                    title: accommodation.hotel_name,
                    subtitle: accommodation.is_planning_option
                        ? "Stay option"
                        : "Trip stay",
                    address: accommodation.address || null,
                    latitude,
                    longitude,
                    dateLabel: [
                        formatShortDate(accommodation.check_in_date),
                        formatShortDate(accommodation.check_out_date),
                    ]
                        .filter(Boolean)
                        .join(" - "),
                    statusLabel: accommodation.status,
                    checkInDate: accommodation.check_in_date,
                    checkOutDate: accommodation.check_out_date,
                    cost: accommodation.cost,
                    currency: accommodation.currency,
                    bookingUrl: accommodation.booking_url,
                    isPlanningOption: accommodation.is_planning_option,
                    accommodation,
                    googleMapsUrl,
                },
            });
        });

    ((scheduledMapItems || []) as Array<{
        id: string;
        title?: string | null;
        category?: string | null;
        status?: string | null;
        item_date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        location?: string | null;
        formatted_address?: string | null;
        google_place_id?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
        trip_leg_id?: string | null;
    }>)
        .filter((item) =>
            hasMappableCoordinatePair(item.location_lat, item.location_lng)
        )
        .forEach((item) => {
            const latitude = getMapCoordinate(item.location_lat);
            const longitude = getMapCoordinate(item.location_lng);
            if (latitude === null || longitude === null) return;

            const fallbackCityName =
                item.location?.split(",").at(-2)?.trim() ||
                item.location?.split(",").at(0)?.trim() ||
                item.title ||
                "Scheduled item";
            const timeRange = formatTimeRange(item.start_time, item.end_time);

            addPlaceToAreaMap({
                tripLegId: item.trip_leg_id || null,
                labels: [item.location, item.formatted_address, item.title],
                fallbackCityName,
                place: {
                    id: `scheduled-${item.id}`,
                    type: "scheduled",
                    title: item.title || "Scheduled activity",
                    subtitle: item.category || "Activity",
                    address: item.formatted_address || item.location || null,
                    latitude,
                    longitude,
                    dateLabel: [formatShortDate(item.item_date), timeRange]
                        .filter(Boolean)
                        .join(" · "),
                    statusLabel: item.status || null,
                    googleMapsUrl: buildGoogleMapsUrl(
                        latitude,
                        longitude,
                        item.google_place_id
                    ),
                },
            });
        });

    ((ideaMapItems || []) as Array<{
        id: string;
        title?: string | null;
        category?: string | null;
        location?: string | null;
        formatted_address?: string | null;
        google_place_id?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
        location_city?: string | null;
        location_region?: string | null;
        location_country?: string | null;
        trip_leg_id?: string | null;
    }>)
        .filter((idea) =>
            hasMappableCoordinatePair(idea.location_lat, idea.location_lng)
        )
        .forEach((idea) => {
            const latitude = getMapCoordinate(idea.location_lat);
            const longitude = getMapCoordinate(idea.location_lng);
            if (latitude === null || longitude === null) return;

            const fallbackCityName =
                idea.location_city ||
                idea.location_region ||
                idea.location_country ||
                idea.location?.split(",").at(-2)?.trim() ||
                idea.title ||
                "Trip idea";

            addPlaceToAreaMap({
                tripLegId: idea.trip_leg_id || null,
                labels: [
                    idea.location_city,
                    idea.location_region,
                    idea.location_country,
                    idea.location,
                    idea.formatted_address,
                    idea.title,
                ],
                fallbackCityName,
                countryName: idea.location_country || null,
                place: {
                    id: `idea-${idea.id}`,
                    type: "idea",
                    title: idea.title || "Trip idea",
                    subtitle: idea.category || "Idea",
                    address: idea.formatted_address || idea.location || null,
                    latitude,
                    longitude,
                    googleMapsUrl: buildGoogleMapsUrl(
                        latitude,
                        longitude,
                        idea.google_place_id
                    ),
                },
            });
        });

    const accommodationAreaMapCities = Array.from(areaMapGroups.values())
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map(
            (group) =>
                ({
                    id: group.id,
                    name: group.name,
                    countryName: group.countryName,
                    iconEmoji: group.iconEmoji,
                    places: [...group.places].sort((a, b) => {
                        const typeSort =
                            (a.type === "accommodation"
                                ? 0
                                : a.type === "scheduled"
                                  ? 1
                                  : 2) -
                            (b.type === "accommodation"
                                ? 0
                                : b.type === "scheduled"
                                  ? 1
                                  : 2);
                        if (typeSort !== 0) return typeSort;
                        return a.title.localeCompare(b.title);
                    }),
                }) satisfies AccommodationAreaMapCity
        );

    const tripLegMemberOptions: TripLegMemberOption[] = memberRows
        .filter((member) => Boolean(member.id))
        .map((member) => {
            const profile = member.user_id
                ? tripMembers.find((tripMember) => tripMember.user_id === member.user_id)
                : null;
            const displayName = [
                profile?.first_name || "",
                profile?.last_name || "",
            ]
                .join(" ")
                .trim();

            return {
                id: member.id as string,
                displayName: displayName || profile?.username || "Trip mate",
                username: profile?.username || null,
                avatarUrl: profile?.avatar_url || null,
            };
        });
    const tripHeaderMemberLegs: TripHeaderMemberLeg[] = heroLocations.flatMap(
        (location) =>
            (location.memberIds || []).map((memberId) => ({
                memberId,
                name: location.name,
                cityName: location.cityName || null,
                countryCode: location.countryCode || null,
                iconEmoji: location.iconEmoji || getFlagEmoji(location.countryCode) || null,
                startDate: location.startDate || null,
                endDate: location.endDate || null,
            }))
    );

    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
            <TripDocumentTitle
                title={tripRecord.title}
                destination={tripRecord.destination}
                startDate={tripRecord.start_date}
            />

            <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
                <TripHeaderCover
                    trip={trip as Parameters<typeof TripHeaderCover>[0]["trip"]}
                    updateTripAction={updateTrip}
                    deleteTripAction={deleteTrip}
                >
                    <div className="space-y-3">
                        <p className="text-sm font-black uppercase tracking-[0.3em] text-lime-200 drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] sm:text-base">
                            {tripRecord.title || "Untitled trip"}
                        </p>
                        <h1 className="vaivia-trip-hero-title max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
                            Stays
                        </h1>
                    </div>
                </TripHeaderCover>

                <div className="mx-auto max-w-7xl p-5 sm:p-7">
                    <div className="hidden sm:block">
                        <TripLegLocationLine
                            tripId={tripRecord.id}
                            revalidatePathname={getTripHref(
                                tripRecord,
                                "/accommodations"
                            )}
                            locations={visibleHeroLocations}
                            memberOptions={tripLegMemberOptions}
                            upsertLegAction={upsertTripLeg}
                            deleteLegAction={deleteTripLeg}
                        >
                            <TripMembersPanel
                                tripId={tripRecord.id}
                                tripTitle={tripRecord.title}
                                members={tripMembers}
                                familyMembers={tripFamilyMembers}
                                availableFamilyMembers={savedFamilyMembers}
                                invitations={pendingInvitations}
                                memberLegs={tripHeaderMemberLegs}
                                currentUserId={user.id}
                                tripOwnerId={tripRecord.user_id}
                                removeMemberAction={removeTripMember}
                                addFamilyMemberAction={addTripFamilyMember}
                                removeFamilyMemberAction={removeTripFamilyMember}
                            />
                        </TripLegLocationLine>
                    </div>

                    <div className="mt-6 hidden gap-4 sm:grid lg:grid-cols-[1fr_1fr_minmax(280px,0.9fr)] lg:items-stretch">
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                Departing:
                            </p>
                            <p className="mt-2 text-2xl font-black tracking-tight text-white">
                                {formatTripDate(tripRecord.start_date)}
                            </p>
                        </div>
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                Returning:
                            </p>
                            <p className="mt-2 text-2xl font-black tracking-tight text-white">
                                {formatTripDate(tripRecord.end_date)}
                            </p>
                        </div>
                        <div className="relative overflow-hidden rounded-[1.35rem] border border-lime-300/30 bg-lime-300 p-5 text-slate-950 shadow-[0_0_50px_rgba(var(--vaivia-neon-rgb),0.24)]">
                            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/35 blur-2xl" />
                            <div className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-fuchsia-400/20 blur-2xl" />
                            <TripCountdown startDate={tripRecord.start_date} />
                        </div>
                    </div>

                    {tripRecord.notes ? (
                        <p className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-sm font-medium leading-6 text-slate-300">
                            {tripRecord.notes}
                        </p>
                    ) : null}
                </div>
            </header>

            <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
                {error ? (
                    <div className="rounded-[1.5rem] border border-red-300/30 bg-red-950/70 p-5 text-sm font-semibold text-red-50">
                        Could not load stays right now.
                    </div>
                ) : null}

                <AccommodationPageTabs
                    activeTab={activeAccommodationTab}
                    baseHref={accommodationsHref}
                />

                {activeAccommodationTab === "stays" ? (
                    <>
                        <AccommodationCoverageTimeline
                            tripStartDate={tripRecord.start_date}
                            tripEndDate={tripRecord.end_date}
                            travelers={accommodationCoverageTravelers}
                            legs={manualLocations.map(
                                (location): AccommodationCoverageLeg => ({
                                    id: location.id,
                                    startDate: location.startDate || null,
                                    endDate: location.endDate || null,
                                    memberIds: location.memberIds || [],
                                    memberDatesByMemberId:
                                        location.memberDatesByMemberId || {},
                                })
                            )}
                            accommodations={
                                ((accommodations || []) as TripAccommodation[]).filter(
                                    (accommodation) =>
                                        !accommodation.is_planning_option
                                )
                            }
                            participants={
                                (accommodationParticipantRows || []) as AccommodationCoverageParticipant[]
                            }
                        />

                        <AccommodationManager
                            tripId={tripId}
                            accommodations={
                                ((accommodations || []) as TripAccommodation[]).filter(
                                    (accommodation) =>
                                        !accommodation.is_planning_option
                                )
                            }
                            createAction={createAccommodation}
                            updateAction={updateAccommodation}
                            deleteAction={deleteAccommodation}
                            moveItemAction={moveTripItem}
                            moveTargetTrips={moveTargetTrips}
                            audienceOptions={audienceOptions}
                            audienceParticipants={
                                (accommodationParticipantRows || []) as AccommodationCoverageParticipant[]
                            }
                            currentUserTripMemberId={currentUserTripMemberId}
                        />
                    </>
                ) : (
                    <AccommodationAreaMaps
                        cities={accommodationAreaMapCities}
                        tripId={tripId}
                        createAction={createAccommodation}
                        updateAction={updateAccommodation}
                        promoteAction={promoteAccommodationOption}
                        audienceOptions={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                    />
                )}
            </div>
        </main>
    );
}
