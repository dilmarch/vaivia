import { describe, expect, it } from "vitest";
import {
    getMapCoordinate,
    getMappableCoordinatePair,
    hasMappableCoordinatePair,
} from "@/lib/mapCoordinates";

describe("map coordinate validation", () => {
    it("does not coerce missing coordinate values to zero", () => {
        expect(getMapCoordinate(null)).toBeNull();
        expect(getMapCoordinate(undefined)).toBeNull();
        expect(getMapCoordinate("")).toBeNull();
        expect(getMapCoordinate("   ")).toBeNull();
    });

    it("rejects the 0,0 placeholder used by items without locations", () => {
        expect(hasMappableCoordinatePair(0, 0)).toBe(false);
        expect(hasMappableCoordinatePair("0", "0")).toBe(false);
        expect(getMappableCoordinatePair(null, null)).toBeNull();
    });

    it("rejects non-finite and out-of-range coordinates", () => {
        expect(hasMappableCoordinatePair(Number.NaN, -79.3832)).toBe(false);
        expect(hasMappableCoordinatePair(91, -79.3832)).toBe(false);
        expect(hasMappableCoordinatePair(43.6532, 181)).toBe(false);
    });

    it("keeps valid locations, including points on one zero axis", () => {
        expect(getMappableCoordinatePair(43.6532, -79.3832)).toEqual({
            latitude: 43.6532,
            longitude: -79.3832,
        });
        expect(hasMappableCoordinatePair(0, -78.5)).toBe(true);
        expect(hasMappableCoordinatePair(51.5, 0)).toBe(true);
    });
});
