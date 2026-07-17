import type { Json } from "@/src/types/supabase";

export const TRAVEL_EMAIL_IMPORT_REVIEW_STATUSES = ["needs_review", "ready"];

export const TRAVEL_EMAIL_IMPORT_STATUS_LABELS: Record<string, string> = {
    received: "Received",
    processing: "Processing",
    needs_review: "Needs review",
    ready: "Ready to add",
    imported: "Imported",
    failed: "Could not process",
    rejected: "Rejected",
};

export function getTravelEmailImportStatusLabel(status?: string | null) {
    return status ? TRAVEL_EMAIL_IMPORT_STATUS_LABELS[status] || status : "Received";
}

export function isTravelImportReviewSchemaMissingError(error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
}) {
    const errorText = [
        error.code,
        error.message,
        error.details,
        error.hint,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        error.code === "PGRST204" ||
        error.code === "42703" ||
        [
            "matched_trip_id",
            "imported_at",
            "reviewed_data",
            "imported_record_id",
            "is_excluded",
        ].some((column) => errorText.includes(column))
    );
}

export function formatImportConfidence(value?: number | null) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Pending";
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}% confidence`;
}

export function formatImportDate(value?: string | null) {
    if (!value) return "Not available";
    return new Date(value).toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function isJsonRecord(value: Json | null | undefined): value is Record<string, Json> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getJsonString(data: Json | Record<string, Json> | null | undefined, keys: string[]) {
    if (!isJsonRecord(data as Json)) return "";
    for (const key of keys) {
        const value = (data as Record<string, Json>)[key];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
}

export function getJsonNumber(data: Json | Record<string, Json> | null | undefined, keys: string[]) {
    if (!isJsonRecord(data as Json)) return null;
    for (const key of keys) {
        const value = (data as Record<string, Json>)[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return null;
}

export function getImportItemRouteLabel(data: Json | null | undefined) {
    const departure =
        getJsonString(data, [
            "departure_airport",
            "departure_airport_code",
            "origin_airport",
            "origin",
        ]) || "Departure";
    const arrival =
        getJsonString(data, [
            "arrival_airport",
            "arrival_airport_code",
            "destination_airport",
            "destination",
        ]) || "Arrival";

    return `${departure} → ${arrival}`;
}
