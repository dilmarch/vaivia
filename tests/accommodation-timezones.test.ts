import { afterEach, describe, expect, it, vi } from "vitest";
import {
    clearAccommodationTimezoneCacheForTests,
    resolveAccommodationTimezone,
    resolveAccommodationTimezones,
} from "@/lib/accommodationTimezones";

afterEach(() => {
    clearAccommodationTimezoneCacheForTests();
});

describe("stay timezone resolution", () => {
    it("resolves the hotel timezone from its saved coordinates", async () => {
        const fetcher = vi.fn(async () =>
            new Response(JSON.stringify({ timeZoneId: "America/Toronto" }), {
                status: 200,
            })
        ) as unknown as typeof fetch;

        await expect(
            resolveAccommodationTimezones(
                [
                    {
                        id: "stay-1",
                        latitude: 43.6532,
                        longitude: -79.3832,
                    },
                ],
                fetcher
            )
        ).resolves.toEqual({ "stay-1": "America/Toronto" });

        expect(fetcher).toHaveBeenCalledWith(
            "/api/timezone",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ lat: 43.6532, lng: -79.3832 }),
            })
        );
    });

    it("reuses one timezone lookup for stays at the same coordinates", async () => {
        const fetcher = vi.fn(async () =>
            new Response(JSON.stringify({ timeZoneId: "Europe/Berlin" }), {
                status: 200,
            })
        ) as unknown as typeof fetch;
        const location = { latitude: 52.52, longitude: 13.405 };

        await Promise.all([
            resolveAccommodationTimezone({ id: "stay-1", ...location }, fetcher),
            resolveAccommodationTimezone({ id: "stay-2", ...location }, fetcher),
        ]);

        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ id: "missing", latitude: null, longitude: null }, 0],
        [{ id: "invalid", latitude: 200, longitude: 13.405 }, 0],
    ])("skips a stay without usable coordinates", async (stay, calls) => {
        const fetcher = vi.fn() as unknown as typeof fetch;

        await expect(resolveAccommodationTimezone(stay, fetcher)).resolves.toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(calls);
    });

    it("rejects malformed or unsupported timezone responses safely", async () => {
        const fetcher = vi.fn(async () =>
            new Response(JSON.stringify({ timeZoneId: "Not/A_Timezone" }), {
                status: 200,
            })
        ) as unknown as typeof fetch;

        await expect(
            resolveAccommodationTimezone(
                { id: "stay-1", latitude: 43.6532, longitude: -79.3832 },
                fetcher
            )
        ).resolves.toBeNull();
    });
});
