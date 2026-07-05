import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ItineraryCalendarItem } from "@/components/ItineraryCalendar";
import ItineraryTabs from "@/components/ItineraryTabs";
import TripDocumentTitle from "@/components/TripDocumentTitle";
import TripDestinationLine from "@/components/TripDestinationLine";
import TripHeaderCover from "@/components/TripHeaderCover";
import {
    formatIdeaDayLabel,
    formatIdeaTimeLabel,
    normalizeTripIdea,
} from "@/lib/tripIdeas";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
};

type ItineraryItemPayload = {
    trip_id: string;
    title: string;
    category: string;
    status: string;
    item_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string;
    formatted_address: string | null;
    google_place_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
    timezone: string | null;
    timezone_source: string;
    url: string | null;
    notes: string;
    ticket_website?: string | null;
    location_website?: string | null;
    cover_image_url?: string | null;
    transportation_mode?: string | null;
    airline_name?: string | null;
    airline_code?: string | null;
    flight_number?: string | null;
};

type TransportationItemPayload = Record<string, string | number | null>;

type TripIdeaPayload = {
    user_id: string;
    trip_id: string;
    title: string;
    description: string | null;
    category: string;
    tags: string[];
    days_available: string[];
    time_of_day: string[];
    opens_at: string | null;
    closes_at: string | null;
    address: string | null;
    formatted_address: string | null;
    google_place_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
    location_city: string | null;
    is_24_hours: boolean;
    ticket_type: string | null;
    age_policy: string | null;
    dress_code: string | null;
    other_notes: string | null;
    is_archived?: boolean;
};

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("trip_cover_image_url") ||
                message.includes("schema cache")))
    );
}

function isMissingOptionalColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
            (message.includes("column") &&
                (message.includes("ticket_website") ||
                    message.includes("location_website") ||
                    message.includes("cover_image_url") ||
                    message.includes("transportation_mode") ||
                    message.includes("airline_name") ||
                    message.includes("airline_code") ||
                    message.includes("flight_number") ||
                    message.includes("schema cache")))
    );
}

function removeOptionalLinkColumns(payload: ItineraryItemPayload) {
    const {
        ticket_website,
        location_website,
        cover_image_url,
        transportation_mode,
        airline_name,
        airline_code,
        flight_number,
        ...fallbackPayload
    } = payload;

    void ticket_website;
    void location_website;
    void cover_image_url;
    void transportation_mode;
    void airline_name;
    void airline_code;
    void flight_number;

    return fallbackPayload;
}

function isCategoryConstraintError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "23514" &&
        (message.includes("category") || message.includes("itinerary_items"))
    );
}

function getTransportationDbStatus(rawStatus: string) {
    return rawStatus === "planned" ||
        rawStatus === "booked" ||
        rawStatus === "confirmed" ||
        rawStatus === "cancelled" ||
        rawStatus === "completed"
        ? rawStatus
        : "planned";
}

async function insertItineraryPayloadWithFallback(
    payload: ItineraryItemPayload,
    context: string
) {
    const supabase = await createClient();
    const fallbackCategoryPayload = {
        ...payload,
        category: payload.category === "transportation" ? "travel" : payload.category,
    };
    const attempts = [
        payload,
        removeOptionalLinkColumns(payload),
        fallbackCategoryPayload,
        removeOptionalLinkColumns(fallbackCategoryPayload),
    ];

    let lastError: { code?: string; message?: string } | null = null;

    for (const [index, attempt] of attempts.entries()) {
        const { error } = await supabase.from("itinerary_items").insert(attempt);

        if (!error) return null;

        lastError = error;

        const shouldTryNext =
            (index < 2 && isMissingOptionalColumnError(error)) ||
            isCategoryConstraintError(error);

        if (!shouldTryNext) break;

        console.warn(`${context} insert fallback ${index + 1} triggered.`, error);
    }

    return lastError;
}

function getMissingColumnName(error: { message?: string; details?: string }) {
    const text = `${error.message || ""} ${error.details || ""}`;
    return (
        text.match(/'([^']+)' column/)?.[1] ||
        text.match(/column "([^"]+)"/)?.[1] ||
        ""
    );
}

