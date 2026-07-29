import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSidebarNav from "@/components/AppSidebarNav";

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/itinerary",
    useSearchParams: () => new URLSearchParams("view=day"),
}));

afterEach(() => cleanup());

function expectSubnavLinks(
    name: string,
    expectedLinks: Array<[label: string, href: string]>
) {
    const navigation = screen.getByRole("navigation", { name });

    expectedLinks.forEach(([label, href]) => {
        expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute(
            "href",
            href
        );
    });
}

describe("desktop sidebar secondary navigation", () => {
    it("keeps the primary list scrollable without redundant trip navigation", () => {
        render(<AppSidebarNav profile={{ role: "super_admin" }} />);

        const primaryNavigation = screen.getByRole("navigation", {
            name: "Primary navigation",
        });
        expect(primaryNavigation).toHaveClass(
            "min-h-0",
            "flex-1",
            "overflow-y-auto",
            "overscroll-contain"
        );
        expect(
            within(primaryNavigation).queryByRole("link", { name: "Home" })
        ).toBeNull();
        expect(
            within(primaryNavigation).queryByRole("link", { name: "News Feed" })
        ).toBeNull();
    });

    it("links each trip section to its requested secondary views", () => {
        render(<AppSidebarNav />);

        expectSubnavLinks("Itinerary views", [
            ["List view", "/trips/trip-a/itinerary?view=list"],
            ["Day view", "/trips/trip-a/itinerary?view=day"],
            ["Week view", "/trips/trip-a/itinerary?view=week"],
            ["Month view", "/trips/trip-a/itinerary?view=month"],
        ]);
        expectSubnavLinks("Budget views", [
            ["Budget", "/trips/trip-a/budget"],
            ["Expenses", "/trips/trip-a/budget/expenses"],
        ]);
        expectSubnavLinks("Transport views", [
            ["Planned transport", "/trips/trip-a?tab=journey"],
            ["Compare transport", "/trips/trip-a?tab=journey-planning"],
        ]);
        expectSubnavLinks("Stays views", [
            ["Planned stays", "/trips/trip-a/accommodations"],
            ["Compare stays", "/trips/trip-a/accommodations?tab=planning"],
        ]);
        expectSubnavLinks("Eat & Drink views", [
            ["Places to Eat", "/trips/trip-a/food?tab=places"],
            ["Food to Try", "/trips/trip-a/food?tab=foods"],
        ]);
    });

    it("shows flyouts on hover or keyboard focus and marks the selected view", () => {
        render(<AppSidebarNav />);

        const itineraryViews = screen.getByRole("navigation", {
            name: "Itinerary views",
        });
        const flyout = itineraryViews.parentElement;

        expect(flyout).toHaveClass(
            "left-full",
            "w-52",
            "group-hover/nav-item:visible",
            "group-focus-within/nav-item:visible"
        );
        expect(
            within(itineraryViews).getByRole("link", { name: "Day view" })
        ).toHaveAttribute("aria-current", "page");
    });

    it("passes an explicit itinerary view through the server route", () => {
        const page = readFileSync(
            resolve(process.cwd(), "app/trips/[tripId]/page.tsx"),
            "utf8"
        );
        const calendar = readFileSync(
            resolve(process.cwd(), "components/ItineraryCalendar.tsx"),
            "utf8"
        );

        expect(page).toContain(
            "resolvedSearchParams.view ??"
        );
        expect(page).toContain("?.itinerary_default_view");
        expect(calendar).toContain("if (!listOnly) setView(defaultView);");
        expect(calendar).toContain("[defaultView, listOnly]");
        expect(calendar).toContain("buildItineraryViewUrl(");
        expect(calendar).toContain('name="return_to"');
        expect(page).toContain("shouldPreserveItineraryView(formData)");
        expect(page).toContain("revalidateItineraryPaths(tripId)");
    });

    it("submits itinerary edits in place instead of redirecting the calendar", () => {
        const itineraryForm = readFileSync(
            resolve(process.cwd(), "components/ItineraryItemForm.tsx"),
            "utf8"
        );
        const transportationForm = readFileSync(
            resolve(process.cwd(), "components/TransportationForm.tsx"),
            "utf8"
        );

        expect(itineraryForm).toContain(
            'formData.set("preserve_itinerary_view", "true")'
        );
        expect(itineraryForm).toContain("action={handleFormAction}");
        expect(transportationForm).toContain(
            'formData.set("preserve_itinerary_view", "true")'
        );
        expect(transportationForm).toContain("action={handleFormAction}");
    });

    it("adds scroll-aware mobile controls for moving between itinerary days", () => {
        const calendar = readFileSync(
            resolve(process.cwd(), "components/ItineraryCalendar.tsx"),
            "utf8"
        );

        expect(calendar).toContain("data-itinerary-day-view");
        expect(calendar).toContain('aria-label="Day navigation"');
        expect(calendar).toContain('aria-label="Previous day"');
        expect(calendar).toContain('aria-label="Next day"');
        expect(calendar).toContain('window.addEventListener("scroll"');
    });
});
