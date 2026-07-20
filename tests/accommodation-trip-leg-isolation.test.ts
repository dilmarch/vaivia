import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("stay and trip-leg isolation", () => {
    it("does not infer a trip leg while creating or editing a stay", () => {
        const createAction = read("app/actions/accommodations.ts");
        const staysPage = read("app/trips/[tripId]/accommodations/page.tsx");

        expect(createAction).not.toContain("resolveTripLegIdForLocation");
        expect(staysPage).not.toContain("resolveTripLegIdForLocation");
    });

    it("builds trip headers only from destinations and explicit trip legs", () => {
        const tripPage = read("app/trips/[tripId]/page.tsx");
        const staysPage = read("app/trips/[tripId]/accommodations/page.tsx");
        const liveHero = read("components/TripPageHero.tsx");

        for (const source of [tripPage, staysPage, liveHero]) {
            expect(source).not.toContain('source: "accommodation" as const');
            expect(source).not.toContain("accommodationLocationsWithManualLegs");
            expect(source).not.toContain("accommodationMatch?.startDate");
        }
    });
});