async function insertTransportationPayloadWithFallback(
    payload: TransportationItemPayload
) {
    const supabase = await createClient();
    let attempt = { ...payload };
    let lastError: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
    } | null = null;

    for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
        const { error } = await supabase.from("transportation_items").insert(attempt);

        if (!error) return null;

        lastError = error;

        if (error.code !== "42703" && error.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in attempt)) break;

        console.warn(
            `Transportation items table is missing optional column "${missingColumn}". Retrying without it.`,
            error
        );

        const { [missingColumn]: _removedColumn, ...nextAttempt } = attempt;
        void _removedColumn;
        attempt = nextAttempt;
    }

    return lastError;
}

async function updateTransportationPayloadWithFallback(
    payload: TransportationItemPayload,
    itemId: string,
    tripId: string
) {
    const supabase = await createClient();
    let attempt = { ...payload };
    let lastError: { code?: string; message?: string; details?: string } | null = null;

    for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
        const { error } = await supabase
            .from("transportation_items")
            .update(attempt)
            .eq("id", itemId)
            .eq("trip_id", tripId);

        if (!error) return null;

        lastError = error;

        if (error.code !== "42703" && error.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in attempt)) break;

        console.warn(
            `Transportation items table is missing optional column "${missingColumn}". Retrying update without it.`,
            error
        );

        const { [missingColumn]: _removedColumn, ...nextAttempt } = attempt;
        void _removedColumn;
        attempt = nextAttempt;
    }

    return lastError;
}

function getStringValue(
    record: Record<string, unknown>,
    keys: string[],
    fallback = ""
) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value;
        if (typeof value === "number") return String(value);
    }

    return fallback;
}

function normalizeTransportationItem(
    item: Record<string, unknown>
): ItineraryCalendarItem {
    const id = getStringValue(item, ["id"], crypto.randomUUID());
    const mode = getStringValue(item, [
        "transportation_mode",
        "mode",
        "type",
    ]);
    const departureLocation = getStringValue(item, [
        "departure_location",
        "origin",
        "from_location",
    ]);
    const arrivalLocation = getStringValue(item, [
        "arrival_location",
        "destination",
        "to_location",
    ]);
    const flightNumber = getStringValue(item, ["flight_number"]);
    const airlineName = getStringValue(item, ["airline_name"]);
    const airlineCode = getStringValue(item, ["airline_code"]);
    const title =
        getStringValue(item, ["title"]) ||
        (flightNumber
            ? `${flightNumber} ${departureLocation || ""} to ${
                  arrivalLocation || ""
              }`.trim()
            : `${mode || "Transportation"}: ${departureLocation || "Departure"} to ${
                  arrivalLocation || "Arrival"
              }`);

    return {
        id: `transportation:${id}`,
        title,
        item_date: getStringValue(item, ["item_date", "departure_date", "date"]),
        end_date: getStringValue(item, ["end_date", "arrival_date"]) || null,
        start_time: getStringValue(item, ["start_time", "departure_time"]) || null,
        end_time: getStringValue(item, ["end_time", "arrival_time"]) || null,
        category: "transportation",
        status: getStringValue(item, ["status"], "tentative"),
        location:
            getStringValue(item, ["location"]) ||
            [departureLocation, arrivalLocation].filter(Boolean).join(" → "),
        timezone:
            getStringValue(item, [
                "timezone",
                "departure_timezone",
                "time_zone",
            ]) || null,
        notes: getStringValue(item, ["notes"]) || null,
        transportation_mode: mode || "airplane",
        airline_name: airlineName || null,
        airline_code: airlineCode || null,
        flight_number: flightNumber || null,
        duration: getStringValue(item, ["duration"]) || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        departure_timezone:
            getStringValue(item, ["departure_timezone", "timezone"]) || null,
        arrival_timezone: getStringValue(item, ["arrival_timezone"]) || null,
        departure_terminal: getStringValue(item, ["departure_terminal"]) || null,
        arrival_terminal: getStringValue(item, ["arrival_terminal"]) || null,
        source_table: "transportation_items",
    };
}

function parseFormStringArray(formData: FormData, name: string) {
    return formData
        .getAll(name)
        .map((value) => String(value).trim())
        .filter(Boolean);
}

