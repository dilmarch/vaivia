import { describe, expect, it, vi } from "vitest";

import {
    fetchGovernmentTravelAdvisories,
    GOVERNMENT_ADVISORY_REVALIDATE_SECONDS,
    GOVERNMENT_ADVISORY_SOURCE_URL,
    matchGovernmentAdvisory,
    parseGovernmentTravelAdvisoryDataset,
} from "@/lib/governmentTravelAdvisories";

function advisoryRecord({
    code,
    level,
    regional = false,
}: {
    code: string;
    level: 0 | 1 | 2 | 3;
    regional?: boolean;
}) {
    return {
        "country-iso": code,
        "country-eng": `Country ${code}`,
        "advisory-state": level,
        "has-regional-advisory": regional ? 1 : 0,
        "recent-updates-type": "Editorial change",
        "date-published": {
            timestamp: 1_770_000_000,
            date: "February 2, 2026",
            asp: "2026-02-02",
        },
        eng: {
            name: `Country ${code}`,
            "url-slug": `country-${code.toLowerCase()}`,
            "friendly-date": "February 2, 2026",
            "advisory-text": `Official source wording for ${code}`,
            "recent-updates": `Latest source update for ${code}`,
        },
    };
}

function sourcePayload() {
    return {
        metadata: {
            generated: {
                timestamp: 1_770_000_100,
                date: "February 2, 2026 at 00:01 UTC",
            },
        },
        data: {
            AA: advisoryRecord({ code: "AA", level: 0 }),
            BB: advisoryRecord({ code: "BB", level: 1 }),
            CC: advisoryRecord({ code: "CC", level: 2, regional: true }),
            DD: advisoryRecord({ code: "DD", level: 3 }),
            "PT-20": {
                ...advisoryRecord({ code: "PT-20", level: 0 }),
                eng: {
                    ...advisoryRecord({ code: "PT-20", level: 0 }).eng,
                    name: "Azores",
                    "url-slug": "azores",
                },
            },
        },
    };
}

describe("Government of Canada travel advisory client", () => {
    it("validates and maps all four advisory-state values without replacing source text", () => {
        const dataset = parseGovernmentTravelAdvisoryDataset(
            sourcePayload(),
            "2026-02-02T00:02:00.000Z"
        );

        expect(dataset?.advisories.map((advisory) => advisory.advisoryLevel)).toEqual([
            0,
            1,
            2,
            3,
        ]);
        expect(dataset?.advisories.map((advisory) => advisory.advisoryText)).toEqual([
            "Official source wording for AA",
            "Official source wording for BB",
            "Official source wording for CC",
            "Official source wording for DD",
        ]);
    });

    it("ignores official subdivision records without rejecting country advisories", () => {
        const dataset = parseGovernmentTravelAdvisoryDataset(sourcePayload());

        expect(dataset?.advisories).toHaveLength(4);
        expect(
            dataset?.advisories.some(
                (candidate) => candidate.countryCode === "PT-20"
            )
        ).toBe(false);
    });

    it("retains the regional-advisory flag and latest update fields", () => {
        const dataset = parseGovernmentTravelAdvisoryDataset(sourcePayload());
        const advisory = dataset?.advisories.find(
            (candidate) => candidate.countryCode === "CC"
        );

        expect(advisory).toMatchObject({
            hasRegionalAdvisory: true,
            latestUpdateType: "Editorial change",
            latestUpdateDescription: "Latest source update for CC",
        });
    });

    it("matches only valid two-letter ISO country codes", () => {
        const dataset = parseGovernmentTravelAdvisoryDataset(sourcePayload())!;

        expect(matchGovernmentAdvisory(dataset, "cc")?.countryCode).toBe("CC");
        expect(matchGovernmentAdvisory(dataset, null)).toBeNull();
        expect(matchGovernmentAdvisory(dataset, "CAN")).toBeNull();
        expect(matchGovernmentAdvisory(dataset, "ZZ")).toBeNull();
    });

    it("rejects malformed source data", () => {
        const payload = sourcePayload();
        payload.data.BB["advisory-state"] = 8 as 0;

        expect(parseGovernmentTravelAdvisoryDataset(payload)).toBeNull();
        expect(parseGovernmentTravelAdvisoryDataset({ data: {} })).toBeNull();
    });

    it("does not hide malformed two-letter country records among subdivisions", () => {
        const payload = sourcePayload();
        payload.data.BB.eng["advisory-text"] = "";

        expect(parseGovernmentTravelAdvisoryDataset(payload)).toBeNull();

        const missingCodePayload = sourcePayload();
        missingCodePayload.data.BB["country-iso"] = "";
        expect(parseGovernmentTravelAdvisoryDataset(missingCodePayload)).toBeNull();
    });

    it("fails safely when the source is unavailable", async () => {
        const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));

        await expect(fetchGovernmentTravelAdvisories({ fetcher })).resolves.toEqual({
            ok: false,
            reason: "source_unavailable",
        });
    });

    it("uses a bounded cached server fetch and rejects malformed responses", async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ metadata: {}, data: {} }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        await expect(fetchGovernmentTravelAdvisories({ fetcher })).resolves.toEqual({
            ok: false,
            reason: "malformed_source",
        });
        expect(fetcher).toHaveBeenCalledWith(
            GOVERNMENT_ADVISORY_SOURCE_URL,
            expect.objectContaining({
                next: { revalidate: GOVERNMENT_ADVISORY_REVALIDATE_SECONDS },
                signal: expect.any(AbortSignal),
            })
        );
    });
});
