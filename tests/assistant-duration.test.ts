import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("assistant execution bounds", () => {
    it("gives only the trip assistant route a 60-second Node.js duration", () => {
        const route = read("app/api/trips/[tripId]/assistant/route.ts");

        expect(route).toContain('export const runtime = "nodejs";');
        expect(route).toContain("export const maxDuration = 60;");
    });

    it("keeps the provider requests independently time bounded", () => {
        const gemini = read("lib/ai/gemini-assistant.ts");
        const places = read("lib/ai/google-places.ts");

        expect(gemini).toContain("const GEMINI_REQUEST_TIMEOUT_MS = 30_000;");
        expect(gemini).toContain("timeout: GEMINI_REQUEST_TIMEOUT_MS");
        expect(gemini).toContain("controller.abort()");
        expect(places).toContain("const GOOGLE_PLACES_TIMEOUT_MS = 8_000;");
        expect(places).toContain("controller.abort()");
    });
});
