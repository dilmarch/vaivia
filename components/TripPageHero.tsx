import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
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
    type TripHeaderMember,
} from "@/components/TripMembersPanel";
import { createClient } from "@/lib/supabase/server";
import {
    buildTripCoverPayloadFromForm,
    cleanupReplacedTripCover,
    deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import {
    addValidatedTripSlugToPayload,
    getTripSlugErrorMessage,
    isTripSlugConflictError,
} from "@/lib/tripSlugUpdate";

type TripPageHeroProps = {
    tripId: string;
    pageLabel?: string;
    revalidatePathname?: string;
    summaryContent?: ReactNode;
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

    return directLabel?.trim() || "Invited guest";
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

    if (baseCountryCode && candidateCountryCode && baseCountryCode === candidateCountryCode) {
        return true;
    }

    const baseNames = [base.name, base.cityName, base.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);
    const candidateNames = [candidate.name, candidate.cityName, candidate.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);

    return baseNames.some((baseName) =>
        candidateNames.some(
            (candidateName) =>
                candidateName === baseName ||
                candidateName.includes(baseName) ||
                baseName.includes(candidateName)
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
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const title = String(formData.get("title") || "");
    const slug = String(formData.get("slug") || "");
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
        start_date: String(formData.get("start_date") || "") || null,
        end_date: String(formData.get("end_date") || "") || null,
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
        console.error("Error updating trip from shared trip hero:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        if (isTripSlugConflictError(error)) {
            throw new Error(getTripSlugErrorMessage(error));
        }
        throw new Error("Could not update trip");
    }

    await cleanupReplacedTripCover({
        supabase,
        userId: user.id,
        oldCover: existingTripCover,
        nextPayload: coverPayload,
    });

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
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
        .delete()
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip from shared trip hero:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        throw new Error("Could not delete trip");
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
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    if (!tripId || !memberUserId || memberUserId === user.id) {
        throw new Error("Could not remove trip member");
    }

    const { error } = await supabase
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", memberUserId);

    if (error) {
        console.error("Error removing trip member:", error);
        throw new Error("Could not remove trip member");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function addTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const revalidatePathname = String(formData.get("revalidate_path") || "");
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

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
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
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    const { error } = await supabase
        .from("trip_family_members")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("trip_id", tripId)
        .eq("family_member_id", familyMemberId);

    if (error) {
        console.error("Error removing family member from trip:", error);
        throw new Error("Could not remove family member from trip");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function upsertTripLeg(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const tripLegId = String(formData.get("trip_leg_id") || "").trim();
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const now = new Date().toISOString();
    const name = String(formData.get("name") || "").trim();
    const cityName = String(formData.get("city_name") || "").trim();
    const countryCode = String(formData.get("country_code") || "")
        .trim()
        .toUpperCase();
    const iconEmoji = String(formData.get("icon_emoji") || "").trim();
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();
    const tripMemberIds = Array.from(
        new Set(
            formData
                .getAll("trip_member_ids")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (!tripId || !name) {
        throw new Error("Could not save trip leg");
    }

    const payload = {
        trip_id: tripId,
        name,
        city_name: cityName || null,
        country_code: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
        icon_emoji: iconEmoji || null,
        start_date: startDate || null,
        end_date: endDate || null,
        leg_type: "custom",
        created_by: user.id,
        updated_at: now,
    };

    const { data: savedLeg, error } = tripLegId
        ? await supabase
              .from("trip_legs")
              .update(payload)
              .eq("id", tripLegId)
              .eq("trip_id", tripId)
              .select("id")
              .single()
        : await supabase
              .from("trip_legs")
              .insert(payload)
              .select("id")
              .single();

    if (error || !savedLeg?.id) {
        console.error("Error saving trip leg:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            payload,
        });
        throw new Error(
            `Could not save trip leg: ${error?.message ?? "Unknown Supabase error"}`
        );
    }

    const { error: deleteMembersError } = await supabase
        .from("trip_member_legs")
        .delete()
        .eq("trip_id", tripId)
        .eq("trip_leg_id", savedLeg.id);

    if (deleteMembersError) {
        console.error("Error clearing trip leg members:", deleteMembersError);
        throw new Error("Could not update trip leg members");
    }

    if (tripMemberIds.length > 0) {
        const { error: insertMembersError } = await supabase
            .from("trip_member_legs")
            .insert(
                tripMemberIds.map((tripMemberId) => ({
                    trip_id: tripId,
                    trip_leg_id: savedLeg.id,
                    trip_member_id: tripMemberId,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    is_joining: true,
                    updated_at: now,
                }))
            );

        if (insertMembersError) {
            console.error("Error saving trip leg members:", {
                message: insertMembersError.message,
                code: insertMembersError.code,
                details: insertMembersError.details,
                hint: insertMembersError.hint,
                tripId,
                tripLegId: savedLeg.id,
                tripMemberIds,
            });
            throw new Error("Could not update trip leg members");
        }
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function deleteTripLeg(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const tripLegId = String(formData.get("trip_leg_id") || "").trim();
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    if (!tripId || !tripLegId) {
        throw new Error("Could not delete trip leg");
    }

    const { error } = await supabase
        .from("trip_legs")
        .delete()
        .eq("id", tripLegId)
        .eq("trip_id", tripId)
        .eq("leg_type", "custom");

    if (error) {
        console.error("Error deleting trip leg:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            tripLegId,
        });
        throw new Error("Could not delete trip leg");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

export default async function TripPageHero({
    tripId,
    pageLabel,
    revalidatePathname,
    summaryContent,
}: TripPageHeroProps) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) notFound();

    const tripRecord = trip as {
        id: string;
        title: string;
        destination?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        notes?: string | null;
        user_id?: string | null;
        created_at?: string | null;
    };

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
            .from("user_profiles")
            .select("id,first_name,last_name,username,email,avatar_url")
            .in("id", tripMemberUserIds);

        const profilesById = new Map(
            ((profileRows || []) as Array<{
                id: string;
                first_name?: string | null;
                last_name?: string | null;
                username?: string | null;
                email?: string | null;
                avatar_url?: string | null;
            }>).map((profile) => [profile.id, profile])
        );

        tripMembers = tripMemberUserIds.map((memberUserId) => {
            const profile = profilesById.get(memberUserId);
            const membership = memberRowsByUserId.get(memberUserId);

            return {
                user_id: memberUserId,
                first_name: profile?.first_name || null,
                last_name: profile?.last_name || null,
                username: profile?.username || null,
                email: profile?.email || null,
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

    const { data: tripLegRows, error: tripLegsError } = await supabase
        .from("trip_legs")
        .select(
            "id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order"
        )
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });

    if (tripLegsError) {
        console.warn("Could not load trip legs for hero:", {
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
    }> = [];

    if (manualTripLegIds.length > 0) {
        const { data: memberLegRows, error: memberLegRowsError } = await supabase
            .from("trip_member_legs")
            .select("trip_leg_id,trip_member_id,is_joining")
            .eq("trip_id", tripId)
            .in("trip_leg_id", manualTripLegIds);

        if (memberLegRowsError) {
            console.warn("Could not load trip leg members for hero:", {
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

    const { data: accommodationLocationRows, error: accommodationLocationError } =
        await supabase
            .from("trip_accommodations")
            .select("id,hotel_name,city,region,country,check_in_date,check_out_date")
            .eq("trip_id", tripId)
            .neq("status", "cancelled")
            .order("check_in_date", { ascending: true });

    if (accommodationLocationError) {
        console.warn("Could not load accommodation locations for hero:", {
            message: accommodationLocationError.message,
            code: accommodationLocationError.code,
            details: accommodationLocationError.details,
            hint: accommodationLocationError.hint,
            tripId,
        });
    }

    const accommodationLocations: TripLegLocation[] = (
        (accommodationLocationRows || []) as Array<{
            id: string;
            hotel_name?: string | null;
            city?: string | null;
            region?: string | null;
            country?: string | null;
            check_in_date?: string | null;
            check_out_date?: string | null;
        }>
    )
        .map((accommodation) => {
            const name =
                accommodation.city ||
                accommodation.region ||
                accommodation.country ||
                accommodation.hotel_name ||
                "Accommodation";

            return {
                id: accommodation.id,
                source: "accommodation" as const,
                name,
                cityName: accommodation.city || accommodation.region || name,
                countryName: accommodation.country || null,
                startDate: accommodation.check_in_date || null,
                endDate: accommodation.check_out_date || null,
            };
        })
        .filter((location) => location.name.trim().length > 0);

    const manualLocations: TripLegLocation[] = (
        (tripLegRows || []) as Array<{
            id: string;
            name: string;
            city_name?: string | null;
            country_code?: string | null;
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
            iconEmoji: leg.icon_emoji || null,
            startDate: leg.start_date || null,
            endDate: leg.end_date || null,
            memberIds: tripMemberIdsByLegId.get(leg.id) || [],
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

    const heroLocations =
        destinationLocations.length > 0
            ? destinationLocations.map((destination) => {
                  const manualMatch = manualLocations.find((location) =>
                      locationsMatch(destination, location)
                  );
                  const accommodationMatch = accommodationLocations.find((location) =>
                      locationsMatch(destination, location)
                  );

                  return {
                      ...destination,
                      persistedLegId: manualMatch?.id || null,
                      startDate:
                          accommodationMatch?.startDate ||
                          manualMatch?.startDate ||
                          null,
                      endDate:
                          accommodationMatch?.endDate ||
                          manualMatch?.endDate ||
                          null,
                      memberIds: manualMatch?.memberIds || [],
                  };
              })
            : [...accommodationLocations, ...manualLocations];
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
                displayName:
                    displayName || profile?.username || member.role || "Trip mate",
                username: profile?.username || null,
                avatarUrl: profile?.avatar_url || null,
            };
        });

    return (
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
            <TripDocumentTitle
                title={tripRecord.title}
                destination={tripRecord.destination}
                startDate={tripRecord.start_date}
            />
            <TripHeaderCover
                trip={trip as Parameters<typeof TripHeaderCover>[0]["trip"]}
                updateTripAction={updateTrip}
                deleteTripAction={deleteTrip}
            >
                <div className="space-y-3">
                    {pageLabel ? (
                        <p className="w-fit rounded-full border border-lime-300/30 bg-lime-300 px-5 py-2 text-sm font-black uppercase tracking-[0.32em] text-slate-950 shadow-[0_0_32px_rgba(var(--vaivia-neon-rgb),0.28)]">
                            {pageLabel}
                        </p>
                    ) : null}
                    <h1 className="vaivia-trip-hero-title max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
                        {tripRecord.title || "Untitled trip"}
                    </h1>
                </div>
            </TripHeaderCover>

            <div className="mx-auto max-w-7xl p-5 sm:p-7">
                <div className="hidden sm:block">
                    {summaryContent ? (
                        <div className="flex flex-wrap items-center gap-4">
                            {summaryContent}
                            <span className="hidden h-14 w-px bg-white/10 lg:block" />
                            <TripMembersPanel
                                tripId={tripRecord.id}
                                tripTitle={tripRecord.title}
                                members={tripMembers}
                                familyMembers={tripFamilyMembers}
                                availableFamilyMembers={savedFamilyMembers}
                                invitations={pendingInvitations}
                                currentUserId={user.id}
                                tripOwnerId={tripRecord.user_id}
                                removeMemberAction={removeTripMember}
                                addFamilyMemberAction={addTripFamilyMember}
                                removeFamilyMemberAction={removeTripFamilyMember}
                            />
                        </div>
                    ) : (
                        <TripLegLocationLine
                            tripId={tripRecord.id}
                            revalidatePathname={revalidatePathname}
                            locations={heroLocations}
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
                                currentUserId={user.id}
                                tripOwnerId={tripRecord.user_id}
                                removeMemberAction={removeTripMember}
                                addFamilyMemberAction={addTripFamilyMember}
                                removeFamilyMemberAction={removeTripFamilyMember}
                            />
                        </TripLegLocationLine>
                    )}
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
    );
}