function parseTagsInput(value: string) {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function getIdeaPayload(formData: FormData, userId: string): TripIdeaPayload {
    const tags = parseTagsInput((formData.get("tags") as string) || "");

    return {
        user_id: userId,
        trip_id: formData.get("trip_id") as string,
        title: ((formData.get("title") as string) || "").trim(),
        description: ((formData.get("description") as string) || "").trim() || null,
        category: (formData.get("category") as string) || "Other",
        tags,
        days_available: parseFormStringArray(formData, "days_available"),
        time_of_day: parseFormStringArray(formData, "time_of_day"),
        opens_at: (formData.get("opens_at") as string) || null,
        closes_at: (formData.get("closes_at") as string) || null,
        address: ((formData.get("address") as string) || "").trim() || null,
        formatted_address:
            ((formData.get("formatted_address") as string) || "").trim() || null,
        google_place_id:
            ((formData.get("google_place_id") as string) || "").trim() || null,
        location_lat: formData.get("location_lat")
            ? Number(formData.get("location_lat"))
            : null,
        location_lng: formData.get("location_lng")
            ? Number(formData.get("location_lng"))
            : null,
        location_city:
            ((formData.get("location_city") as string) || "").trim() || null,
        is_24_hours: formData.get("is_24_hours") === "true",
        ticket_type: ((formData.get("ticket_type") as string) || "").trim() || null,
        age_policy: ((formData.get("age_policy") as string) || "").trim() || null,
        dress_code: ((formData.get("dress_code") as string) || "").trim() || null,
        other_notes: ((formData.get("other_notes") as string) || "").trim() || null,
    };
}

function parseTripDate(dateString?: string | null) {
    if (!dateString) return null;
    return new Date(`${dateString}T00:00:00`);
}

function formatTripDate(dateString?: string | null) {
    const date = parseTripDate(dateString);
    if (!date) return "Not set";

    return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function getDepartureCountdown(startDate?: string | null) {
    const departureDate = parseTripDate(startDate);
    if (!departureDate) return "Departure date not set";

    const today = new Date();
    const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );
    const dayDifference = Math.ceil(
        (departureDate.getTime() - todayStart.getTime()) / 86400000
    );

    if (dayDifference === 0) return "Departing today";
    if (dayDifference === 1) return "1 day until departure";
    if (dayDifference > 1) return `${dayDifference} days until departure`;
    if (dayDifference === -1) return "Departed 1 day ago";
    return `Departed ${Math.abs(dayDifference)} days ago`;
}

async function createItineraryItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const rawStatus = String(formData.get("status") || "").trim();
    const transportationStatus = getTransportationDbStatus(rawStatus);
    const itemDate = formData.get("item_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const location = formData.get("location") as string;
    const formattedAddress = formData.get("formatted_address") as string;
    const googlePlaceId = formData.get("google_place_id") as string;
    const locationLat = formData.get("location_lat") as string;
    const locationLng = formData.get("location_lng") as string;
    const timezone = formData.get("timezone") as string;
    const timezoneSource = formData.get("timezone_source") as string;
    const ticketWebsite = formData.get("ticket_website") as string;
    const locationWebsite = formData.get("location_website") as string;
    const coverImageUrl = formData.get("cover_image_url") as string;
    const url = ticketWebsite || (formData.get("url") as string);
    const endDate = formData.get("end_date") as string;
    const notes = formData.get("notes") as string;

    const payload: ItineraryItemPayload = {
        trip_id: tripId,
        title,
        category,
        status,
        item_date: itemDate,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location,
        formatted_address: formattedAddress || null,
        google_place_id: googlePlaceId || null,
        location_lat: locationLat ? Number(locationLat) : null,
        location_lng: locationLng ? Number(locationLng) : null,
        timezone: timezone || null,
        timezone_source: timezoneSource || "manual",
        url: url || null,
        ticket_website: ticketWebsite || null,
        location_website: locationWebsite || null,
        cover_image_url: coverImageUrl || null,
        notes,
    };

    const error = await insertItineraryPayloadWithFallback(
        payload,
        "Itinerary item"
    );

    if (error) {
        console.error("Error creating itinerary item:", error);
        throw new Error("Could not create itinerary item");
    }

    redirect(`/trips/${tripId}`);
}

async function createTransportationItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const mode = formData.get("transportation_mode") as string;
    const departureLocation = formData.get("departure_location") as string;
    const arrivalLocation = formData.get("arrival_location") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const status = formData.get("status") as string;
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const duration = formData.get("duration") as string;
    const visaRequirements = formData.get("visa_requirements") as string;
    const luggageRequirements = formData.get("luggage_requirements") as string;
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const flightLegCount = Number(formData.get("flight_leg_count") || 1);
    const flightLegNotes = Array.from({ length: flightLegCount }, (_, index) => {
        const legDepartureLocation = formData.get(
            `leg_${index}_departure_location`
        ) as string;
        const legArrivalLocation = formData.get(
            `leg_${index}_arrival_location`
        ) as string;
        const legDepartureDate = formData.get(`leg_${index}_departure_date`) as string;
        const legDepartureTime = formData.get(`leg_${index}_departure_time`) as string;
        const legArrivalDate = formData.get(`leg_${index}_arrival_date`) as string;
        const legArrivalTime = formData.get(`leg_${index}_arrival_time`) as string;
        const legDepartureTimezone = formData.get(
            `leg_${index}_departure_timezone`
        ) as string;
        const legArrivalTimezone = formData.get(
            `leg_${index}_arrival_timezone`
        ) as string;
        const legDepartureTerminal = formData.get(
            `leg_${index}_departure_terminal`
        ) as string;
        const legArrivalTerminal = formData.get(
            `leg_${index}_arrival_terminal`
        ) as string;
        const legFlightNumber = formData.get(`leg_${index}_flight_number`) as string;
        const legAirlineName = formData.get(`leg_${index}_airline_name`) as string;
        const legAirlineCode = formData.get(`leg_${index}_airline_code`) as string;
        const legDuration = formData.get(`leg_${index}_duration`) as string;

        return [
            `Leg ${index + 1}: ${legDepartureLocation || "Departure"} → ${
                legArrivalLocation || "Arrival"
            }`,
            legFlightNumber ? `Flight: ${legFlightNumber}` : "",
            legAirlineName || legAirlineCode
                ? `Airline: ${[legAirlineName, legAirlineCode]
                      .filter(Boolean)
                      .join(" / ")}`
                : "",
            legDepartureDate || legDepartureTime
                ? `Departure: ${[legDepartureDate, legDepartureTime]
                      .filter(Boolean)
                      .join(" ")}`
                : "",
            legDepartureTimezone ? `Departure time zone: ${legDepartureTimezone}` : "",
            legArrivalDate || legArrivalTime
                ? `Arrival: ${[legArrivalDate, legArrivalTime]
                      .filter(Boolean)
                      .join(" ")}`
                : "",
            legArrivalTimezone ? `Arrival time zone: ${legArrivalTimezone}` : "",
            legDepartureTerminal
                ? `Departure terminal: ${legDepartureTerminal}`
                : "",
            legArrivalTerminal ? `Arrival terminal: ${legArrivalTerminal}` : "",
            legDuration ? `Duration: ${legDuration}` : "",
        ]
            .filter(Boolean)
            .join("\n");
    }).filter(Boolean);
    const modeLabel = mode ? mode[0].toUpperCase() + mode.slice(1) : "Transportation";
    const title =
        mode === "airplane" && flightNumber
            ? `${flightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
            : `${modeLabel}: ${departureLocation || "Departure"} to ${
                  arrivalLocation || "Arrival"
              }`;
    const notes = [
        duration ? `Duration: ${duration}` : "",
        departureTerminal ? `Departure terminal/platform: ${departureTerminal}` : "",
        arrivalTerminal ? `Arrival terminal/platform: ${arrivalTerminal}` : "",
        departureTimezone ? `Departure time zone: ${departureTimezone}` : "",
        arrivalTimezone ? `Arrival time zone: ${arrivalTimezone}` : "",
        flightLegNotes.length ? `Flight legs:\n\n${flightLegNotes.join("\n\n")}` : "",
        visaRequirements ? `VISA requirements:\n${visaRequirements}` : "",
        luggageRequirements ? `Luggage requirements:\n${luggageRequirements}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    const transportationPayload: TransportationItemPayload = {
        user_id: user.id,
        trip_id: tripId,
        title,
        transportation_mode: mode || null,
        mode: mode || null,
        type: mode || null,
        status: transportationStatus,
        item_date: itemDate || null,
        date: itemDate || null,
        departure_date: itemDate || null,
        arrival_date: endDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        departure_time: startTime || null,
        end_time: endTime || null,
        arrival_time: endTime || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        location: [departureLocation, arrivalLocation].filter(Boolean).join(" → "),
        departure_timezone: departureTimezone || null,
        arrival_timezone: arrivalTimezone || null,
        timezone: departureTimezone || null,
        airline_name: airlineName || null,
        airline_code: airlineCode || null,
        flight_number: flightNumber || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        flight_leg_count: flightLegCount,
        visa_requirements: visaRequirements || null,
        luggage_requirements: luggageRequirements || null,
        notes,
    };

    console.log("Creating transportation item:", {
        rawStatus,
        transportationStatus,
        transportationPayload,
    });

    const error = await insertTransportationPayloadWithFallback(
        transportationPayload
    );

    if (error) {
        console.error("Error creating transportation item:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: transportationPayload,
        });
        throw new Error(
            `Could not create transportation item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    redirect(`/trips/${tripId}`);
}

async function updateTransportationItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const rawItemId = formData.get("item_id") as string;
    const itemId = rawItemId.replace("transportation:", "");
    const departureLocation = formData.get("departure_location") as string;
    const arrivalLocation = formData.get("arrival_location") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const status = formData.get("status") as string;
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const duration = formData.get("duration") as string;
    const notes = formData.get("notes") as string;
    const title = flightNumber
        ? `${flightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
        : `Airplane: ${departureLocation || "Departure"} to ${
              arrivalLocation || "Arrival"
          }`;
    const payload: TransportationItemPayload = {
        title,
        status: getTransportationDbStatus(status),
        item_date: itemDate || null,
        date: itemDate || null,
        departure_date: itemDate || null,
        arrival_date: endDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        departure_time: startTime || null,
        end_time: endTime || null,
        arrival_time: endTime || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        location: [departureLocation, arrivalLocation].filter(Boolean).join(" → "),
        departure_timezone: departureTimezone || null,
        arrival_timezone: arrivalTimezone || null,
        timezone: departureTimezone || null,
        airline_name: airlineName || null,
        airline_code: airlineCode || null,
        flight_number: flightNumber || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        notes,
    };

    const error = await updateTransportationPayloadWithFallback(
        payload,
        itemId,
        tripId
    );

    if (error) {
        console.error("Error updating transportation item:", error);
        throw new Error("Could not update transportation item");
    }

    redirect(`/trips/${tripId}`);
}

async function deleteItineraryItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const itemId = formData.get("item_id") as string;
    const isTransportationItem = itemId.startsWith("transportation:");
    const tableName = isTransportationItem
        ? "transportation_items"
        : "itinerary_items";
    const normalizedItemId = isTransportationItem
        ? itemId.replace("transportation:", "")
        : itemId;

    const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", normalizedItemId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error deleting itinerary item:", error);
        throw new Error("Could not delete itinerary item");
    }

    redirect(`/trips/${tripId}`);
}

