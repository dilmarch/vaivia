import { Inbox, Paperclip, Plane, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Json } from "@/src/types/supabase";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processTravelEmailImport } from "@/lib/travelEmailImportProcessor";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import ImportAirportFields from "@/components/ImportAirportFields";
import ImportTripTravelerSelector, {
    type ImportTravelerTrip,
} from "@/components/ImportTripTravelerSelector";
import { resolveImportedFlightTimezones } from "@/lib/importAirportTimezones";
import {
    findImportedFlightMatch,
    getImportedFlightMergePatch,
    getImportedFlightFingerprint,
    normalizeImportedFlightNumber,
    parseImportedCoordinate,
} from "@/lib/importFlightMatching";
import ImportFlightMatchReview from "@/components/ImportFlightMatchReview";
import { getTripRouteSegment } from "@/lib/tripRoutes";
import { stripStructuredFlightNotes } from "@/lib/flightNotes";
import {
    applyConfirmationPriceToFlights,
    getEditableImportedFlight,
    getImportedTravelerNames,
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
    trip_id: string;
    title: string | null;
    transport_number: string | null;
    departure_location: string | null;
    arrival_location: string | null;
    departure_date: string | null;
    departure_time: string | null;
    arrival_date: string | null;
    arrival_time: string | null;
    notes: string | null;
    status?: string | null;
    provider_name?: string | null;
    provider_code?: string | null;
    reservation_code?: string | null;
    baggage_info?: string | null;
    seat_number?: string | null;
    cabin_class?: string | null;
    departure_terminal?: string | null;
    arrival_terminal?: string | null;
    cost?: number | null;
    currency?: string | null;
    departure_timezone?: string | null;
    arrival_timezone?: string | null;
    departure_formatted_address?: string | null;
    departure_google_place_id?: string | null;
    departure_lat?: number | null;
    departure_lng?: number | null;
    arrival_formatted_address?: string | null;
    arrival_google_place_id?: string | null;
    arrival_lat?: number | null;
    arrival_lng?: number | null;
};

type ImportTripRow = ImportTripOption & {
    user_id: string;
};

type ImportTravelerSelection = {
    userIds: string[];
    familyMemberIds: string[];
    guestNames: string[];
};

