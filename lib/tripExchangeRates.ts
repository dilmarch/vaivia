import "server-only";

import countryToCurrency from "country-to-currency";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getExchangeRate } from "@/lib/budgetServer";
import { normalizeCurrencyCode } from "@/lib/currency";
import type { Database } from "@/src/types/supabase";

export type TripExchangeDestination = {
    label: string;
    countryCode: string | null;
};

export type TripDestinationCurrencyGroup = {
    currency: string;
    destinationLabels: string[];
    countryCodes: string[];
};

export type TripExchangeRateRow = TripDestinationCurrencyGroup & {
    baseToDestinationRate: number | null;
    destinationToBaseRate: number | null;
};

export type TripExchangeRateData = {
    baseCurrency: string;
    rates: TripExchangeRateRow[];
};

type ExchangeRateLoader = (args: {
    fromCurrency: string;
    toCurrency: string;
}) => Promise<{ rate: number; provider: string }>;

function normalizeCountryCode(value?: string | null) {
    const countryCode = String(value || "")
        .trim()
        .toUpperCase();
    return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

export function getCurrencyForCountryCode(value?: string | null) {
    const countryCode = normalizeCountryCode(value);
    if (!countryCode || !(countryCode in countryToCurrency)) return null;
    return countryToCurrency[
        countryCode as keyof typeof countryToCurrency
    ];
}

export function buildTripDestinationCurrencyGroups(
    destinations: TripExchangeDestination[]
): TripDestinationCurrencyGroup[] {
    const groups = new Map<string, TripDestinationCurrencyGroup>();
    const seenDestinations = new Set<string>();

    destinations.forEach((destination) => {
        const countryCode = normalizeCountryCode(destination.countryCode);
        const currency = getCurrencyForCountryCode(countryCode);
        const label = destination.label.trim();
        if (!countryCode || !currency || !label) return;

        const destinationKey = `${countryCode}:${label.toLocaleLowerCase()}`;
        if (seenDestinations.has(destinationKey)) return;
        seenDestinations.add(destinationKey);

        const group = groups.get(currency) || {
            currency,
            destinationLabels: [],
            countryCodes: [],
        };
        group.destinationLabels.push(label);
        if (!group.countryCodes.includes(countryCode)) {
            group.countryCodes.push(countryCode);
        }
        groups.set(currency, group);
    });

    return Array.from(groups.values()).sort((left, right) =>
        left.currency.localeCompare(right.currency)
    );
}

export async function resolveTripExchangeRates({
    baseCurrency,
    destinations,
    rateLoader = getExchangeRate,
}: {
    baseCurrency: string;
    destinations: TripExchangeDestination[];
    rateLoader?: ExchangeRateLoader;
}): Promise<TripExchangeRateData> {
    const normalizedBaseCurrency = normalizeCurrencyCode(baseCurrency);
    const groups = buildTripDestinationCurrencyGroups(destinations);
    const rates = await Promise.all(
        groups.map(async (group): Promise<TripExchangeRateRow> => {
            if (group.currency === normalizedBaseCurrency) {
                return {
                    ...group,
                    baseToDestinationRate: 1,
                    destinationToBaseRate: 1,
                };
            }

            try {
                const result = await rateLoader({
                    fromCurrency: normalizedBaseCurrency,
                    toCurrency: group.currency,
                });
                const rate = Number(result.rate);
                if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid rate");

                return {
                    ...group,
                    baseToDestinationRate: rate,
                    destinationToBaseRate: 1 / rate,
                };
            } catch {
                return {
                    ...group,
                    baseToDestinationRate: null,
                    destinationToBaseRate: null,
                };
            }
        })
    );

    return { baseCurrency: normalizedBaseCurrency, rates };
}

export async function loadMobileTripExchangeRates({
    supabase,
    userId,
    tripId,
    fallbackCurrency = "CAD",
    fallbackDestinations = [],
    rateLoader = getExchangeRate,
}: {
    supabase: SupabaseClient<Database>;
    userId: string;
    tripId: string;
    fallbackCurrency?: string;
    fallbackDestinations?: TripExchangeDestination[];
    rateLoader?: ExchangeRateLoader;
}): Promise<TripExchangeRateData> {
    const [financeResult, destinationResult] = await Promise.all([
        supabase
            .from("user_finance_settings")
            .select("home_currency")
            .eq("user_id", userId)
            .maybeSingle(),
        supabase
            .from("trip_destinations")
            .select("label,country_code,sort_order")
            .eq("trip_id", tripId)
            .order("sort_order", { ascending: true }),
    ]);

    if (financeResult.error) {
        console.warn("Could not load the default currency for the trip widget:", {
            code: financeResult.error.code,
            tripId,
        });
    }
    if (destinationResult.error) {
        console.warn("Could not load destination currencies for the trip widget:", {
            code: destinationResult.error.code,
            tripId,
        });
    }

    const savedDestinations = (destinationResult.data || []).map((destination) => ({
        label: destination.label,
        countryCode: destination.country_code,
    }));

    return resolveTripExchangeRates({
        baseCurrency:
            financeResult.data?.home_currency || normalizeCurrencyCode(fallbackCurrency),
        destinations: [...savedDestinations, ...fallbackDestinations],
        rateLoader,
    });
}
