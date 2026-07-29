import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ItineraryQuickAdd from "@/components/ItineraryQuickAdd";

const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/itinerary",
    useRouter: () => ({ replace: routerReplace, refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/AnimatedModal", () => ({
    default: ({
        children,
        onClose,
    }: {
        children: (controls: { requestClose: () => void }) => React.ReactNode;
        onClose: () => void;
    }) => <div role="dialog">{children({ requestClose: onClose })}</div>,
}));

vi.mock("@/components/ItineraryItemForm", () => ({
    default: ({
        openSignal,
        submitLabel,
        defaultDate,
        defaultStartTime,
        defaultEndTime,
    }: {
        openSignal: number;
        submitLabel: string;
        defaultDate?: string;
        defaultStartTime?: string;
        defaultEndTime?: string;
    }) => (
        <output data-testid="scheduled-form-state">
            {openSignal}:{submitLabel}:{defaultDate}:{defaultStartTime}:
            {defaultEndTime}
        </output>
    ),
}));

vi.mock("@/components/IdeasTab", () => ({
    IdeaForm: () => <div data-testid="trip-idea-form">Trip idea form</div>,
}));

vi.mock("@/components/TransportationForm", () => ({
    default: ({
        isOpen,
        defaultDate,
        defaultStartTime,
        defaultEndTime,
    }: {
        isOpen: boolean;
        defaultDate?: string;
        defaultStartTime?: string;
        defaultEndTime?: string;
    }) =>
        isOpen ? (
            <output data-testid="transportation-form-state">
                {defaultDate}:{defaultStartTime}:{defaultEndTime}
            </output>
        ) : null,
}));
vi.mock("@/components/accommodations/AccommodationManager", () => ({
    AccommodationCreateModal: () => null,
}));
vi.mock("@/components/budget/QuickAddExpenseModal", () => ({
    default: () => null,
}));
vi.mock("@/components/FeatureSuggestionModal", () => ({ default: () => null }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function renderQuickAdd(
    initialAction?: "things",
    calendarDraftRange?: {
        requestId: number;
        dateKey: string;
        startTime: string;
        endTime: string;
    }
) {
    return render(
        <ItineraryQuickAdd
            tripId="trip-a"
            createItineraryAction={vi.fn(async () => undefined)}
            createTransportationAction={vi.fn(async () => undefined)}
            createIdeaAction={vi.fn(async () => undefined)}
            initialAction={initialAction}
            calendarDraftRange={calendarDraftRange}
        />
    );
}

function openThingsToDoChooser() {
    fireEvent.click(
        screen.getByRole("button", { name: "Open itinerary quick add menu" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add things to do" }));
}

describe("things to do quick add", () => {
    it("opens the timing chooser from a global quick-add deep link", () => {
        renderQuickAdd("things");

        expect(
            screen.getByRole("heading", { name: "When can this happen?" })
        ).toBeInTheDocument();
        expect(routerReplace).toHaveBeenCalledWith(
            "/trips/trip-a/itinerary",
            { scroll: false }
        );
    });

    it("offers fixed, flexible, and anytime timing choices", () => {
        renderQuickAdd();
        openThingsToDoChooser();

        expect(
            screen.getByRole("heading", { name: "When can this happen?" })
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Fixed time/ })).toHaveTextContent(
            "Happens at a particular date and time"
        );
        expect(
            screen.getByRole("button", { name: /Flexible time/ })
        ).toHaveTextContent("Can be fitted anywhere within an available window");
        expect(
            screen.getByRole("button", { name: /Anytime during trip/ })
        ).toHaveTextContent("Can take place anytime during your trip");
    });

    it("opens the scheduled form for fixed-time plans", () => {
        renderQuickAdd();
        openThingsToDoChooser();

        fireEvent.click(screen.getByRole("button", { name: /Fixed time/ }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByTestId("scheduled-form-state")).toHaveTextContent(
            "1:Add fixed-time activity"
        );
    });

    it.each([
        ["Flexible time", "Save a flexible plan for an available window."],
        [
            "Anytime during trip",
            "Save something that can happen anytime during this trip.",
        ],
    ])("opens the trip idea form for %s", (choice, description) => {
        renderQuickAdd();
        openThingsToDoChooser();

        fireEvent.click(screen.getByRole("button", { name: new RegExp(choice) }));

        expect(screen.getByRole("heading", { name: "Add thing to do" })).toBeInTheDocument();
        expect(screen.getByText(description)).toBeInTheDocument();
        expect(screen.getByTestId("trip-idea-form")).toBeInTheDocument();
    });

    it.each([
        ["Things to do", "scheduled-form-state"],
        ["Transportation item", "transportation-form-state"],
    ])(
        "keeps a dragged calendar range when opening %s",
        (choice, expectedFormTestId) => {
            renderQuickAdd(undefined, {
                requestId: 1,
                dateKey: "2026-09-24",
                startTime: "10:15",
                endTime: "11:45",
            });

            expect(
                screen.getByRole("heading", {
                    name: "What do you want to add?",
                })
            ).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole("button", { name: new RegExp(choice) })
            );

            expect(screen.getByTestId(expectedFormTestId)).toHaveTextContent(
                "2026-09-24:10:15:11:45"
            );
        }
    );
});
