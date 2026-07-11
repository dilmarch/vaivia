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
    user_id?: string | null;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    notes?: string | null;
    cover_image_url?: string | null;
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
    memberProfiles?: SharedTripMemberProfile[];
};

function normalizeJoinedTrip(row: Record<string, unknown>) {
    const rawTrip = row.trips;
    const trip = Array.isArray(rawTrip) ? rawTrip[0] : rawTrip;

    if (!trip || typeof trip !== "object") return null;

    return {
        ...(trip as Record<string, unknown>),
        membershipRole: typeof row.role === "string" ? row.role : null,
        membershipStatus: typeof row.status === "string" ? row.status : null,
    } as SharedTrip;
}

export async function loadActiveMemberTrips(
    supabase: SupabaseClient,
    userId: string
) {
    const { data, error } = await supabase
        .from("trip_members")
        .select(
            `
            role,
            status,
            trips (
                id,
                user_id,
                title,
                destination,
                start_date,
                end_date,
                notes,
                cover_image_url,
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
        .eq("status", "active")
        .is("trips.archived_at", null);

    const memberTrips = ((data || []) as Record<string, unknown>[])
        .map(normalizeJoinedTrip)
        .filter((trip): trip is SharedTrip => Boolean(trip));

    const { data: ownerTripRows, error: ownerTripsError } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null);

    const ownerTrips = ((ownerTripRows || []) as SharedTrip[]).map((trip) => ({
        ...trip,
        membershipRole: trip.membershipRole || "owner",
        membershipStatus: trip.membershipStatus || "active",
    }));

    const tripsById = new Map<string, SharedTrip>();
    [...memberTrips, ...ownerTrips].forEach((trip) => {
        if (trip.id) tripsById.set(trip.id, trip);
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
            .select("trip_id,user_id,status")
            .in("trip_id", tripIds)
            .eq("status", "active");

        if (!membersError) {
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
                    .from("user_profiles")
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

    return { trips, error: error || ownerTripsError || null };
}
