import { FileText, Inbox, Paperclip, Plane, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Json } from "@/src/types/supabase";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processTravelEmailImport } from "@/lib/travelEmailImportProcessor";
import { getTripRouteSegment } from "@/lib/tripRoutes";
import {
    getEditableImportedFlight,
    getRequiredFlightIssues,
    matchImportToTrips,
    type EditableImportedFlight,
    type ImportTripOption,
} from "@/lib/travelEmailImportReview";
import {
    getTravelEmailImportStatusLabel,
    getTravelEmailImportStatusClasses,
    isTravelImportReviewSchemaMissingError,
} from "@/lib/travelEmailImports";

type ImportPageProps = {
    params: Promise<{
        importId: string;
    }>;
};

type TravelEmailImportRow = {
    id: string;
    attachment_count: number;
    created_at: string;
    extracted_data: Json | null;
    extraction_confidence: number | null;
    extraction_error: string | null;
    extraction_model: string | null;
    import_type: string | null;
    processed_at: string | null;
    provider: string;
    recipient_email: string | null;
    requires_data_review: boolean;
    sender_email: string | null;
    status: string;
    subject: string | null;
    matched_trip_id?: string | null;
    imported_at?: string | null;
};

type TravelEmailImportAttachmentRow = {
    id: string;
    filename: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    storage_path: string | null;
};

type TravelEmailImportItemRow = {
    id: string;
    confidence: number | null;
    extracted_data: Json;
    item_order: number;
    item_type: string;
    reviewed_data?: Json | null;
    imported_record_id?: string | null;
    imported_at?: string | null;
    is_excluded?: boolean | null;
    matched_trip_id?: string | null;
};

type ImportedTransportationRecord = {
    id: string;
    title: string | null;
    transport_number: string | null;
};

type ExistingTransportationFlight = {
    id: string;
    title: string | null;
    transport_number: string | null;
    departure_location: string | null;
    departure_date: string | null;
    departure_time: string | null;
};

type SupabaseActionError = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

type ImportFlightsRpcClient = {
    rpc: (
        fn: "import_travel_email_flights",
        args: {
            p_import_id: string;
            p_trip_id: string;
            p_items: Json;
        }
    ) => Promise<{
        data: {
            status?: string;
            tripId?: string;
            tripSlug?: string | null;
            transportationItemIds?: string[];
        } | null;
        error: {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
        } | null;
    }>;
};

type TravelEmailImportAddResult = {
    status?: string;
    tripId?: string;
    tripSlug?: string | null;
    transportationItemIds?: string[];
};

const STALE_PROCESSING_MINUTES = 15;

