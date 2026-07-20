import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("assistant navigation entry", () => {
    it("activates the general navigation item without guessing a trip", () => {
        const sidebar = read("components/AppSidebarNav.tsx");

        expect(sidebar).toMatch(
            /label: "Travel Assistant",\s+href: "\/assistant",\s+icon: Bot/
        );
        expect(sidebar).toContain('currentPathname === "/assistant"');
    });

    it("keeps trip navigation scoped to the current trip", () => {
        const sidebar = read("components/AppSidebarNav.tsx");

        expect(sidebar).toContain('href: tripHref ? `${tripHref}/assistant` : undefined');
    });

    it("requires authentication and an explicit accessible-trip selection", () => {
        const picker = read("app/assistant/page.tsx");

        expect(picker).toContain('if (!user) redirect("/auth/login")');
        expect(picker).toContain("loadActiveMemberTrips(supabase, user.id)");
        expect(picker).toContain('getTripHref(trip, "/assistant")');
        expect(picker).toContain("Which trip are we talking about?");
    });
});
