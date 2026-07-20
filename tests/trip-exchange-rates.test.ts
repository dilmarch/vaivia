import { describe, expect, it, vi } from "vitest";

import {
    buildTripDestinationCurrencyGroups,
    getCurrencyForCountryCode,
    loadMobileTripExchangeRates,
    resolveTripExchangeRates,
} from "@/lib/tripExchangeRates";

describe("mobile trip exchange rates", () => {
    it("maps ISO country codes to their local currencies", () => {
        expect(getCurrencyForCountryCode("ca")).toBe("CAD");
        expect(getCurrencyForCountryCode("PT")).toBe("EUR");
        expect(getCurrencyForCountryCode("JP")).toBe("JPY");
        expect(getCurrencyForCountryCode(null)).toBeNull();
        expect(getCurrencyForCountryCode("ZZ")).toBeNull();
    });

    it("groups destinations that use the same currency without losing locations", () => {
        expect(
            buildTripDestinationCurrencyGroups([
                { label: "Lisbon", countryCode: "PT" },
                { label: "Paris", countryCode: "FR" },
                { label: "Lisbon", countryCode: "PT" },
                { label: "Tokyo", countryCode: "JP" },
                { label: "Missing", countryCode: null },
            ])
        ).toEqual([
            {
                currency: "EUR",
                destinationLabels: ["Lisbon", "Paris"],
                countryCodes: ["PT", "FR"],
            },
            {
                currency: "JPY",
                destinationLabels: ["Tokyo"],
                countryCodes: ["JP"],
            },
        ]);
    });

    it("uses one fetched rate per currency and derives the reciprocal direction", async () => {
        const rateLoader = vi.fn(async () => ({
            rate: 0.75,
            provider: "frankfurter",
        }));

        const data = await resolveTripExchangeRates({
            baseCurrency: "CAD",
            destinations: [
                { label: "New York", countryCode: "US" },
                { label: "Toronto", countryCode: "CA" },
            ],
            rateLoader,
        });

        expect(rateLoader).toHaveBeenCalledOnce();
        expect(rateLoader).toHaveBeenCalledWith({
            fromCurrency: "CAD",
            toCurrency: "USD",
        });
        expect(data).toEqual({
            baseCurrency: "CAD",
            rates: [
                expect.objectContaining({
                    currency: "CAD",
                    baseToDestinationRate: 1,
                    destinationToBaseRate: 1,
                }),
                expect.objectContaining({
                    currency: "USD",
                    baseToDestinationRate: 0.75,
                    destinationToBaseRate: 4 / 3,
                }),
            ],
        });
    });

    it("keeps failed destination rates isolated from the rest of the widget", async () => {
        const rateLoader = vi.fn(async ({ toCurrency }: { toCurrency: string }) => {
            if (toCurrency === "JPY") throw new Error("provider unavailable");
            return { rate: 0.65, provider: "frankfurter" };
        });

        const data = await resolveTripExchangeRates({
            baseCurrency: "CAD",
            destinations: [
                { label: "Paris", countryCode: "FR" },
                { label: "Tokyo", countryCode: "JP" },
            ],
            rateLoader,
        });

        expect(data.rates.find((rate) => rate.currency === "EUR")).toMatchObject({
            baseToDestinationRate: 0.65,
        });
        expect(data.rates.find((rate) => rate.currency === "JPY")).toMatchObject({
            baseToDestinationRate: null,
            destinationToBaseRate: null,
        });
    });

    it("uses the user's saved default currency and normalized trip destinations", async () => {
        const financeQuery: Record<string, ReturnType<typeof vi.fn>> = {};
        financeQuery.select = vi.fn(() => financeQuery);
        financeQuery.eq = vi.fn(() => financeQuery);
        financeQuery.maybeSingle = vi.fn(async () => ({
            data: { home_currency: "USD" },
            error: null,
        }));

        const destinationQuery: Record<string, ReturnType<typeof vi.fn>> = {};
        destinationQuery.select = vi.fn(() => destinationQuery);
        destinationQuery.eq = vi.fn(() => destinationQuery);
        destinationQuery.order = vi.fn(async () => ({
            data: [
                {
                    label: "Toronto",
                    country_code: "CA",
                    sort_order: 0,
                },
            ],
            error: null,
        }));

        const supabase = {
            from: vi.fn((table: string) =>
                table === "user_finance_settings"
                    ? financeQuery
                    : destinationQuery
            ),
        };
        const rateLoader = vi.fn(async ({ toCurrency }: { toCurrency: string }) => ({
            rate: toCurrency === "CAD" ? 1.35 : 0.9,
            provider: "frankfurter",
        }));

        const data = await loadMobileTripExchangeRates({
            supabase: supabase as never,
            userId: "user-1",
            tripId: "trip-1",
            fallbackCurrency: "EUR",
            fallbackDestinations: [{ label: "Lisbon", countryCode: "PT" }],
            rateLoader,
        });

        expect(data.baseCurrency).toBe("USD");
        expect(data.rates.map((rate) => rate.currency)).toEqual(["CAD", "EUR"]);
        expect(rateLoader).toHaveBeenCalledWith({
            fromCurrency: "USD",
            toCurrency: "CAD",
        });
        expect(rateLoader).toHaveBeenCalledWith({
            fromCurrency: "USD",
            toCurrency: "EUR",
        });
    });
});
