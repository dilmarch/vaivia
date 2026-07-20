import "server-only";

import { sanitizeServerError } from "@/lib/emailImportInbound";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database, Json } from "@/src/types/supabase";

const STALE_PROCESSING_MINUTES = 15;
const DEFAULT_GEMINI_EMAIL_IMPORT_MODEL = "gemini-2.5-flash";

type TravelEmailImportStatus =
    Database["public"]["Enums"]["travel_email_import_status"];

type TravelEmailImportForProcessing = {
    id: string;
    attachment_count: number;
    created_at: string;
    provider_email_id: string;
    raw_html: string | null;
    raw_text: string | null;
    sender_email: string | null;
    status: TravelEmailImportStatus;
    subject: string | null;
    user_id: string;
};

type ExtractionItem = {
    item_type?: unknown;
    confidence?: unknown;
    extracted_data?: unknown;
};

type GeminiExtractionResult = {
    import_type?: unknown;
    confidence?: unknown;
    summary?: unknown;
    items?: unknown;
};

type TravelEmailProcessorClient = ReturnType<typeof createServiceRoleClient>;

type NotificationQueryError = {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
};

type NotificationInsertPayload = {
    user_id: string;
    type: "travel_email_ready" | "travel_email_needs_review";
    title: string;
    body: string;
    metadata: {
        importId: string;
        url: string;
        source: "travel_email_import";
    };
};

type NotificationTableClient = {
    select: (columns: string) => {
        eq: (column: "user_id", value: string) => {
            in: (
                column: "type",
                values: Array<NotificationInsertPayload["type"]>
            ) => {
                contains: (
                    column: "metadata",
                    value: { importId: string }
                ) => {
                    maybeSingle: () => Promise<{
                        data: { id: string } | null;
                        error: NotificationQueryError | null;
                    }>;
                };
            };
        };
    };
    insert: (payload: NotificationInsertPayload) => Promise<{
        error: NotificationQueryError | null;
    }>;
};

type NotificationCapableClient = TravelEmailProcessorClient & {
    from: (table: "notifications") => NotificationTableClient;
};

function getNotificationTable(
    supabase: TravelEmailProcessorClient
): NotificationTableClient {
    return (supabase as unknown as NotificationCapableClient).from("notifications");
}

function logTravelEmailEvent(
    event: string,
    metadata: Record<string, string | number | boolean | null | undefined>
) {
    console.info(event, metadata);
}

function getPreparedItemSummary(items: ExtractionItem[]) {
    const flightCount = items.filter((item) => item.item_type === "flight").length;
    if (flightCount > 0) {
        return `${flightCount} flight${flightCount === 1 ? "" : "s"}`;
    }
    return `${items.length} travel item${items.length === 1 ? "" : "s"}`;
}

async function createImportReadyNotification(
    supabase: TravelEmailProcessorClient,
    importRow: TravelEmailImportForProcessing,
    items: ExtractionItem[],
    confidence: number | null
) {
    const importId = importRow.id;
    const url = `/imports/${importId}`;
    const notifications = getNotificationTable(supabase);
    const { data: existingNotification, error: existingError } = await notifications
        .select("id")
        .eq("user_id", importRow.user_id)
        .in("type", ["travel_email_ready", "travel_email_needs_review"])
        .contains("metadata", { importId })
        .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
        console.warn("travel_email_notification_lookup_failed", {
            importId,
            error: sanitizeServerError(existingError),
        });
        return;
    }

    if (existingNotification?.id) return;

    const itemSummary = getPreparedItemSummary(items);
    const isPartial = !items.length || (typeof confidence === "number" && confidence < 0.75);
    const notificationType = isPartial
        ? "travel_email_needs_review"
        : "travel_email_ready";
    const title = isPartial
        ? "Your forwarded booking needs a quick check"
        : "Your flight confirmation is ready";
    const body = isPartial
        ? "We found some travel details, but one or more fields need confirmation."
        : `We found ${itemSummary}. Review ${
              items.length === 1 ? "it" : "them"
          } before adding ${
              items.length === 1 ? "it" : "them"
          } to a trip.`;

    const { error } = await notifications.insert({
        user_id: importRow.user_id,
        type: notificationType,
        title,
        body,
        metadata: {
            importId,
            url,
            source: "travel_email_import",
        },
    });

    if (error) {
        console.warn("travel_email_notification_create_failed", {
            importId,
            error: sanitizeServerError(error),
        });
    }
}

