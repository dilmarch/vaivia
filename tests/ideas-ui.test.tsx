import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdeaForm } from "@/components/IdeasTab";

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
});
