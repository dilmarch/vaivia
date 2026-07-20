import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HealthSafetyAdvisories from "@/components/health/HealthSafetyAdvisories";
import type {
    GovernmentTravelAdvisory,
    GovernmentTravelAdvisoryDataset,
} from "@/lib/governmentTravelAdvisories";
import type { TripDestinationRecord } from "@/lib/tripDestinations";

afterEach(cleanup);

function advisory(
    countryCode: string,
    advisoryLevel: 0 | 1 | 2 | 3,
    hasRegionalAdvisory = false
): GovernmentTravelAdvisory {
    return {
        countryCode,
        countryName: `Country ${countryCode}`,
        advisoryLevel,
        advisoryText: `Official advisory ${countryCode}`,
        hasRegionalAdvisory,
        latestUpdateType: "Risk level change",
        latestUpdateDescription: `Latest update ${countryCode}`,
        publishedAt: "2026-02-02T00:00:00.000Z",
        publishedDescription: "February 2, 2026",
        urlSlug: `country-${countryCode.toLowerCase()}`,
    };
}

const dataset: GovernmentTravelAdvisoryDataset = {
    generatedAt: "2026-02-02T00:01:00.000Z",
    generatedDescription: "February 2, 2026 at 00:01 UTC",
    fetchedAt: "2026-02-02T00:02:00.000Z",
    advisories: [
        advisory("AA", 0),
        advisory("BB", 1),
        advisory("CC", 2, true),
        advisory("DD", 3),
    ],
};

function destination(
    label: string,
    countryCode: string | null,
    sortOrder: number
): TripDestinationRecord {
    return {
        id: `destination-${sortOrder}`,
        label,
        placeId: `place-${sortOrder}`,
        countryCode,
        countryName: null,
        sortOrder,
    };
}

describe("Health & Safety travel advisories", () => {
    it("renders all four accessible risk labels, source wording and regional status", () => {
        render(
            <HealthSafetyAdvisories
                destinations={[
                    destination("Destination A", "AA", 0),
                    destination("Destination B", "BB", 1),
                    destination("Destination C", "CC", 2),
                    destination("Destination D", "DD", 3),
                ]}
                advisoryResult={{ ok: true, dataset }}
            />
        );

        expect(screen.getByText("Normal precautions")).toBeInTheDocument();
        expect(screen.getByText("High degree of caution")).toBeInTheDocument();
        expect(screen.getByText("Avoid non-essential travel")).toBeInTheDocument();
        expect(screen.getByText("Avoid all travel")).toBeInTheDocument();
        expect(screen.getByText("Official advisory CC")).toBeInTheDocument();
        expect(screen.getByText("Includes regional advisories")).toBeInTheDocument();
        expect(
            screen.getAllByRole("link", { name: "Review official advisory" })[2]
        ).toHaveAttribute(
            "href",
            "https://travel.gc.ca/destinations/country-cc"
        );
    });

    it("shows safe destination states for a missing code and no matching record", () => {
        render(
            <HealthSafetyAdvisories
                destinations={[
                    destination("Missing code", null, 0),
                    destination("No match", "ZZ", 1),
                ]}
                advisoryResult={{ ok: true, dataset }}
            />
        );

        expect(screen.getByText(/choose this destination again/i)).toBeInTheDocument();
        expect(screen.getByText(/no government of canada advisory record/i)).toBeInTheDocument();
    });

    it("keeps the trip page usable when the official source is unavailable", () => {
        render(
            <HealthSafetyAdvisories
                destinations={[destination("Destination A", "AA", 0)]}
                advisoryResult={{ ok: false, reason: "source_unavailable" }}
            />
        );

        expect(
            screen.getByText("Travel advisories are temporarily unavailable")
        ).toBeInTheDocument();
        expect(screen.getByText(/your trip is still available/i)).toBeInTheDocument();
    });

    it("includes the required source, warning, licence attribution and disclaimer", () => {
        render(
            <HealthSafetyAdvisories
                destinations={[]}
                advisoryResult={{ ok: true, dataset }}
            />
        );

        expect(
            screen.getByText(
                "Advisories can change quickly. Review the official source before travelling."
            )
        ).toBeInTheDocument();
        expect(screen.getByText("Government of Canada")).toBeInTheDocument();
        expect(screen.getByText("Open Government Licence – Canada")).toBeInTheDocument();
        expect(screen.getByText(/not affiliated with or endorsed/i)).toBeInTheDocument();
    });
});
