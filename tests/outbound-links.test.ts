import { describe, expect, it } from "vitest";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";

describe("VAIVIA outbound UTM attribution", () => {
    it("retags Google-supplied UTM links while preserving useful context", () => {
        const input =
            "https://www.axelhotels.com/de/axel-hotel-berlin/hotel?utm_source=google&utm_medium=organic&utm_campaign=GMB&utm_content=axel_berlin";

        expect(addVaiviaUtmAttribution(input)).toBe(
            "https://www.axelhotels.com/de/axel-hotel-berlin/hotel?utm_source=vaivia&utm_medium=referral&utm_campaign=GMB&utm_content=axel_berlin"
        );
    });

    it("adds VAIVIA attribution when another UTM field is already present", () => {
        expect(
            addVaiviaUtmAttribution(
                "https://example.com/place?room=deluxe&utm_campaign=summer#rates"
            )
        ).toBe(
            "https://example.com/place?room=deluxe&utm_campaign=summer&utm_source=vaivia&utm_medium=referral#rates"
        );
    });

    it("normalizes differently-cased source and medium keys", () => {
        expect(
            addVaiviaUtmAttribution(
                "https://example.com/place?UTM_SOURCE=google&UTM_MEDIUM=organic&utm_content=card"
            )
        ).toBe(
            "https://example.com/place?utm_content=card&utm_source=vaivia&utm_medium=referral"
        );
    });

    it("leaves ordinary, relative and non-http links unchanged", () => {
        expect(addVaiviaUtmAttribution("https://example.com/place?room=deluxe")).toBe(
            "https://example.com/place?room=deluxe"
        );
        expect(addVaiviaUtmAttribution("/relative/path?utm_source=google")).toBe(
            "/relative/path?utm_source=google"
        );
        expect(addVaiviaUtmAttribution("mailto:hello@example.com?utm_source=google")).toBe(
            "mailto:hello@example.com?utm_source=google"
        );
    });
});
