import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImportTripTravelerSelector from "@/components/ImportTripTravelerSelector";
import {
    getAirportCodeCandidates,
    resolveImportedFlightTimezones,
} from "@/lib/importAirportTimezones";
import { getImportedFlightFingerprint } from "@/lib/importFlightMatching";
import {
    applyConfirmationPriceToFlights,
    getEditableImportedFlight,
    getImportedTravelerNames,
} from "@/lib/travelEmailImportReview";
import type { Database } from "@/src/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("travel email import review data", () => {
    it("matches legacy manual flights without depending on airport label formatting", () => {
        const manualFingerprint = getImportedFlightFingerprint({
            transport_number: null,
            title: "Transportation: full airport name to full airport name",
            notes: "Flight legs:\n\nLeg 1: full airport name → full airport name\nFlight: AC697",
            departure_date: "2026-09-24",
            departure_time: "17:40:00",
        });
        const importedFingerprint = getImportedFlightFingerprint({
            flightNumber: "AC 697",
            departureDate: "2026-09-24",
            departureTime: "17:40",
        });

        expect(importedFingerprint).toBe(manualFingerprint);
    });

    it("defaults imported confirmations to booked and captures baggage aliases", () => {
        const flight = getEditableImportedFlight("item-1", {
            flight_number: "AC692",
            departure_location: "YYT",
            arrival_location: "YYZ",
            status: "planned",
            baggage_allowance: "1 checked bag up to 23 kg and 1 carry-on",
        });

        expect(flight.status).toBe("booked");
        expect(flight.luggageRequirements).toContain("23 kg");
    });

    it("keeps structured luggage details out of editable flight notes", () => {
        const flight = getEditableImportedFlight("item-1", {
            luggage_requirements: "1 personal item only",
            notes: [
                "Luggage requirements:\n1 personal item only",
                "Request an aisle seat if one becomes available.",
            ].join("\n\n"),
        });

        expect(flight.luggageRequirements).toBe("1 personal item only");
        expect(flight.notes).toBe(
            "Request an aisle seat if one becomes available."
        );
    });

    it("preserves an explicit non-default status and reads passenger names", () => {
        const data = {
            status: "cancelled",
            traveler_names: ["Dill Doe", "Alex Guest"],
        };

        expect(getEditableImportedFlight("item-1", data).status).toBe("cancelled");
        expect(getImportedTravelerNames(data)).toEqual([
            "Dill Doe",
            "Alex Guest",
        ]);
    });

    it("shows a confirmation total on only the first flight segment", () => {
        const flights = [
            getEditableImportedFlight("item-1", {
                flight_number: "AC100",
                currency: "CAD",
            }),
            getEditableImportedFlight("item-2", {
                flight_number: "AC200",
                currency: "CAD",
            }),
        ];

        const pricedFlights = applyConfirmationPriceToFlights(flights, {
            summary: {
                booking_total: "CAD 1,234.56",
                currency: "CAD",
            },
        });

        expect(pricedFlights[0].cost).toBe("1234.56");
        expect(pricedFlights[0].currency).toBe("CAD");
        expect(pricedFlights[1].cost).toBe("");
    });

    it("moves an item-level booking total to the first of several flights", () => {
        const flights = [
            getEditableImportedFlight("item-1", { flight_number: "AC100" }),
            getEditableImportedFlight("item-2", {
                flight_number: "AC200",
                total_price: "$499.95 CAD",
                currency: "CAD",
            }),
        ];

        const pricedFlights = applyConfirmationPriceToFlights(flights, null);

        expect(pricedFlights[0].cost).toBe("499.95");
        expect(pricedFlights[1].cost).toBe("");
    });

    it("asks Gemini for airport-derived zones, baggage, travelers, and booked status", () => {
        const processor = read("lib/travelEmailImportProcessor.ts");

        expect(processor).toContain("Use IANA time zone IDs");
        expect(processor).toContain("derive it from the airport code");
        expect(processor).toContain("carry-on, personal-item, weight, quantity");
        expect(processor).toContain("traveler_names");
        expect(processor).toContain(
            "Never repeat airline, flight, route, date, time"
        );
        expect(processor).toContain("Default status to booked");
        expect(processor).toContain("overall booking_total");
        expect(processor).toContain("first flight item only");
    });
});

