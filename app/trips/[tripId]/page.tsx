import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
    CalendarAccommodation,
    ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import ItineraryTabs from "@/components/ItineraryTabs";
import TripDocumentTitle from "@/components/TripDocumentTitle";
import TripDestinationLine from "@/components/TripDestinationLine";
import TripHeaderCover from "@/components/TripHeaderCover";
import TripCountdown, {
    type TripCountdownTargetOption,
} from "@/components/TripCountdown";
import TripMembersPanel, {
    type TripHeaderFamilyMember,
    type TripHeaderInvitation,
    type TripHeaderMember,
} from "@/components/TripMembersPanel";
import {
    FALLBACK_CATEGORY_LABEL,
    sortCategoriesByName,
    type UserCategory,
} from "@/lib/itineraryCategories";
import {
    formatIdeaAgePolicy,
    formatIdeaDayLabel,
    formatIdeaTicketPolicy,
    formatIdeaTimeLabel,
    normalizeIdeaAgePolicy,
    normalizeIdeaTicketPolicy,
    normalizeTripIdea,
    type IdeaReactionProfile,
    type IdeaReactionSummary,
    type IdeaReactionType,
    type TripIdea,
    toIdeaDayValue,
    toIdeaTimeOfDayValue,
} from "@/lib/tripIdeas";
import type {
    TransportationTraveler,
    TransportationTravelerOptions,
} from "@/lib/travelers";

type PageProps = {
    params: Promise<{
        tripId: string;
    }>;
    searchParams?: Promise<{
        tab?: string;
    }>;
};

type ItineraryItemPayload = {
    trip_id: string;
    created_by?: string;
    title: string;
    category: string;
    category_id?: string | null;
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
    is_private?: boolean;
};

type TransportationItemPayload = Record<string, string | number | boolean | null>;

type TripUpdatePayload = {
    title: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    cover_image_url?: string | null;
    countdown_target_itinerary_item_id?: string | null;
    notes: string;
};

type TripIdeaPayload = {
    created_by: string;
    trip_id: string;
    title: string;
    description: string | null;
    category: string;
    tags: string[];
    days_of_week: string[];
    time_of_day: string[];
    opens_at: string | null;
    closes_at: string | null;
    location: string | null;
    formatted_address: string | null;
    google_place_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
    location_city: string | null;
    location_region: string | null;
    location_country: string | null;
    location_country_code: string | null;
    location_postal_code: string | null;
    location_website: string | null;
    ticket_website: string | null;
    is_24_hours: boolean;
    ticket_policy: string;
    age_policy: string | null;
    dress_code: string | null;
    other_notes: string | null;
    is_private?: boolean;
    is_archived?: boolean;
};

function getPendingInvitationLabel(invitation: Record<string, unknown>) {
    const labelCandidates = [
        invitation.invitee_identifier,
        invitation.invitee_email,
        invitation.invitee_username,
        invitation.email,
        invitation.username,
        invitation.target_email,
        invitation.target_username,
    ];

    const directLabel = labelCandidates.find(
        (candidate): candidate is string =>
            typeof candidate === "string" && candidate.trim().length > 0
    );

    if (directLabel) return directLabel.trim();

    const metadata = invitation.metadata;
    if (metadata && typeof metadata === "object") {
        const metadataRecord = metadata as Record<string, unknown>;
        const metadataLabel = [
            metadataRecord.invitee_identifier,
            metadataRecord.email,
            metadataRecord.username,
        ].find(
            (candidate): candidate is string =>
                typeof candidate === "string" && candidate.trim().length > 0
        );

        if (metadataLabel) return metadataLabel.trim();
    }

    return "Invited guest";
}

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("cover_image_url") ||
                message.includes("schema cache")))
    );
}

function isMissingCountdownTargetColumnError(error: {
    code?: string;
    message?: string;
}) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("countdown_target_type") ||
                message.includes("countdown_target_id") ||
                message.includes("schema cache")))
    );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
    const { cover_image_url, ...fallbackPayload } = payload;
    void cover_image_url;

    return fallbackPayload;
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
                    message.includes("created_by") ||
                    message.includes("is_private") ||
                    message.includes("category_id") ||
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
        created_by,
        is_private,
        category_id,
        ...fallbackPayload
    } = payload;

    void ticket_website;
    void location_website;
    void cover_image_url;
    void transportation_mode;
    void airline_name;
    void airline_code;
    void flight_number;
    void created_by;
    void is_private;
    void category_id;

    return fallbackPayload;
}

async function getUserCategories(userId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("user_categories")
        .select("id,user_id,name,color_key,is_default,created_at,updated_at")
        .eq("user_id", userId);

    if (error) {
        console.warn("Could not load user itinerary categories:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return [];
    }

    return sortCategoriesByName((data || []) as UserCategory[]);
}

async function getCategorySelectionForPayload({
    categoryId,
    fallbackName,
    userId,
}: {
    categoryId: string;
    fallbackName: string;
    userId: string;
}) {
    const cleanCategoryId = categoryId && categoryId !== "__shared__" ? categoryId : "";
    if (!cleanCategoryId) {
        return {
            category_id: null,
            category: fallbackName || FALLBACK_CATEGORY_LABEL,
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("user_categories")
        .select("id,name,user_id")
        .eq("id", cleanCategoryId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.warn("Could not resolve itinerary category. Falling back to text.", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            categoryId: cleanCategoryId,
        });
    }

    return {
        category_id: data ? cleanCategoryId : null,
        category:
            ((data as { name?: string | null } | null)?.name || fallbackName || FALLBACK_CATEGORY_LABEL).trim(),
    };
}

function isCategoryConstraintError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "23514" &&
        (message.includes("category") || message.includes("itinerary_items"))
    );
}

