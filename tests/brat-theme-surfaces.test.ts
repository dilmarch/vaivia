import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("brat theme surfaces", () => {
    it("gives the assistant page and conversation rail semantic green surfaces", () => {
        const page = read("app/trips/[tripId]/assistant/page.tsx");
        const assistant = read("components/assistant/TripAssistant.tsx");
        const css = read("app/globals.css");

        expect(page).toContain('className="vaivia-page-bg');
        expect(assistant).toContain("vaivia-assistant-conversation-panel");
        expect(css).toMatch(
            /\.group\\\/sidebar,[\s\S]*\.vaivia-assistant-conversation-panel\s*\{[\s\S]*linear-gradient\(180deg, #6faa00, #5f9200\)/
        );
    });

    it("recolors dark structural utilities while preserving interactive controls", () => {
        const css = read("app/globals.css");

        expect(css).toContain('[class^="bg-[#0"]');
        expect(css).toContain('[class^="bg-slate-950"]');
        expect(css).toContain('[class^="bg-black"]');
        expect(css).toContain(':not(button):not(a):not([role="button"])');
        expect(css).toContain('.bg-black:is(button, a, [role="button"])');
        expect(css).toContain("Dark buttons are the sole exception");
    });

    it("covers shared custom surfaces that do not use background utilities", () => {
        const css = read("app/globals.css");

        for (const surface of [
            ".vaivia-modal-panel",
            ".vaivia-modal-body",
            ".vaivia-modal-confirm",
            ".vaivia-modal-footer",
            ".pac-container",
            ".vaivia-quick-add-menu-panel",
        ]) {
            expect(css).toContain(surface);
        }
    });
});
