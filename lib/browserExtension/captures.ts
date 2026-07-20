import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";
import type {
    BrowserExtensionCapture,
    BrowserExtensionFlightCapture,
    BrowserExtensionFlightLeg,
    BrowserExtensionHotelCapture,
    BrowserExtensionTrip,
} from "@/lib/browserExtension/contracts";

type ServiceClient = SupabaseClient<Database>;

type TripRow = {
    id: string;
    slug: string;
    title: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    archived_at: string | null;
    user_id: string;
};

type JourneyScenario = {
    id: string;
    label: string;
    transportMode: "airplane";
    isRoundTrip: boolean;
    returnLegCount: number;
    cost: string;
    currency: string;
    pros: string[];
    cons: string[];
    legs: BrowserExtensionFlightLeg[];
};

function cleanText(value: unknown, maxLength: number) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

function nullableText(value: unknown, maxLength: number) {
    return cleanText(value, maxLength) || null;
}

function validDate(value: unknown) {
    const text = cleanText(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function validTime(value: unknown) {
    const text = cleanText(value, 5);
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function validCurrency(value: unknown) {
    const text = cleanText(value, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(text) ? text : null;
}

function validCoordinate(value: unknown, minimum: number, maximum: number) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum
        ? value
        : null;
}

function validPositiveNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.round(value * 100) / 100
        : null;
}

function validSourceUrl(value: unknown) {
    const text = cleanText(value, 2000);
    try {
        const url = new URL(text);
        return url.protocol === "https:" || url.protocol === "http:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

export async function getBrowserExtensionTrips(
    service: ServiceClient,
    userId: string
): Promise<BrowserExtensionTrip[]> {
    const [{ data: memberships }, { data: ownedTrips }] = await Promise.all([
        service
            .from("trip_members")
            .select("trip_id")
            .eq("user_id", userId)
            .eq("status", "active"),
        service
            .from("trips")
            .select("id,slug,title,destination,start_date,end_date,archived_at,user_id")
            .eq("user_id", userId)
            .is("archived_at", null),
    ]);
    const memberTripIds = Array.from(
        new Set(
            (memberships || [])
                .map((row: { trip_id?: string | null }) => row.trip_id)
                .filter((id: unknown): id is string => typeof id === "string")
        )
    );
    const { data: memberTrips } = memberTripIds.length
        ? await service
              .from("trips")
              .select("id,slug,title,destination,start_date,end_date,archived_at,user_id")
              .in("id", memberTripIds)
              .is("archived_at", null)
        : { data: [] };
    const byId = new Map<string, TripRow>();

    ([...(ownedTrips || []), ...(memberTrips || [])] as TripRow[]).forEach((trip) =>
        byId.set(trip.id, trip)
    );

    return Array.from(byId.values())
        .sort((a, b) =>
            String(a.start_date || "9999-12-31").localeCompare(
                String(b.start_date || "9999-12-31")
            )
        )
        .map((trip) => ({
            id: trip.id,
            slug: trip.slug,
            title: trip.title,
            destination: trip.destination,
            startDate: trip.start_date,
            endDate: trip.end_date,
        }));
}

export async function getAccessibleTrip(
    service: ServiceClient,
    userId: string,
    tripId: string
) {
    const { data: trip } = await service
        .from("trips")
        .select("id,slug,title,destination,start_date,end_date,archived_at,user_id")
        .eq("id", tripId)
        .is("archived_at", null)
        .maybeSingle();

    if (!trip) return null;
    if ((trip as TripRow).user_id === userId) return trip as TripRow;

    const { data: membership } = await service
        .from("trip_members")
        .select("id")
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    return membership ? (trip as TripRow) : null;
}

function getHotelNotes(capture: BrowserExtensionHotelCapture) {
    return [
        capture.roomType ? `Room: ${cleanText(capture.roomType, 200)}` : "",
        capture.guests ? `Guests: ${Math.round(capture.guests)}` : "",
        capture.rooms ? `Rooms: ${Math.round(capture.rooms)}` : "",
        capture.cancellationPolicy
            ? `Cancellation: ${cleanText(capture.cancellationPolicy, 800)}`
            : "",
        capture.paymentTerms
            ? `Payment: ${cleanText(capture.paymentTerms, 500)}`
            : "",
        capture.price.amount
            ? `Captured price: ${[
                  validCurrency(capture.price.currency),
                  validPositiveNumber(capture.price.amount),
              ]
                  .filter(Boolean)
                  .join(" ")} (${capture.price.basis.replace("_", " ")}).`
            : "",
        capture.confirmationNumber
            ? `Confirmation: ${cleanText(capture.confirmationNumber, 100)}`
            : "",
        `Captured from ${cleanText(capture.source.siteName, 100) || "travel website"} on ${cleanText(capture.source.capturedAt, 40) || new Date().toISOString()}.`,
    ]
        .filter(Boolean)
        .join("\n\n");
}

function getStayNightCount(checkInDate: string, checkOutDate: string) {
    const checkIn = new Date(`${checkInDate}T00:00:00Z`).getTime();
    const checkOut = new Date(`${checkOutDate}T00:00:00Z`).getTime();
    const nights = Math.round((checkOut - checkIn) / 86_400_000);
    return Number.isSafeInteger(nights) && nights > 0 ? nights : 0;
}

async function saveHotelCapture({
    service,
    userId,
    trip,
    capture,
}: {
    service: ServiceClient;
    userId: string;
    trip: TripRow;
    capture: BrowserExtensionHotelCapture;
}) {
    const name = cleanText(capture.name, 200);
    const checkInDate = validDate(capture.checkInDate);
    const checkOutDate = validDate(capture.checkOutDate);
    const sourceUrl = validSourceUrl(capture.source.url);

    if (!name || !checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
        throw new Error("Hotel name and valid check-in/check-out dates are required.");
    }
    if (!sourceUrl) throw new Error("The source page URL is invalid.");
    const capturedAmount = validPositiveNumber(capture.price.amount);
    const nightCount = getStayNightCount(checkInDate, checkOutDate);
    const storedCost =
        capturedAmount && capture.price.basis === "per_night" && nightCount
            ? Math.round(capturedAmount * nightCount * 100) / 100
            : capturedAmount;

    const { data, error } = await service
        .from("trip_accommodations")
        .insert({
            trip_id: trip.id,
            created_by: userId,
            hotel_name: name,
            google_place_id: nullableText(capture.googlePlaceId, 255),
            address: nullableText(capture.address, 500),
            city: nullableText(capture.city, 160),
            region: nullableText(capture.region, 160),
            country: nullableText(capture.country, 160),
            postal_code: nullableText(capture.postalCode, 40),
            latitude: validCoordinate(capture.latitude, -90, 90),
            longitude: validCoordinate(capture.longitude, -180, 180),
            check_in_date: checkInDate,
            check_out_date: checkOutDate,
            free_cancellation_ends_on: validDate(capture.freeCancellationEndsOn) || null,
            accommodation_type: "hotel",
            status: capture.captureKind === "confirmed" ? "booked" : "tentative",
            website: sourceUrl,
            cost: storedCost,
            currency: validCurrency(capture.price.currency),
            is_private: false,
            audience_mode: "everyone",
            notes: getHotelNotes(capture),
        })
        .select("id")
        .single();

    if (error) throw new Error(`Could not add the stay to VAIVIA: ${error.message}`);

    return {
        ok: true as const,
        recordId: data.id as string,
        destinationUrl:
            capture.captureKind === "confirmed"
                ? `/trips/${trip.slug}/accommodations`
                : `/trips/${trip.slug}/accommodations?tab=planning`,
    };
}

function normalizeFlightLeg(leg: BrowserExtensionFlightLeg): BrowserExtensionFlightLeg {
    return {
        departureLocation: cleanText(leg.departureLocation, 160),
        arrivalLocation: cleanText(leg.arrivalLocation, 160),
        departureDate: validDate(leg.departureDate),
        arrivalDate: validDate(leg.arrivalDate),
        departureTime: validTime(leg.departureTime),
        arrivalTime: validTime(leg.arrivalTime),
        departureTimezone: cleanText(leg.departureTimezone, 80),
        arrivalTimezone: cleanText(leg.arrivalTimezone, 80),
        departureTerminal: cleanText(leg.departureTerminal, 80),
        arrivalTerminal: cleanText(leg.arrivalTerminal, 80),
        flightNumber: cleanText(leg.flightNumber, 30).toUpperCase(),
        airlineName: cleanText(leg.airlineName, 160),
        cost: cleanText(leg.cost, 30),
        currency: validCurrency(leg.currency) || "",
    };
}

function validateFlightLeg(leg: BrowserExtensionFlightLeg) {
    return Boolean(
        leg.departureLocation &&
            leg.arrivalLocation &&
            leg.departureDate &&
            leg.arrivalDate &&
            leg.departureTime &&
            leg.arrivalTime
    );
}

async function saveFlightComparison({
    service,
    userId,
    trip,
    capture,
}: {
    service: ServiceClient;
    userId: string;
    trip: TripRow;
    capture: BrowserExtensionFlightCapture;
}) {
    const legs = capture.legs.map(normalizeFlightLeg).filter(validateFlightLeg);
    if (!legs.length) throw new Error("At least one complete flight segment is required.");

    const { data: planningState } = await service
        .from("trip_journey_planning_states")
        .select("scenarios")
        .eq("trip_id", trip.id)
        .maybeSingle();
    const scenarios = Array.isArray(planningState?.scenarios)
        ? (planningState.scenarios as unknown as JourneyScenario[])
        : [];
    const amount = validPositiveNumber(capture.price.amount);
    const currency = validCurrency(capture.price.currency) || "CAD";
    const scenario: JourneyScenario = {
        id: crypto.randomUUID(),
        label: cleanText(capture.label, 120) || `Flight option ${scenarios.length + 1}`,
        transportMode: "airplane",
        isRoundTrip: Boolean(capture.isRoundTrip),
        returnLegCount: capture.isRoundTrip
            ? Math.min(Math.max(Math.round(capture.returnLegCount || 1), 1), legs.length)
            : 0,
        cost: amount ? String(amount) : "",
        currency,
        pros: [],
        cons: [],
        legs,
    };
    const { error } = await service.from("trip_journey_planning_states").upsert(
        {
            trip_id: trip.id,
            scenarios: [...scenarios, scenario],
            updated_by: userId,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id" }
    );

    if (error) throw new Error(`Could not add the flight option to VAIVIA: ${error.message}`);

    return {
        ok: true as const,
        recordId: scenario.id,
        destinationUrl: `/trips/${trip.slug}?tab=journey-planning`,
    };
}

async function saveConfirmedFlight({
    service,
    userId,
    trip,
    capture,
}: {
    service: ServiceClient;
    userId: string;
    trip: TripRow;
    capture: BrowserExtensionFlightCapture;
}) {
    const legs = capture.legs.map(normalizeFlightLeg).filter(validateFlightLeg);
    if (!legs.length) throw new Error("At least one complete flight segment is required.");
    const total = validPositiveNumber(capture.price.amount);
    const currency = validCurrency(capture.price.currency);
    const sourceUrl = validSourceUrl(capture.source.url);
    const confirmationNumber = nullableText(capture.confirmationNumber, 100);
    const payloads = legs.map((leg, index) => {
        const flightNumber = leg.flightNumber.replace(/[\s-]+/g, "");
        const providerCode = flightNumber.match(/^[A-Z0-9]{2,3}/)?.[0] || null;

        return {
            trip_id: trip.id,
            created_by: userId,
            title: `${flightNumber || "Flight"} ${leg.departureLocation} to ${leg.arrivalLocation}`,
            transport_type: "airplane",
            status: "booked",
            departure_location: leg.departureLocation,
            arrival_location: leg.arrivalLocation,
            departure_date: leg.departureDate,
            arrival_date: leg.arrivalDate,
            departure_time: leg.departureTime,
            arrival_time: leg.arrivalTime,
            departure_timezone: leg.departureTimezone || null,
            arrival_timezone: leg.arrivalTimezone || null,
            departure_terminal: leg.departureTerminal || null,
            arrival_terminal: leg.arrivalTerminal || null,
            provider_name: leg.airlineName || null,
            provider_code: providerCode,
            transport_number: flightNumber || null,
            reservation_code: confirmationNumber,
            cabin_class: nullableText(capture.cabinClass, 100),
            baggage_info: nullableText(capture.baggageInfo, 500),
            booking_url: sourceUrl,
            route_stops: [
                { order: 0, label: leg.departureLocation },
                { order: 1, label: leg.arrivalLocation },
            ],
            cost: index === 0 ? total : null,
            currency: index === 0 && total ? currency : null,
            audience_mode: "everyone",
            is_private: false,
            notes: `Imported from ${cleanText(capture.source.siteName, 100) || "travel website"} using the VAIVIA browser extension.`,
        };
    });
    const { data, error } = await service
        .from("transportation_items")
        .insert(payloads)
        .select("id")
        .limit(1)
        .single();

    if (error) throw new Error(`Could not add the booked flight to VAIVIA: ${error.message}`);

    return {
        ok: true as const,
        recordId: data.id as string,
        destinationUrl: `/trips/${trip.slug}?tab=journey`,
    };
}

export async function saveBrowserExtensionCapture({
    service,
    userId,
    trip,
    capture,
}: {
    service: ServiceClient;
    userId: string;
    trip: TripRow;
    capture: BrowserExtensionCapture;
}) {
    if (capture.type === "hotel") {
        return saveHotelCapture({ service, userId, trip, capture });
    }

    return capture.captureKind === "confirmed"
        ? saveConfirmedFlight({ service, userId, trip, capture })
        : saveFlightComparison({ service, userId, trip, capture });
}