function getLegacyItineraryCategory(category?: string | null) {
    const normalizedCategory = String(category || "").trim().toLowerCase();

    return normalizedCategory === "travel" ||
        normalizedCategory === "work" ||
        normalizedCategory === "activity" ||
        normalizedCategory === "other"
        ? normalizedCategory
        : "other";
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

function normalizeAirlineCode(rawCode?: string | null) {
    const compactCode = String(rawCode || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    const codeFromFlightNumber = compactCode.match(/^([A-Z0-9]{2})(\d+)/)?.[1];

    return codeFromFlightNumber || compactCode;
}

function normalizeFlightNumber({
    flightNumber,
    airlineCode,
    fallbackFlightNumber,
}: {
    flightNumber?: string | null;
    airlineCode?: string | null;
    fallbackFlightNumber?: string | null;
}) {
    const compactFlightNumber = String(flightNumber || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    const compactFallback = String(fallbackFlightNumber || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    const normalizedAirlineCode = normalizeAirlineCode(airlineCode);

    if (/\d/.test(compactFlightNumber)) {
        if (/^[A-Z0-9]{2}\d/.test(compactFlightNumber)) {
            return compactFlightNumber;
        }

        if (/^\d+[A-Z]?$/.test(compactFlightNumber) && normalizedAirlineCode) {
            return `${normalizedAirlineCode}${compactFlightNumber}`;
        }

        return compactFlightNumber;
    }

    if (/\d/.test(compactFallback)) {
        return normalizeFlightNumber({
            flightNumber: compactFallback,
            airlineCode: normalizedAirlineCode || compactFlightNumber,
        });
    }

    return "";
}

async function insertItineraryPayloadWithFallback(
    payload: ItineraryItemPayload,
    context: string
) {
    const supabase = await createClient();
    const fallbackCategoryPayload = {
        ...payload,
        category:
            payload.category === "transportation"
                ? "travel"
                : getLegacyItineraryCategory(payload.category),
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
        const { data, error } = await supabase
            .from("transportation_items")
            .insert(attempt)
            .select("id")
            .single();

        if (!error) return { data: data as Record<string, unknown>, error: null };

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

    return { data: null, error: lastError };
}

function getUniqueFormStrings(formData: FormData, name: string) {
    return Array.from(
        new Set(
            formData
                .getAll(name)
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );
}

function buildTransportationTravelerRows({
    formData,
    tripId,
    transportationItemId,
    userId,
}: {
    formData: FormData;
    tripId: string;
    transportationItemId: string;
    userId: string;
}) {
    const userIds = getUniqueFormStrings(formData, "traveler_user_ids");
    const familyMemberIds = getUniqueFormStrings(
        formData,
        "traveler_family_member_ids"
    );
    const guestNames = getUniqueFormStrings(formData, "traveler_guest_names");

    return [
        ...userIds.map((travelerUserId) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            user_id: travelerUserId,
            family_member_id: null,
            guest_name: null,
            created_by: userId,
        })),
        ...familyMemberIds.map((familyMemberId) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            user_id: null,
            family_member_id: familyMemberId,
            guest_name: null,
            created_by: userId,
        })),
        ...guestNames.map((guestName) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            user_id: null,
            family_member_id: null,
            guest_name: guestName,
            created_by: userId,
        })),
    ];
}

async function replaceTransportationTravelers({
    transportationItemId,
    tripId,
    formData,
    userId,
}: {
    transportationItemId: string;
    tripId: string;
    formData: FormData;
    userId: string;
}) {
    const supabase = await createClient();
    const { error: deleteError } = await supabase
        .from("transportation_item_travelers")
        .delete()
        .eq("transportation_item_id", transportationItemId)
        .eq("trip_id", tripId);

    if (deleteError) return deleteError;

    const rows = buildTransportationTravelerRows({
        formData,
        tripId,
        transportationItemId,
        userId,
    });

    if (rows.length === 0) return null;

    const { error } = await supabase
        .from("transportation_item_travelers")
        .insert(rows);

    return error;
}

async function insertTripIdeaPayloadWithFallback(payload: TripIdeaPayload) {
    const supabase = await createClient();
    const optionalColumns = new Set([
        "location",
        "formatted_address",
        "google_place_id",
        "location_lat",
        "location_lng",
        "location_city",
        "location_region",
        "location_country",
        "location_country_code",
        "location_postal_code",
        "location_website",
        "ticket_website",
        "is_24_hours",
        "ticket_policy",
        "age_policy",
        "dress_code",
        "other_notes",
        "is_private",
    ]);
    let attempt: Record<string, unknown> = { ...payload };
    let lastError: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
    } | null = null;

    for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
        const { error } = await supabase.from("trip_ideas").insert(attempt);

        if (!error) return null;

        lastError = error;

        if (error.code !== "42703" && error.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(error);
        if (
            !missingColumn ||
            !(missingColumn in attempt) ||
            !optionalColumns.has(missingColumn)
        ) {
            break;
        }

        console.warn(
            `Trip ideas table is missing optional column "${missingColumn}". Retrying without it.`,
            error
        );

        const { [missingColumn]: _removedColumn, ...nextAttempt } = attempt;
        void _removedColumn;
        attempt = nextAttempt;
    }

    return lastError;
}

async function updateTripIdeaPayloadWithFallback(
    payload: Record<string, unknown>,
    ideaId: string,
    tripId: string
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
        const { error } = await supabase
            .from("trip_ideas")
            .update(attempt)
            .eq("id", ideaId)
            .eq("trip_id", tripId);

        if (!error) return null;

        lastError = error;

        if (error.code !== "42703" && error.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in attempt)) break;

        console.warn(
            `Trip ideas table is missing optional column "${missingColumn}". Retrying update without it.`,
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
    const reservationCode = getStringValue(item, ["reservation_code"]);
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
        reservation_code: reservationCode || null,
        duration: getStringValue(item, ["duration"]) || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        departure_timezone:
            getStringValue(item, ["departure_timezone", "timezone"]) || null,
        arrival_timezone: getStringValue(item, ["arrival_timezone"]) || null,
        departure_terminal: getStringValue(item, ["departure_terminal"]) || null,
        arrival_terminal: getStringValue(item, ["arrival_terminal"]) || null,
        itinerary_item_id: getStringValue(item, ["itinerary_item_id"]) || null,
        source_table: "transportation_items",
    } as ItineraryCalendarItem & { itinerary_item_id?: string | null };
}

