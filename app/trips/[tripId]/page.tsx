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
import TripHeaderCover from "@/components/TripHeaderCover";
import TripLegLocationLine, {
    type TripLegLocation,
    type TripLegMemberOption,
} from "@/components/TripLegLocationLine";
import TripCountdown, {
    type TripCountdownTargetOption,
} from "@/components/TripCountdown";
import TripMembersPanel, {
    type TripHeaderFamilyMember,
    type TripHeaderInvitation,
    type TripHeaderMember,
} from "@/components/TripMembersPanel";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import {
    FALLBACK_CATEGORY_LABEL,
    sortCategoriesByName,
    type UserCategory,
} from "@/lib/itineraryCategories";
import {
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
import {
    parseTripAudienceFormData,
    type TripAudienceOption,
    type TripItemParticipantDisplay,
} from "@/lib/tripAudience";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";
import { moveTripItem } from "@/app/actions/moveTripItem";
import { deleteTripLeg, upsertTripLeg } from "@/app/actions/tripLegs";
import { loadActiveMemberTrips } from "@/lib/sharedTrips";
import { getMoveTargetTrips } from "@/lib/tripMove";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import {
    resolveTripLegIdForDate,
    resolveTripLegIdForLocation,
} from "@/lib/tripLegs";

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
    audience_mode?: string | null;
    trip_leg_id?: string | null;
};

type TransportationItemPayload = Record<string, string | number | boolean | null>;

type ParticipantDisplayQueryBuilder = {
    select: (columns: string) => ParticipantDisplayQueryBuilder;
    eq: (column: string, value: string) => ParticipantDisplayQueryBuilder;
    in: (
        column: string,
        values: string[]
    ) => Promise<{
        data: TripItemParticipantDisplay[] | null;
        error: {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
        } | null;
    }>;
};

type ParticipantDisplaySupabaseClient = {
    from: (table: "trip_item_participants_display") => ParticipantDisplayQueryBuilder;
};

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
    trip_leg_id?: string | null;
    is_private?: boolean;
    is_archived?: boolean;
    attended?: boolean;
};

function getFlagEmoji(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";

    return normalized
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getCountryName(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return null;

    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || null;
    } catch {
        return null;
    }
}

function getCountryCodeFromFlag(flag: string) {
    const codePoints = Array.from(flag);
    if (codePoints.length !== 2) return null;

    const countryCode = codePoints
        .map((character) => character.codePointAt(0))
        .filter((codePoint): codePoint is number => Boolean(codePoint))
        .map((codePoint) => String.fromCharCode(codePoint - 127397))
        .join("");

    return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];
    return destination
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getLeadingFlag(destination: string) {
    return destination.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "";
}

function stripLeadingFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "").trim();
}

function normalizeLocationText(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function locationsMatch(
    base: TripLegLocation,
    candidate?: TripLegLocation | null
) {
    if (!candidate) return false;
    const baseCountryCode = String(base.countryCode || "").toUpperCase();
    const candidateCountryCode = String(candidate.countryCode || "").toUpperCase();

    if (baseCountryCode && candidateCountryCode && baseCountryCode === candidateCountryCode) {
        return true;
    }

    const baseNames = [base.name, base.cityName, base.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);
    const candidateNames = [candidate.name, candidate.cityName, candidate.countryName]
        .map(normalizeLocationText)
        .filter(Boolean);

    return baseNames.some((baseName) =>
        candidateNames.some(
            (candidateName) =>
                candidateName === baseName ||
                candidateName.includes(baseName) ||
                baseName.includes(candidateName)
        )
    );
}

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
        audience_mode,
        trip_leg_id,
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
    void audience_mode;
    void trip_leg_id;

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
        const { data, error } = await supabase
            .from("itinerary_items")
            .insert(attempt)
            .select("id")
            .single();

        if (!error) {
            return {
                data: data as { id?: string | null } | null,
                error: null,
            };
        }

        lastError = error;

        const shouldTryNext =
            (index < 2 && isMissingOptionalColumnError(error)) ||
            isCategoryConstraintError(error);

        if (!shouldTryNext) break;

        console.warn(`${context} insert fallback ${index + 1} triggered.`, error);
    }

    return { data: null, error: lastError };
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

