import type { SharedTrip } from "@/lib/sharedTrips";

export type MoveTargetTrip = {
    id: string;
    title: string;
};

export function getMoveTargetTrips({
    trips,
    currentTripId,
}: {
    trips: SharedTrip[];
    currentTripId: string;
}): MoveTargetTrip[] {
    return trips
        .filter((trip) => trip.id && trip.id !== currentTripId)
        .map((trip) => ({
            id: trip.id,
            title:
                trip.title?.trim() ||
                trip.destination?.trim() ||
                "Untitled trip",
        }));
}
