import { describe, expect, it } from "vitest";

import { parseTripDestinationsFormData } from "@/lib/tripDestinations";

describe("trip destination country metadata", () => {
    it("stores normalized Google country short codes with each destination", () => {
        const formData = new FormData();
        formData.set(
            "destination_places_json",
            JSON.stringify([
                {
                    label: "Toronto",
                    placeId: "google-place-toronto",
                    countryCode: "ca",
                    countryName: "Canada",
                    latitude: 43.6532,
                    longitude: -79.3832,
                },
                {
                    label: "Lisbon",
                    placeId: "google-place-lisbon",
                    countryCode: "PT",
                    countryName: "Portugal",
                },
            ])
        );

        expect(parseTripDestinationsFormData(formData)).toEqual([
            {
                label: "Toronto",
                placeId: "google-place-toronto",
                countryCode: "CA",
                countryName: "Canada",
                latitude: 43.6532,
                longitude: -79.3832,
            },
            {
                label: "Lisbon",
                placeId: "google-place-lisbon",
                countryCode: "PT",
                countryName: "Portugal",
                latitude: null,
                longitude: null,
            },
        ]);
    });

    it("keeps legacy destinations readable when no country code exists", () => {
        const formData = new FormData();
        formData.set("destination", "Toronto, Lisbon");

        expect(parseTripDestinationsFormData(formData)).toEqual([
            {
                label: "Toronto",
                placeId: null,
                countryCode: null,
                countryName: null,
                latitude: null,
                longitude: null,
            },
            {
                label: "Lisbon",
                placeId: null,
                countryCode: null,
                countryName: null,
                latitude: null,
                longitude: null,
            },
        ]);
    });
});
