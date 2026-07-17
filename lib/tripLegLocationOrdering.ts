type SortableTripLegLocation = {
    startDate?: string | null;
    endDate?: string | null;
};

function getDateSortValue(location: SortableTripLegLocation) {
    const value = location.startDate || location.endDate || "";
    if (!value) return Number.POSITIVE_INFINITY;

    const timestamp = Date.parse(`${value}T00:00:00`);
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function sortTripLegLocations<T extends SortableTripLegLocation>(
    locations: T[]
) {
    return locations
        .map((location, index) => ({ location, index }))
        .sort((a, b) => {
            const dateDelta =
                getDateSortValue(a.location) - getDateSortValue(b.location);
            if (dateDelta !== 0) return dateDelta;

            return a.index - b.index;
        })
        .map(({ location }) => location);
}
