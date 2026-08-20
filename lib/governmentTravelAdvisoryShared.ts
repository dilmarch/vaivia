export type GovernmentAdvisoryLevel = 0 | 1 | 2 | 3;

export type GovernmentTravelAdvisory = {
    countryCode: string;
    countryName: string;
    advisoryLevel: GovernmentAdvisoryLevel;
    advisoryText: string;
    hasRegionalAdvisory: boolean;
    latestUpdateType: string | null;
    latestUpdateDescription: string;
    publishedAt: string;
    publishedDescription: string;
    urlSlug: string;
};

export type GovernmentTravelAdvisoryDataset = {
    generatedAt: string;
    generatedDescription: string;
    fetchedAt: string;
    advisories: GovernmentTravelAdvisory[];
};

export type GovernmentTravelAdvisoryResult =
    | { ok: true; dataset: GovernmentTravelAdvisoryDataset }
    | { ok: false; reason: "source_unavailable" | "malformed_source" };

export const GOVERNMENT_ADVISORY_LEVELS: Record<
    GovernmentAdvisoryLevel,
    { label: string; shortLabel: string }
> = {
    0: {
        label: "Exercise normal security precautions",
        shortLabel: "Normal precautions",
    },
    1: {
        label: "Exercise a high degree of caution",
        shortLabel: "High degree of caution",
    },
    2: {
        label: "Avoid non-essential travel",
        shortLabel: "Avoid non-essential travel",
    },
    3: {
        label: "Avoid all travel",
        shortLabel: "Avoid all travel",
    },
};

export function matchGovernmentAdvisory(
    dataset: GovernmentTravelAdvisoryDataset,
    countryCode?: string | null
) {
    const normalizedCode = String(countryCode || "")
        .trim()
        .toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalizedCode)) return null;
    return (
        dataset.advisories.find(
            (advisory) => advisory.countryCode === normalizedCode
        ) || null
    );
}

export function getGovernmentAdvisoryUrl(advisory: GovernmentTravelAdvisory) {
    return `https://travel.gc.ca/destinations/${encodeURIComponent(
        advisory.urlSlug
    )}`;
}