async function updateTripCoverImage(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const shouldReset = formData.get("reset_to_default") === "true";
    const coverImageUrl = formData.get("trip_cover_image_url") as string;

    const { error } = await supabase
        .from("trips")
        .update({
            trip_cover_image_url: shouldReset ? null : coverImageUrl || null,
        })
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn("Trip cover image column is missing.", error);
        redirect(`/trips/${tripId}`);
    }

    if (error) {
        console.error("Error updating trip cover image:", error);
        throw new Error("Could not update trip cover image");
    }

    redirect(`/trips/${tripId}`);
}

async function createTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const payload = getIdeaPayload(formData, user.id);

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", payload.trip_id)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea:", tripError);
        throw new Error("Could not create trip idea");
    }

    const { error } = await supabase.from("trip_ideas").insert(payload);

    if (error) {
        console.error("Error creating trip idea:", error);
        throw new Error("Could not create trip idea");
    }

    redirect(`/trips/${payload.trip_id}`);
}

async function updateTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const ideaId = formData.get("idea_id") as string;
    const payload = getIdeaPayload(formData, user.id);
    const { user_id: _userId, trip_id: _tripId, ...updatePayload } = payload;
    void _userId;
    void _tripId;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", payload.trip_id)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea update:", tripError);
        throw new Error("Could not update trip idea");
    }

    const { error } = await supabase
        .from("trip_ideas")
        .update({
            ...updatePayload,
            updated_at: new Date().toISOString(),
        })
        .eq("id", ideaId)
        .eq("trip_id", payload.trip_id)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error updating trip idea:", error);
        throw new Error("Could not update trip idea");
    }

    redirect(`/trips/${payload.trip_id}`);
}