type SubmittedImportFlight = {
    item_id: string;
    include: boolean;
    match_action: "create" | "merge" | "separate";
    reviewed_data: Record<string, string>;
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

function FlightTextInput({
    itemId,
    field,
    label,
    defaultValue,
    required = false,
    type = "text",
    step,
}: {
    itemId: string;
    field: keyof EditableImportedFlight;
    label: string;
    defaultValue: string;
    required?: boolean;
    type?: string;
    step?: string;
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
                step={step}
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
    const fieldClassName =
        "mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50";

    return (
        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
                {required ? (
                    <span className="ml-1 text-lime-200">Required before adding</span>
                ) : null}
            </span>
            {type === "date" ? (
                <DateInput
                    name={getLegFieldName(itemId, legField)}
                    defaultValue={defaultValue}
                    required={required}
                    className={fieldClassName}
                />
            ) : type === "time" ? (
                <TimeInput
                    name={getLegFieldName(itemId, legField)}
                    defaultValue={defaultValue}
                    required={required}
                    className={fieldClassName}
                />
            ) : (
                <input
                    name={getLegFieldName(itemId, legField)}
                    type={type}
                    defaultValue={defaultValue}
                    required={required}
                    className={fieldClassName}
                />
            )}
        </label>
    );
}

function EditableFlightCard({
    item,
    flight,
    flightRecordsByTrip,
    defaultTripId,
    tripHrefsById,
}: {
    item: TravelEmailImportItemRow;
    flight: EditableImportedFlight;
    flightRecordsByTrip: Record<string, ExistingTransportationFlight[]>;
    defaultTripId: string;
    tripHrefsById: Record<string, string>;
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
                    Review this flight before importing it.
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
                <ImportFlightMatchReview
                    itemId={item.id}
                    importedFlight={flight}
                    flightRecordsByTrip={flightRecordsByTrip}
                    defaultTripId={defaultTripId}
                    tripHrefsById={tripHrefsById}
                />
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
                                Review this flight before adding it to Transport.
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
                    <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                Select mode of transportation
                            </p>
                            <p className="mt-2 text-sm font-black text-white">✈️ Airplane</p>
                        </div>
                    </div>
                </div>

                <fieldset className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                    <legend className="px-1 text-sm font-black text-white">
                        Flight leg 1
                    </legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ImportAirportFields
                            itemId={item.id}
                            departureDate={flight.departureDate}
                            arrivalDate={flight.arrivalDate}
                            departure={{
                                location: flight.departureLocation,
                                formattedAddress: flight.departureFormattedAddress,
                                googlePlaceId: flight.departureGooglePlaceId,
                                latitude: flight.departureLat,
                                longitude: flight.departureLng,
                                timezone: flight.departureTimezone,
                            }}
                            arrival={{
                                location: flight.arrivalLocation,
                                formattedAddress: flight.arrivalFormattedAddress,
                                googlePlaceId: flight.arrivalGooglePlaceId,
                                latitude: flight.arrivalLat,
                                longitude: flight.arrivalLng,
                                timezone: flight.arrivalTimezone,
                            }}
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
                            defaultValue={flight.cost}
                            type="number"
                            step="0.01"
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

function getReviewedFlightLegField(
    formData: FormData,
    itemId: string,
    field: string
) {
    return String(formData.get(getLegFieldName(itemId, field)) || "").trim();
}

function normalizeTransportationStatus(status: string) {
    if (status === "planned") return "booked";

    return ["booked", "confirmed", "cancelled", "completed"].includes(
        status
    )
        ? status
        : "booked";
}

function getUniqueFormStrings(
    formData: FormData,
    name: string,
    maxLength = 120
) {
    return Array.from(
        new Set(
            formData
                .getAll(name)
                .map((value) => String(value).trim().slice(0, maxLength))
                .filter(Boolean)
        )
    );
}

function getImportTravelerSelection(formData: FormData): ImportTravelerSelection {
    return {
        userIds: getUniqueFormStrings(formData, "traveler_user_ids", 64),
        familyMemberIds: getUniqueFormStrings(
            formData,
            "traveler_family_member_ids",
            64
        ),
        guestNames: getUniqueFormStrings(formData, "traveler_guest_names"),
    };
}

async function validateImportTravelerSelection({
    supabase,
    userId,
    tripId,
    selection,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    userId: string;
    tripId: string;
    selection: ImportTravelerSelection;
}) {
    const selectedCount =
        selection.userIds.length +
        selection.familyMemberIds.length +
        selection.guestNames.length;
    if (selectedCount === 0 || selectedCount > 50) {
        throw new Error("Select at least one traveler before adding this import.");
    }

    const usersToValidate = Array.from(new Set([...selection.userIds, userId]));
    const [tripResult, memberResult, tripFamilyResult, familyResult] =
        await Promise.all([
            supabase
                .from("trips")
                .select("user_id")
                .eq("id", tripId)
                .maybeSingle(),
            supabase
                .from("trip_members")
                .select("user_id")
                .eq("trip_id", tripId)
                .eq("status", "active")
                .is("left_at", null)
                .in("user_id", usersToValidate),
            selection.familyMemberIds.length
                ? supabase
                      .from("trip_family_members")
                      .select("family_member_id")
                      .eq("trip_id", tripId)
                      .eq("status", "going")
                      .in("family_member_id", selection.familyMemberIds)
                : Promise.resolve({ data: [], error: null }),
            selection.familyMemberIds.length
                ? supabase
                      .from("user_family_members")
                      .select("id")
                      .eq("user_id", userId)
                      .in("id", selection.familyMemberIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

    const validUserIds = new Set(
        (memberResult.data || []).map((member) => member.user_id)
    );
    if (tripResult.data?.user_id) validUserIds.add(tripResult.data.user_id);
    const userCanEditTrip =
        !tripResult.error &&
        Boolean(tripResult.data) &&
        validUserIds.has(userId);
    const selectedUsersAreValid =
        !memberResult.error &&
        selection.userIds.every((selectedUserId) =>
            validUserIds.has(selectedUserId)
        );
    const selectedFamilyAreValid =
        !tripFamilyResult.error &&
        !familyResult.error &&
        (tripFamilyResult.data || []).length === selection.familyMemberIds.length &&
        (familyResult.data || []).length === selection.familyMemberIds.length;

    if (!userCanEditTrip || !selectedUsersAreValid || !selectedFamilyAreValid) {
        throw new Error(
            "One or more selected travelers are not available for this trip. Review the traveler selection and try again."
        );
    }
}

async function saveImportedFlightTravelers({
    userId,
    tripId,
    transportationItemIds,
    selection,
}: {
    userId: string;
    tripId: string;
    transportationItemIds: string[];
    selection: ImportTravelerSelection;
}) {
    const itemIds = Array.from(new Set(transportationItemIds.filter(Boolean)));
    if (itemIds.length === 0) {
        throw new Error("VAIVIA could not confirm the imported flights.");
    }

    // The import mutation has already verified ownership and trip access. Use the
    // server-only client here so an exact replacement cannot be weakened by an
    // older row's creator-scoped delete policy.
    const serviceSupabase = createServiceRoleClient();
    const { error: travelerDeleteError } = await serviceSupabase
        .from("transportation_item_travelers")
        .delete()
        .eq("trip_id", tripId)
        .in("transportation_item_id", itemIds);

    if (travelerDeleteError) {
        throw new Error("VAIVIA could not save who this import is for.");
    }

    const travelerRows: Array<{
        transportation_item_id: string;
        trip_id: string;
        created_by: string;
        user_id?: string;
        family_member_id?: string;
        guest_name?: string;
    }> = itemIds.flatMap((transportationItemId) => [
        ...selection.userIds.map((selectedUserId) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            user_id: selectedUserId,
            created_by: userId,
        })),
        ...selection.familyMemberIds.map((familyMemberId) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            family_member_id: familyMemberId,
            created_by: userId,
        })),
        ...selection.guestNames.map((guestName) => ({
            transportation_item_id: transportationItemId,
            trip_id: tripId,
            guest_name: guestName,
            created_by: userId,
        })),
    ]);
    const { error: travelerInsertError } = await serviceSupabase
        .from("transportation_item_travelers")
        .insert(travelerRows);
    if (travelerInsertError) {
        console.error("travel_email_import_traveler_insert_failed", {
            importTravelerCount: travelerRows.length,
            code: travelerInsertError.code,
        });
        throw new Error("VAIVIA could not save who this import is for.");
    }

    const { error: participantDeleteError } = await serviceSupabase
        .from("trip_item_participants")
        .delete()
        .eq("trip_id", tripId)
        .eq("item_type", "transportation")
        .in("item_id", itemIds);
    if (participantDeleteError) {
        throw new Error("VAIVIA could not save who this import is for.");
    }

    const participantRows = itemIds.flatMap((itemId) => [
        ...selection.userIds.map((selectedUserId) => ({
            trip_id: tripId,
            item_type: "transportation",
            item_id: itemId,
            participant_kind: "user",
            user_id: selectedUserId,
            created_by: userId,
        })),
        ...selection.familyMemberIds.map((familyMemberId) => ({
            trip_id: tripId,
            item_type: "transportation",
            item_id: itemId,
            participant_kind: "family_member",
            family_member_id: familyMemberId,
            created_by: userId,
        })),
        ...selection.guestNames.map((guestName) => ({
            trip_id: tripId,
            item_type: "transportation",
            item_id: itemId,
            participant_kind: "guest",
            guest_name: guestName,
            created_by: userId,
        })),
    ]);
    const { error: participantInsertError } = await serviceSupabase
        .from("trip_item_participants")
        .insert(participantRows);
    if (participantInsertError) {
        throw new Error("VAIVIA could not save who this import is for.");
    }

    const isJustCurrentUser =
        selection.userIds.length === 1 &&
        selection.userIds[0] === userId &&
        selection.familyMemberIds.length === 0 &&
        selection.guestNames.length === 0;
    const { error: audienceError } = await serviceSupabase
        .from("transportation_items")
        .update({ audience_mode: isJustCurrentUser ? "just_me" : "custom" })
        .eq("trip_id", tripId)
        .in("id", itemIds);
    if (audienceError) {
        throw new Error("VAIVIA could not save who this import is for.");
    }
}

function parseMoneyValue(value?: string | null) {
    const normalized = String(value || "").replace(/,/g, "").trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
}

async function prepareExistingImportedFlightMatches({
    supabase,
    tripId,
    submittedItems,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    tripId: string;
    submittedItems: SubmittedImportFlight[];
}) {
    const includedItems = submittedItems.filter(
        (item) => item.include && item.match_action !== "separate"
    );
    if (includedItems.length === 0) return;

    const { data, error } = await supabase
        .from("transportation_items")
        .select(
            "id,trip_id,title,status,transport_number,departure_location,arrival_location,departure_date,departure_time,arrival_date,arrival_time,notes,provider_name,provider_code,reservation_code,baggage_info,seat_number,cabin_class,departure_terminal,arrival_terminal,cost,currency,departure_timezone,arrival_timezone,departure_formatted_address,departure_google_place_id,departure_lat,departure_lng,arrival_formatted_address,arrival_google_place_id,arrival_lat,arrival_lng"
        )
        .eq("trip_id", tripId)
        .eq("transport_type", "flight")
        .limit(500);

    if (error) {
        throw new Error("VAIVIA could not check this trip for matching flights.");
    }

    const existingFlights = (data || []) as ExistingTransportationFlight[];
    for (const item of includedItems) {
        const existingFlight = findImportedFlightMatch(
            existingFlights,
            {
                flightNumber: item.reviewed_data.flight_number,
                departureDate: item.reviewed_data.departure_date,
                departureTime: item.reviewed_data.departure_time,
            }
        );
        if (!existingFlight) continue;

        const { error: updateError } = await supabase
            .from("transportation_items")
            .update(getImportedFlightMergePatch(item.reviewed_data, existingFlight))
            .eq("id", existingFlight.id)
            .eq("trip_id", tripId);

        if (updateError) {
            throw new Error("VAIVIA could not link this import to the matching flight.");
        }

        item.reviewed_data.departure_location =
            existingFlight.departure_location ||
            item.reviewed_data.departure_location;
        item.reviewed_data.arrival_location =
            existingFlight.arrival_location || item.reviewed_data.arrival_location;
        item.reviewed_data.flight_number =
            normalizeImportedFlightNumber(
                existingFlight.transport_number ||
                    getImportedFlightFingerprint(existingFlight).split("|")[0]
            ) || item.reviewed_data.flight_number;
        item.reviewed_data.departure_date =
            existingFlight.departure_date || item.reviewed_data.departure_date;
        item.reviewed_data.departure_time =
            existingFlight.departure_time || item.reviewed_data.departure_time;
    }
}

async function saveImportedFlightPlaceMetadata({
    supabase,
    importId,
    tripId,
    submittedItems,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    importId: string;
    tripId: string;
    submittedItems: SubmittedImportFlight[];
}) {
    const itemIds = submittedItems.map((item) => item.item_id);
    const { data: importItems, error: importItemsError } = await supabase
        .from("travel_email_import_items")
        .select("id,imported_record_id")
        .eq("import_id", importId)
        .in("id", itemIds);

    if (importItemsError) {
        if (isTravelImportReviewSchemaMissingError(importItemsError)) {
            console.warn("travel_email_import_airport_metadata_tracking_unavailable", {
                importId,
                code: importItemsError.code,
            });
            return;
        }
        throw new Error("VAIVIA could not finish saving the imported airports.");
    }

    const records = (importItems || []).filter(
        (item): item is { id: string; imported_record_id: string } =>
            Boolean(item.imported_record_id)
    );
    if (records.length === 0) return;

    const recordIds = records.map((item) => item.imported_record_id);
    const { data: transportationRows, error: transportationError } = await supabase
        .from("transportation_items")
        .select(
            "id,trip_id,title,status,transport_number,departure_location,arrival_location,departure_date,departure_time,arrival_date,arrival_time,notes,provider_name,provider_code,reservation_code,baggage_info,seat_number,cabin_class,departure_terminal,arrival_terminal,cost,currency,departure_timezone,arrival_timezone,departure_formatted_address,departure_google_place_id,departure_lat,departure_lng,arrival_formatted_address,arrival_google_place_id,arrival_lat,arrival_lng"
        )
        .eq("trip_id", tripId)
        .in("id", recordIds);

    if (transportationError) {
        throw new Error("VAIVIA could not finish saving the imported airports.");
    }

    const submittedById = new Map(
        submittedItems.map((item) => [item.item_id, item.reviewed_data])
    );
    const transportationById = new Map(
        ((transportationRows || []) as ExistingTransportationFlight[]).map((item) => [
            item.id,
            item,
        ])
    );

    for (const importItem of records) {
        const reviewedData = submittedById.get(importItem.id);
        const transportation = transportationById.get(importItem.imported_record_id);
        if (!reviewedData || !transportation) continue;

        const { error } = await supabase
            .from("transportation_items")
            .update(getImportedFlightMergePatch(reviewedData, transportation))
            .eq("id", transportation.id)
            .eq("trip_id", tripId);
        if (error) {
            throw new Error("VAIVIA could not finish saving the imported airports.");
        }
    }
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
    submittedItems: SubmittedImportFlight[];
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
        const flightNumber = normalizeImportedFlightNumber(data.flight_number);
        const airlineCode =
            normalizeImportedFlightNumber(data.airline_code) ||
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
        const notes = stripStructuredFlightNotes(data.notes);

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

        const { data: existingFlightCandidates, error: existingError } = await supabase
            .from("transportation_items")
            .select(
                "id,trip_id,title,status,transport_number,departure_location,arrival_location,departure_date,departure_time,arrival_date,arrival_time,notes,provider_name,provider_code,reservation_code,baggage_info,seat_number,cabin_class,departure_terminal,arrival_terminal,cost,currency,departure_timezone,arrival_timezone,departure_formatted_address,departure_google_place_id,departure_lat,departure_lng,arrival_formatted_address,arrival_google_place_id,arrival_lat,arrival_lng"
            )
            .eq("trip_id", tripId)
            .eq("transport_type", "flight")
            .limit(500);

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

        const existingFlight =
            item.match_action === "separate"
                ? null
                : findImportedFlightMatch(
                      (existingFlightCandidates || []) as ExistingTransportationFlight[],
                      {
                          flightNumber,
                          departureDate,
                          departureTime,
                      }
                  );

        if (existingFlight?.id) {
            const { error: mergeError } = await supabase
                .from("transportation_items")
                .update(getImportedFlightMergePatch(data, existingFlight))
                .eq("id", existingFlight.id)
                .eq("trip_id", tripId);

            if (mergeError) {
                console.error("travel_email_import_fallback_merge_failed", {
                    importId,
                    itemId: item.item_id,
                    userId,
                    code: mergeError.code,
                });
                throw new Error(
                    "We couldn’t merge this confirmation with the existing flight. Nothing was changed."
                );
            }

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
                departure_formatted_address:
                    data.departure_formatted_address || null,
                departure_google_place_id:
                    data.departure_google_place_id || null,
                departure_lat: parseImportedCoordinate(data.departure_lat, -90, 90),
                departure_lng: parseImportedCoordinate(data.departure_lng, -180, 180),
                arrival_formatted_address: data.arrival_formatted_address || null,
                arrival_google_place_id: data.arrival_google_place_id || null,
                arrival_lat: parseImportedCoordinate(data.arrival_lat, -90, 90),
                arrival_lng: parseImportedCoordinate(data.arrival_lng, -180, 180),
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
    const travelerSelection = getImportTravelerSelection(formData);
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

    const submittedItems: SubmittedImportFlight[] = itemIds.map((itemId) => {
        const requestedMatchAction = String(
            formData.get(`match_action_${itemId}`) || "create"
        );
        const matchAction: SubmittedImportFlight["match_action"] =
            requestedMatchAction === "merge" || requestedMatchAction === "separate"
                ? requestedMatchAction
                : "create";

        return {
            item_id: itemId,
            include: formData.get(`include_${itemId}`) === "on",
            match_action: matchAction,
            reviewed_data: {
                import_match_action: matchAction,
            is_private: getReviewedFlightField(formData, itemId, "isPrivate"),
            airline_name: getReviewedFlightField(formData, itemId, "airlineName"),
            airline_code: getReviewedFlightField(formData, itemId, "airlineCode"),
            flight_number: getReviewedFlightField(formData, itemId, "flightNumber"),
            departure_location: getReviewedFlightField(
                formData,
                itemId,
                "departureLocation"
            ),
            departure_formatted_address: getReviewedFlightLegField(
                formData,
                itemId,
                "departure_formatted_address"
            ),
            departure_google_place_id: getReviewedFlightLegField(
                formData,
                itemId,
                "departure_google_place_id"
            ),
            departure_lat: getReviewedFlightLegField(
                formData,
                itemId,
                "departure_lat"
            ),
            departure_lng: getReviewedFlightLegField(
                formData,
                itemId,
                "departure_lng"
            ),
            arrival_location: getReviewedFlightField(
                formData,
                itemId,
                "arrivalLocation"
            ),
            arrival_formatted_address: getReviewedFlightLegField(
                formData,
                itemId,
                "arrival_formatted_address"
            ),
            arrival_google_place_id: getReviewedFlightLegField(
                formData,
                itemId,
                "arrival_google_place_id"
            ),
            arrival_lat: getReviewedFlightLegField(
                formData,
                itemId,
                "arrival_lat"
            ),
            arrival_lng: getReviewedFlightLegField(
                formData,
                itemId,
                "arrival_lng"
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
            status: normalizeTransportationStatus(
                getReviewedFlightField(formData, itemId, "status")
            ),
            },
        };
    });

    if (!submittedItems.some((item) => item.include)) {
        throw new Error("One or more flight details need attention.");
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    await validateImportTravelerSelection({
        supabase,
        userId: user.id,
        tripId,
        selection: travelerSelection,
    });
    let importResult: TravelEmailImportAddResult | null = null;
    const requiresSeparateInsert = submittedItems.some(
        (item) => item.include && item.match_action === "separate"
    );

    if (requiresSeparateInsert) {
        importResult = await addImportedFlightsUsingTransportationFallback({
            supabase,
            userId: user.id,
            importId,
            tripId,
            submittedItems,
        });
    } else {
        await prepareExistingImportedFlightMatches({
            supabase,
            tripId,
            submittedItems,
        });

        const { data, error } = await (
            supabase as unknown as ImportFlightsRpcClient
        ).rpc("import_travel_email_flights", {
            p_import_id: importId,
            p_trip_id: tripId,
            p_items: submittedItems as Json,
        });

        if (error) {
            if (isImportFlightRpcUnavailableError(error)) {
                console.warn(
                    "travel_email_import_rpc_unavailable_using_transport_fallback",
                    {
                        importId,
                        userId: user.id,
                        code: error.code,
                    }
                );
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
                throw new Error(
                    "We couldn’t add the flights. Nothing was changed. Please try again."
                );
            }
        } else {
            importResult = data;
        }
    }

    await saveImportedFlightTravelers({
        userId: user.id,
        tripId,
        transportationItemIds: importResult?.transportationItemIds || [],
        selection: travelerSelection,
    });

    await saveImportedFlightPlaceMetadata({
        supabase,
        importId,
        tripId,
        submittedItems,
    });

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

async function loadImportTravelerTrips({
    supabase,
    trips,
    currentUserId,
    recommendedTripId,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    trips: ImportTripRow[];
    currentUserId: string;
    recommendedTripId: string | null;
}): Promise<ImportTravelerTrip[]> {
    const tripIds = trips.map((trip) => trip.id);
    if (tripIds.length === 0) return [];

    const [memberResult, tripFamilyResult, familyResult] = await Promise.all([
        supabase
            .from("trip_members")
            .select("trip_id,user_id")
            .in("trip_id", tripIds)
            .eq("status", "active")
            .is("left_at", null),
        supabase
            .from("trip_family_members")
            .select("trip_id,family_member_id")
            .in("trip_id", tripIds)
            .eq("status", "going"),
        supabase
            .from("user_family_members")
            .select("id,name,relationship,avatar_url")
            .eq("user_id", currentUserId),
    ]);

    if (memberResult.error || tripFamilyResult.error || familyResult.error) {
        console.warn("travel_email_import_traveler_options_unavailable", {
            memberCode: memberResult.error?.code,
            tripFamilyCode: tripFamilyResult.error?.code,
            familyCode: familyResult.error?.code,
        });
    }

    const memberRows = (memberResult.data || []) as Array<{
        trip_id: string;
        user_id: string;
    }>;
    const memberUserIds = Array.from(
        new Set([
            ...trips.map((trip) => trip.user_id),
            ...memberRows.map((member) => member.user_id),
        ])
    );
    const { data: profiles, error: profileError } = memberUserIds.length
        ? await supabase
              .from("connected_public_user_profiles")
              .select("id,first_name,last_name,username,avatar_url")
              .in("id", memberUserIds)
        : { data: [], error: null };

    if (profileError) {
        console.warn("travel_email_import_traveler_profiles_unavailable", {
            code: profileError.code,
        });
    }

    const profilesById = new Map(
        ((profiles || []) as Array<{
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            username?: string | null;
            avatar_url?: string | null;
        }>).map((profile) => [profile.id, profile])
    );
    const familyById = new Map(
        ((familyResult.data || []) as Array<{
            id: string;
            name: string;
            relationship?: string | null;
            avatar_url?: string | null;
        }>).map((familyMember) => [familyMember.id, familyMember])
    );
    const tripFamilyRows = (tripFamilyResult.data || []) as Array<{
        trip_id: string;
        family_member_id: string;
    }>;

    return trips.map((trip) => {
        const userIds = Array.from(
            new Set([
                trip.user_id,
                ...memberRows
                    .filter((member) => member.trip_id === trip.id)
                    .map((member) => member.user_id),
            ])
        );
        const users = userIds.map((memberUserId) => {
            const profile = profilesById.get(memberUserId);
            const profileName = [profile?.first_name, profile?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
            return {
                type: "user" as const,
                id: memberUserId,
                name:
                    profileName ||
                    profile?.username ||
                    (memberUserId === currentUserId ? "You" : "Trip member"),
                secondaryLabel: profile?.username
                    ? `@${profile.username}`
                    : memberUserId === currentUserId
                      ? "You"
                      : null,
                avatarUrl: profile?.avatar_url || null,
            };
        });
        const familyMembers = tripFamilyRows
            .filter((row) => row.trip_id === trip.id)
            .map((row) => familyById.get(row.family_member_id))
            .filter((familyMember) => Boolean(familyMember))
            .map((familyMember) => ({
                type: "family" as const,
                id: familyMember!.id,
                name: familyMember!.name,
                secondaryLabel: familyMember!.relationship || "Family member",
                avatarUrl: familyMember!.avatar_url || null,
            }));

        return {
            id: trip.id,
            title: trip.title,
            startDate: trip.start_date,
            endDate: trip.end_date,
            isRecommended: trip.id === recommendedTripId,
            travelers: [...users, ...familyMembers],
        };
    });
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
            .select("id,slug,title,destination,start_date,end_date,user_id")
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
    const editableTrips = (trips || []) as ImportTripRow[];
    const baseEditableFlights = applyConfirmationPriceToFlights(
        reviewItems
            .filter((item) => item.item_type === "flight")
            .map((item) =>
                getEditableImportedFlight(
                    item.id,
                    item.extracted_data,
                    item.reviewed_data
                )
            ),
        reviewImport.extracted_data
    );
    const resolvedTimezones = await resolveImportedFlightTimezones(
        supabase,
        baseEditableFlights
    );
    const editableFlights = baseEditableFlights.map((flight, index) => ({
        ...flight,
        departureTimezone:
            flight.departureTimezone ||
            resolvedTimezones[index]?.departureTimezone ||
            "",
        arrivalTimezone:
            flight.arrivalTimezone || resolvedTimezones[index]?.arrivalTimezone || "",
    }));
    const tripMatch = matchImportToTrips(editableFlights, editableTrips);
    const selectedTripId =
        reviewImport.matched_trip_id ||
        tripMatch.recommendedTripId ||
        editableTrips[0]?.id ||
        "";
    const selectedTrip = editableTrips.find((trip) => trip.id === selectedTripId);
    const inferredTravelerNames = Array.from(
        new Set(
            reviewItems
                .filter((item) => item.item_type === "flight")
                .flatMap((item) => getImportedTravelerNames(item.extracted_data))
        )
    );
    const travelerTrips = await loadImportTravelerTrips({
        supabase,
        trips: editableTrips,
        currentUserId: user.id,
        recommendedTripId: tripMatch.recommendedTripId,
    });
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
    const editableTripIds = editableTrips.map((trip) => trip.id);
    const { data: existingFlights } = editableTripIds.length
        ? await supabase
              .from("transportation_items")
              .select(
                  "id,trip_id,title,status,transport_number,departure_location,arrival_location,departure_date,departure_time,arrival_date,arrival_time,notes,provider_name,provider_code,reservation_code,baggage_info,seat_number,cabin_class,departure_terminal,arrival_terminal,cost,currency,departure_timezone,arrival_timezone,departure_formatted_address,departure_google_place_id,departure_lat,departure_lng,arrival_formatted_address,arrival_google_place_id,arrival_lat,arrival_lng"
              )
              .in("trip_id", editableTripIds)
              .eq("transport_type", "flight")
        : { data: [] };
    const existingFlightsByTrip = new Map<string, ExistingTransportationFlight[]>();
    for (const flight of (existingFlights || []) as ExistingTransportationFlight[]) {
        existingFlightsByTrip.set(flight.trip_id, [
            ...(existingFlightsByTrip.get(flight.trip_id) || []),
            flight,
        ]);
    }
    const tripHrefsById = Object.fromEntries(
        editableTrips.map((trip) => [
            trip.id,
            `/trips/${getTripRouteSegment(trip)}?tab=journey`,
        ])
    );

    function getFlightRecordsByTrip() {
        return Object.fromEntries(
            editableTripIds.map((tripId) => [
                tripId,
                existingFlightsByTrip.get(tripId) || [],
            ])
        );
    }

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
                                    {editableTrips.length ? (
                                        <ImportTripTravelerSelector
                                            trips={travelerTrips}
                                            defaultTripId={selectedTripId}
                                            inferredTravelerNames={inferredTravelerNames}
                                            currentUserId={user.id}
                                            confidenceLabel={
                                                tripMatch.confidence === "recommended"
                                                    ? "Recommended trip"
                                                    : tripMatch.confidence === "possible"
                                                      ? "Possible trip"
                                                      : "Select a trip"
                                            }
                                        />
                                    ) : (
                                        <section className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/10 p-4">
                                            <p className="text-sm font-bold text-white">
                                                Create a trip before adding this flight.
                                            </p>
                                            <Link
                                                href={`/trips/new?returnTo=/imports/${reviewImport.id}`}
                                                className="mt-3 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950"
                                            >
                                                Create trip
                                            </Link>
                                        </section>
                                    )}

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
                                                flightRecordsByTrip={getFlightRecordsByTrip()}
                                                defaultTripId={selectedTripId}
                                                tripHrefsById={tripHrefsById}
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
                                                Add to trip
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

            </div>
        </main>
    );
}
