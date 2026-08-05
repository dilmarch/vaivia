import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import VaiviaLoadingScreen from "@/components/VaiviaLoadingScreen";

afterEach(cleanup);

describe("Vaivia loading screen", () => {
    it("renders one deterministic visual with an accessible throbber", () => {
        const { container, rerender } = render(<VaiviaLoadingScreen />);

        expect(screen.getByText("Curating your itinerary")).toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Loading your latest trip details"
        );
        expect(
            container.querySelector("[data-vaivia-loading-throbber]")
        ).toBeInTheDocument();
        expect(container.querySelector(".animate-vaivia-loading-bar")).toBeNull();

        rerender(<VaiviaLoadingScreen passportStampFlag="PT" />);
        expect(screen.getByText("Curating your itinerary")).toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
});