function buildCountdownTargetOptions(items: ItineraryCalendarItem[]) {
    return items
        .filter((item) => item.item_date && item.start_time)
        .map((item): TripCountdownTargetOption => {
        const isTransportation =
            item.source_table === "transportation_items" ||
            item.category === "transportation" ||
            Boolean(item.transportation_mode);
        const saveId = isTransportation
            ? item.id.replace(/^transportation:/, "")
            : item.id;

        return {
            id: item.id,
            saveId,
            saveType: isTransportation ? "transportation_item" : "itinerary_item",
            title: item.title || (isTransportation ? "Transportation" : "Activity"),
            itemType: isTransportation ? "transportation" : "activity",
            itemDate: item.item_date,
            startTime: item.start_time || null,
            endTime: item.end_time || null,
            location:
                item.location ||
                [item.departure_location, item.arrival_location]
                    .filter(Boolean)
                    .join(" → ") ||
                null,
            categoryLabel:
                item.category_name ||
                item.category ||
                (isTransportation ? "Transportation" : "Activity"),
        };
    });
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
    const daysOfWeek = [
        ...parseFormStringArray(formData, "days_of_week"),
        ...parseFormStringArray(formData, "days_available"),
    ].map(toIdeaDayValue);
    const is24Hours =
        formData.get("is_24_hours") === "on" ||
        formData.get("is_24_hours") === "true";
    const ticketPolicy = normalizeIdeaTicketPolicy(
        formData.get("ticket_policy") || formData.get("ticket_type")
    );
    const agePolicy = normalizeIdeaAgePolicy(formData.get("age_policy"));
    const dressCode = ((formData.get("dress_code") as string) || "").trim();

    return {
        created_by: userId,
        trip_id: formData.get("trip_id") as string,
        title: ((formData.get("title") as string) || "").trim(),
        description: ((formData.get("description") as string) || "").trim() || null,
        category: (formData.get("category") as string) || "Other",
        tags,
        days_of_week: [...new Set(daysOfWeek)],
        time_of_day: [
            ...new Set(
                parseFormStringArray(formData, "time_of_day").map(
                    toIdeaTimeOfDayValue
                )
            ),
        ],
        opens_at: (formData.get("opens_at") as string) || null,
        closes_at: (formData.get("closes_at") as string) || null,
        location: ((formData.get("location") as string) || "").trim() || null,
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
        location_region:
            ((formData.get("location_region") as string) || "").trim() || null,
        location_country:
            ((formData.get("location_country") as string) || "").trim() || null,
        location_country_code:
            ((formData.get("location_country_code") as string) || "").trim() ||
            null,
        location_postal_code:
            ((formData.get("location_postal_code") as string) || "").trim() ||
            null,
        location_website:
            ((formData.get("location_website") as string) || "").trim() || null,
        ticket_website:
            ((formData.get("ticket_website") as string) || "").trim() || null,
        is_24_hours: is24Hours,
        ticket_policy: ticketPolicy,
        age_policy: agePolicy,
        dress_code: dressCode || null,
        other_notes: ((formData.get("other_notes") as string) || "").trim() || null,
        is_private:
            formData.get("is_private") === "on" ||
            formData.get("is_private") === "true",
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

async function createItineraryItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const title = formData.get("title") as string;
    const categorySelection = await getCategorySelectionForPayload({
        categoryId: String(formData.get("category_id") || ""),
        fallbackName: String(formData.get("category") || FALLBACK_CATEGORY_LABEL),
        userId: user.id,
    });
    const status = formData.get("status") as string;
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
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";

    const payload: ItineraryItemPayload = {
        trip_id: tripId,
        created_by: user.id,
        title,
        category: categorySelection.category,
        category_id: categorySelection.category_id,
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
        is_private: isPrivate,
        notes,
    };

    const error = await insertItineraryPayloadWithFallback(
        payload,
        "Itinerary item"
    );

    if (error) {
        console.error("Error creating itinerary item:", {
            authenticatedUserId: user.id,
            tripId,
            message: error.message,
            code: error.code,
            payload,
        });
        throw new Error(
            `Could not create itinerary item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    if (!isPrivate) {
        await supabase.rpc("notify_trip_members", {
            target_trip_id: tripId,
            notification_type: "trip_item_added",
            notification_title: "Trip item added",
            notification_body: `${title || "An itinerary item"} was added to the trip.`,
            notification_metadata: {
                itemType: "itinerary_item",
            },
        });
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
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const mode = formData.get("transportation_mode") as string;
    const departureLocation = formData.get("departure_location") as string;
    const arrivalLocation = formData.get("arrival_location") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const rawStatus = String(formData.get("status") || "").trim();
    const transportationStatus = getTransportationDbStatus(rawStatus);
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const reservationCode = String(formData.get("reservation_code") || "").trim();
    const duration = formData.get("duration") as string;
    const visaRequirements = formData.get("visa_requirements") as string;
    const luggageRequirements = formData.get("luggage_requirements") as string;
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
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
    const firstLegFlightNumber = String(
        formData.get("leg_0_flight_number") || ""
    ).trim();
    const firstLegAirlineCode = String(
        formData.get("leg_0_airline_code") || ""
    ).trim();
    const effectiveAirlineCode = normalizeAirlineCode(
        airlineCode || firstLegAirlineCode
    );
    const effectiveFlightNumber = normalizeFlightNumber({
        flightNumber,
        airlineCode: effectiveAirlineCode,
        fallbackFlightNumber: firstLegFlightNumber,
    });
    const modeLabel = mode ? mode[0].toUpperCase() + mode.slice(1) : "Transportation";
    const title =
        mode === "airplane" && effectiveFlightNumber
            ? `${effectiveFlightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
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
        created_by: user.id,
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
        airline_code: effectiveAirlineCode || null,
        flight_number: effectiveFlightNumber || null,
        reservation_code: reservationCode || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        flight_leg_count: flightLegCount,
        visa_requirements: visaRequirements || null,
        luggage_requirements: luggageRequirements || null,
        is_private: isPrivate,
        notes,
    };

    if (process.env.NODE_ENV !== "production") {
        console.log("Creating transportation item:", {
            authenticatedUserId: user.id,
            tripId,
            rawStatus,
            transportationStatus,
            payload: transportationPayload,
        });
    }

    const transportationInsert = await insertTransportationPayloadWithFallback(
        transportationPayload
    );
    const error = transportationInsert.error;

    if (error) {
        if (process.env.NODE_ENV !== "production") {
            console.error("Error creating transportation item:", {
                authenticatedUserId: user.id,
                tripId,
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                payload: transportationPayload,
            });
        }
        throw new Error(
            `Could not create transportation item: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    const transportationItemId =
        typeof transportationInsert.data?.id === "string"
            ? transportationInsert.data.id
            : "";

    if (transportationItemId) {
        const travelersError = await replaceTransportationTravelers({
            transportationItemId,
            tripId,
            formData,
            userId: user.id,
        });

        if (travelersError) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error creating transportation travelers:", {
                    authenticatedUserId: user.id,
                    tripId,
                    transportationItemId,
                    message: travelersError.message,
                    code: travelersError.code,
                    details: travelersError.details,
                    hint: travelersError.hint,
                });
            }
            throw new Error(
                `Could not create transportation travelers: ${
                    travelersError.message ?? "Unknown Supabase error"
                }`
            );
        }
    }

    if (!isPrivate) {
        await supabase.rpc("notify_trip_members", {
            target_trip_id: tripId,
            notification_type: "trip_item_added",
            notification_title: "Trip item added",
            notification_body: `${title || "A transportation item"} was added to the trip.`,
            notification_metadata: {
                itemType: "transportation_item",
            },
        });
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
        redirect("/auth/login");
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
    const rawStatus = String(formData.get("status") || "").trim();
    const transportationStatus = getTransportationDbStatus(rawStatus);
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const reservationCode = String(formData.get("reservation_code") || "").trim();
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const duration = formData.get("duration") as string;
    const notes = formData.get("notes") as string;
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
    const effectiveAirlineCode = normalizeAirlineCode(airlineCode);
    const effectiveFlightNumber = normalizeFlightNumber({
        flightNumber,
        airlineCode: effectiveAirlineCode,
    });
    const title = effectiveFlightNumber
        ? `${effectiveFlightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
        : `Airplane: ${departureLocation || "Departure"} to ${
              arrivalLocation || "Arrival"
          }`;
    const payload: TransportationItemPayload = {
        title,
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
        airline_code: effectiveAirlineCode || null,
        flight_number: effectiveFlightNumber || null,
        reservation_code: reservationCode || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        is_private: isPrivate,
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

    const travelersError = await replaceTransportationTravelers({
        transportationItemId: itemId,
        tripId,
        formData,
        userId: user.id,
    });

    if (travelersError) {
        console.error("Error updating transportation travelers:", {
            message: travelersError.message,
            code: travelersError.code,
            details: travelersError.details,
            hint: travelersError.hint,
            tripId,
            transportationItemId: itemId,
        });
        throw new Error(
            `Could not update transportation travelers: ${
                travelersError.message ?? "Unknown Supabase error"
            }`
        );
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
        redirect("/auth/login");
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

async function updateTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const title = formData.get("title") as string;
    const destination = formData.get("destination") as string;
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;
    const coverImageUrl = String(formData.get("cover_image_url") || "").trim();
    const notes = formData.get("notes") as string;

    const payload: TripUpdatePayload = {
        title,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        cover_image_url: coverImageUrl || null,
        notes,
    };

    let { error } = await supabase
        .from("trips")
        .update(payload)
        .eq("id", tripId);

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn(
            "Optional trip cover column is missing. Falling back to legacy trip fields.",
            error
        );
        ({ error } = await supabase
            .from("trips")
            .update(removeTripCoverColumn(payload))
            .eq("id", tripId));
    }

    if (error) {
        console.error("Error updating trip:", error);
        throw new Error("Could not update trip");
    }

    await supabase.rpc("notify_trip_members", {
        target_trip_id: tripId,
        notification_type: "trip_updated",
        notification_title: "Trip updated",
        notification_body: "A trip detail was updated.",
        notification_metadata: {
            changedArea: "trip",
        },
    });

    redirect(`/trips/${tripId}`);
}

async function updateTripCountdownTarget(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = String(formData.get("trip_id") || "");
    const rawType = String(formData.get("countdown_target_type") || "").trim();
    const rawTargetId = String(formData.get("countdown_target_id") || "").trim();
    const countdownTargetType =
        rawType === "transportation_item" || rawType === "itinerary_item"
            ? rawType
            : "";
    const countdownTargetId = rawTargetId || null;

    if (countdownTargetType && countdownTargetId) {
        const tableName =
            countdownTargetType === "transportation_item"
                ? "transportation_items"
                : "itinerary_items";
        const { data: targetItem, error: targetError } = await supabase
            .from(tableName)
            .select("id,trip_id")
            .eq("id", countdownTargetId)
            .eq("trip_id", tripId)
            .maybeSingle();

        if (targetError || !targetItem) {
            console.error("Invalid countdown target:", {
                message: targetError?.message,
                code: targetError?.code,
                details: targetError?.details,
                hint: targetError?.hint,
                tripId,
                countdownTargetType,
                countdownTargetId,
            });
            throw new Error("Could not update countdown target");
        }
    }

    const payload = {
        countdown_target_type: countdownTargetType || null,
        countdown_target_id: countdownTargetType ? countdownTargetId : null,
        countdown_target_itinerary_item_id:
            countdownTargetType === "itinerary_item" ? countdownTargetId : null,
    };

    let { error } = await supabase
        .from("trips")
        .update(payload)
        .eq("id", tripId);

    if (
        error &&
        countdownTargetType !== "transportation_item" &&
        isMissingCountdownTargetColumnError(error)
    ) {
        ({ error } = await supabase
            .from("trips")
            .update({
                countdown_target_itinerary_item_id:
                    countdownTargetType === "itinerary_item" ? countdownTargetId : null,
            })
            .eq("id", tripId));
    }

    if (error) {
        console.error("Error updating countdown target:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            countdownTargetType,
            countdownTargetId,
            payload,
        });
        throw new Error(
            `Could not update countdown target: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}`);
}

async function deleteTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        console.error("Error finding trip to delete:", tripError);
        throw new Error("Could not delete trip");
    }

    const { count: activeMemberCount, error: memberCountError } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "active");

    if (!memberCountError && (activeMemberCount || 0) > 1) {
        throw new Error("Shared trips cannot be deleted. Leave the trip instead.");
    }

    const { error: itineraryError } = await supabase
        .from("itinerary_items")
        .delete()
        .eq("trip_id", tripId);

    if (itineraryError) {
        console.error("Error deleting trip itinerary items:", itineraryError);
        throw new Error("Could not delete trip itinerary items");
    }

    const { error: transportationError } = await supabase
        .from("transportation_items")
        .delete()
        .eq("trip_id", tripId);

    if (transportationError) {
        console.error("Error deleting trip transportation items:", transportationError);
        throw new Error("Could not delete trip transportation items");
    }

    const { error: ideasError } = await supabase
        .from("trip_ideas")
        .delete()
        .eq("trip_id", tripId);

    if (ideasError) {
        console.error("Error deleting trip ideas:", ideasError);
        throw new Error("Could not delete trip ideas");
    }

    const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip:", error);
        throw new Error("Could not delete trip");
    }

    redirect("/");
}

async function removeTripMember(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = String(formData.get("trip_id") || "");
    const memberUserId = String(formData.get("member_user_id") || "");

    if (!tripId || !memberUserId || memberUserId === user.id) {
        throw new Error("Could not remove trip member");
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,user_id")
        .eq("id", tripId)
        .single();

    if (tripError || !trip || (trip as { user_id?: string | null }).user_id !== user.id) {
        console.error("Unauthorized trip member removal attempt:", {
            tripId,
            memberUserId,
            userId: user.id,
            message: tripError?.message,
            code: tripError?.code,
        });
        throw new Error("Could not remove trip member");
    }

    if ((trip as { user_id?: string | null }).user_id === memberUserId) {
        throw new Error("Trip owner cannot be removed from the trip");
    }

    const { error } = await supabase
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", memberUserId);

    if (error) {
        console.error("Error removing trip member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            memberUserId,
        });
        throw new Error(
            `Could not remove trip member: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}`);
}

async function addTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const familyMemberIds = Array.from(
        new Set(
            formData
                .getAll("family_member_id")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (familyMemberIds.length === 0) {
        throw new Error("Could not add family member to trip: no family member selected");
    }

    const payload = familyMemberIds.map((familyMemberId) => ({
        trip_id: tripId,
        family_member_id: familyMemberId,
        added_by: user.id,
        status: "going",
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("trip_family_members").upsert(
        payload,
        { onConflict: "trip_id,family_member_id" }
    );

    if (error) {
        console.error("Error adding family member to trip:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            familyMemberIds,
            userId: user.id,
        });
        throw new Error(`Could not add family member to trip: ${error.message}`);
    }

    revalidatePath(`/trips/${tripId}`);
}

async function removeTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const familyMemberId = String(formData.get("family_member_id") || "");

    const { error } = await supabase
        .from("trip_family_members")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("trip_id", tripId)
        .eq("family_member_id", familyMemberId);

    if (error) {
        console.error("Error removing family member from trip:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            familyMemberId,
            userId: user.id,
        });
        throw new Error(`Could not remove family member from trip: ${error.message}`);
    }

    revalidatePath(`/trips/${tripId}`);
}

async function createTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const payload = getIdeaPayload(formData, user.id);

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", payload.trip_id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea:", tripError);
        throw new Error("Could not create trip idea");
    }

    const error = await insertTripIdeaPayloadWithFallback(payload);

    if (error) {
        console.error("Error creating trip idea:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(
            `Could not create trip idea: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    if (!payload.is_private) {
        await supabase.rpc("notify_trip_members", {
            target_trip_id: payload.trip_id,
            notification_type: "trip_item_added",
            notification_title: "Trip idea added",
            notification_body: `${payload.title || "An idea"} was added to the trip.`,
            notification_metadata: {
                itemType: "trip_idea",
            },
        });
    }

    redirect(`/trips/${payload.trip_id}?tab=ideas`);
}

async function updateTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const ideaId = formData.get("idea_id") as string;
    const payload = getIdeaPayload(formData, user.id);
    const { created_by: _createdBy, trip_id: _tripId, ...updatePayload } = payload;
    void _createdBy;
    void _tripId;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", payload.trip_id)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea update:", tripError);
        throw new Error("Could not update trip idea");
    }

    const error = await updateTripIdeaPayloadWithFallback(
        {
            ...updatePayload,
            updated_at: new Date().toISOString(),
        },
        ideaId,
        payload.trip_id
    );

    if (error) {
        console.error("Error updating trip idea:", error);
        throw new Error("Could not update trip idea");
    }

    redirect(`/trips/${payload.trip_id}?tab=ideas`);
}

async function archiveTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const ideaId = formData.get("idea_id") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
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
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error archiving trip idea:", error);
        throw new Error("Could not archive trip idea");
    }

    redirect(`/trips/${tripId}?tab=ideas`);
}

async function deleteTripIdea(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const ideaId = formData.get("idea_id") as string;

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        console.error("Error confirming trip for idea delete:", tripError);
        throw new Error("Could not delete trip idea");
    }

    const { error } = await supabase
        .from("trip_ideas")
        .delete()
        .eq("id", ideaId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error deleting trip idea:", error);
        throw new Error("Could not delete trip idea");
    }

    redirect(`/trips/${tripId}?tab=ideas`);
}

async function promoteIdeaToItinerary(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
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
        .single();

    if (ideaError || !idea) {
        console.error("Error finding trip idea to promote:", ideaError);
        throw new Error("Could not add idea to itinerary");
    }

    const normalizedIdea = normalizeTripIdea(idea as Record<string, unknown>);
    const notes = [
        normalizedIdea.description || "",
        normalizedIdea.ticket_policy
            ? `Tickets: ${formatIdeaTicketPolicy(normalizedIdea.ticket_policy)}`
            : "",
        normalizedIdea.age_policy
            ? `Age: ${formatIdeaAgePolicy(normalizedIdea.age_policy)}`
            : "",
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
            normalizedIdea.location ||
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
        ticket_website: normalizedIdea.ticket_website || null,
        location_website: normalizedIdea.location_website || null,
        cover_image_url: null,
        is_private: Boolean(normalizedIdea.is_private),
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

function getDefaultItineraryView(value: unknown): "list" | "day" | "week" {
    return value === "day" || value === "week" ? value : "list";
}

type TripIdeaReactionRecord = {
    idea_id: string;
    user_id: string;
    reaction: string;
    score?: number | null;
};

type UserProfileRecord = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
};

const IDEA_REACTION_VALUES: Record<IdeaReactionType, 2 | 1 | -1> = {
    heart: 2,
    thumbs_up: 1,
    thumbs_down: -1,
};

function normalizeIdeaReaction(value: unknown): IdeaReactionType | null {
    if (
        value === "heart" ||
        value === "thumbs_up" ||
        value === "thumbs_down"
    ) {
        return value;
    }

    return null;
}

function attachIdeaReactions({
    ideas,
    reactions,
    profiles,
    currentUserId,
}: {
    ideas: TripIdea[];
    reactions: TripIdeaReactionRecord[];
    profiles: UserProfileRecord[];
    currentUserId: string;
}) {
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const reactionsByIdeaId = new Map<string, TripIdeaReactionRecord[]>();

    reactions.forEach((reaction) => {
        const normalizedReaction = normalizeIdeaReaction(reaction.reaction);
        if (!normalizedReaction) return;

        const ideaReactions = reactionsByIdeaId.get(reaction.idea_id) || [];
        ideaReactions.push({ ...reaction, reaction: normalizedReaction });
        reactionsByIdeaId.set(reaction.idea_id, ideaReactions);
    });

    return ideas.map((idea) => {
        const ideaReactions = reactionsByIdeaId.get(idea.id) || [];
        const currentUserReaction =
            normalizeIdeaReaction(
                ideaReactions.find((reaction) => reaction.user_id === currentUserId)
                    ?.reaction
            ) || null;
        const reactionScore = ideaReactions.reduce((total, reaction) => {
            const normalizedReaction = normalizeIdeaReaction(reaction.reaction);
            if (!normalizedReaction) return total;

            return (
                total +
                (typeof reaction.score === "number"
                    ? reaction.score
                    : IDEA_REACTION_VALUES[normalizedReaction])
            );
        }, 0);
        const reactionSummaries = (
            ["heart", "thumbs_up", "thumbs_down"] as IdeaReactionType[]
        ).map((reactionType): IdeaReactionSummary => {
            const matchingReactions = ideaReactions.filter(
                (reaction) => reaction.reaction === reactionType
            );
            const reactionProfiles = matchingReactions.map((reaction) => {
                const profile = profilesById.get(reaction.user_id);
                return {
                    user_id: reaction.user_id,
                    avatar_url: profile?.avatar_url || null,
                    first_name: profile?.first_name || null,
                    last_name: profile?.last_name || null,
                    username: profile?.username || null,
                } satisfies IdeaReactionProfile;
            });

            return {
                reaction: reactionType,
                value: IDEA_REACTION_VALUES[reactionType],
                count: matchingReactions.length,
                profiles: reactionProfiles,
            };
        });

        return {
            ...idea,
            current_user_reaction: currentUserReaction,
            reaction_summaries: reactionSummaries,
            reaction_score: reactionScore,
        };
    });
}

async function toggleTripIdeaReaction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = String(formData.get("trip_id") || "");
    const ideaId = String(formData.get("idea_id") || "");
    const reaction = normalizeIdeaReaction(formData.get("reaction"));

    if (!tripId || !ideaId || !reaction) {
        throw new Error("Could not update idea reaction: missing reaction data");
    }

    const { data: existingReaction, error: existingReactionError } = await supabase
        .from("trip_idea_reactions")
        .select("id,reaction")
        .eq("trip_id", tripId)
        .eq("idea_id", ideaId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingReactionError) {
        console.error("Error loading idea reaction:", {
            message: existingReactionError.message,
            code: existingReactionError.code,
            details: existingReactionError.details,
            hint: existingReactionError.hint,
        });
        throw new Error(
            `Could not update idea reaction: ${
                existingReactionError.message || "Unknown Supabase error"
            }`
        );
    }

    if (
        existingReaction &&
        normalizeIdeaReaction(
            (existingReaction as { reaction?: unknown }).reaction
        ) === reaction
    ) {
        const { error } = await supabase
            .from("trip_idea_reactions")
            .delete()
            .eq("trip_id", tripId)
            .eq("idea_id", ideaId)
            .eq("user_id", user.id);

        if (error) {
            console.error("Error deleting idea reaction:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            throw new Error(
                `Could not update idea reaction: ${
                    error.message || "Unknown Supabase error"
                }`
            );
        }
    } else {
        const payload = {
            trip_id: tripId,
            idea_id: ideaId,
            user_id: user.id,
            reaction,
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
            .from("trip_idea_reactions")
            .upsert(payload, { onConflict: "idea_id,user_id" });

        if (error) {
            console.error("Error upserting idea reaction:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                payload,
            });
            throw new Error(
                `Could not update idea reaction: ${
                    error.message || "Unknown Supabase error"
                }`
            );
        }
    }

    revalidatePath(`/trips/${tripId}`);
}

async function TripDetailContent({ params, searchParams }: PageProps) {
    await connection();

    const { tripId } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const initialTab =
        resolvedSearchParams.tab === "ideas"
            ? "ideas"
            : resolvedSearchParams.tab === "journey-planning"
              ? "journey-planning"
            : resolvedSearchParams.tab === "journey"
              ? "journey"
              : "itinerary";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { data: userPreferences, error: userPreferencesError } = await supabase
        .from("user_preferences")
        .select("itinerary_default_view")
        .eq("user_id", user.id)
        .maybeSingle();

    if (userPreferencesError) {
        console.warn("Could not load user itinerary preferences:", {
            message: userPreferencesError.message,
            code: userPreferencesError.code,
            details: userPreferencesError.details,
        });
    }

    const defaultItineraryView = getDefaultItineraryView(
        (userPreferences as { itinerary_default_view?: unknown } | null)
            ?.itinerary_default_view
    );

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const tripRecord = trip as {
        id: string;
        user_id?: string | null;
        created_at?: string | null;
    };

    const { data: tripMemberRows, error: tripMembersError } = await supabase
        .from("trip_members")
        .select("user_id,role,status,created_at")
        .eq("trip_id", tripId)
        .eq("status", "active");

    if (tripMembersError) {
        console.warn("Could not load trip members:", {
            message: tripMembersError.message,
            code: tripMembersError.code,
            details: tripMembersError.details,
            hint: tripMembersError.hint,
            tripId,
        });
    }

    const memberRows = (tripMemberRows || []) as Array<{
        user_id?: string | null;
        role?: string | null;
        created_at?: string | null;
    }>;
    const memberRowsByUserId = new Map(
        memberRows
            .filter((member) => Boolean(member.user_id))
            .map((member) => [member.user_id as string, member])
    );
    const tripMemberUserIds = Array.from(
        new Set([tripRecord.user_id, ...memberRows.map((member) => member.user_id)].filter(Boolean) as string[])
    );
    let tripMembers: TripHeaderMember[] = [];

    if (tripMemberUserIds.length > 0) {
        const { data: profileRows, error: profileRowsError } = await supabase
            .from("user_profiles")
            .select("id,first_name,last_name,username,avatar_url")
            .in("id", tripMemberUserIds);

        if (profileRowsError) {
            console.warn("Could not load trip member profiles:", {
                message: profileRowsError.message,
                code: profileRowsError.code,
                details: profileRowsError.details,
                hint: profileRowsError.hint,
                tripId,
            });
        } else {
            const profilesById = new Map(
                ((profileRows || []) as Array<{
                    id: string;
                    first_name?: string | null;
                    last_name?: string | null;
                    username?: string | null;
                    avatar_url?: string | null;
                }>).map((profile) => [profile.id, profile])
            );

            tripMembers = tripMemberUserIds.map((memberUserId) => {
                const profile = profilesById.get(memberUserId);
                const membership = memberRowsByUserId.get(memberUserId);

                return {
                    user_id: memberUserId,
                    first_name: profile?.first_name || null,
                    last_name: profile?.last_name || null,
                    username: profile?.username || null,
                    avatar_url: profile?.avatar_url || null,
                    joined_at:
                        membership?.created_at ||
                        (memberUserId === tripRecord.user_id
                            ? tripRecord.created_at || null
                            : null),
                    role:
                        memberUserId === tripRecord.user_id
                            ? "owner"
                            : membership?.role || null,
                };
            });
        }
    }

    const { data: userFamilyRows, error: userFamilyError } = await supabase
        .from("user_family_members")
        .select("id,user_id,name,relationship,avatar_url,notes,created_at,updated_at")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

    if (userFamilyError) {
        console.warn("Could not load saved family members:", {
            message: userFamilyError.message,
            code: userFamilyError.code,
            details: userFamilyError.details,
            hint: userFamilyError.hint,
            tripId,
        });
    }

    const { data: tripFamilyRows, error: tripFamilyError } = await supabase
        .from("trip_family_members")
        .select("id,trip_id,family_member_id,added_by,status,created_at,updated_at")
        .eq("trip_id", tripId)
        .eq("status", "going");

    if (tripFamilyError) {
        console.warn("Could not load trip family members:", {
            message: tripFamilyError.message,
            code: tripFamilyError.code,
            details: tripFamilyError.details,
            hint: tripFamilyError.hint,
            tripId,
        });
    }

    const savedFamilyMembers = ((userFamilyRows || []) as Array<{
        id: string;
        name: string;
        relationship?: string | null;
        avatar_url?: string | null;
        notes?: string | null;
    }>).map(
        (member): TripHeaderFamilyMember => ({
            id: member.id,
            family_member_id: member.id,
            name: member.name,
            relationship: member.relationship || null,
            avatar_url: member.avatar_url || null,
            notes: member.notes || null,
            status: null,
        })
    );
    const savedFamilyById = new Map(
        savedFamilyMembers.map((member) => [member.family_member_id, member])
    );
    const tripFamilyMembers = ((tripFamilyRows || []) as Array<{
        id: string;
        family_member_id: string;
        created_at?: string | null;
        status?: string | null;
    }>)
        .map((row) => {
            const member = savedFamilyById.get(row.family_member_id);
            if (!member) return null;
            return {
                ...member,
                id: row.id,
                joined_at: row.created_at || null,
                status: row.status || "going",
            };
        })
        .filter(Boolean) as TripHeaderFamilyMember[];

    const tripMemberTravelerOptions = tripMembers.map(
        (member): TransportationTraveler => {
            const name =
                [member.first_name, member.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                member.username ||
                "Trip member";

            return {
                type: "user",
                user_id: member.user_id,
                name,
                secondaryLabel: member.username ? `@${member.username}` : null,
                avatar_url: member.avatar_url || null,
            };
        }
    );
    const tripFamilyTravelerOptions = tripFamilyMembers.map(
        (member): TransportationTraveler => ({
            type: "family",
            family_member_id: member.family_member_id,
            name: member.name,
            secondaryLabel: member.relationship || "Family member",
            avatar_url: member.avatar_url || null,
        })
    );
    const transportationTravelerOptions: TransportationTravelerOptions = {
        users: tripMemberTravelerOptions,
        familyMembers: tripFamilyTravelerOptions,
    };
    const tripTravelersByUserId = new Map(
        tripMemberTravelerOptions
            .filter((traveler) => traveler.user_id)
            .map((traveler) => [traveler.user_id as string, traveler])
    );
    const tripTravelersByFamilyMemberId = new Map(
        tripFamilyTravelerOptions
            .filter((traveler) => traveler.family_member_id)
            .map((traveler) => [traveler.family_member_id as string, traveler])
    );

    const { data: pendingInvitationRows, error: pendingInvitationsError } =
        await supabase
            .from("trip_invitations")
            .select("*")
            .eq("trip_id", tripId)
            .eq("status", "pending")
            .order("created_at", { ascending: true });

    if (pendingInvitationsError) {
        console.warn("Could not load pending trip invitations:", {
            message: pendingInvitationsError.message,
            code: pendingInvitationsError.code,
            details: pendingInvitationsError.details,
            hint: pendingInvitationsError.hint,
            tripId,
        });
    }

    const pendingInvitations: TripHeaderInvitation[] = (
        (pendingInvitationRows || []) as Array<Record<string, unknown>>
    ).map((invitation, index) => ({
        id:
            typeof invitation.id === "string"
                ? invitation.id
                : `${tripId}-pending-${index}`,
        label: getPendingInvitationLabel(invitation),
        created_at:
            typeof invitation.created_at === "string"
                ? invitation.created_at
                : null,
    }));

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

    const transportationItemIds = ((transportationItems || []) as Array<{
        id?: string | null;
    }>)
        .map((item) => item.id)
        .filter(Boolean) as string[];
    let transportationTravelerRows: Array<Record<string, unknown>> = [];

    if (transportationItemIds.length > 0) {
        const { data: travelerRows, error: travelerRowsError } = await supabase
            .from("transportation_item_travelers")
            .select(
                "id,transportation_item_id,user_id,family_member_id,guest_name,traveler_note,created_at"
            )
            .eq("trip_id", tripId)
            .in("transportation_item_id", transportationItemIds)
            .order("created_at", { ascending: true });

        if (travelerRowsError) {
            console.warn("Could not load transportation travelers:", {
                message: travelerRowsError.message,
                code: travelerRowsError.code,
                details: travelerRowsError.details,
                hint: travelerRowsError.hint,
                tripId,
            });
        } else {
            transportationTravelerRows = (travelerRows || []) as Array<
                Record<string, unknown>
            >;
        }
    }

    const transportationTravelersByItemId = new Map<
        string,
        TransportationTraveler[]
    >();

    transportationTravelerRows.forEach((row) => {
        const transportationItemId =
            typeof row.transportation_item_id === "string"
                ? row.transportation_item_id
                : "";
        if (!transportationItemId) return;

        const userTraveler =
            typeof row.user_id === "string"
                ? tripTravelersByUserId.get(row.user_id)
                : null;
        const familyTraveler =
            typeof row.family_member_id === "string"
                ? tripTravelersByFamilyMemberId.get(row.family_member_id)
                : null;
        const guestName =
            typeof row.guest_name === "string" ? row.guest_name.trim() : "";

        const traveler: TransportationTraveler | null = userTraveler
            ? { ...userTraveler, id: String(row.id || "") }
            : familyTraveler
              ? { ...familyTraveler, id: String(row.id || "") }
              : guestName
                ? {
                      id: String(row.id || ""),
                      type: "guest",
                      guest_name: guestName,
                      name: guestName,
                  }
                : null;

        if (!traveler) return;

        const current = transportationTravelersByItemId.get(transportationItemId) || [];
        current.push(traveler);
        transportationTravelersByItemId.set(transportationItemId, current);
    });

    const { data: accommodationRows, error: accommodationsError } = await supabase
        .from("trip_accommodations")
        .select(
            "id,hotel_name,city,region,country,address,check_in_date,check_out_date,status"
        )
        .eq("trip_id", tripId)
        .order("check_in_date", { ascending: true });

    if (accommodationsError) {
        console.warn("Could not load accommodations for week location band:", {
            message: accommodationsError.message,
            code: accommodationsError.code,
            details: accommodationsError.details,
            hint: accommodationsError.hint,
            tripId,
        });
    }

    const userCategories = await getUserCategories(user.id);
    const categoryIds = Array.from(
        new Set(
            ((itineraryItems || []) as Record<string, unknown>[])
                .map((item) => String(item.category_id || ""))
                .filter(Boolean)
        )
    );
    const colorKeys = new Set(userCategories.map((category) => category.color_key).filter(Boolean));
    let itineraryCategories: UserCategory[] = [];

    if (categoryIds.length > 0) {
        const { data: categoryRows, error: categoryRowsError } = await supabase
            .from("user_categories")
            .select("id,user_id,name,color_key,is_default,created_at,updated_at")
            .in("id", categoryIds);

        if (categoryRowsError) {
            console.warn("Could not load itinerary item categories:", {
                message: categoryRowsError.message,
                code: categoryRowsError.code,
                details: categoryRowsError.details,
                hint: categoryRowsError.hint,
            });
        } else {
            itineraryCategories = (categoryRows || []) as UserCategory[];
            itineraryCategories.forEach((category) => {
                if (category.color_key) colorKeys.add(category.color_key);
            });
        }
    }

    const { data: colorRows, error: colorRowsError } =
        colorKeys.size > 0
            ? await supabase
                  .from("category_color_options")
                  .select("key,label,hex,sort_order")
                  .in("key", Array.from(colorKeys))
            : { data: [], error: null };

    if (colorRowsError) {
        console.warn("Could not load category color options:", {
            message: colorRowsError.message,
            code: colorRowsError.code,
            details: colorRowsError.details,
            hint: colorRowsError.hint,
        });
    }

    const categoryColorsByKey = new Map(
        ((colorRows || []) as { key: string; hex: string }[]).map((color) => [
            color.key,
            color.hex,
        ])
    );
    const categoriesById = new Map(
        [...userCategories, ...itineraryCategories].map((category) => [
            category.id,
            category,
        ])
    );

    const { data: tripIdeas, error: tripIdeasError } = await supabase
        .from("trip_ideas")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });

    if (tripIdeasError) {
        console.warn("Could not load trip ideas. Showing itinerary without ideas.", {
            code: tripIdeasError.code,
            message: tripIdeasError.message,
            details: tripIdeasError.details,
            hint: tripIdeasError.hint,
        });
    }

    const normalizedIdeas = ((tripIdeas || []) as Record<string, unknown>[]).map(
        normalizeTripIdea
    );
    const ideaIds = normalizedIdeas.map((idea) => idea.id).filter(Boolean);
    let tripIdeaReactions: TripIdeaReactionRecord[] = [];
    let ideaReactionProfiles: UserProfileRecord[] = [];

    if (ideaIds.length > 0) {
        const { data: reactionRows, error: reactionsError } = await supabase
            .from("trip_idea_reactions")
            .select("idea_id,user_id,reaction,score")
            .eq("trip_id", tripId)
            .in("idea_id", ideaIds);

        if (reactionsError) {
            console.warn("Could not load trip idea reactions.", {
                code: reactionsError.code,
                message: reactionsError.message,
                details: reactionsError.details,
                hint: reactionsError.hint,
            });
        } else {
            tripIdeaReactions = (reactionRows || []) as TripIdeaReactionRecord[];
        }

        const reactionUserIds = Array.from(
            new Set(tripIdeaReactions.map((reaction) => reaction.user_id))
        );

        if (reactionUserIds.length > 0) {
            const { data: profileRows, error: profilesError } = await supabase
                .from("user_profiles")
                .select("id,first_name,last_name,username,avatar_url")
                .in("id", reactionUserIds);

            if (profilesError) {
                console.warn("Could not load idea reaction profiles.", {
                    code: profilesError.code,
                    message: profilesError.message,
                    details: profilesError.details,
                    hint: profilesError.hint,
                });
            } else {
                ideaReactionProfiles = (profileRows || []) as UserProfileRecord[];
            }
        }
    }

    const ideas = attachIdeaReactions({
        ideas: normalizedIdeas,
        reactions: tripIdeaReactions,
        profiles: ideaReactionProfiles,
        currentUserId: user.id,
    }).sort((a, b) => {
        const scoreSort = (b.reaction_score || 0) - (a.reaction_score || 0);
        if (scoreSort !== 0) return scoreSort;

        const createdSort = String(b.created_at || "").localeCompare(
            String(a.created_at || "")
        );
        if (createdSort !== 0) return createdSort;

        return a.title.localeCompare(b.title);
    });

    const calendarItems = [
        ...(((itineraryItems || []) as ItineraryCalendarItem[]).map((item) => ({
            ...item,
            category_name:
                categoriesById.get(String(item.category_id || ""))?.name ||
                item.category ||
                FALLBACK_CATEGORY_LABEL,
            category_color_hex:
                categoryColorsByKey.get(
                    String(
                        categoriesById.get(String(item.category_id || ""))?.color_key ||
                            ""
                    )
                ) || undefined,
            category_owner_id:
                categoriesById.get(String(item.category_id || ""))?.user_id || null,
            source_table: "itinerary_items" as const,
        }))),
        ...((transportationItems || []) as Record<string, unknown>[]).map((item) => {
            const normalizedItem = normalizeTransportationItem(item);
            const rawId = getStringValue(item, ["id"]);

            return {
                ...normalizedItem,
                travelers: transportationTravelersByItemId.get(rawId) || [],
            };
        }),
    ].sort((a, b) => {
        const dateSort = a.item_date.localeCompare(b.item_date);
        if (dateSort !== 0) return dateSort;

        return (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    });
    const countdownTargetOptions = buildCountdownTargetOptions(calendarItems);
    const tripCountdownRecord = trip as {
        countdown_target_type?: unknown;
        countdown_target_id?: unknown;
        countdown_target_itinerary_item_id?: unknown;
    };
    const selectedCountdownTargetType =
        tripCountdownRecord.countdown_target_type === "transportation_item" ||
        tripCountdownRecord.countdown_target_type === "itinerary_item"
            ? tripCountdownRecord.countdown_target_type
            : typeof tripCountdownRecord.countdown_target_itinerary_item_id ===
                "string"
              ? "itinerary_item"
              : null;
    const selectedCountdownTargetId =
        selectedCountdownTargetType &&
        typeof tripCountdownRecord.countdown_target_id === "string"
            ? tripCountdownRecord.countdown_target_id
            : selectedCountdownTargetType === "itinerary_item" &&
                typeof tripCountdownRecord.countdown_target_itinerary_item_id ===
                "string"
              ? tripCountdownRecord.countdown_target_itinerary_item_id
              : null;
    return (
        <main className="min-h-screen bg-[#0c0115] pb-10 pt-0">
            <TripDocumentTitle
                title={trip.title}
                destination={trip.destination}
                startDate={trip.start_date}
            />

            <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
                <TripHeaderCover
                    trip={trip}
                    updateTripAction={updateTrip}
                    deleteTripAction={deleteTrip}
                >
                    <h1 className="max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
                        {trip.title || "Untitled trip"}
                    </h1>
                </TripHeaderCover>

                <div className="mx-auto max-w-7xl p-5 sm:p-7">
                        <TripDestinationLine destination={trip.destination}>
                            <TripMembersPanel
                                tripId={trip.id}
                                tripTitle={trip.title}
                                members={tripMembers}
                                familyMembers={tripFamilyMembers}
                                availableFamilyMembers={savedFamilyMembers}
                                invitations={pendingInvitations}
                                currentUserId={user.id}
                                tripOwnerId={tripRecord.user_id}
                                removeMemberAction={removeTripMember}
                                addFamilyMemberAction={addTripFamilyMember}
                                removeFamilyMemberAction={removeTripFamilyMember}
                            />
                        </TripDestinationLine>

                        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_minmax(280px,0.9fr)] lg:items-stretch">
                            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                    Departing:
                                </p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                                    {formatTripDate(trip.start_date)}
                                </p>
                            </div>
                            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                    Returning:
                                </p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                                    {formatTripDate(trip.end_date)}
                                </p>
                            </div>
                            <div className="relative overflow-hidden rounded-[1.35rem] border border-lime-300/30 bg-lime-300 p-5 text-slate-950 shadow-[0_0_50px_rgba(var(--vaivia-neon-rgb),0.24)]">
                                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/35 blur-2xl" />
                                <div className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-fuchsia-400/20 blur-2xl" />
                                <TripCountdown
                                    tripId={trip.id}
                                    startDate={trip.start_date}
                                    selectedTargetId={selectedCountdownTargetId}
                                    selectedTargetType={selectedCountdownTargetType}
                                    targets={countdownTargetOptions}
                                    updateCountdownTargetAction={
                                        updateTripCountdownTarget
                                    }
                                />
                            </div>
                        </div>

                        {trip.notes && (
                            <p className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-sm font-medium leading-6 text-slate-300">
                                {trip.notes}
                            </p>
                        )}
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <section className="space-y-6">
                    <ItineraryTabs
                        tripId={trip.id}
                        items={calendarItems}
                        accommodations={
                            ((accommodationRows || []) as CalendarAccommodation[])
                        }
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
                        toggleIdeaReactionAction={toggleTripIdeaReaction}
                        promoteIdeaAction={promoteIdeaToItinerary}
                        initialTab={initialTab}
                        defaultItineraryView={defaultItineraryView}
                        categories={userCategories}
                        travelerOptions={transportationTravelerOptions}
                    />
                </section>
            </div>
        </main>
    );
}

export default function TripDetailPage({ params, searchParams }: PageProps) {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-[#0c0115] px-4 py-10 sm:px-6">
                    <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300 shadow-sm">
                        Loading itinerary...
                    </div>
                </main>
            }
        >
            <TripDetailContent params={params} searchParams={searchParams} />
        </Suspense>
    );
}