function formatDate(value?: string | null) {
    if (!value) return "Not processed yet";

    return new Date(value).toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatPercent(value?: number | null) {
    if (typeof value !== "number") return "Pending";
    return `${Math.round(value * 100)}%`;
}

function formatBytes(value?: number | null) {
    if (!value) return "Unknown size";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function stringifyJson(value: Json) {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
}

function getUserFacingExtractionError(value?: string | null) {
    if (!value) return "";

    if (value === "resend_api_key_requires_full_access") {
        return "VAIVIA received your email, but email processing is temporarily unavailable. Please try again later.";
    }

    return "VAIVIA received your email, but could not finish processing it yet. Please try again later.";
}

function canRetryImport(status: string, processedAt?: string | null) {
    if (status === "received" || status === "failed") return true;
    if (status !== "processing" || !processedAt) return false;

    return (
        Date.now() - new Date(processedAt).getTime() >
        STALE_PROCESSING_MINUTES * 60 * 1000
    );
}

function getItemTitle(item: TravelEmailImportItemRow) {
    const data = item.extracted_data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return item.item_type;
    }

    const title =
        data.title ||
        data.name ||
        data.flight_number ||
        data.confirmation_number ||
        data.booking_reference;

    return typeof title === "string" && title.trim() ? title : item.item_type;
}

function getFieldName(itemId: string, fieldName: keyof EditableImportedFlight) {
    return `${itemId}:${fieldName}`;
}

function getLegFieldName(itemId: string, fieldName: string) {
    return `${itemId}:leg_0_${fieldName}`;
}

function getLegFieldForFlightField(field: keyof EditableImportedFlight) {
    const fieldMap: Partial<Record<keyof EditableImportedFlight, string>> = {
        airlineName: "airline_name",
        airlineCode: "airline_code",
        flightNumber: "flight_number",
        departureLocation: "departure_location",
        arrivalLocation: "arrival_location",
        departureDate: "departure_date",
        departureTime: "departure_time",
        arrivalDate: "arrival_date",
        arrivalTime: "arrival_time",
        departureTimezone: "departure_timezone",
        arrivalTimezone: "arrival_timezone",
        departureTerminal: "departure_terminal",
        arrivalTerminal: "arrival_terminal",
    };

    return fieldMap[field] || null;
}

function normalizeFlightFingerprintPart(value?: string | null) {
    return (value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

function getFlightFingerprint(flight: {
    flightNumber?: string | null;
    transport_number?: string | null;
    departureLocation?: string | null;
    departure_location?: string | null;
    departureDate?: string | null;
    departure_date?: string | null;
    departureTime?: string | null;
    departure_time?: string | null;
}) {
    return [
        normalizeFlightFingerprintPart(flight.flightNumber || flight.transport_number),
        normalizeFlightFingerprintPart(
            flight.departureLocation || flight.departure_location
        ),
        flight.departureDate || flight.departure_date || "",
        flight.departureTime || flight.departure_time || "",
    ].join("|");
}

function FlightTextInput({
    itemId,
    field,
    label,
    defaultValue,
    required = false,
    type = "text",
}: {
    itemId: string;
    field: keyof EditableImportedFlight;
    label: string;
    defaultValue: string;
    required?: boolean;
    type?: string;
}) {
    return (
        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
                {required ? (
                    <span className="ml-1 text-lime-200">Required before adding</span>
                ) : null}
            </span>
            <input
                name={getFieldName(itemId, field)}
                type={type}
                defaultValue={defaultValue}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
            />
        </label>
    );
}

function FlightTextarea({
    itemId,
    field,
    label,
    defaultValue,
    rows = 3,
}: {
    itemId: string;
    field: keyof EditableImportedFlight;
    label: string;
    defaultValue: string;
    rows?: number;
}) {
    return (
        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
            </span>
            <textarea
                name={getFieldName(itemId, field)}
                defaultValue={defaultValue}
                rows={rows}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
            />
        </label>
    );
}

function FlightLegTextInput({
    itemId,
    legField,
    label,
    defaultValue,
    required = false,
    type = "text",
}: {
    itemId: string;
    legField: string;
    label: string;
    defaultValue: string;
    required?: boolean;
    type?: string;
}) {
    return (
        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
                {required ? (
                    <span className="ml-1 text-lime-200">Required before adding</span>
                ) : null}
            </span>
            <input
                name={getLegFieldName(itemId, legField)}
                type={type}
                defaultValue={defaultValue}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
            />
        </label>
    );
}

function EditableFlightCard({
    item,
    flight,
    duplicateRecord,
    selectedTrip,
}: {
    item: TravelEmailImportItemRow;
    flight: EditableImportedFlight;
    duplicateRecord?: ExistingTransportationFlight | null;
    selectedTrip?: ImportTripOption | null;
}) {
    const missingFields = getRequiredFlightIssues(flight);

    return (
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <input type="hidden" name="item_id" value={item.id} />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-sm font-black text-lime-50">
                    <input
                        type="checkbox"
                        name={`include_${item.id}`}
                        defaultChecked={!item.is_excluded}
                        className="h-4 w-4 accent-lime-300"
                    />
                    Include
                </label>
                <span className="rounded-full border border-lime-300/20 px-3 py-1 text-xs font-black text-lime-100">
                    {formatPercent(item.confidence)}
                </span>
            </div>

            <div className="mt-4 rounded-[1.25rem] border border-lime-300/15 bg-lime-300/10 p-4">
                <p className="text-sm font-black text-lime-50">
                    This flight has not been added to a trip yet.
                </p>
                {missingFields.length > 0 ? (
                    <p className="mt-1 text-xs font-semibold text-lime-100/80">
                        Required before adding: {missingFields.join(", ")}
                    </p>
                ) : (
                    <p className="mt-1 text-xs font-semibold text-lime-100/80">
                        Review the local times exactly as they appear on your confirmation.
                    </p>
                )}
                {duplicateRecord ? (
                    <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
                        <p className="text-sm font-black text-amber-100">
                            This flight is already in the selected trip.
                        </p>
                        <p className="mt-1 text-xs font-semibold text-amber-100/80">
                            VAIVIA will link this import to the existing flight instead
                            of creating a duplicate.
                        </p>
                        {selectedTrip ? (
                            <Link
                                href={`/trips/${getTripRouteSegment(
                                    selectedTrip
                                )}?tab=journey`}
                                className="mt-2 inline-flex rounded-full border border-amber-200/30 px-3 py-1 text-xs font-black text-amber-100 transition hover:bg-amber-300/10"
                            >
                                Open existing flight
                            </Link>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <input type="hidden" name={getLegFieldName(item.id, "airline_code")} value={flight.airlineCode} />
            <input type="hidden" name="transportation_mode" value="airplane" />
            <input type="hidden" name="flight_leg_count" value="1" />

            <div className="mt-4 space-y-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200/80">
                                Airplane
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                Review this flight before adding it to Journey.
                            </p>
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-black text-slate-100">
                            <input
                                type="checkbox"
                                name={getFieldName(item.id, "isPrivate")}
                                defaultChecked={flight.isPrivate === "true" || flight.isPrivate === "on"}
                                className="h-4 w-4 accent-lime-300"
                            />
                            Private
                        </label>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                Select mode of transportation
                            </p>
                            <p className="mt-2 text-sm font-black text-white">✈️ Airplane</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                Is this flight direct?
                            </p>
                            <p className="mt-2 text-sm font-black text-white">Direct</p>
                        </div>
                    </div>
                </div>

                <fieldset className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                    <legend className="px-1 text-sm font-black text-white">
                        Flight leg 1
                    </legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="departure_location"
                            label="Departure airport, code, or city"
                            defaultValue={flight.departureLocation}
                            required
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="arrival_location"
                            label="Arrival airport, code, or city"
                            defaultValue={flight.arrivalLocation}
                            required
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="departure_date"
                            label="Departure date"
                            defaultValue={flight.departureDate}
                            required
                            type="date"
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="departure_time"
                            label="Departure time"
                            defaultValue={flight.departureTime}
                            required
                            type="time"
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="arrival_date"
                            label="Arrival date"
                            defaultValue={flight.arrivalDate}
                            required
                            type="date"
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="arrival_time"
                            label="Arrival time"
                            defaultValue={flight.arrivalTime}
                            required
                            type="time"
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="departure_timezone"
                            label="Departure time zone"
                            defaultValue={flight.departureTimezone}
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="arrival_timezone"
                            label="Arrival time zone"
                            defaultValue={flight.arrivalTimezone}
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="departure_terminal"
                            label="Departure terminal"
                            defaultValue={flight.departureTerminal}
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="arrival_terminal"
                            label="Arrival terminal"
                            defaultValue={flight.arrivalTerminal}
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="flight_number"
                            label="Flight number, e.g. AC692"
                            defaultValue={flight.flightNumber}
                            required
                        />
                        <FlightLegTextInput
                            itemId={item.id}
                            legField="airline_name"
                            label="Airline"
                            defaultValue={flight.airlineName}
                        />
                    </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                    <FlightTextInput
                        itemId={item.id}
                        field="reservationCode"
                        label="Reservation code / booking reference"
                        defaultValue={flight.reservationCode}
                    />
                    <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                        <FlightTextInput
                            itemId={item.id}
                            field="cost"
                            label="Cost"
                            defaultValue={flight.cost || "0"}
                            type="number"
                        />
                        <FlightTextInput
                            itemId={item.id}
                            field="currency"
                            label="Currency"
                            defaultValue={flight.currency || "CAD"}
                        />
                    </div>
                    <FlightTextInput
                        itemId={item.id}
                        field="seatNumber"
                        label="Seat"
                        defaultValue={flight.seatNumber}
                    />
                    <FlightTextInput
                        itemId={item.id}
                        field="cabinClass"
                        label="Cabin"
                        defaultValue={flight.cabinClass}
                    />
                    <FlightTextarea
                        itemId={item.id}
                        field="visaRequirements"
                        label="VISA requirements"
                        defaultValue={flight.visaRequirements}
                    />
                    <FlightTextarea
                        itemId={item.id}
                        field="luggageRequirements"
                        label="Luggage requirements"
                        defaultValue={flight.luggageRequirements}
                    />
                    <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Status
                        </span>
                        <select
                            name={getFieldName(item.id, "status")}
                            defaultValue={flight.status}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                        >
                            <option value="planned">Planned</option>
                            <option value="booked">Booked</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="completed">Completed</option>
                        </select>
                    </label>
                </div>
                <FlightTextarea
                    itemId={item.id}
                    field="notes"
                    label="Notes"
                    defaultValue={flight.notes}
                />
            </div>

            <details className="mt-4 rounded-[1rem] border border-white/10 bg-black/30 p-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                    Technical details
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto text-xs font-semibold leading-5 text-slate-200">
                    {stringifyJson(item.extracted_data)}
                </pre>
            </details>
        </article>
    );
}

async function retryTravelEmailImport(formData: FormData) {
    "use server";

    const importId = String(formData.get("import_id") || "");
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: importRow, error } = await supabase
        .from("travel_email_imports")
        .select("id,status,processed_at")
        .eq("id", importId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        console.error("Could not verify travel email retry ownership:", {
            importId,
            userId: user.id,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        throw new Error("Could not retry travel email import");
    }

    if (!importRow) notFound();
    if (!canRetryImport(importRow.status, importRow.processed_at)) {
        redirect(`/imports/${importId}`);
    }

    try {
        await processTravelEmailImport(importId);
    } catch (error) {
        console.error("Could not retry travel email import:", {
            importId,
            userId: user.id,
            error,
        });
    }

    revalidatePath(`/imports/${importId}`);
    redirect(`/imports/${importId}`);
}

async function ignoreTravelEmailImport(formData: FormData) {
    "use server";

    const importId = String(formData.get("import_id") || "").trim();
    if (!importId) throw new Error("Could not ignore this import.");

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: importRow, error: importLookupError } = await supabase
        .from("travel_email_imports")
        .select("id,status,user_id")
        .eq("id", importId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (importLookupError || !importRow) {
        console.error("travel_email_import_ignore_failed", {
            importId,
            userId: user.id,
            code: importLookupError?.code,
            message: importLookupError?.message,
            details: importLookupError?.details,
            hint: importLookupError?.hint,
        });
        throw new Error("Could not ignore this import. Please try again.");
    }

    if (importRow.status !== "imported") {
        const serviceSupabase = createServiceRoleClient();
        const ignoredItemUpdate = {
            is_excluded: true,
        } as never;
        const { error: itemUpdateError } = await serviceSupabase
            .from("travel_email_import_items")
            .update(ignoredItemUpdate)
            .eq("import_id", importId);

        if (
            itemUpdateError &&
            !isTravelImportReviewSchemaMissingError(itemUpdateError)
        ) {
            console.warn("travel_email_import_ignore_item_update_failed", {
                importId,
                userId: user.id,
                code: itemUpdateError.code,
            });
        }

        const { error: importUpdateError } = await serviceSupabase
            .from("travel_email_imports")
            .update({ status: "rejected" })
            .eq("id", importId)
            .eq("user_id", user.id);

        if (importUpdateError) {
            console.error("travel_email_import_ignore_status_update_failed", {
                importId,
                userId: user.id,
                code: importUpdateError.code,
                message: importUpdateError.message,
                details: importUpdateError.details,
                hint: importUpdateError.hint,
            });
            throw new Error("Could not ignore this import. Please try again.");
        }

        const { error: notificationUpdateError } = await serviceSupabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .in("type", [
                "travel_email_ready",
                "travel_email_needs_review",
                "travel_email_failed",
            ])
            .eq("metadata->>importId", importId);

        if (notificationUpdateError) {
            console.warn("travel_email_import_ignore_notification_update_failed", {
                importId,
                userId: user.id,
                code: notificationUpdateError.code,
            });
        }
    }

    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");
    redirect(`/imports/${importId}`);
}

function getReviewedFlightField(
    formData: FormData,
    itemId: string,
    field: keyof EditableImportedFlight
) {
    const legField = getLegFieldForFlightField(field);
    const legValue = legField
        ? String(formData.get(getLegFieldName(itemId, legField)) || "").trim()
        : "";

    if (legValue) return legValue;

    return String(formData.get(getFieldName(itemId, field)) || "").trim();
}

function normalizeTransportationStatus(status: string) {
    return ["planned", "booked", "confirmed", "cancelled", "completed"].includes(
        status
    )
        ? status
        : "planned";
}

function parseMoneyValue(value?: string | null) {
    const normalized = String(value || "").replace(/,/g, "").trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
}

async function resolveImportTripLegIdForDate({
    supabase,
    tripId,
    itemDate,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tripId: string;
    itemDate?: string | null;
}) {
    const cleanDate = (itemDate || "").trim();
    if (!cleanDate) return null;

    const { data, error } = await supabase
        .from("trip_legs")
        .select("id")
        .eq("trip_id", tripId)
        .or(`start_date.is.null,start_date.lte.${cleanDate}`)
        .or(`end_date.is.null,end_date.gte.${cleanDate}`)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn("travel_email_import_trip_leg_lookup_failed", {
            tripId,
            itemDate: cleanDate,
            code: error.code,
        });
        return null;
    }

    return typeof data?.id === "string" ? data.id : null;
}

function isImportFlightRpcUnavailableError(error: SupabaseActionError) {
    const text = [error.code, error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        error.code === "PGRST202" ||
        error.code === "42883" ||
        text.includes("import_travel_email_flights") ||
        isTravelImportReviewSchemaMissingError(error)
    );
}

async function markTravelEmailImportNotificationsRead({
    supabase,
    userId,
    importId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    userId: string;
    importId: string;
}) {
    const { data: notifications, error } = await supabase
        .from("notifications")
        .select("id,metadata,type")
        .eq("user_id", userId)
        .in("type", [
            "travel_email_ready",
            "travel_email_needs_review",
            "travel_email_failed",
        ]);

    if (error) {
        console.warn("travel_email_import_notification_lookup_failed", {
            importId,
            userId,
            code: error.code,
        });
        return;
    }

    const notificationIds = ((notifications || []) as Array<{
        id: string;
        metadata?: Json | null;
    }>)
        .filter((notification) => {
            const metadata = notification.metadata;
            return (
                metadata &&
                typeof metadata === "object" &&
                !Array.isArray(metadata) &&
                metadata.importId === importId
            );
        })
        .map((notification) => notification.id);

    await Promise.all(
        notificationIds.map((notificationId) =>
            supabase.rpc("mark_app_alert_read", {
                alert_id: notificationId,
            })
        )
    );
}

async function loadTravelEmailImportForReview(
    supabase: Awaited<ReturnType<typeof createClient>>,
    importId: string,
    userId: string
) {
    const richQuery = await supabase
        .from("travel_email_imports")
        .select(
            "id,attachment_count,created_at,extracted_data,extraction_confidence,extraction_error,extraction_model,import_type,processed_at,provider,recipient_email,requires_data_review,sender_email,status,subject,matched_trip_id,imported_at"
        )
        .eq("id", importId)
        .eq("user_id", userId)
        .maybeSingle();

    if (
        !richQuery.error ||
        !isTravelImportReviewSchemaMissingError(richQuery.error)
    ) {
        return richQuery;
    }

    console.warn("Travel import review columns are not available yet; using import fallback query.", {
        importId,
        userId,
        code: richQuery.error.code,
    });

    return supabase
        .from("travel_email_imports")
        .select(
            "id,attachment_count,created_at,extracted_data,extraction_confidence,extraction_error,extraction_model,import_type,processed_at,provider,recipient_email,requires_data_review,sender_email,status,subject"
        )
        .eq("id", importId)
        .eq("user_id", userId)
        .maybeSingle();
}

async function loadTravelEmailImportItemsForReview(
    supabase: Awaited<ReturnType<typeof createClient>>,
    importId: string
) {
    const richQuery = await supabase
        .from("travel_email_import_items")
        .select(
            "id,confidence,extracted_data,item_order,item_type,reviewed_data,imported_record_id,imported_at,is_excluded,matched_trip_id"
        )
        .eq("import_id", importId)
        .order("item_order", { ascending: true });

    if (
        !richQuery.error ||
        !isTravelImportReviewSchemaMissingError(richQuery.error)
    ) {
        return richQuery;
    }

    console.warn("Travel import item review columns are not available yet; using item fallback query.", {
        importId,
        code: richQuery.error.code,
    });

    return supabase
        .from("travel_email_import_items")
        .select("id,confidence,extracted_data,item_order,item_type")
        .eq("import_id", importId)
        .order("item_order", { ascending: true });
}

async function addImportedFlightsUsingTransportationFallback({
    supabase,
    userId,
    importId,
    tripId,
    submittedItems,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    userId: string;
    importId: string;
    tripId: string;
    submittedItems: Array<{
        item_id: string;
        include: boolean;
        reviewed_data: Record<string, string>;
    }>;
}): Promise<TravelEmailImportAddResult> {
    const { data: importRow, error: importError } = await supabase
        .from("travel_email_imports")
        .select("id,status,user_id")
        .eq("id", importId)
        .eq("user_id", userId)
        .maybeSingle();

    if (importError || !importRow) {
        console.error("travel_email_import_fallback_import_lookup_failed", {
            importId,
            userId,
            code: importError?.code,
        });
        throw new Error(
            "We couldn’t add the flights. Nothing was changed. Please try again."
        );
    }

    if (
        importRow.status !== "imported" &&
        !["needs_review", "ready"].includes(importRow.status)
    ) {
        throw new Error("One or more flight details need attention.");
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,slug,title,user_id,archived_at")
        .eq("id", tripId)
        .maybeSingle();

    if (tripError || !trip || trip.archived_at) {
        console.error("travel_email_import_fallback_trip_lookup_failed", {
            importId,
            tripId,
            userId,
            code: tripError?.code,
        });
        throw new Error("Select a trip before continuing.");
    }

    const isTripOwner = trip.user_id === userId;
    const { data: membership, error: membershipError } = isTripOwner
        ? { data: null, error: null }
        : await supabase
              .from("trip_members")
              .select("id")
              .eq("trip_id", tripId)
              .eq("user_id", userId)
              .eq("status", "active")
              .is("left_at", null)
              .maybeSingle();

    if (membershipError || (!isTripOwner && !membership)) {
        console.error("travel_email_import_fallback_trip_not_authorized", {
            importId,
            tripId,
            userId,
            code: membershipError?.code,
        });
        throw new Error("You no longer have permission to edit this trip.");
    }

    const serviceSupabase = createServiceRoleClient();
    const includedItems = submittedItems.filter((item) => item.include);
    if (!includedItems.length) {
        throw new Error("One or more flight details need attention.");
    }

    const createdIds: string[] = [];

    for (const item of includedItems) {
        const data = item.reviewed_data;
        const flightNumber = normalizeFlightFingerprintPart(data.flight_number);
        const airlineCode =
            normalizeFlightFingerprintPart(data.airline_code) ||
            flightNumber.match(/^([A-Z0-9]{2})\d/)?.[1] ||
            "";
        const departureLocation = data.departure_location?.trim();
        const arrivalLocation = data.arrival_location?.trim();
        const departureDate = data.departure_date?.trim();
        const departureTime = data.departure_time?.trim();
        const arrivalDate = data.arrival_date?.trim();
        const arrivalTime = data.arrival_time?.trim();
        const isPrivate = data.is_private === "on" || data.is_private === "true";
        const cost = parseMoneyValue(data.cost);
        const currency = data.currency?.trim().toUpperCase() || "CAD";
        const notes = [
            data.visa_requirements ? `VISA requirements:\n${data.visa_requirements}` : "",
            data.luggage_requirements
                ? `Luggage requirements:\n${data.luggage_requirements}`
                : "",
            data.notes || "",
        ]
            .filter(Boolean)
            .join("\n\n");

        if (
            !flightNumber ||
            !departureLocation ||
            !arrivalLocation ||
            !departureDate ||
            !departureTime ||
            !arrivalDate ||
            !arrivalTime
        ) {
            throw new Error("One or more flight details need attention.");
        }

        const { data: importItem, error: importItemError } = await supabase
            .from("travel_email_import_items")
            .select("id")
            .eq("id", item.item_id)
            .eq("import_id", importId)
            .eq("item_type", "flight")
            .maybeSingle();

        if (importItemError || !importItem) {
            console.error("travel_email_import_fallback_item_lookup_failed", {
                importId,
                itemId: item.item_id,
                userId,
                code: importItemError?.code,
            });
            throw new Error("One or more flight details need attention.");
        }

        const { data: existingFlight, error: existingError } = await supabase
            .from("transportation_items")
            .select("id")
            .eq("trip_id", tripId)
            .eq("transport_type", "flight")
            .eq("transport_number", flightNumber)
            .eq("departure_location", departureLocation)
            .eq("departure_date", departureDate)
            .eq("departure_time", departureTime)
            .maybeSingle();

        if (existingError && existingError.code !== "PGRST116") {
            console.error("travel_email_import_fallback_duplicate_lookup_failed", {
                importId,
                itemId: item.item_id,
                userId,
                code: existingError.code,
            });
            throw new Error(
                "We couldn’t add the flights. Nothing was changed. Please try again."
            );
        }

        if (existingFlight?.id) {
            createdIds.push(existingFlight.id);
            const existingImportItemUpdate = {
                reviewed_data: data as Json,
                matched_trip_id: tripId,
                imported_record_id: existingFlight.id,
                imported_at: new Date().toISOString(),
                is_excluded: false,
            } as never;
            const { error: richItemUpdateError } = await serviceSupabase
                .from("travel_email_import_items")
                .update(existingImportItemUpdate)
                .eq("id", item.item_id)
                .eq("import_id", importId);

            if (
                richItemUpdateError &&
                !isTravelImportReviewSchemaMissingError(richItemUpdateError)
            ) {
                console.warn("travel_email_import_fallback_item_update_failed", {
                    importId,
                    itemId: item.item_id,
                    code: richItemUpdateError.code,
                });
            }
            continue;
        }

        const title = `${flightNumber} ${departureLocation} to ${arrivalLocation}`.trim();
        const routeStops = [
            { order: 0, label: departureLocation },
            { order: 1, label: arrivalLocation },
        ];
        const tripLegId = await resolveImportTripLegIdForDate({
            supabase,
            tripId,
            itemDate: departureDate,
        });
        const { data: insertedFlight, error: insertError } = await supabase
            .from("transportation_items")
            .insert({
                trip_id: tripId,
                created_by: userId,
                title,
                transport_type: "flight",
                status: normalizeTransportationStatus(data.status || ""),
                departure_date: departureDate,
                arrival_date: arrivalDate,
                departure_time: departureTime,
                arrival_time: arrivalTime,
                departure_location: departureLocation,
                arrival_location: arrivalLocation,
                departure_timezone: data.departure_timezone || null,
                arrival_timezone: data.arrival_timezone || null,
                provider_name: data.airline_name || null,
                provider_code: airlineCode || null,
                transport_number: flightNumber,
                reservation_code: data.reservation_code || null,
                seat_number: data.seat_number || null,
                cabin_class: data.cabin_class || null,
                baggage_info: data.luggage_requirements || null,
                departure_terminal: data.departure_terminal || null,
                arrival_terminal: data.arrival_terminal || null,
                cost,
                currency,
                notes: notes || null,
                is_private: isPrivate,
                audience_mode: "everyone",
                route_stops: routeStops as Json,
                trip_leg_id: tripLegId,
            })
            .select("id")
            .single();

        if (insertError || !insertedFlight?.id) {
            console.error("travel_email_import_fallback_transport_insert_failed", {
                importId,
                itemId: item.item_id,
                userId,
                message: insertError?.message,
                code: insertError?.code,
                details: insertError?.details,
                hint: insertError?.hint,
            });
            throw new Error(
                "We couldn’t add the flights. Nothing was changed. Please try again."
            );
        }

        const { data: visibleFlight, error: visibleFlightError } = await supabase
            .from("transportation_items")
            .select("id")
            .eq("id", insertedFlight.id)
            .eq("trip_id", tripId)
            .maybeSingle();

        if (visibleFlightError || !visibleFlight?.id) {
            console.error("travel_email_import_fallback_transport_visibility_failed", {
                importId,
                itemId: item.item_id,
                tripId,
                insertedFlightId: insertedFlight.id,
                code: visibleFlightError?.code,
            });
            throw new Error(
                "We couldn’t add the flights. Nothing was changed. Please try again."
            );
        }

        createdIds.push(insertedFlight.id);

        const insertedImportItemUpdate = {
            reviewed_data: data as Json,
            matched_trip_id: tripId,
            imported_record_id: insertedFlight.id,
            imported_at: new Date().toISOString(),
            is_excluded: false,
        } as never;
        const { error: richItemUpdateError } = await serviceSupabase
            .from("travel_email_import_items")
            .update(insertedImportItemUpdate)
            .eq("id", item.item_id)
            .eq("import_id", importId);

        if (
            richItemUpdateError &&
            !isTravelImportReviewSchemaMissingError(richItemUpdateError)
        ) {
            console.warn("travel_email_import_fallback_item_update_failed", {
                importId,
                itemId: item.item_id,
                code: richItemUpdateError.code,
            });
        }
    }

    const importStatusUpdate = {
        status: "imported",
        matched_trip_id: tripId,
        imported_at: new Date().toISOString(),
    } as never;
    const { error: richImportUpdateError } = await serviceSupabase
        .from("travel_email_imports")
        .update(importStatusUpdate)
        .eq("id", importId)
        .eq("user_id", userId);

    if (
        richImportUpdateError &&
        isTravelImportReviewSchemaMissingError(richImportUpdateError)
    ) {
        console.warn("travel_email_import_rich_tracking_unavailable", {
            importId,
            userId,
            code: richImportUpdateError.code,
        });

        const { error: fallbackImportUpdateError } = await serviceSupabase
            .from("travel_email_imports")
            .update({ status: "imported" })
            .eq("id", importId)
            .eq("user_id", userId);

        if (fallbackImportUpdateError) {
            console.error("travel_email_import_status_fallback_failed", {
                importId,
                userId,
                code: fallbackImportUpdateError.code,
                message: fallbackImportUpdateError.message,
                details: fallbackImportUpdateError.details,
                hint: fallbackImportUpdateError.hint,
            });
            throw new Error(
                "The flight was created, but VAIVIA could not mark this import as reviewed. Please try again."
            );
        }
    } else if (richImportUpdateError) {
        console.error("travel_email_import_fallback_import_status_update_failed", {
            importId,
            userId,
            code: richImportUpdateError.code,
            message: richImportUpdateError.message,
            details: richImportUpdateError.details,
            hint: richImportUpdateError.hint,
        });
        throw new Error(
            "The flight was created, but VAIVIA could not mark this import as reviewed. Please try again."
        );
    }

    await serviceSupabase.from("notifications").insert({
        user_id: userId,
        type: "travel_email_ready",
        title: "Flight added to your trip",
        body:
            createdIds.length === 1
                ? `A flight was added to ${trip.title}.`
                : `${createdIds.length} flights were added to ${trip.title}.`,
        metadata: {
            importId,
            tripId,
            url: `/trips/${trip.slug || trip.id}?tab=journey`,
            source: "travel_email_import_completion",
        },
    });

    return {
        status: "imported",
        tripId,
        tripSlug: trip.slug,
        transportationItemIds: createdIds,
    };
}

async function addImportedFlightsToTrip(formData: FormData) {
    "use server";

    const importId = String(formData.get("import_id") || "").trim();
    const tripId = String(formData.get("trip_id") || "").trim();
    const itemIds = formData
        .getAll("item_id")
        .map((value) => String(value).trim())
        .filter(Boolean);

    if (!importId || !tripId) {
        throw new Error("Select a trip before continuing.");
    }

    if (itemIds.length === 0) {
        throw new Error("One or more flight details need attention.");
    }

    const submittedItems = itemIds.map((itemId) => ({
        item_id: itemId,
        include: formData.get(`include_${itemId}`) === "on",
        reviewed_data: {
            is_private: getReviewedFlightField(formData, itemId, "isPrivate"),
            airline_name: getReviewedFlightField(formData, itemId, "airlineName"),
            airline_code: getReviewedFlightField(formData, itemId, "airlineCode"),
            flight_number: getReviewedFlightField(formData, itemId, "flightNumber"),
            departure_location: getReviewedFlightField(
                formData,
                itemId,
                "departureLocation"
            ),
            arrival_location: getReviewedFlightField(
                formData,
                itemId,
                "arrivalLocation"
            ),
            departure_date: getReviewedFlightField(
                formData,
                itemId,
                "departureDate"
            ),
            departure_time: getReviewedFlightField(
                formData,
                itemId,
                "departureTime"
            ),
            arrival_date: getReviewedFlightField(formData, itemId, "arrivalDate"),
            arrival_time: getReviewedFlightField(formData, itemId, "arrivalTime"),
            departure_timezone: getReviewedFlightField(
                formData,
                itemId,
                "departureTimezone"
            ),
            arrival_timezone: getReviewedFlightField(
                formData,
                itemId,
                "arrivalTimezone"
            ),
            departure_terminal: getReviewedFlightField(
                formData,
                itemId,
                "departureTerminal"
            ),
            arrival_terminal: getReviewedFlightField(
                formData,
                itemId,
                "arrivalTerminal"
            ),
            seat_number: getReviewedFlightField(formData, itemId, "seatNumber"),
            cabin_class: getReviewedFlightField(formData, itemId, "cabinClass"),
            reservation_code: getReviewedFlightField(
                formData,
                itemId,
                "reservationCode"
            ),
            cost: getReviewedFlightField(formData, itemId, "cost"),
            currency: getReviewedFlightField(formData, itemId, "currency"),
            visa_requirements: getReviewedFlightField(
                formData,
                itemId,
                "visaRequirements"
            ),
            luggage_requirements: getReviewedFlightField(
                formData,
                itemId,
                "luggageRequirements"
            ),
            notes: getReviewedFlightField(formData, itemId, "notes"),
            status: getReviewedFlightField(formData, itemId, "status"),
        },
    }));

    if (!submittedItems.some((item) => item.include)) {
        throw new Error("One or more flight details need attention.");
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    let importResult: TravelEmailImportAddResult | null = null;
    const { data, error } = await (supabase as unknown as ImportFlightsRpcClient).rpc(
        "import_travel_email_flights",
        {
            p_import_id: importId,
            p_trip_id: tripId,
            p_items: submittedItems as Json,
        }
    );

    if (error) {
        if (isImportFlightRpcUnavailableError(error)) {
            console.warn("travel_email_import_rpc_unavailable_using_transport_fallback", {
                importId,
                userId: user.id,
                code: error.code,
            });
            importResult = await addImportedFlightsUsingTransportationFallback({
                supabase,
                userId: user.id,
                importId,
                tripId,
                submittedItems,
            });
        } else {
        console.error("travel_email_import_add_to_trip_failed", {
            importId,
            userId: user.id,
            code: error.code,
        });
        throw new Error("We couldn’t add the flights. Nothing was changed. Please try again.");
        }
    } else {
        importResult = data;
    }

    await markTravelEmailImportNotificationsRead({
        supabase,
        userId: user.id,
        importId,
    });

    revalidatePath(`/imports/${importId}`);
    revalidatePath("/imports");

    const tripRouteSegment = importResult?.tripSlug || tripId;
    revalidatePath(`/trips/${tripId}`);
    if (importResult?.tripSlug) {
        revalidatePath(`/trips/${importResult.tripSlug}`);
    }
    redirect(`/trips/${tripRouteSegment}?tab=journey`);
}

export default async function ImportReviewPage({ params }: ImportPageProps) {
    const { importId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data: importRow, error: importError },
        { data: attachments, error: attachmentsError },
        { data: items, error: itemsError },
        { data: trips, error: tripsError },
    ] = await Promise.all([
        loadTravelEmailImportForReview(supabase, importId, user.id),
        supabase
            .from("travel_email_import_attachments")
            .select("id,filename,mime_type,size_bytes,storage_path")
            .eq("import_id", importId)
            .order("created_at", { ascending: true }),
        loadTravelEmailImportItemsForReview(supabase, importId),
        supabase
            .from("trips")
            .select("id,slug,title,destination,start_date,end_date")
            .order("start_date", { ascending: false }),
    ]);

    if (importError) {
        console.error("Could not load travel email import:", {
            message: importError.message,
            code: importError.code,
            details: importError.details,
            hint: importError.hint,
            importId,
            userId: user.id,
        });
        throw new Error("Could not load travel email import");
    }

    if (!importRow) notFound();

    if (attachmentsError || itemsError || tripsError) {
        console.error("Could not load travel email import review details:", {
            attachmentsError,
            itemsError,
            tripsError,
            importId,
            userId: user.id,
        });
        throw new Error("Could not load travel email import details");
    }

    const reviewImport = importRow as TravelEmailImportRow;
    const reviewAttachments = (attachments || []) as TravelEmailImportAttachmentRow[];
    const reviewItems = (items || []) as TravelEmailImportItemRow[];
    const editableTrips = (trips || []) as ImportTripOption[];
    const editableFlights = reviewItems
        .filter((item) => item.item_type === "flight")
        .map((item) =>
            getEditableImportedFlight(item.id, item.extracted_data, item.reviewed_data)
        );
    const tripMatch = matchImportToTrips(editableFlights, editableTrips);
    const selectedTripId =
        reviewImport.matched_trip_id ||
        tripMatch.recommendedTripId ||
        editableTrips[0]?.id ||
        "";
    const selectedTrip = editableTrips.find((trip) => trip.id === selectedTripId);
    const retryAvailable = canRetryImport(
        reviewImport.status,
        reviewImport.processed_at
    );
    const isReviewableImport =
        reviewImport.status === "needs_review" || reviewImport.status === "ready";
    const isIgnoredImport = reviewImport.status === "rejected";
    const importedRecordIds = reviewItems
        .map((item) => item.imported_record_id)
        .filter((id): id is string => Boolean(id));
    const hasImportedRecordLinks = importedRecordIds.length > 0;
    const { data: importedRecords } = importedRecordIds.length
        ? await supabase
              .from("transportation_items")
              .select("id,title,transport_number")
              .in("id", importedRecordIds)
        : { data: [] };
    const importedRecordsById = new Map(
        ((importedRecords || []) as ImportedTransportationRecord[]).map((record) => [
            record.id,
            record,
        ])
    );
    const { data: existingFlights } = selectedTripId
        ? await supabase
              .from("transportation_items")
              .select(
                  "id,title,transport_number,departure_location,departure_date,departure_time"
              )
              .eq("trip_id", selectedTripId)
              .eq("transport_type", "flight")
        : { data: [] };
    const existingFlightsByFingerprint = new Map(
        ((existingFlights || []) as ExistingTransportationFlight[]).map((flight) => [
            getFlightFingerprint(flight),
            flight,
        ])
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-[calc(8rem+var(--safe-area-top))] text-white md:py-10 md:pl-28">
            <div className="mx-auto max-w-5xl space-y-6">
                <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)] p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Travel email import
                                </p>
                                <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
                                    {reviewImport.subject || "Imported confirmation"}
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                                    VAIVIA received this forwarded confirmation and prepared
                                    the details below for review.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {retryAvailable ? (
                                    <form action={retryTravelEmailImport}>
                                        <input
                                            type="hidden"
                                            name="import_id"
                                            value={reviewImport.id}
                                        />
                                        <button
                                            type="submit"
                                            className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                        >
                                            Retry processing
                                        </button>
                                    </form>
                                ) : null}
                                <Link
                                    href="/settings?section=communications"
                                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                                >
                                    Email import settings
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Status
                            </p>
                            <span
                                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${getTravelEmailImportStatusClasses(
                                    reviewImport.status
                                )}`}
                            >
                                {getTravelEmailImportStatusLabel(reviewImport.status)}
                            </span>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Received
                            </p>
                            <p className="mt-2 text-sm font-bold text-white">
                                {formatDate(reviewImport.created_at)}
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Processed
                            </p>
                            <p className="mt-2 text-sm font-bold text-white">
                                {formatDate(reviewImport.processed_at)}
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Confidence
                            </p>
                            <p className="mt-2 text-lg font-black text-lime-100">
                                {formatPercent(reviewImport.extraction_confidence)}
                            </p>
                        </div>
                    </div>
                </section>

                {reviewImport.extraction_error ? (
                    <section className="rounded-[2rem] border border-red-300/20 bg-red-950/20 p-5 text-red-100">
                        <p className="text-xs font-black uppercase tracking-[0.22em]">
                            Extraction needs attention
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                            {getUserFacingExtractionError(
                                reviewImport.extraction_error
                            )}
                        </p>
                        {retryAvailable ? (
                            <form action={retryTravelEmailImport} className="mt-4">
                                <input
                                    type="hidden"
                                    name="import_id"
                                    value={reviewImport.id}
                                />
                                <button
                                    type="submit"
                                    className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                >
                                    Retry processing
                                </button>
                            </form>
                        ) : null}
                    </section>
                ) : null}

                <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                <Plane className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                    Prepared items
                                </p>
                                <h2 className="text-xl font-black">
                                    {reviewItems.length
                                        ? `${reviewItems.length} item${
                                              reviewItems.length === 1 ? "" : "s"
                                          } found`
                                        : "No prepared items yet"}
                                </h2>
                            </div>
                        </div>

                        <div className="mt-5 space-y-4">
                            {reviewImport.status === "imported" &&
                            hasImportedRecordLinks ? (
                                <section className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-5">
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                        Imported
                                    </p>
                                    <h3 className="mt-2 text-2xl font-black text-white">
                                        Flights added to{" "}
                                        {selectedTrip?.title || "your trip"}
                                    </h3>
                                    <p className="mt-2 text-sm font-semibold text-lime-50/85">
                                        Imported {formatDate(reviewImport.imported_at)}
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        {reviewItems
                                            .filter((item) => item.imported_record_id)
                                            .map((item) => {
                                                const record = item.imported_record_id
                                                    ? importedRecordsById.get(
                                                          item.imported_record_id
                                                      )
                                                    : null;

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="rounded-2xl border border-white/10 bg-slate-950/50 p-3"
                                                    >
                                                        <p className="text-sm font-black text-white">
                                                            {record?.transport_number ||
                                                                record?.title ||
                                                                getItemTitle(item)}
                                                        </p>
                                                        {selectedTrip ? (
                                                            <Link
                                                                href={`/trips/${getTripRouteSegment(
                                                                    selectedTrip
                                                                )}?tab=journey`}
                                                                className="mt-2 inline-flex rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-slate-950"
                                                            >
                                                                View transportation
                                                            </Link>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        {selectedTrip ? (
                                            <Link
                                                href={`/trips/${getTripRouteSegment(
                                                    selectedTrip
                                                )}?tab=journey`}
                                                className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
                                            >
                                                View trip
                                            </Link>
                                        ) : null}
                                        <Link
                                            href="/imports"
                                            className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200"
                                        >
                                            Back to imports
                                        </Link>
                                    </div>
                                </section>
                            ) : isIgnoredImport ? (
                                <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5">
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                                        Ignored
                                    </p>
                                    <h3 className="mt-2 text-2xl font-black text-white">
                                        This import has been reviewed
                                    </h3>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                        VAIVIA will keep this confirmation in your
                                        imports list, but it will no longer appear in
                                        your notification dropdown or review prompts.
                                    </p>
                                    <Link
                                        href="/imports"
                                        className="mt-5 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                                    >
                                        Back to imports
                                    </Link>
                                </section>
                            ) : isReviewableImport && reviewItems.length ? (
                                <form action={addImportedFlightsToTrip} className="space-y-4">
                                    <input
                                        type="hidden"
                                        name="import_id"
                                        value={reviewImport.id}
                                    />
                                    <section className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-4">
                                        <p className="text-sm font-black text-lime-50">
                                            These flights have not been added to a trip yet.
                                        </p>
                                        <label className="mt-4 block">
                                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                {tripMatch.confidence === "recommended"
                                                    ? "Recommended trip"
                                                    : tripMatch.confidence === "possible"
                                                      ? "Possible trip"
                                                      : "Select a trip"}
                                            </span>
                                            {editableTrips.length ? (
                                                <select
                                                    name="trip_id"
                                                    defaultValue={selectedTripId}
                                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none focus:border-lime-300/50"
                                                >
                                                    {editableTrips.map((trip) => (
                                                        <option
                                                            key={trip.id}
                                                            value={trip.id}
                                                        >
                                                            {trip.title}
                                                            {trip.id ===
                                                            tripMatch.recommendedTripId
                                                                ? " · Recommended"
                                                                : ""}
                                                            {trip.start_date
                                                                ? ` · ${trip.start_date}`
                                                                : ""}
                                                            {trip.end_date
                                                                ? ` - ${trip.end_date}`
                                                                : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                                                    <p className="text-sm font-bold text-white">
                                                        Create a trip before adding this
                                                        flight.
                                                    </p>
                                                    <Link
                                                        href={`/trips/new?returnTo=/imports/${reviewImport.id}`}
                                                        className="mt-3 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950"
                                                    >
                                                        Create trip
                                                    </Link>
                                                </div>
                                            )}
                                        </label>
                                    </section>

                                    {reviewItems.map((item) =>
                                        item.item_type === "flight" ? (
                                            <EditableFlightCard
                                                key={item.id}
                                                item={item}
                                                flight={
                                                    editableFlights.find(
                                                        (flight) =>
                                                            flight.itemId === item.id
                                                    ) ||
                                                    getEditableImportedFlight(
                                                        item.id,
                                                        item.extracted_data,
                                                        item.reviewed_data
                                                    )
                                                }
                                                duplicateRecord={existingFlightsByFingerprint.get(
                                                    getFlightFingerprint(
                                                        editableFlights.find(
                                                            (flight) =>
                                                                flight.itemId === item.id
                                                        ) ||
                                                            getEditableImportedFlight(
                                                                item.id,
                                                                item.extracted_data,
                                                                item.reviewed_data
                                                            )
                                                    )
                                                )}
                                                selectedTrip={selectedTrip}
                                            />
                                        ) : (
                                            <article
                                                key={item.id}
                                                className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4"
                                            >
                                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                                    {item.item_type.replaceAll("_", " ")}
                                                </p>
                                                <h3 className="mt-1 text-lg font-black">
                                                    {getItemTitle(item)}
                                                </h3>
                                                <p className="mt-3 text-sm font-semibold text-slate-400">
                                                    Only flight imports can be added to a
                                                    trip in this step.
                                                </p>
                                            </article>
                                        )
                                    )}

                                    <div className="sticky bottom-4 z-10 rounded-[1.5rem] border border-white/10 bg-[#050712]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
                                        <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                                            <button
                                                type="submit"
                                                formAction={ignoreTravelEmailImport}
                                                formNoValidate
                                                className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                                            >
                                                Ignore
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={!editableTrips.length}
                                                className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {selectedTrip
                                                    ? `Add ${
                                                          editableFlights.length
                                                      } flight${
                                                          editableFlights.length === 1
                                                              ? ""
                                                              : "s"
                                                      } to ${selectedTrip.title}`
                                                    : "Select a trip before continuing"}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/50 p-5 text-sm font-semibold text-slate-400">
                                    {reviewImport.status === "failed"
                                        ? "VAIVIA could not process this confirmation. You can retry processing from the top of the page."
                                        : "Once processing finishes, VAIVIA will list detected flights, stays, receipts, or itinerary details here."}
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                    <Inbox className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                        Email details
                                    </p>
                                    <h2 className="text-xl font-black">Source</h2>
                                </div>
                            </div>
                            <dl className="mt-5 space-y-3 text-sm">
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        From
                                    </dt>
                                    <dd className="mt-1 break-words font-bold text-slate-200">
                                        {reviewImport.sender_email || "Unknown sender"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        To
                                    </dt>
                                    <dd className="mt-1 break-words font-bold text-slate-200">
                                        Private VAIVIA import address
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        Provider
                                    </dt>
                                    <dd className="mt-1 font-bold capitalize text-slate-200">
                                        {reviewImport.provider}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                        Attachments
                                    </p>
                                    <h2 className="text-xl font-black">
                                        {reviewAttachments.length || reviewImport.attachment_count}
                                    </h2>
                                </div>
                            </div>
                            <div className="mt-5 space-y-3">
                                {reviewAttachments.length ? (
                                    reviewAttachments.map((attachment) => (
                                        <div
                                            key={attachment.id}
                                            className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-3"
                                        >
                                            <p className="break-words text-sm font-black text-white">
                                                {attachment.filename || "Attachment"}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                                {attachment.mime_type || "Unknown type"} ·{" "}
                                                {formatBytes(attachment.size_bytes)}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="rounded-[1.25rem] border border-dashed border-white/15 bg-slate-950/50 p-3 text-sm font-semibold text-slate-400">
                                        No stored attachments for this import.
                                    </p>
                                )}
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-lime-300/15 bg-lime-300/10 p-5">
                            <div className="flex items-start gap-3">
                                <ShieldCheck
                                    className="mt-1 h-5 w-5 shrink-0 text-lime-200"
                                    aria-hidden="true"
                                />
                                <p className="text-sm font-semibold leading-6 text-lime-50">
                                    This page only loads imports owned by your account.
                                    Private raw email and storage records remain protected
                                    by Supabase policies.
                                </p>
                            </div>
                        </section>
                    </aside>
                </section>

                {reviewImport.extracted_data ? (
                    <details className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                        <summary className="flex cursor-pointer items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                <FileText className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span>
                                <span className="block text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                    Technical details
                                </span>
                                <span className="block text-xl font-black">
                                    Import summary payload
                                </span>
                            </span>
                        </summary>
                        <pre className="mt-5 max-h-96 overflow-auto rounded-[1rem] border border-white/10 bg-black/40 p-4 text-xs font-semibold leading-5 text-slate-200">
                            {stringifyJson(reviewImport.extracted_data)}
                        </pre>
                    </details>
                ) : null}
            </div>
        </main>
    );
}
