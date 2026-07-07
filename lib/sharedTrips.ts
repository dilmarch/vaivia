import type { SupabaseClient } from "@supabase/supabase-js";

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
    archived_at?: string | null;
    archived_reason?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    membershipRole?: string | null;
    membershipStatus?: string | null;
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

    return { trips, error: error || ownerTripsError || null };
}
