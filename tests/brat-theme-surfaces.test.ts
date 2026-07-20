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

    it("keeps every dark button family green, including nested labels and icons", () => {
        const css = read("app/globals.css");

        for (const darkFamily of [
            'bg-slate-950',
            'bg-[#2',
            'bg-gray-950',
            'bg-zinc-950',
            'bg-neutral-950',
            'bg-stone-950',
            'bg-black',
            '.bg-lime-300',
            '.vaivia-quick-add-bubble',
            'background-color: rgb(0',
        ]) {
            expect(css).toContain(darkFamily);
        }
        expect(css).toContain("-webkit-text-fill-color: #8ace00 !important");
        expect(css).toContain("fill: currentColor !important");
        expect(css).toContain("stroke: currentColor !important");
    });

    it("uses black and green for every semantic button in brat mode", () => {
        const css = read("app/globals.css");

        expect(css).toMatch(
            /data-vaivia-theme="brat"[\s\S]*:is\([\s\S]*button,[\s\S]*\[role="button"\],[\s\S]*input\[type="submit"\][\s\S]*\)\s*\{[\s\S]*background: #000000 !important;[\s\S]*color: #8ace00 !important;/
        );
    });

    it("keeps all dashboard trip-card labels green across image tones", () => {
        const dashboard = read("components/TripDashboardClient.tsx");
        const css = read("app/globals.css");

        expect(dashboard).toContain("vaivia-trip-card-duration");
        expect(css).toContain(
            '.vaivia-trip-card .vaivia-trip-card-title'
        );
        expect(css).toContain(
            '.vaivia-trip-card .vaivia-trip-card-date'
        );
        expect(css).toContain(
            '.vaivia-trip-card .vaivia-trip-card-duration'
        );
        expect(css).not.toContain(
            '.vaivia-trip-card[data-image-tone="light"] .vaivia-trip-card-title'
        );
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
