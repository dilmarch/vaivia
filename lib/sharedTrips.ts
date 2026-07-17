import type { SupabaseClient } from "@supabase/supabase-js";

export type SharedTripMemberProfile = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
};

export type SharedTrip = {
    id: string;
    slug?: string | null;
    user_id?: string | null;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    notes?: string | null;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
    trip_cover_image_url?: string | null;
    countdown_target_type?: string | null;
    countdown_target_id?: string | null;
    countdown_target_itinerary_item_id?: string | null;
    archived_at?: string | null;
    archived_reason?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    membershipRole?: string | null;
    membershipStatus?: string | null;
    membershipId?: string | null;
    viewerTripMemberId?: string | null;
    viewerAssignedLegCount?: number;
    viewerStartDate?: string | null;
    viewerEndDate?: string | null;
    memberProfiles?: SharedTripMemberProfile[];
};

function normalizeJoinedTrip(row: Record<string, unknown>) {
    const rawTrip = row.trips;
    const trip = Array.isArray(rawTrip) ? rawTrip[0] : rawTrip;

    if (!trip || typeof trip !== "object") return null;

    return {
        ...(trip as Record<string, unknown>),
        membershipId: typeof row.id === "string" ? row.id : null,
        membershipRole: typeof row.role === "string" ? row.role : null,
        membershipStatus: typeof row.status === "string" ? row.status : null,
    } as SharedTrip;
}

function compareDateKey(a?: string | null, b?: string | null) {
    if (!a) return b ? 1 : 0;
    if (!b) return -1;
    return a.localeCompare(b);
}

type MemberTripsArchiveMode = "active" | "archived";

