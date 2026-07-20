import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IdeasTab, { IdeaForm } from "@/components/IdeasTab";
import SuggestedIdeasPanel from "@/components/SuggestedIdeasPanel";
import type { TripIdea } from "@/lib/tripIdeas";

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/itinerary",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/script", () => ({
    default: () => null,
}));

afterEach(() => cleanup());

describe("trip idea form", () => {
    it("leaves opening and closing times blank when adding an idea", () => {
        render(
            <IdeaForm
                tripId="trip-a"
                action={vi.fn(async () => undefined)}
            />
        );

        const openingTime = screen.getByLabelText("Optional opening time");
        const closingTime = screen.getByLabelText("Optional closing time");

        expect(openingTime).toHaveValue("");
        expect(closingTime).toHaveValue("");

        fireEvent.click(
            screen.getByRole("button", { name: /^Afternoon/ })
        );

        expect(openingTime).toHaveValue("");
        expect(closingTime).toHaveValue("");
    });

    it("captures an optional start and end date", () => {
        render(
            <IdeaForm
                tripId="trip-a"
                action={vi.fn(async () => undefined)}
            />
        );

        const startDate = screen.getByLabelText("Start date");
        const endDate = screen.getByLabelText("End date");

        expect(startDate).toHaveValue("");
        expect(endDate).toHaveValue("");

        fireEvent.change(startDate, { target: { value: "2026-09-20" } });
        fireEvent.change(endDate, { target: { value: "2026-09-27" } });

        expect(startDate).toHaveValue("2026-09-20");
        expect(endDate).toHaveValue("2026-09-27");
    });
});

const baseIdea: TripIdea = {
    id: "idea-a",
    trip_id: "trip-a",
    title: "Harbour festival",
    category: "Entertainment",
    tags: [],
    days_available: [],
    time_of_day: [],
    availability_start_date: "2026-09-20",
    availability_end_date: "2026-09-27",
    is_archived: false,
    attended: false,
};

describe("trip idea editing", () => {
    it("opens the edit form in the standard VAIVIA modal", async () => {
        render(
            <IdeasTab
                tripId="trip-a"
                ideas={[baseIdea]}
                updateIdeaAction={vi.fn(async () => undefined)}
                deleteIdeaAction={vi.fn(async () => undefined)}
                toggleReactionAction={vi.fn(async () => undefined)}
                toggleAttendedAction={vi.fn(async () => undefined)}
                moveItemAction={vi.fn(async () => undefined)}
                moveTargetTrips={[]}
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Edit Harbour festival" })
        );

        const dialog = screen.getByRole("dialog", {
            name: "Edit thing to do",
        });
        expect(dialog).toHaveClass("vaivia-modal-panel", "max-w-3xl");
        expect(
            screen.getByRole("heading", { name: "Harbour festival", level: 3 })
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save thing to do" })).toHaveClass(
            "vaivia-modal-button-primary"
        );

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });
});

describe("trip idea location tabs", () => {
    it("filters things to do by validated location", () => {
        const torontoIdea: TripIdea = {
            ...baseIdea,
            id: "idea-toronto",
            title: "Toronto gallery",
            location_city: "Toronto",
            location_country: "Canada",
            location_country_code: "CA",
        };
        const berlinIdea: TripIdea = {
            ...baseIdea,
            id: "idea-berlin",
            title: "Berlin museum",
            location_city: "Berlin",
            location_country: "Germany",
            location_country_code: "DE",
        };

        render(
            <IdeasTab
                tripId="trip-a"
                ideas={[torontoIdea, berlinIdea, baseIdea]}
                updateIdeaAction={vi.fn(async () => undefined)}
                deleteIdeaAction={vi.fn(async () => undefined)}
                toggleReactionAction={vi.fn(async () => undefined)}
                toggleAttendedAction={vi.fn(async () => undefined)}
                moveItemAction={vi.fn(async () => undefined)}
                moveTargetTrips={[]}
            />
        );

        const locationTabs = screen.getByRole("tablist", {
            name: "Filter things to do by location",
        });
        expect(locationTabs).toBeInTheDocument();
        expect(
            screen.getByRole("tab", {
                name: "All locations, 3 things to do",
            })
        ).toHaveAttribute(
            "aria-selected",
            "true"
        );

        fireEvent.click(
            screen.getByRole("tab", { name: "Toronto, 1 thing to do" })
        );
        expect(screen.getByText("Toronto gallery")).toBeInTheDocument();
        expect(screen.queryByText("Berlin museum")).not.toBeInTheDocument();
        expect(screen.queryByText("Harbour festival")).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("tab", { name: "NO LOCATION, 1 thing to do" })
        );
        expect(screen.getByText("Harbour festival")).toBeInTheDocument();
        expect(screen.queryByText("Toronto gallery")).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("tab", {
                name: "All locations, 3 things to do",
            })
        );
        expect(screen.getByText("Toronto gallery")).toBeInTheDocument();
        expect(screen.getByText("Berlin museum")).toBeInTheDocument();
        expect(screen.getByText("Harbour festival")).toBeInTheDocument();
    });
});

describe("trip idea day-view availability", () => {
    it("shows an idea every day inside its date range when no weekdays are selected", () => {
        render(
            <SuggestedIdeasPanel
                tripId="trip-a"
                ideas={[baseIdea]}
                selectedDate={new Date(2026, 8, 23)}
                promoteIdeaAction={vi.fn(async () => undefined)}
            />
        );

        expect(screen.getByText("Harbour festival")).toBeInTheDocument();
        expect(screen.getByText(/Sep 20, 2026/)).toBeInTheDocument();
    });

    it("hides ideas outside their date range or on an unselected weekday", () => {
        const { rerender } = render(
            <SuggestedIdeasPanel
                tripId="trip-a"
                ideas={[baseIdea]}
                selectedDate={new Date(2026, 8, 28)}
                promoteIdeaAction={vi.fn(async () => undefined)}
            />
        );

        expect(screen.queryByText("Harbour festival")).not.toBeInTheDocument();

        rerender(
            <SuggestedIdeasPanel
                tripId="trip-a"
                ideas={[{ ...baseIdea, days_available: ["Tuesday"] }]}
                selectedDate={new Date(2026, 8, 23)}
                promoteIdeaAction={vi.fn(async () => undefined)}
            />
        );

        expect(screen.queryByText("Harbour festival")).not.toBeInTheDocument();
    });
});
