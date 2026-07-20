export type MappableCoordinatePair = {
    latitude: number;
    longitude: number;
};

export function getMapCoordinate(value: unknown) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && value.trim() === "") return null;

    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

export function getMappableCoordinatePair(
    latitudeValue: unknown,
    longitudeValue: unknown
): MappableCoordinatePair | null {
    const latitude = getMapCoordinate(latitudeValue);
    const longitude = getMapCoordinate(longitudeValue);

    if (latitude === null || longitude === null) return null;
    if (latitude < -90 || latitude > 90) return null;
    if (longitude < -180 || longitude > 180) return null;

    // Missing geocodes have historically been stored as 0,0. Never map that
    // sentinel—the map otherwise places the item at Null Island in the Gulf of Guinea.
    if (latitude === 0 && longitude === 0) return null;

    return { latitude, longitude };
}

export function hasMappableCoordinatePair(
    latitudeValue: unknown,
    longitudeValue: unknown
) {
    return getMappableCoordinatePair(latitudeValue, longitudeValue) !== null;
}
