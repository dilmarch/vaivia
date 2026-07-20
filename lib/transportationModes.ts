const DATABASE_TRANSPORT_TYPES = new Set([
    "train",
    "bus",
    "ferry",
    "car",
    "rental_car",
    "rideshare",
    "taxi",
    "subway",
    "tram",
    "walking",
    "other",
]);

const LEGACY_TITLE_MODES: Array<[RegExp, string]> = [
    [/^train\s*:/i, "train"],
    [/^(?:metro\s*\/\s*subway|metro|subway)\s*:/i, "subway"],
    [/^bus\s*:/i, "bus"],
    [/^tram\s*:/i, "tram"],
    [/^ferry\s*:/i, "ferry"],
    [/^taxi\s*:/i, "taxi"],
    [/^car\s*:/i, "car"],
];

export function resolveTransportationMode(
    mode?: string | null,
    title?: string | null
) {
    const normalizedMode = (mode || "").trim().toLowerCase();
    const titleMode = LEGACY_TITLE_MODES.find(([pattern]) =>
        pattern.test((title || "").trim())
    )?.[1];

    if (
        titleMode &&
        (!normalizedMode ||
            ["airplane", "flight", "plane"].includes(normalizedMode))
    ) {
        return titleMode;
    }
    if (["airplane", "flight", "plane"].includes(normalizedMode)) {
        return "airplane";
    }
    if (normalizedMode === "metro") return "subway";
    return normalizedMode;
}

export function getTransportationDbType(mode?: string | null) {
    const normalizedMode = resolveTransportationMode(mode);
    if (["airplane", "flight", "plane"].includes(normalizedMode)) {
        return "flight";
    }
    if (normalizedMode === "metro") return "subway";
    return DATABASE_TRANSPORT_TYPES.has(normalizedMode)
        ? normalizedMode
        : "other";
}

export function getTransportationModeLabel(mode?: string | null) {
    const normalizedMode = resolveTransportationMode(mode);
    if (["airplane", "flight", "plane"].includes(normalizedMode)) {
        return "Flight";
    }
    if (["metro", "subway"].includes(normalizedMode)) {
        return "Metro / Subway";
    }
    if (!normalizedMode || normalizedMode === "other") return "Transportation";
    return normalizedMode[0].toUpperCase() + normalizedMode.slice(1);
}

export function getTransportationModeEmoji(mode?: string | null) {
    const normalizedMode = resolveTransportationMode(mode);
    if (["airplane", "flight", "plane"].includes(normalizedMode)) return "✈️";
    if (normalizedMode === "train") return "🚆";
    if (["metro", "subway"].includes(normalizedMode)) return "🚇";
    if (normalizedMode === "bus") return "🚌";
    if (normalizedMode === "tram") return "🚊";
    if (["ferry", "ship"].includes(normalizedMode)) return "⛴️";
    if (["taxi", "car", "rental_car", "rideshare"].includes(normalizedMode)) {
        return "🚕";
    }
    if (["bike", "bicycle"].includes(normalizedMode)) return "🚲";
    if (normalizedMode === "walking") return "🚶";
    return "🧭";
}
