import { afterEach, describe, expect, it, vi } from "vitest";

import {
    getExchangeRateWithClient,
    type UntypedSupabaseClient,
} from "@/lib/budgetServer";

function createSupabase(cachedRate?: number) {
    const maybeSingle = vi.fn(async () => ({
        data: cachedRate ? { rate: cachedRate } : null,
        error: null,
    }));
    const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle,
        upsert: vi.fn(async () => ({ data: null, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);

    return {
        client: {
            from: vi.fn(() => query),
        } as unknown as UntypedSupabaseClient,
        query,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("budget exchange-rate provider", () => {
    it("uses Frankfurter v2 for the latest rate and caches its flat response", async () => {
        const { client, query } = createSupabase();
        const fetchMock = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit) => {
                void _input;
                void _init;
                return new Response(
                    JSON.stringify({
                        date: "2026-10-15",
                        base: "USD",
                        quote: "CAD",
                        rate: 1.38,
                    }),
                    { status: 200 }
                );
            }
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            getExchangeRateWithClient(client, {
                fromCurrency: "usd",
                toCurrency: "cad",
            })
        ).resolves.toEqual({ rate: 1.38, provider: "frankfurter" });

        const requestedUrl = fetchMock.mock.calls[0]?.[0];
        expect(String(requestedUrl)).toBe(
            "https://api.frankfurter.dev/v2/rate/USD/CAD"
        );
        expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
            cache: "no-store",
        });
        expect(query.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                base_currency: "USD",
                target_currency: "CAD",
                rate: 1.38,
                provider: "frankfurter",
            }),
            {
                onConflict:
                    "rate_date,base_currency,target_currency,provider",
            }
        );
    });

    it("requests the expense date for historical rates", async () => {
        const { client } = createSupabase();
        const fetchMock = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit) => {
                void _input;
                void _init;
                return new Response(JSON.stringify({ rate: 0.93 }), {
                    status: 200,
                });
            }
        );
        vi.stubGlobal("fetch", fetchMock);

        await getExchangeRateWithClient(client, {
            date: "2020-01-02",
            fromCurrency: "CAD",
            toCurrency: "USD",
        });

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api.frankfurter.dev/v2/rate/CAD/USD?date=2020-01-02"
        );
    });

    it("uses a cached rate without calling the provider", async () => {
        const { client } = createSupabase(0.72);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            getExchangeRateWithClient(client, {
                date: "2020-01-02",
                fromCurrency: "CAD",
                toCurrency: "USD",
            })
        ).resolves.toEqual({ rate: 0.72, provider: "frankfurter" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not call the provider when both currencies match", async () => {
        const { client } = createSupabase();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            getExchangeRateWithClient(client, {
                fromCurrency: "CAD",
                toCurrency: "CAD",
            })
        ).resolves.toEqual({ rate: 1, provider: "identity" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