function getGeminiEmailImportModel() {
    return (
        process.env.GEMINI_EMAIL_IMPORT_MODEL?.trim() ||
        DEFAULT_GEMINI_EMAIL_IMPORT_MODEL
    );
}

function getGeminiApiKey() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("gemini_api_key_not_configured");
    return apiKey;
}

function getStaleProcessingCutoff() {
    return new Date(
        Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000
    ).toISOString();
}

function toConfidence(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.max(0, Math.min(1, value));
}

function toJsonObject(value: unknown): Json {
    if (!value || typeof value !== "object") return {};
    return value as Json;
}

function stripCodeFence(value: string) {
    return value
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
}

function parseGeminiExtraction(text: string): GeminiExtractionResult {
    const parsed = JSON.parse(stripCodeFence(text));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("gemini_response_invalid_json_shape");
    }
    return parsed as GeminiExtractionResult;
}

function getGeminiResponseText(response: unknown) {
    const candidates = (response as { candidates?: unknown[] })?.candidates;
    const firstCandidate = Array.isArray(candidates) ? candidates[0] : null;
    const parts = (firstCandidate as { content?: { parts?: unknown[] } } | null)
        ?.content?.parts;
    const textParts = Array.isArray(parts)
        ? parts
              .map((part) =>
                  typeof (part as { text?: unknown })?.text === "string"
                      ? ((part as { text: string }).text)
                      : ""
              )
              .filter(Boolean)
        : [];

    return textParts.join("\n").trim();
}

async function markImportFailed(
    supabase: TravelEmailProcessorClient,
    importId: string,
    error: unknown
) {
    const sanitizedError = sanitizeServerError(error);
    const { error: updateError } = await supabase
        .from("travel_email_imports")
        .update({
            status: "failed",
            extraction_error: sanitizedError,
            processed_at: new Date().toISOString(),
        })
        .eq("id", importId);

    if (updateError) {
        console.error("travel_email_processing_failed_status_update_failed", {
            importId,
            error: sanitizeServerError(updateError),
        });
    }

    logTravelEmailEvent("travel_email_processing_failed", {
        importId,
        error: sanitizedError,
    });
}

async function loadImportForProcessing(
    supabase: TravelEmailProcessorClient,
    importId: string
) {
    const staleCutoff = getStaleProcessingCutoff();
    const processingStartedAt = new Date().toISOString();
    const { data, error } = await supabase
        .from("travel_email_imports")
        .update({
            status: "processing",
            extraction_error: null,
            processed_at: processingStartedAt,
        })
        .eq("id", importId)
        .or(
            `status.in.(received,failed),and(status.eq.processing,processed_at.lt.${staleCutoff})`
        )
        .select(
            "id,attachment_count,created_at,provider_email_id,raw_html,raw_text,sender_email,status,subject,user_id"
        )
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("travel_email_import_not_retryable");

    logTravelEmailEvent("travel_email_processing_lock_acquired", {
        importId,
        status: "processing",
    });

    return data as TravelEmailImportForProcessing;
}

