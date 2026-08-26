import { describe, expect, it } from "vitest";
import {
    extractFlightNumber,
    getCanonicalFlightPersistenceFields,
    getFlightTitleLabel,
    getTransportationFlightNumber,
} from "@/lib/transport/flightFields";

describe("transportation flight fields", () => {
    it("extracts a full flight number instead of reducing it to the airline code", () => {
        expect(extractFlightNumber("JX717 Taiwan Taoyuan to Hanoi")).toBe("JX717");
        expect(extractFlightNumber("Air Canada AC690 YYZ to YYT")).toBe("AC690");
    });

    it("prefers the canonical Supabase transport number", () => {
        expect(
            getTransportationFlightNumber({
                transport_number: "AC697",
                flight_number: "AC999",
                title: "Flight: YYT to YYZ",
            })
        ).toBe("AC697");
    });

    it("maps the web form fields to the canonical Supabase columns", () => {
        expect(
            getCanonicalFlightPersistenceFields({
                airlineName: "STARLUX Airlines",
                airlineCode: "JX",
                flightNumber: "JX717",
            })
        ).toEqual({
            provider_name: "STARLUX Airlines",
            provider_code: "JX",
            transport_number: "JX717",
        });
    });

    it("recovers a flight number from structured notes when old rows lack it", () => {
        expect(
            getTransportationFlightNumber({
                title: "Transportation: Toronto to Taipei",
                notes: "Scenario leg 2 of 3\r\nFlight: BR35\r\nAirline: EVA Air / BR",
            })
        ).toBe("BR35");
    });

    it("does not replace a title containing the flight number with only an airline code", () => {
        expect(
            getFlightTitleLabel({
                airlineCode: "JX",
                title: "JX717 Taiwan Taoyuan to Hanoi",
            })
        ).toBe("JX717 Taiwan Taoyuan to Hanoi");
    });

    it("does not repeat an airline code already included in the flight number", () => {
        expect(
            getFlightTitleLabel({
                airlineCode: "JX",
                flightNumber: "JX717",
                title: "Flight to Hanoi",
            })
        ).toBe("JX717");
    });
});
