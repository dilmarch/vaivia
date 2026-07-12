import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAccommodation } from "@/app/actions/accommodations";
import { moveTripItem } from "@/app/actions/moveTripItem";
import { deleteTripLeg, upsertTripLeg } from "@/app/actions/tripLegs";
import AccommodationManager from "@/components/accommodations/AccommodationManager";
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
import {
    buildAccommodationPayload,
    getAccommodationErrorMessage,
    validateAccommodationPayload,
    type TripAccommodation,
} from "@/lib/accommodations";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import { createClient } from "@/lib/supabase/server";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { getMoveTargetTrips } from "@/lib/tripMove";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";
import { resolveTripLegIdForLocation } from "@/lib/tripLegs";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
};

type TripUpdatePayload = {
    title: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    cover_image_url?: string | null;
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

function getPendingInvitationLabel(invitation: Record<string, unknown>) {
    const labelCandidates = [
        invitation.invitee_identifier,
        invitation.invitee_email,
        invitation.invitee_username,
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

function removeTripCoverColumn(payload: TripUpdatePayload) {
    const { cover_image_url: _coverImageUrl, ...fallbackPayload } = payload;
    void _coverImageUrl;
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
    const coverImageUrl = String(formData.get("cover_image_url") || "").trim();
    const payload: TripUpdatePayload = {
        title: String(formData.get("title") || ""),
        destination: String(formData.get("destination") || ""),
        start_date: String(formData.get("start_date") || "") || null,
        end_date: String(formData.get("end_date") || "") || null,
        cover_image_url: coverImageUrl || null,
        notes: String(formData.get("notes") || ""),
    };

    let { error } = await supabase.from("trips").update(payload).eq("id", tripId);

    if (error && isMissingTripCoverColumnError(error)) {
        ({ error } = await supabase
            .from("trips")
            .update(removeTripCoverColumn(payload))
            .eq("id", tripId));
    }

    if (error) {
        console.error("Error updating trip from accommodations page:", error);
        throw new Error("Could not update trip");
    }

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

    await supabase.from("trip_accommodations").delete().eq("trip_id", tripId);
    await supabase.from("itinerary_items").delete().eq("trip_id", tripId);
    await supabase.from("transportation_items").delete().eq("trip_id", tripId);
    await supabase.from("trip_ideas").delete().eq("trip_id", tripId);

    const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip from accommodations page:", error);
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
    payload.trip_leg_id = await resolveTripLegIdForLocation({
        supabase,
        tripId,
        explicitTripLegId: payload.trip_leg_id,
        city: payload.city,
        region: payload.region,
        country: payload.country,
        itemDate: payload.check_in_date,
    });
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

    const participantsError = await replaceTripItemParticipantsFromForm({
        tripId,
        itemType: "accommodation",
        itemId: accommodationId,
        formData,
    });

    if (participantsError) {
        console.error("Error updating accommodation participants:", {
            message: participantsError.message,
            code: participantsError.code,
            details: participantsError.details,
            hint: participantsError.hint,
            tripId,
            accommodationId,
        });
        throw new Error(
            `Could not update accommodation participants: ${
                participantsError.message ?? "Unknown Supabase error"
            }`
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
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const { trips: movableTrips } = await loadActiveMemberTrips(supabase, user.id);
    const moveTargetTrips = getMoveTargetTrips({
        trips: movableTrips,
        currentTripId: tripId,
    });

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
                user_id: memberUserId,
                first_name: profile?.first_name || null,
                last_name: profile?.last_name || null,
                username: profile?.username || null,
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
    }));
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
        console.error("Error loading accommodations:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            userId: user.id,
        });
    }

    const { data: tripLegRows, error: tripLegsError } = await supabase
        .from("trip_legs")
        .select(
            "id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order"
        )
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });

    if (tripLegsError) {
        console.warn("Could not load trip legs for accommodations hero:", {
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
            console.warn("Could not load trip leg members for accommodations hero:", {
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

    const accommodationLocations: TripLegLocation[] = (
        (accommodations || []) as Array<{
            id: string;
            hotel_name?: string | null;
            city?: string | null;
            region?: string | null;
            country?: string | null;
            check_in_date?: string | null;
            check_out_date?: string | null;
            status?: string | null;
        }>
    )
        .filter((accommodation) => accommodation.status !== "cancelled")
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
        });

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
                displayName: displayName || profile?.username || "Trip mate",
                username: profile?.username || null,
                avatarUrl: profile?.avatar_url || null,
            };
        });

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
                    <h1 className="vaivia-trip-hero-title max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
                        {tripRecord.title || "Untitled trip"}
                    </h1>
                </TripHeaderCover>

                <div className="mx-auto max-w-7xl p-5 sm:p-7">
                    <div className="hidden sm:block">
                        <TripLegLocationLine
                            tripId={tripRecord.id}
                            revalidatePathname={`/trips/${tripRecord.id}/accommodations`}
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
                        Could not load accommodations right now.
                    </div>
                ) : null}

                <AccommodationManager
                    tripId={tripId}
                    accommodations={(accommodations || []) as TripAccommodation[]}
                    createAction={createAccommodation}
                    updateAction={updateAccommodation}
                    deleteAction={deleteAccommodation}
                    moveItemAction={moveTripItem}
                    moveTargetTrips={moveTargetTrips}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                />
            </div>
        </main>
    );
}