async function callGeminiForImport(importRow: TravelEmailImportForProcessing) {
    const model = getGeminiEmailImportModel();
    const apiKey = getGeminiApiKey();
    const emailText = [importRow.subject, importRow.raw_text, importRow.raw_html]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 80000);

    if (!emailText.trim()) throw new Error("travel_email_import_has_no_content");

    logTravelEmailEvent("travel_email_gemini_started", {
        importId: importRow.id,
        model,
    });

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text:
                                    "Extract travel confirmation details for VAIVIA. Return strict JSON only with this shape: " +
                                    "{ \"import_type\": \"flight|train|bus|accommodation|receipt|itinerary|unknown\", " +
                                    "\"confidence\": 0.0, \"summary\": {}, \"items\": [" +
                                    "{ \"item_type\": \"flight|train|bus|accommodation|receipt|itinerary_item|unknown\", " +
                                    "\"confidence\": 0.0, \"extracted_data\": {} } ] }. " +
                                    "For flight items, use these exact extracted_data keys when present: " +
                                    "flight_number (full flight number including airline code, for example AC692), " +
                                    "airline_name, airline_code, departure_location, arrival_location, " +
                                    "departure_date (YYYY-MM-DD), departure_time (HH:MM 24-hour local), " +
                                    "arrival_date (YYYY-MM-DD), arrival_time (HH:MM 24-hour local), " +
                                    "departure_timezone, arrival_timezone, departure_terminal, arrival_terminal, " +
                                    "seat_number, cabin_class, reservation_code, cost, currency, " +
                                    "visa_requirements, luggage_requirements (text), traveler_names (array of full names), notes, status. " +
                                    "Use IANA time zone IDs for departure_timezone and arrival_timezone. " +
                                    "When a time zone is not printed, derive it from the airport code or airport location. " +
                                    "If the email only contains an airport code, put that code in the location field. " +
                                    "Capture luggage_requirements whenever the confirmation states checked baggage, " +
                                    "carry-on, personal-item, weight, quantity, or size allowances; preserve fare-specific details. " +
                                    "Capture traveler_names only from passenger or traveler names explicitly printed in the confirmation. " +
                                    "For a flight confirmation, put the overall booking_total and currency in summary when present. " +
                                    "When one booking total covers multiple flight items, also put cost and currency on the first flight item only; do not repeat that total on later flight items. " +
                                    "Use notes only for relevant information that has no dedicated extracted_data key. " +
                                    "Never repeat airline, flight, route, date, time, time zone, terminal, seat, cabin, reservation, price, " +
                                    "traveler, visa, luggage, or status details in notes. " +
                                    "Default status to booked for a valid confirmation unless the email clearly says it was cancelled. " +
                                    "Do not invent Google place IDs or passenger names. " +
                                    "Do not include markdown. Email content follows:\n\n" +
                                    emailText,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`gemini_request_failed_${response.status}`);
    }

    const json = (await response.json()) as unknown;
    const text = getGeminiResponseText(json);
    if (!text) throw new Error("gemini_response_missing_text");

    return {
        model,
        result: parseGeminiExtraction(text),
    };
}

async function replaceExtractedItems(
    supabase: TravelEmailProcessorClient,
    importId: string,
    items: ExtractionItem[]
) {
    const { error: deleteError } = await supabase
        .from("travel_email_import_items")
        .delete()
        .eq("import_id", importId);

    if (deleteError) throw deleteError;
    if (!items.length) return;

    const rows = items.map((item, index) => ({
        import_id: importId,
        item_order: index,
        item_type:
            typeof item.item_type === "string" && item.item_type.trim()
                ? item.item_type.trim()
                : "unknown",
        confidence: toConfidence(item.confidence),
        extracted_data: toJsonObject(item.extracted_data),
    }));

    const { error: insertError } = await supabase
        .from("travel_email_import_items")
        .insert(rows);

    if (insertError) throw insertError;
}

export async function processTravelEmailImport(importId: string) {
    const supabase = createServiceRoleClient();

    logTravelEmailEvent("travel_email_processing_started", {
        importId,
    });

    try {
        const importRow = await loadImportForProcessing(supabase, importId);
        const { model, result } = await callGeminiForImport(importRow);
        const items = Array.isArray(result.items)
            ? (result.items as ExtractionItem[])
            : [];
        const confidence = toConfidence(result.confidence);
        const importType =
            typeof result.import_type === "string" && result.import_type.trim()
                ? result.import_type.trim()
                : "unknown";

        await replaceExtractedItems(supabase, importId, items);

        const { error: updateError } = await supabase
            .from("travel_email_imports")
            .update({
                status: "needs_review",
                import_type: importType,
                extracted_data: toJsonObject({
                    import_type: importType,
                    confidence,
                    summary: result.summary || {},
                    item_count: items.length,
                }),
                extraction_confidence: confidence,
                extraction_error: null,
                extraction_model: model,
                requires_data_review: true,
                processed_at: new Date().toISOString(),
            })
            .eq("id", importId);

        if (updateError) throw updateError;

        await createImportReadyNotification(supabase, importRow, items, confidence);

        logTravelEmailEvent("travel_email_processing_completed", {
            importId,
            status: "needs_review",
            itemCount: items.length,
            model,
        });

        return {
            status: "needs_review" as const,
            itemCount: items.length,
        };
    } catch (error) {
        await markImportFailed(supabase, importId, error);
        throw error;
    }
}