async function loadMemberTrips(
    supabase: SupabaseClient,
    userId: string,
    archiveMode: MemberTripsArchiveMode
) {
    let memberTripsQuery = supabase
        .from("trip_members")
        .select(
            `
            id,
            role,
            status,
            trips (
                id,
                slug,
                user_id,
                title,
                destination,
                start_date,
                end_date,
                notes,
                cover_image_url,
                cover_image_source,
                cover_image_storage_path,
                cover_image_unsplash_id,
                cover_image_photographer_name,
                cover_image_photographer_url,
                countdown_target_type,
                countdown_target_id,
                countdown_target_itinerary_item_id,
                archived_at,
                archived_reason,
                created_at,
                updated_at
            )
        `
        )
        .eq("user_id", userId)
        .eq("status", "active");

    memberTripsQuery =
        archiveMode === "archived"
            ? memberTripsQuery.not("trips.archived_at", "is", null)
            : memberTripsQuery.is("trips.archived_at", null);

    const { data, error } = await memberTripsQuery;

    const memberTrips = ((data || []) as Record<string, unknown>[])
        .map(normalizeJoinedTrip)
        .filter((trip): trip is SharedTrip => Boolean(trip));

    let ownerTripsQuery = supabase
        .from("trips")
        .select("*")
        .eq("user_id", userId);

    ownerTripsQuery =
        archiveMode === "archived"
            ? ownerTripsQuery.not("archived_at", "is", null)
            : ownerTripsQuery.is("archived_at", null);

    const { data: ownerTripRows, error: ownerTripsError } = await ownerTripsQuery;

    const ownerTrips = ((ownerTripRows || []) as SharedTrip[]).map((trip) => ({
        ...trip,
        membershipRole: trip.membershipRole || "owner",
        membershipStatus: trip.membershipStatus || "active",
    }));

    const tripsById = new Map<string, SharedTrip>();
    [...memberTrips, ...ownerTrips].forEach((trip) => {
        if (!trip.id) return;
        const existing = tripsById.get(trip.id);
        tripsById.set(trip.id, {
            ...existing,
            ...trip,
            membershipId: existing?.membershipId || trip.membershipId || null,
            membershipRole:
                trip.membershipRole || existing?.membershipRole || null,
            membershipStatus:
                trip.membershipStatus || existing?.membershipStatus || null,
        });
    });

    const trips = Array.from(tripsById.values())
        .sort((a, b) =>
            String(a.start_date || "9999-12-31").localeCompare(
                String(b.start_date || "9999-12-31")
            )
        );

    const tripIds = trips.map((trip) => trip.id).filter(Boolean);

    if (tripIds.length > 0) {
        const { data: memberRows, error: membersError } = await supabase
            .from("trip_members")
            .select("id,trip_id,user_id,status")
            .in("trip_id", tripIds)
            .eq("status", "active");

        if (!membersError) {
            const currentMemberRows = ((memberRows || []) as Array<{
                id?: string | null;
                trip_id?: string | null;
                user_id?: string | null;
            }>).filter((member) => member.user_id === userId);
            const currentMemberIdsByTripId = new Map(
                currentMemberRows
                    .filter((member) => member.id && member.trip_id)
                    .map((member) => [member.trip_id as string, member.id as string])
            );

            trips.forEach((trip) => {
                if (!trip.id) return;
                const viewerTripMemberId =
                    currentMemberIdsByTripId.get(trip.id) ||
                    trip.membershipId ||
                    null;

                trip.viewerTripMemberId = viewerTripMemberId;
            });

            const currentMemberIds = Array.from(
                new Set(
                    trips
                        .map((trip) => trip.viewerTripMemberId)
                        .filter((id): id is string => Boolean(id))
                )
            );

            if (currentMemberIds.length > 0) {
                const { data: viewerLegRows, error: viewerLegsError } =
                    await supabase
                        .from("trip_member_legs")
                        .select("trip_id,trip_member_id,is_joining,start_date,end_date")
                        .in("trip_member_id", currentMemberIds)
                        .eq("is_joining", true);

                if (!viewerLegsError) {
                    const rangesByTripId = new Map<
                        string,
                        {
                            count: number;
                            startDate: string | null;
                            endDate: string | null;
                        }
                    >();

                    ((viewerLegRows || []) as Array<{
                        trip_id?: string | null;
                        start_date?: string | null;
                        end_date?: string | null;
                    }>).forEach((leg) => {
                        if (!leg.trip_id) return;
                        const current =
                            rangesByTripId.get(leg.trip_id) || {
                                count: 0,
                                startDate: null,
                                endDate: null,
                            };
                        const legStart = leg.start_date || null;
                        const legEnd = leg.end_date || leg.start_date || null;

                        rangesByTripId.set(leg.trip_id, {
                            count: current.count + 1,
                            startDate:
                                legStart && compareDateKey(legStart, current.startDate) < 0
                                    ? legStart
                                    : current.startDate || legStart,
                            endDate:
                                legEnd && compareDateKey(legEnd, current.endDate) > 0
                                    ? legEnd
                                    : current.endDate || legEnd,
                        });
                    });

                    trips.forEach((trip) => {
                        if (!trip.id) return;
                        const range = rangesByTripId.get(trip.id);
                        trip.viewerAssignedLegCount = range?.count || 0;
                        trip.viewerStartDate = range?.startDate || null;
                        trip.viewerEndDate = range?.endDate || null;
                    });
                }
            }

            const memberUserIdsByTripId = new Map<string, Set<string>>();

            trips.forEach((trip) => {
                if (!trip.id) return;
                memberUserIdsByTripId.set(
                    trip.id,
                    new Set(
                        [trip.user_id]
                            .filter(
                                (memberUserId): memberUserId is string =>
                                    Boolean(memberUserId) && memberUserId !== userId
                            )
                    )
                );
            });

            ((memberRows || []) as Array<{
                trip_id?: string | null;
                user_id?: string | null;
            }>).forEach((member) => {
                if (!member.trip_id || !member.user_id) return;
                if (member.user_id === userId) return;

                const userIds =
                    memberUserIdsByTripId.get(member.trip_id) || new Set<string>();
                userIds.add(member.user_id);
                memberUserIdsByTripId.set(member.trip_id, userIds);
            });

            const profileUserIds = Array.from(
                new Set(
                    Array.from(memberUserIdsByTripId.values()).flatMap((userIds) =>
                        Array.from(userIds)
                    )
                )
            );

            if (profileUserIds.length > 0) {
                const { data: profileRows, error: profilesError } = await supabase
                    .from("connected_public_user_profiles")
                    .select("id,first_name,last_name,username,avatar_url")
                    .in("id", profileUserIds);

                if (!profilesError) {
                    const profilesById = new Map(
                        ((profileRows || []) as SharedTripMemberProfile[]).map(
                            (profile) => [profile.id, profile]
                        )
                    );

                    trips.forEach((trip) => {
                        const userIds = trip.id
                            ? memberUserIdsByTripId.get(trip.id)
                            : undefined;
                        trip.memberProfiles = Array.from(userIds || [])
                            .map((memberUserId) => profilesById.get(memberUserId))
                            .filter(
                                (profile): profile is SharedTripMemberProfile =>
                                    Boolean(profile)
                            );
                    });
                }
            }
        }
    }

    trips.sort((a, b) =>
        String(a.viewerStartDate || a.start_date || "9999-12-31").localeCompare(
            String(b.viewerStartDate || b.start_date || "9999-12-31")
        )
    );

    return { trips, error: error || ownerTripsError || null };
}

export async function loadActiveMemberTrips(
    supabase: SupabaseClient,
    userId: string
) {
    return loadMemberTrips(supabase, userId, "active");
}

export async function loadArchivedMemberTrips(
    supabase: SupabaseClient,
    userId: string
) {
    return loadMemberTrips(supabase, userId, "archived");
}
