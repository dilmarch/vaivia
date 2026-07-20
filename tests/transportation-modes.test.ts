import { describe, expect, it } from "vitest";

import {
    getTransportationDbType,
    getTransportationModeEmoji,
    getTransportationModeLabel,
    resolveTransportationMode,
} from "@/lib/transportationModes";

describe("transportation modes", () => {
    it("persists metro/subway using the supported subway database type", () => {
        expect(getTransportationDbType("subway")).toBe("subway");
        expect(getTransportationDbType("metro")).toBe("subway");
        expect(getTransportationDbType("airplane")).toBe("flight");
    });

    it("uses the metro/subway label and icon consistently", () => {
        expect(getTransportationModeLabel("subway")).toBe("Metro / Subway");
        expect(getTransportationModeEmoji("subway")).toBe("🚇");
    });

    it("recovers legacy non-flight cards that were stored with the flight default", () => {
        expect(
            resolveTransportationMode(
                "flight",
                "Train: Central Station to Airport Station"
            )
        ).toBe("train");
        expect(
            getTransportationModeEmoji(
                resolveTransportationMode("flight", "Train: A to B")
            )
        ).toBe("🚆");
        expect(resolveTransportationMode("flight", "AC692 YYT to YYZ")).toBe(
            "airplane"
        );
    });
});