describe("airport timezone resolution", () => {
    it("recognizes IATA and ICAO codes embedded in airport labels", () => {
        expect(getAirportCodeCandidates("Toronto Pearson (YYZ)")).toContain("YYZ");
        expect(getAirportCodeCandidates("CYYT")).toEqual(["CYYT"]);
    });

    it("fills only missing zones from server-side airport coordinates", async () => {
        vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-server-key");
        const airportRows = [
            {
                ident: "CYYT",
                iata_code: "YYT",
                latitude_deg: 47.6,
                longitude_deg: -52.7,
            },
            {
                ident: "CYYZ",
                iata_code: "YYZ",
                latitude_deg: 43.7,
                longitude_deg: -79.6,
            },
        ];
        const query = {
            select: vi.fn(() => query),
            in: vi.fn().mockResolvedValue({ data: airportRows, error: null }),
        };
        const supabase = {
            from: vi.fn(() => query),
        } as unknown as SupabaseClient<Database>;
        const fetchMock = vi.fn((input: string | URL | Request) => {
            const url = String(input);
            const timeZoneId = url.includes("47.6")
                ? "America/St_Johns"
                : "America/Toronto";
            return Promise.resolve(
                new Response(JSON.stringify({ status: "OK", timeZoneId }), {
                    status: 200,
                })
            );
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await resolveImportedFlightTimezones(supabase, [
            {
                departureLocation: "YYT",
                arrivalLocation: "Toronto Pearson (YYZ)",
                departureDate: "2026-09-01",
                arrivalDate: "2026-09-01",
                departureTimezone: "",
                arrivalTimezone: "",
            },
        ]);

        expect(result).toEqual([
            {
                departureTimezone: "America/St_Johns",
                arrivalTimezone: "America/Toronto",
            },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain("key=test-server-key");
    });

});

describe("trip-aware import traveler selection", () => {
    const trips = [
        {
            id: "trip-one",
            title: "First trip",
            startDate: "2026-09-01",
            endDate: "2026-09-05",
            isRecommended: true,
            travelers: [
                {
                    type: "user" as const,
                    id: "user-one",
                    name: "Dill Doe",
                    secondaryLabel: "You",
                },
                {
                    type: "family" as const,
                    id: "family-one",
                    name: "Alex Doe",
                },
            ],
        },
        {
            id: "trip-two",
            title: "Second trip",
            startDate: "2026-10-01",
            endDate: "2026-10-05",
            isRecommended: false,
            travelers: [
                {
                    type: "user" as const,
                    id: "user-one",
                    name: "Dill Doe",
                    secondaryLabel: "You",
                },
                {
                    type: "user" as const,
                    id: "user-two",
                    name: "Sam Smith",
                },
            ],
        },
    ];

    it("preselects matching names and retains unmatched passengers as guests", () => {
        const { container } = render(
            <ImportTripTravelerSelector
                trips={trips}
                defaultTripId="trip-one"
                inferredTravelerNames={["Dill Doe", "Alex Guest"]}
                currentUserId="user-one"
                confidenceLabel="Recommended trip"
            />
        );

        expect(
            screen.getByRole("button", { name: /Dill Doe/ })
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Alex Guest")).toBeInTheDocument();
        expect(
            container.querySelector('input[name="traveler_user_ids"]')
        ).toHaveValue("user-one");
        expect(
            container.querySelector('input[name="traveler_guest_names"]')
        ).toHaveValue("Alex Guest");
    });

    it("updates the available traveler choices when the destination trip changes", () => {
        render(
            <ImportTripTravelerSelector
                trips={trips}
                defaultTripId="trip-one"
                inferredTravelerNames={[]}
                currentUserId="user-one"
                confidenceLabel="Recommended trip"
            />
        );

        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "trip-two" },
        });

        expect(screen.getByRole("button", { name: /Sam Smith/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Alex Doe/ })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Dill Doe/ })).toHaveAttribute(
            "aria-pressed",
            "true"
        );
    });

    it("hides technical payloads, uses a stable CTA, and writes traveler rows", () => {
        const page = read("app/imports/[importId]/page.tsx");
        const selector = read("components/ImportTripTravelerSelector.tsx");

        expect(page).not.toContain("Technical details");
        expect(page).not.toContain("Import summary payload");
        expect(page).toContain("Add to trip");
        expect(page).toContain('.from("transportation_item_travelers")');
        expect(page).toContain('.from("trip_item_participants")');
        expect(page).toContain('isJustCurrentUser ? "just_me" : "custom"');
        expect(page).toContain(
            "isTravelImportReviewSchemaMissingError(importItemsError)"
        );
        expect(page).not.toContain("Is this flight direct?");
        expect(page).toContain("prepareExistingImportedFlightMatches");
        expect(page).toContain("requiresSeparateInsert");
        expect(page).toContain('item.match_action === "separate"');
        expect(page).toContain("getImportedFlightMergePatch(data, existingFlight)");
        expect(page).toContain('if (status === "planned") return "booked"');
        expect(page).toContain("departure_google_place_id");
        expect(selector).toContain('name="traveler_user_ids"');
    });
});