async function archiveTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const ideaId = formData.get("idea_id") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea archive:", tripError);
        throw new Error("Could not archive trip idea");
    }

    const { error } = await supabase
        .from("trip_ideas")
        .update({
            is_archived: true,
            updated_at: new Date().toISOString(),
        })
        .eq("id", ideaId)
        .eq("trip_id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error archiving trip idea:", error);
        throw new Error("Could not archive trip idea");
    }

    redirect(`/trips/${tripId}`);
}

async function deleteTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const ideaId = formData.get("idea_id") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea delete:", tripError);
        throw new Error("Could not delete trip idea");
    }

    const { error } = await supabase
        .from("trip_ideas")
        .delete()
        .eq("id", ideaId)
        .eq("trip_id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip idea:", error);
        throw new Error("Could not delete trip idea");
    }

    redirect(`/trips/${tripId}`);
}

async function promoteIdeaToItinerary(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const tripId = formData.get("trip_id") as string;
    const ideaId = formData.get("idea_id") as string;
    const itemDate = formData.get("item_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea promotion:", tripError);
        throw new Error("Could not add idea to itinerary");
    }

    const { data: idea, error: ideaError } = await supabase
        .from("trip_ideas")
        .select("*")
        .eq("id", ideaId)
        .eq("trip_id", tripId)
        .eq("user_id", user.id)
        .single();

    if (ideaError || !idea) {
        console.error("Error finding trip idea to promote:", ideaError);
        throw new Error("Could not add idea to itinerary");
    }

    const normalizedIdea = normalizeTripIdea(idea as Record<string, unknown>);
    const notes = [
        normalizedIdea.description || "",
        normalizedIdea.ticket_type ? `Tickets: ${normalizedIdea.ticket_type}` : "",
        normalizedIdea.age_policy ? `Age: ${normalizedIdea.age_policy}` : "",
        normalizedIdea.dress_code
            ? `Dress code:\n${normalizedIdea.dress_code}`
            : "",
        normalizedIdea.other_notes ? `Other:\n${normalizedIdea.other_notes}` : "",
        normalizedIdea.tags.length
            ? `Tags: ${normalizedIdea.tags.join(", ")}`
            : "",
        `Idea availability: ${formatIdeaDayLabel(
            normalizedIdea.days_available
        )}; ${formatIdeaTimeLabel(normalizedIdea.time_of_day)}`,
    ]
        .filter(Boolean)
        .join("\n\n");

    const payload: ItineraryItemPayload = {
        trip_id: tripId,
        title: normalizedIdea.title,
        category: "activity",
        status: "tentative",
        item_date: itemDate,
        end_date: null,
        start_time: startTime || null,
        end_time: endTime || null,
        location:
            normalizedIdea.address ||
            normalizedIdea.location_city ||
            normalizedIdea.formatted_address ||
            "",
        formatted_address: normalizedIdea.formatted_address || null,
        google_place_id: normalizedIdea.google_place_id || null,
        location_lat: normalizedIdea.location_lat || null,
        location_lng: normalizedIdea.location_lng || null,
        timezone: null,
        timezone_source: "manual",
        url: null,
        ticket_website: null,
        location_website: null,
        cover_image_url: null,
        notes,
    };

    const error = await insertItineraryPayloadWithFallback(
        payload,
        "Promoted trip idea"
    );

    if (error) {
        console.error("Error promoting trip idea:", error);
        throw new Error("Could not add idea to itinerary");
    }

    redirect(`/trips/${tripId}`);
}

