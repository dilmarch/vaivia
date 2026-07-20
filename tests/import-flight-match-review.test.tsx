import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ImportFlightMatchReview from "@/components/ImportFlightMatchReview";
import {
    findImportedFlightMatch,
    getImportedFlightMergePatch,
} from "@/lib/importFlightMatching";
import type { EditableImportedFlight } from "@/lib/travelEmailImportReview";

afterEach(() => cleanup());

const importedFlight: EditableImportedFlight = {
    itemId: "import-item-a",
    isPrivate: "false",
    airlineName: "Air Canada",
    airlineCode: "AC",
    flightNumber: "AC697",
    departureLocation: "YYT",
    departureFormattedAddress: "",
    departureGooglePlaceId: "",
    departureLat: "",
    departureLng: "",
    arrivalLocation: "YYZ",
    arrivalFormattedAddress: "",
    arrivalGooglePlaceId: "",
    arrivalLat: "",
    arrivalLng: "",
    departureDate: "2026-09-24",
    departureTime: "17:40",
    arrivalDate: "2026-09-24",
    arrivalTime: "19:40",
    departureTerminal: "1",
    arrivalTerminal: "1",
    departureTimezone: "America/St_Johns",
    arrivalTimezone: "America/Toronto",
    seatNumber: "12A",
    cabinClass: "Economy",
    reservationCode: "BOOKED1",
    cost: "320",
    currency: "CAD",
    visaRequirements: "",
    luggageRequirements: "One checked bag",
    notes: "",
    status: "booked",
};

describe("import flight duplicate review", () => {
    it("shows a field comparison and defaults to a conservative merge", () => {
        render(
            <ImportFlightMatchReview
                itemId="import-item-a"
                importedFlight={importedFlight}
                defaultTripId="trip-a"
                tripHrefsById={{ "trip-a": "/trips/trip-a?tab=journey" }}
                flightRecordsByTrip={{
                    "trip-a": [{
                        id: "flight-a",
                        status: "planned",
                        transport_number: "AC697",
                        departure_location: "St. John's International Airport",
                        arrival_location: "Toronto Pearson International Airport",
                        departure_date: "2026-09-24",
                        departure_time: "17:40",
                        arrival_date: "2026-09-24",
                        arrival_time: "19:40",
                    }],
                }}
            />
        );

        expect(screen.getByText("Possible duplicate found")).toBeInTheDocument();
        expect(screen.getByText("Will mark Booked")).toBeInTheDocument();
        expect(screen.getAllByText("Different · existing kept").length).toBeGreaterThan(0);
        expect(screen.getByRole("radio", { name: /Merge with existing/i })).toBeChecked();

        fireEvent.click(screen.getByRole("radio", { name: /Add separately/i }));
        expect(screen.getByRole("radio", { name: /Add separately/i })).toBeChecked();
    });

    it("updates the match when the selected trip changes", () => {
        const { container } = render(
            <ImportFlightMatchReview
                itemId="import-item-a"
                importedFlight={importedFlight}
                defaultTripId="trip-a"
                tripHrefsById={{}}
                flightRecordsByTrip={{
                    "trip-a": [{ id: "flight-a", status: "planned" }],
                }}
            />
        );

        fireEvent(
            window,
            new CustomEvent("vaivia:import-trip-change", {
                detail: { tripId: "trip-b" },
            })
        );

        expect(screen.queryByText("Possible duplicate found")).not.toBeInTheDocument();
        expect(
            container.querySelector('input[name="match_action_import-item-a"]')
        ).toHaveValue("create");
    });

    it("detects a duplicate after the reviewed flight number and date are corrected", () => {
        render(
            <form>
                <ImportFlightMatchReview
                    itemId="import-item-a"
                    importedFlight={{
                        ...importedFlight,
                        flightNumber: "WRONG1",
                        departureDate: "2026-09-25",
                    }}
                    defaultTripId="trip-a"
                    tripHrefsById={{}}
                    flightRecordsByTrip={{
                        "trip-a": [
                            {
                                id: "flight-a",
                                status: "planned",
                                transport_number: "AC697",
                                departure_date: "2026-09-24",
                                departure_time: "17:40:00",
                            },
                        ],
                    }}
                />
                <input
                    aria-label="Flight number"
                    name="import-item-a:leg_0_flight_number"
                    defaultValue="WRONG1"
                />
                <input
                    aria-label="Departure date"
                    name="import-item-a:leg_0_departure_date"
                    defaultValue="2026-09-25"
                />
                <input
                    name="import-item-a:leg_0_departure_time"
                    defaultValue="17:35"
                />
            </form>
        );

        fireEvent.change(screen.getByLabelText("Flight number"), {
            target: { value: "AC 697" },
        });
        fireEvent.change(screen.getByLabelText("Departure date"), {
            target: { value: "2026-09-24" },
        });

        expect(screen.getByText("Possible duplicate found")).toBeInTheDocument();
        expect(screen.getByText("Will mark Booked")).toBeInTheDocument();
    });
});

describe("import flight matching", () => {
    it("matches the same flight number and departure date despite a time difference", () => {
        const match = findImportedFlightMatch(
            [
                {
                    id: "flight-a",
                    title: "Air Canada AC697",
                    departure_date: "2026-09-24",
                    departure_time: "17:40:00",
                },
            ],
            {
                flightNumber: "AC 697",
                departureDate: "2026-09-24",
                departureTime: "17:35",
            }
        );

        expect(match?.id).toBe("flight-a");
    });

    it("does not match the same flight number on a different date", () => {
        expect(
            findImportedFlightMatch(
                [
                    {
                        id: "flight-a",
                        transport_number: "AC697",
                        departure_date: "2026-09-24",
                    },
                ],
                {
                    flightNumber: "AC697",
                    departureDate: "2026-09-25",
                }
            )
        ).toBeNull();
    });
});

describe("import flight merge patch", () => {
    it("fills missing imported details, preserves conflicts, and books planned matches", () => {
        const patch = getImportedFlightMergePatch(
            {
                flight_number: "AC697",
                departure_location: "YYT",
                arrival_location: "YYZ",
                reservation_code: "BOOKED1",
                luggage_requirements: "One checked bag",
                cost: "320",
                currency: "CAD",
            },
            {
                status: "planned",
                departure_location: "St. John's International Airport",
                arrival_location: "Toronto Pearson International Airport",
                cost: 275,
                currency: "CAD",
            }
        );

        expect(patch.status).toBe("booked");
        expect(patch.departure_location).toBe("St. John's International Airport");
        expect(patch.arrival_location).toBe("Toronto Pearson International Airport");
        expect(patch.reservation_code).toBe("BOOKED1");
        expect(patch.baggage_info).toBe("One checked bag");
        expect(patch.cost).toBe(275);
    });

    it("does not downgrade an existing confirmed flight", () => {
        expect(
            getImportedFlightMergePatch({}, { status: "confirmed" }).status
        ).toBe("confirmed");
    });

    it("uses the imported currency when it fills a missing cost", () => {
        const patch = getImportedFlightMergePatch(
            { cost: "150", currency: "USD" },
            { cost: null, currency: "CAD" }
        );

        expect(patch.cost).toBe(150);
        expect(patch.currency).toBe("USD");
    });
});
