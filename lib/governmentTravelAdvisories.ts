import "server-only";

export const GOVERNMENT_ADVISORY_SOURCE_URL =
    "https://data.international.gc.ca/travel-voyage/index-alpha-eng.json";
export const GOVERNMENT_ADVISORY_REVALIDATE_SECONDS = 60 * 60;

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFlag(value: unknown): value is 0 | 1 {
    return value === 0 || value === 1;
}

function isAdvisoryLevel(value: unknown): value is GovernmentAdvisoryLevel {
    return value === 0 || value === 1 || value === 2 || value === 3;
}

function isCountryCode(value: unknown): value is string {
    return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function timestampToIso(timestamp: number) {
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function parseAdvisoryRecord(
    key: string,
    value: unknown
): GovernmentTravelAdvisory | null {
    if (!isRecord(value)) return null;
    const countryCode = value["country-iso"];
    const advisoryLevel = value["advisory-state"];
    const regionalFlag = value["has-regional-advisory"];
    const datePublished = value["date-published"];
    const english = value.eng;

    if (
        !isCountryCode(countryCode) ||
        countryCode !== key ||
        !isNonEmptyString(value["country-eng"]) ||
        !isAdvisoryLevel(advisoryLevel) ||
        !isFlag(regionalFlag) ||
        !isRecord(datePublished) ||
        typeof datePublished.timestamp !== "number" ||
        !Number.isFinite(datePublished.timestamp) ||
        !isNonEmptyString(datePublished.date) ||
        !isRecord(english) ||
        !isNonEmptyString(english.name) ||
        !isNonEmptyString(english["url-slug"]) ||
        !isNonEmptyString(english["advisory-text"]) ||
        !isNonEmptyString(english["recent-updates"])
    ) {
        return null;
    }

    const publishedAt = timestampToIso(datePublished.timestamp);
    if (!publishedAt) return null;

    return {
        countryCode,
        countryName: english.name,
        advisoryLevel,
        advisoryText: english["advisory-text"],
        hasRegionalAdvisory: regionalFlag === 1,
        latestUpdateType: isNonEmptyString(value["recent-updates-type"])
            ? value["recent-updates-type"]
            : null,
        latestUpdateDescription: english["recent-updates"],
        publishedAt,
        publishedDescription: datePublished.date,
        urlSlug: english["url-slug"],
    };
}

export function parseGovernmentTravelAdvisoryDataset(
    value: unknown,
    fetchedAt = new Date().toISOString()
): GovernmentTravelAdvisoryDataset | null {
    if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.data)) {
        return null;
    }

    const generated = value.metadata.generated;
    if (
        !isRecord(generated) ||
        typeof generated.timestamp !== "number" ||
        !Number.isFinite(generated.timestamp) ||
        !isNonEmptyString(generated.date)
    ) {
        return null;
    }

    const generatedAt = timestampToIso(generated.timestamp);
    if (!generatedAt) return null;

    // The official feed can include subdivision records such as PT-20 (Azores)
    // alongside ISO 3166-1 alpha-2 country records. Trip destinations deliberately
    // store two-letter country codes, so subdivision records are outside this
    // client's matching contract and must not invalidate the country dataset.
    const countryEntries = Object.entries(value.data).filter(
        ([key, record]) =>
            isCountryCode(key) ||
            (isRecord(record) && isCountryCode(record["country-iso"]))
    );
    if (countryEntries.length === 0) return null;
    const advisories = countryEntries.map(([key, record]) =>
        parseAdvisoryRecord(key, record)
    );
    if (advisories.some((advisory) => advisory === null)) return null;

    return {
        generatedAt,
        generatedDescription: generated.date,
        fetchedAt,
        advisories: advisories as GovernmentTravelAdvisory[],
    };
}

export async function fetchGovernmentTravelAdvisories({
    fetcher = fetch,
}: {
    fetcher?: typeof fetch;
} = {}): Promise<GovernmentTravelAdvisoryResult> {
    let response: Response;
    try {
        response = await fetcher(GOVERNMENT_ADVISORY_SOURCE_URL, {
            headers: { Accept: "application/json" },
            next: { revalidate: GOVERNMENT_ADVISORY_REVALIDATE_SECONDS },
            signal: AbortSignal.timeout(8_000),
        });
    } catch {
        return { ok: false, reason: "source_unavailable" };
    }

    if (!response.ok) return { ok: false, reason: "source_unavailable" };

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        return { ok: false, reason: "malformed_source" };
    }

    const dataset = parseGovernmentTravelAdvisoryDataset(payload);
    return dataset
        ? { ok: true, dataset }
        : { ok: false, reason: "malformed_source" };
}

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