async function replaceTripItemParticipants({
    tripId,
    itemType,
    itemId,
    formData,
}: {
    tripId: string;
    itemType: "itinerary" | "transportation" | "accommodation";
    itemId: string;
    formData: FormData;
}) {
    return replaceTripItemParticipantsFromForm({
        tripId,
        itemType,
        itemId,
        formData,
    });
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
        "attended",
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
        cost:
            typeof item.cost === "number"
                ? item.cost
                : Number.isFinite(Number(item.cost))
                  ? Number(item.cost)
                  : null,
        currency: getStringValue(item, ["currency"]) || null,
        duration: getStringValue(item, ["duration"]) || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        departure_timezone:
            getStringValue(item, ["departure_timezone", "timezone"]) || null,
        arrival_timezone: getStringValue(item, ["arrival_timezone"]) || null,
        departure_terminal: getStringValue(item, ["departure_terminal"]) || null,
        arrival_terminal: getStringValue(item, ["arrival_terminal"]) || null,
        is_private: Boolean(item.is_private),
        audience_mode:
            getStringValue(item, ["audience_mode"]) === "custom" ||
            getStringValue(item, ["audience_mode"]) === "just_me"
                ? (getStringValue(item, ["audience_mode"]) as "custom" | "just_me")
                : "everyone",
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
    const audience = parseTripAudienceFormData(formData);
    const tripLegId = await resolveTripLegIdForDate({
        supabase,
        tripId,
        explicitTripLegId: String(formData.get("trip_leg_id") || ""),
        itemDate,
    });

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
        audience_mode: audience.audienceMode,
        trip_leg_id: tripLegId,
        notes,
    };

    const insertResult = await insertItineraryPayloadWithFallback(
        payload,
        "Itinerary item"
    );
    const error = insertResult.error;

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

    const itineraryItemId =
        typeof insertResult.data?.id === "string" ? insertResult.data.id : "";

    if (itineraryItemId) {
        const participantsError = await replaceTripItemParticipants({
            tripId,
            itemType: "itinerary",
            itemId: itineraryItemId,
            formData,
        });

        if (participantsError) {
            console.error("Error creating itinerary participants:", {
                message: participantsError.message,
                code: participantsError.code,
                details: participantsError.details,
                hint: participantsError.hint,
                tripId,
                itineraryItemId,
            });
            throw new Error(
                `Could not create itinerary participants: ${
                    participantsError.message ?? "Unknown Supabase error"
                }`
            );
        }
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
    const transportationCost = formData.get("cost");
    const transportationCurrency = formData.get("currency");
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
    const audience = parseTripAudienceFormData(formData);
    const tripLegId = await resolveTripLegIdForDate({
        supabase,
        tripId,
        explicitTripLegId: String(formData.get("trip_leg_id") || ""),
        itemDate,
    });
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
        cost: transportationCost
            ? Number(String(transportationCost).replace(/,/g, ""))
            : null,
        currency: String(transportationCurrency || "").trim().toUpperCase() || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        flight_leg_count: flightLegCount,
        visa_requirements: visaRequirements || null,
        luggage_requirements: luggageRequirements || null,
        is_private: isPrivate,
        audience_mode: audience.audienceMode,
        trip_leg_id: tripLegId,
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
        await syncAutoBudgetExpense({
            supabase,
            userId: user.id,
            tripId,
            sourceType: "transportation",
            sourceId: transportationItemId,
            amount: transportationCost,
            currency: transportationCurrency,
            expenseDate: itemDate,
            description: title,
            formData,
        });

        const participantsError = await replaceTripItemParticipants({
            tripId,
            itemType: "transportation",
            itemId: transportationItemId,
            formData,
        });

        if (participantsError) {
            if (process.env.NODE_ENV !== "production") {
                console.error("Error creating transportation participants:", {
                    authenticatedUserId: user.id,
                    tripId,
                    transportationItemId,
                    message: participantsError.message,
                    code: participantsError.code,
                    details: participantsError.details,
                    hint: participantsError.hint,
                });
            }
            throw new Error(
                `Could not create transportation participants: ${
                    participantsError.message ?? "Unknown Supabase error"
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
    const transportationCost = formData.get("cost");
    const transportationCurrency = formData.get("currency");
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const duration = formData.get("duration") as string;
    const notes = formData.get("notes") as string;
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
    const audience = parseTripAudienceFormData(formData);
    const tripLegId = await resolveTripLegIdForDate({
        supabase,
        tripId,
        explicitTripLegId: String(formData.get("trip_leg_id") || ""),
        itemDate,
    });
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
        cost: transportationCost
            ? Number(String(transportationCost).replace(/,/g, ""))
            : null,
        currency: String(transportationCurrency || "").trim().toUpperCase() || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        is_private: isPrivate,
        audience_mode: audience.audienceMode,
        trip_leg_id: tripLegId,
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

    await syncAutoBudgetExpense({
        supabase,
        userId: user.id,
        tripId,
        sourceType: "transportation",
        sourceId: itemId,
        amount: transportationCost,
        currency: transportationCurrency,
        expenseDate: itemDate,
        description: title,
        formData,
    });

    const participantsError = await replaceTripItemParticipants({
        tripId,
        itemType: "transportation",
        itemId,
        formData,
    });

    if (participantsError) {
        console.error("Error updating transportation participants:", {
            message: participantsError.message,
            code: participantsError.code,
            details: participantsError.details,
            hint: participantsError.hint,
            tripId,
            transportationItemId: itemId,
        });
        throw new Error(
            `Could not update transportation participants: ${
                participantsError.message ?? "Unknown Supabase error"
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
    payload.trip_leg_id = await resolveTripLegIdForLocation({
        supabase,
        tripId: payload.trip_id,
        explicitTripLegId: String(formData.get("trip_leg_id") || ""),
        city: payload.location_city,
        region: payload.location_region,
        country: payload.location_country,
        countryCode: payload.location_country_code,
    });

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
    payload.trip_leg_id = await resolveTripLegIdForLocation({
        supabase,
        tripId: payload.trip_id,
        explicitTripLegId: String(formData.get("trip_leg_id") || ""),
        city: payload.location_city,
        region: payload.location_region,
        country: payload.location_country,
        countryCode: payload.location_country_code,
    });
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

async function toggleTripIdeaAttended(formData: FormData) {
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
    const attended = String(formData.get("attended") || "") === "true";
    const payload = {
        attended,
        updated_at: new Date().toISOString(),
    };

    if (!tripId || !ideaId) {
        throw new Error("Could not update trip idea attended status");
    }

    const { error } = await supabase
        .from("trip_ideas")
        .update(payload)
        .eq("id", ideaId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating trip idea attended status:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(
            `Could not update trip idea attended status: ${
                error.message ?? "Unknown Supabase error"
            }`
        );
    }

    revalidatePath(`/trips/${tripId}`);
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
    const hideHeaderDetailsOnMobile = initialTab !== "itinerary";

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
    const { trips: movableTrips } = await loadActiveMemberTrips(supabase, user.id);
    const moveTargetTrips = getMoveTargetTrips({
        trips: movableTrips,
        currentTripId: tripId,
    });

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
        .select("id,user_id,role,status,created_at")
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
        id?: string | null;
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
            const membership = memberRowsByUserId.get(member.user_id);
            const name =
                [member.first_name, member.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                member.username ||
                "Trip member";

            return {
                type: "user",
                trip_member_id: membership?.id || null,
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
    const currentUserTraveler =
        tripMemberTravelerOptions.find((traveler) => traveler.user_id === user.id) ||
        null;

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
    const audienceOptions: TripAudienceOption[] = [
        ...tripMemberTravelerOptions
            .filter((traveler) => traveler.trip_member_id)
            .map(
                (traveler): TripAudienceOption => ({
                    kind: "member",
                    id: traveler.trip_member_id as string,
                    displayName: traveler.name,
                    avatarUrl: traveler.avatar_url || null,
                    status: "accepted",
                    secondaryLabel: traveler.secondaryLabel || null,
                    isCurrentUser: traveler.user_id === user.id,
                })
            ),
        ...pendingInvitations.map(
            (invitation): TripAudienceOption => ({
                kind: "invitation",
                id: invitation.id,
                displayName: invitation.label,
                status: "invited",
                secondaryLabel: "Pending invitation",
            })
        ),
        ...tripFamilyMembers.map(
            (member): TripAudienceOption => ({
                kind: "family_member",
                id: member.family_member_id,
                displayName: member.name,
                avatarUrl: member.avatar_url || null,
                status: "family_member",
                secondaryLabel: member.relationship || "Family member",
            })
        ),
    ];
    const currentUserTripMemberId =
        audienceOptions.find(
            (option) => option.kind === "member" && option.isCurrentUser
        )?.id || null;
    const audienceOptionsByKey = new Map(
        audienceOptions.map((option) => [`${option.kind}:${option.id}`, option])
    );

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

    const itineraryItemIds = ((itineraryItems || []) as Array<{
        id?: string | null;
    }>)
        .map((item) => item.id)
        .filter(Boolean) as string[];
    const transportationItemIds = ((transportationItems || []) as Array<{
        id?: string | null;
    }>)
        .map((item) => item.id)
        .filter(Boolean) as string[];
    const participantsByItemKey = new Map<string, TransportationTraveler[]>();
    const selectedAudienceOptionsByItemKey = new Map<string, TripAudienceOption[]>();
    const participantQueries: Array<{
        itemType: "itinerary" | "transportation";
        ids: string[];
    }> = [
        { itemType: "itinerary", ids: itineraryItemIds },
        { itemType: "transportation", ids: transportationItemIds },
    ];

    for (const participantQuery of participantQueries) {
        if (participantQuery.ids.length === 0) continue;

        const { data: participantSourceRows, error: participantSourceRowsError } =
            await supabase
                .from("trip_item_participants")
                .select(
                    "item_type,item_id,participant_kind,trip_member_id,invitation_id,family_member_id,guest_name"
                )
                .eq("trip_id", tripId)
                .eq("item_type", participantQuery.itemType)
                .in("item_id", participantQuery.ids);

        if (participantSourceRowsError) {
            console.warn("Could not load trip item participant source rows:", {
                message: participantSourceRowsError.message,
                code: participantSourceRowsError.code,
                details: participantSourceRowsError.details,
                hint: participantSourceRowsError.hint,
                tripId,
                itemType: participantQuery.itemType,
            });
        } else {
            ((participantSourceRows || []) as Array<Record<string, unknown>>).forEach(
                (row) => {
                    const itemId =
                        typeof row.item_id === "string" ? row.item_id : "";
                    const itemType =
                        typeof row.item_type === "string" ? row.item_type : "";
                    const participantKind =
                        typeof row.participant_kind === "string"
                            ? row.participant_kind
                            : "";
                    if (!itemId || !itemType) return;

                    const key = `${itemType}:${itemId}`;
                    let option: TripAudienceOption | undefined;

                    if (participantKind === "member") {
                        const tripMemberId =
                            typeof row.trip_member_id === "string"
                                ? row.trip_member_id
                                : "";
                        option = audienceOptionsByKey.get(`member:${tripMemberId}`);
                    } else if (participantKind === "invitation") {
                        const invitationId =
                            typeof row.invitation_id === "string"
                                ? row.invitation_id
                                : "";
                        option = audienceOptionsByKey.get(`invitation:${invitationId}`);
                    } else if (participantKind === "family_member") {
                        const familyMemberId =
                            typeof row.family_member_id === "string"
                                ? row.family_member_id
                                : "";
                        option = audienceOptionsByKey.get(
                            `family_member:${familyMemberId}`
                        );
                    } else if (participantKind === "guest") {
                        const guestName =
                            typeof row.guest_name === "string"
                                ? row.guest_name.trim()
                                : "";
                        if (guestName) {
                            option = {
                                kind: "guest",
                                id: guestName,
                                displayName: guestName,
                                status: "guest",
                            };
                        }
                    }

                    if (!option) return;
                    const current = selectedAudienceOptionsByItemKey.get(key) || [];
                    current.push(option);
                    selectedAudienceOptionsByItemKey.set(key, current);
                }
            );
        }

        const participantDisplayClient =
            supabase as unknown as ParticipantDisplaySupabaseClient;
        const { data: participantRows, error: participantRowsError } =
            await participantDisplayClient
                .from("trip_item_participants_display")
                .select("*")
                .eq("trip_id", tripId)
                .eq("item_type", participantQuery.itemType)
                .in("item_id", participantQuery.ids);

        if (participantRowsError) {
            console.warn("Could not load trip item participant display rows:", {
                message: participantRowsError.message,
                code: participantRowsError.code,
                details: participantRowsError.details,
                hint: participantRowsError.hint,
                tripId,
                itemType: participantQuery.itemType,
            });
            continue;
        }

        (participantRows || []).forEach((row) => {
            if (!row.item_id) return;
            const key = `${row.item_type}:${row.item_id}`;
            const current = participantsByItemKey.get(key) || [];
            current.push({
                type:
                    row.participant_kind === "family_member"
                        ? "family"
                        : row.participant_kind === "guest"
                          ? "guest"
                          : "user",
                name: row.display_name || "Traveller",
                avatar_url: row.avatar_url || null,
                guest_name:
                    row.participant_kind === "guest"
                        ? row.display_name || "Guest"
                        : null,
            });
            participantsByItemKey.set(key, current);
        });
    }
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

    const { data: tripLegRows, error: tripLegsError } = await supabase
        .from("trip_legs")
        .select(
            "id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order"
        )
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });

    if (tripLegsError) {
        console.warn("Could not load trip legs for hero:", {
            message: tripLegsError.message,
            code: tripLegsError.code,
            details: tripLegsError.details,
            hint: tripLegsError.hint,
            tripId,
        });
    }

    const manualTripLegIds = ((tripLegRows || []) as Array<{ id?: string | null }>)
        .map((leg) => leg.id)
        .filter(Boolean) as string[];
    let tripMemberLegRows: Array<{
        trip_leg_id: string;
        trip_member_id: string;
        is_joining?: boolean | null;
    }> = [];

    if (manualTripLegIds.length > 0) {
        const { data: memberLegRows, error: memberLegRowsError } = await supabase
            .from("trip_member_legs")
            .select("trip_leg_id,trip_member_id,is_joining")
            .eq("trip_id", tripId)
            .in("trip_leg_id", manualTripLegIds);

        if (memberLegRowsError) {
            console.warn("Could not load trip leg members for hero:", {
                message: memberLegRowsError.message,
                code: memberLegRowsError.code,
                details: memberLegRowsError.details,
                hint: memberLegRowsError.hint,
                tripId,
            });
        } else {
            tripMemberLegRows = (memberLegRows || []) as typeof tripMemberLegRows;
        }
    }

    const tripMemberIdsByLegId = new Map<string, string[]>();
    tripMemberLegRows.forEach((row) => {
        if (!row.is_joining) return;
        const current = tripMemberIdsByLegId.get(row.trip_leg_id) || [];
        current.push(row.trip_member_id);
        tripMemberIdsByLegId.set(row.trip_leg_id, current);
    });

    const accommodationLocations: TripLegLocation[] = (
        (accommodationRows || []) as Array<{
            id: string;
            hotel_name?: string | null;
            city?: string | null;
            region?: string | null;
            country?: string | null;
            check_in_date?: string | null;
            check_out_date?: string | null;
            status?: string | null;
        }>
    )
        .filter((accommodation) => accommodation.status !== "cancelled")
        .map((accommodation) => {
            const name =
                accommodation.city ||
                accommodation.region ||
                accommodation.country ||
                accommodation.hotel_name ||
                "Accommodation";

            return {
                id: accommodation.id,
                source: "accommodation" as const,
                name,
                cityName: accommodation.city || accommodation.region || name,
                countryName: accommodation.country || null,
                startDate: accommodation.check_in_date || null,
                endDate: accommodation.check_out_date || null,
            };
        });

    const manualLocations: TripLegLocation[] = (
        (tripLegRows || []) as Array<{
            id: string;
            name: string;
            city_name?: string | null;
            country_code?: string | null;
            icon_emoji?: string | null;
            start_date?: string | null;
            end_date?: string | null;
            leg_type?: string | null;
        }>
    )
        .filter((leg) => leg.leg_type !== "accommodation")
        .map((leg) => ({
            id: leg.id,
            source: "manual" as const,
            name: leg.name,
            cityName: leg.city_name || null,
            countryCode: leg.country_code || null,
            iconEmoji: leg.icon_emoji || null,
            startDate: leg.start_date || null,
            endDate: leg.end_date || null,
            memberIds: tripMemberIdsByLegId.get(leg.id) || [],
        }));

    const destinationLocations: TripLegLocation[] = parseDestinationList(
        trip.destination
    ).map((destination, index) => {
        const flag = getLeadingFlag(destination);
        const countryCode = getCountryCodeFromFlag(flag);
        const cleanDestination = stripLeadingFlag(destination);
        const countryName = getCountryName(countryCode);

        return {
            id: `destination-${index}-${cleanDestination || destination}`,
            source: "destination" as const,
            name: cleanDestination || destination,
            cityName: cleanDestination || destination,
            countryCode,
            countryName,
            iconEmoji: flag || getFlagEmoji(countryCode) || null,
            startDate: null,
            endDate: null,
            memberIds: [],
        };
    });

    const heroLocations =
        destinationLocations.length > 0
            ? destinationLocations.map((destination) => {
                  const manualMatch = manualLocations.find((location) =>
                      locationsMatch(destination, location)
                  );
                  const accommodationMatch = accommodationLocations.find((location) =>
                      locationsMatch(destination, location)
                  );

                  return {
                      ...destination,
                      persistedLegId: manualMatch?.id || null,
                      startDate:
                          accommodationMatch?.startDate ||
                          manualMatch?.startDate ||
                          null,
                      endDate:
                          accommodationMatch?.endDate ||
                          manualMatch?.endDate ||
                          null,
                      memberIds: manualMatch?.memberIds || [],
                  };
              })
            : [...accommodationLocations, ...manualLocations];
    const tripLegMemberOptions: TripLegMemberOption[] = memberRows
        .filter((member) => Boolean(member.id))
        .map((member) => {
            const profile = member.user_id
                ? tripMembers.find((tripMember) => tripMember.user_id === member.user_id)
                : null;
            const displayName = [
                profile?.first_name || "",
                profile?.last_name || "",
            ]
                .join(" ")
                .trim();

            return {
                id: member.id as string,
                displayName: displayName || profile?.username || "Trip mate",
                username: profile?.username || null,
                avatarUrl: profile?.avatar_url || null,
            };
        });

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
        if (a.attended !== b.attended) return a.attended ? 1 : -1;

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
            participants:
                participantsByItemKey.get(`itinerary:${item.id}`) || [],
            audience_selected_options:
                selectedAudienceOptionsByItemKey.get(`itinerary:${item.id}`) || [],
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
            const itemParticipants =
                participantsByItemKey.get(`transportation:${rawId}`) || [];
            const participants =
                (normalizedItem.audience_mode === "just_me" ||
                    normalizedItem.is_private) &&
                currentUserTraveler
                    ? [currentUserTraveler]
                    : itemParticipants;

            return {
                ...normalizedItem,
                travelers: transportationTravelersByItemId.get(rawId) || [],
                participants,
                audience_selected_options:
                    selectedAudienceOptionsByItemKey.get(
                        `transportation:${rawId}`
                    ) || [],
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
                    <div className={hideHeaderDetailsOnMobile ? "hidden sm:block" : ""}>
                        <TripLegLocationLine
                            tripId={trip.id}
                            revalidatePathname={`/trips/${trip.id}`}
                            locations={heroLocations}
                            memberOptions={tripLegMemberOptions}
                            upsertLegAction={upsertTripLeg}
                            deleteLegAction={deleteTripLeg}
                        >
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
                        </TripLegLocationLine>
                    </div>

                        <div className={`mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_minmax(280px,0.9fr)] lg:items-stretch ${
                            hideHeaderDetailsOnMobile ? "hidden sm:grid" : ""
                        }`}>
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
                        moveItemAction={moveTripItem}
                        moveTargetTrips={moveTargetTrips}
                        toggleIdeaReactionAction={toggleTripIdeaReaction}
                        toggleIdeaAttendedAction={toggleTripIdeaAttended}
                        initialTab={initialTab}
                        defaultItineraryView={defaultItineraryView}
                        categories={userCategories}
                        travelerOptions={transportationTravelerOptions}
                        audienceOptions={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
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
                <DelayedVaiviaLoadingScreen
                    title="Curating your itinerary"
                    subtitle="Handpicking the best experiences just for you."
                />
            }
        >
            <TripDetailContent params={params} searchParams={searchParams} />
        </Suspense>
    );
}
