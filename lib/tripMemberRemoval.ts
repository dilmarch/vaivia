type TripMemberRemovalClient = {
    rpc: (
        functionName: "remove_trip_member",
        args: {
            target_trip_id: string;
            target_member_user_id: string;
        }
    ) => Promise<{
        data: string | null;
        error: {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
        } | null;
    }>;
};

export async function removeTripMemberAsOwner({
    supabase,
    tripId,
    memberUserId,
}: {
    supabase: unknown;
    tripId: string;
    memberUserId: string;
}) {
    const { data, error } = await (supabase as TripMemberRemovalClient).rpc(
        "remove_trip_member",
        {
            target_trip_id: tripId,
            target_member_user_id: memberUserId,
        }
    );

    if (error || !data) {
        throw new Error(
            `Could not remove trip member: ${
                error?.message ?? "No trip member was removed."
            }`
        );
    }

    return data;
}
