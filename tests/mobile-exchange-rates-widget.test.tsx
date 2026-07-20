import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MobileExchangeRatesWidget from "@/components/MobileExchangeRatesWidget";

afterEach(cleanup);

describe("MobileExchangeRatesWidget", () => {
    it("shows both conversion directions for every destination currency", () => {
        const { container } = render(
            <MobileExchangeRatesWidget
                data={{
                    baseCurrency: "CAD",
                    rates: [
                        {
                            currency: "EUR",
                            destinationLabels: ["Lisbon", "Paris"],
                            countryCodes: ["PT", "FR"],
                            baseToDestinationRate: 0.68,
                            destinationToBaseRate: 1 / 0.68,
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText("Current exchange rates")).toBeInTheDocument();
        expect(screen.getByText("Lisbon · Paris")).toBeInTheDocument();
        expect(container.textContent).toContain("1.00 CAD = 0.68 EUR");
        expect(container.textContent).toContain("1.00 EUR = 1.4706 CAD");
        expect(container.textContent).toContain("Base CAD");
    });

    it("renders per-currency unavailable and missing-destination states safely", () => {
        const { rerender } = render(
            <MobileExchangeRatesWidget
                data={{
                    baseCurrency: "CAD",
                    rates: [
                        {
                            currency: "JPY",
                            destinationLabels: ["Tokyo"],
                            countryCodes: ["JP"],
                            baseToDestinationRate: null,
                            destinationToBaseRate: null,
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText("Current rate unavailable")).toBeInTheDocument();

        rerender(
            <MobileExchangeRatesWidget
                data={{ baseCurrency: "CAD", rates: [] }}
            />
        );
        expect(screen.getByText(/add google-validated trip destinations/i)).toBeInTheDocument();
    });
});