async function TripDetailContent({ params }: PageProps) {
    await connection();

    const { tripId } = await params;

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const { data: itineraryItems, error: itineraryError } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("item_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (itineraryError) {
        console.error("Error loading itinerary:", itineraryError);
    }

    const { data: transportationItems, error: transportationError } = await supabase
        .from("transportation_items")
        .select("*")
        .eq("trip_id", tripId);

    if (transportationError) {
        console.error("Error loading transportation items:", transportationError);
    }

    const { data: tripIdeas, error: tripIdeasError } = await supabase
        .from("trip_ideas")
        .select("*")
        .eq("trip_id", tripId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (tripIdeasError) {
        console.warn("Could not load trip ideas. Showing itinerary without ideas.", {
            code: tripIdeasError.code,
            message: tripIdeasError.message,
            details: tripIdeasError.details,
            hint: tripIdeasError.hint,
        });
    }

    const ideas = ((tripIdeas || []) as Record<string, unknown>[]).map(
        normalizeTripIdea
    );

    const calendarItems = [
        ...(((itineraryItems || []) as ItineraryCalendarItem[]).map((item) => ({
            ...item,
            source_table: "itinerary_items" as const,
        }))),
        ...((transportationItems || []) as Record<string, unknown>[]).map(
            normalizeTransportationItem
        ),
    ].sort((a, b) => {
        const dateSort = a.item_date.localeCompare(b.item_date);
        if (dateSort !== 0) return dateSort;

        return (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    });

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
            <TripDocumentTitle
                title={trip.title}
                destination={trip.destination}
                startDate={trip.start_date}
            />

            <div className="mx-auto max-w-7xl">
                <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
                    ← Back to dashboard
                </Link>

                <header className="mt-6 mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <TripHeaderCover
                        trip={trip}
                        updateCoverAction={updateTripCoverImage}
                    >
                        <h1 className="max-w-5xl text-5xl font-bold tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
                            {trip.title || "Untitled trip"}
                        </h1>
                    </TripHeaderCover>

                    <div className="p-6">
                        <TripDestinationLine destination={trip.destination} />

                        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-stretch">
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Departing:
                                </p>
                                <p className="mt-1 text-lg font-semibold text-slate-950">
                                    {formatTripDate(trip.start_date)}
                                </p>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Returning:
                                </p>
                                <p className="mt-1 text-lg font-semibold text-slate-950">
                                    {formatTripDate(trip.end_date)}
                                </p>
                            </div>
                            <div className="rounded-md bg-slate-950 p-4 text-white sm:min-w-56">
                                <p className="text-xs font-semibold uppercase tracking-wide text-white/65">
                                    Countdown
                                </p>
                                <p className="mt-1 text-lg font-semibold">
                                    {getDepartureCountdown(trip.start_date)}
                                </p>
                            </div>
                        </div>

                        {trip.notes && (
                            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                                {trip.notes}
                            </p>
                        )}
                    </div>
                </header>

                <section className="space-y-6">
                    <ItineraryTabs
                        tripId={trip.id}
                        items={calendarItems}
                        ideas={ideas}
                        tripStartDate={trip.start_date}
                        tripDestination={trip.destination}
                        deleteItineraryAction={deleteItineraryItem}
                        updateTransportationAction={updateTransportationItem}
                        createItineraryAction={createItineraryItem}
                        createTransportationAction={createTransportationItem}
                        createIdeaAction={createTripIdea}
                        updateIdeaAction={updateTripIdea}
                        archiveIdeaAction={archiveTripIdea}
                        deleteIdeaAction={deleteTripIdea}
                        promoteIdeaAction={promoteIdeaToItinerary}
                    />
                </section>
            </div>
        </main>
    );
}

export default function TripDetailPage({ params }: PageProps) {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
                    <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                        Loading itinerary...
                    </div>
                </main>
            }
        >
            <TripDetailContent params={params} />
        </Suspense>
    );
}
