/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import type {
    AttachmentData,
    GetReceivingEmailResponseSuccess,
} from "resend";

import { getResendClient } from "@/lib/email/resend";
import { sanitizeServerError } from "@/lib/emailImportInbound";
import {
    extractTravelEmail,
    getTravelEmailReadiness,
    TRAVEL_EMAIL_IMPORT_MODEL,
    type TravelEmailExtraction,
} from "@/lib/travelEmailExtraction";
import {
    getDefaultNotificationPreference,
    type NotificationPreference,
} from "@/lib/notificationTypes";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json } from "@/src/types/supabase";

const STORAGE_BUCKET = "travel-email-imports";
const ACCEPTED_MIME_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/html",
]);
const REJECTED_EXTENSIONS = new Set([
    "zip",
    "exe",
    "js",
    "svg",
    "docm",
    "xlsm",
    "pptm",
    "msi",
    "bat",
    "cmd",
    "sh",
]);

type ServiceSupabase = ReturnType<typeof createServiceRoleClient>;

type TravelEmailImportRow = {
    id: string;
    user_id: string;
    provider: string;
    provider_email_id: string;
    sender_email: string | null;
    subject: string | null;
    raw_text: string | null;
    raw_html: string | null;
    status: string;
};

type StoredAttachment = {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    data: Uint8Array;
    textContent?: string | null;
};

type ProcessResult =
    | {
          status: "skipped";
          reason: string;
      }
    | {
          status: "ready" | "needs_review" | "failed";
          importId: string;
          segments: number;
          reasons?: string[];
      };

function getMaxAttachmentBytes() {
    const configured = Number(process.env.EMAIL_IMPORT_MAX_ATTACHMENT_BYTES);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : 15_000_000;
}

function getMaxAttachments() {
    const configured = Number(process.env.EMAIL_IMPORT_MAX_ATTACHMENTS);
    return Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : 10;
}

function normalizeMimeType(value?: string | null) {
    return (value || "").split(";")[0]?.trim().toLowerCase() || "";
}

function sanitizeFilename(value?: string | null) {
    const filename = (value || "attachment")
        .split(/[\\/]/)
        .pop()
        ?.normalize("NFKD")
        .replace(/[^\w.\- ]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);

    return filename || "attachment";
}

function getExtension(filename: string) {
    const extension = filename.split(".").pop();
    return extension ? extension.toLowerCase() : "";
}

function isSupportedAttachment(attachment: AttachmentData) {
    const filename = sanitizeFilename(attachment.filename);
    const extension = getExtension(filename);
    const mimeType = normalizeMimeType(attachment.content_type);
    const size = Number(attachment.size || 0);
    const maxBytes = getMaxAttachmentBytes();

    if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
        return {
            supported: false,
            reason: `unsupported_mime:${mimeType || "unknown"}`,
        };
    }

    if (REJECTED_EXTENSIONS.has(extension)) {
        return {
            supported: false,
            reason: `rejected_extension:${extension}`,
        };
    }

    if (size <= 0) {
        return { supported: false, reason: "empty_attachment" };
    }

    if (size > maxBytes) {
        return { supported: false, reason: "attachment_too_large" };
    }

    return { supported: true, reason: "" };
}

function verifyFileSignature(mimeType: string, data: Uint8Array) {
    if (mimeType === "text/plain" || mimeType === "text/html") return true;
    if (mimeType === "application/pdf") {
        return Buffer.from(data.slice(0, 5)).toString("utf8") === "%PDF-";
    }
    if (mimeType === "image/png") {
        return (
            data[0] === 0x89 &&
            data[1] === 0x50 &&
            data[2] === 0x4e &&
            data[3] === 0x47
        );
    }
    if (mimeType === "image/jpeg") {
        return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    }
    if (mimeType === "image/webp") {
        return (
            Buffer.from(data.slice(0, 4)).toString("utf8") === "RIFF" &&
            Buffer.from(data.slice(8, 12)).toString("utf8") === "WEBP"
        );
    }

    return false;
}

function attachmentText(mimeType: string, data: Uint8Array) {
    if (mimeType !== "text/plain" && mimeType !== "text/html") return null;
    const decoded = Buffer.from(data).toString("utf8");
    return decoded.replace(/\0/g, "").slice(0, 80_000);
}

async function claimImportForProcessing(
    supabase: ServiceSupabase,
    importId: string
) {
    const { data, error } = await (supabase.from as any)("travel_email_imports")
        .update({
            status: "processing",
            extraction_error: null,
        })
        .eq("id", importId)
        .eq("status", "received")
        .select(
            "id,user_id,provider,provider_email_id,sender_email,subject,raw_text,raw_html,status"
        )
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data as TravelEmailImportRow | null;
}

async function downloadAttachment(attachment: AttachmentData) {
    const response = await fetch(attachment.download_url, {
        redirect: "error",
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Could not download attachment ${attachment.id}.`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > getMaxAttachmentBytes()) {
        throw new Error(`Attachment ${attachment.id} exceeded size limit.`);
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > getMaxAttachmentBytes()) {
        throw new Error(`Attachment ${attachment.id} exceeded size limit.`);
    }

    return buffer;
}

async function listAttachmentData(providerEmailId: string) {
    const resend = getResendClient();
    const { data, error } = await resend.emails.receiving.attachments.list({
        emailId: providerEmailId,
        limit: getMaxAttachments(),
    });

    if (error) throw new Error(error.message);
    return (data?.data || []) as AttachmentData[];
}

async function storeAttachment(
    supabase: ServiceSupabase,
    importRow: TravelEmailImportRow,
    attachment: AttachmentData,
    data: Uint8Array
): Promise<StoredAttachment> {
    const filename = sanitizeFilename(attachment.filename);
    const mimeType = normalizeMimeType(attachment.content_type);
    const storagePath = `${importRow.user_id}/${importRow.id}/${attachment.id}-${filename}`;

    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, data, {
            contentType: mimeType,
            upsert: false,
        });

    if (uploadError && !uploadError.message.toLowerCase().includes("exists")) {
        throw new Error(uploadError.message);
    }

    const { error: insertError } = await (supabase.from as any)(
        "travel_email_import_attachments"
    ).insert({
        import_id: importRow.id,
        provider_attachment_id: attachment.id,
        filename,
        mime_type: mimeType,
        size_bytes: data.byteLength,
        storage_path: storagePath,
    });

    if (insertError) throw new Error(insertError.message);

    return {
        filename,
        mimeType,
        sizeBytes: data.byteLength,
        storagePath,
        data,
        textContent: attachmentText(mimeType, data),
    };
}

async function retrieveAndStoreAttachments(
    supabase: ServiceSupabase,
    importRow: TravelEmailImportRow,
    receivedEmail?: GetReceivingEmailResponseSuccess | null
) {
    const warnings: string[] = [];
    const stored: StoredAttachment[] = [];
    const attachmentMetadata =
        receivedEmail?.attachments?.length && receivedEmail.attachments.length > 0
            ? receivedEmail.attachments
            : [];
    const list = await listAttachmentData(importRow.provider_email_id);
    const maxAttachments = getMaxAttachments();

    if (attachmentMetadata.length > list.length) {
        warnings.push(
            `resend_attachment_metadata_count_exceeds_signed_urls:${attachmentMetadata.length}:${list.length}`
        );
    }

    for (const attachment of list.slice(0, maxAttachments)) {
        const supported = isSupportedAttachment(attachment);
        if (!supported.supported) {
            warnings.push(`${attachment.id}:${supported.reason}`);
            continue;
        }

        try {
            const data = await downloadAttachment(attachment);
            const mimeType = normalizeMimeType(attachment.content_type);
            if (!verifyFileSignature(mimeType, data)) {
                warnings.push(`${attachment.id}:signature_mismatch`);
                continue;
            }

            stored.push(await storeAttachment(supabase, importRow, attachment, data));
        } catch (error) {
            warnings.push(`${attachment.id}:${sanitizeServerError(error)}`);
        }
    }

    return { attachments: stored, warnings };
}

function getNotificationForStatus(
    status: "ready" | "needs_review" | "failed",
    extraction?: TravelEmailExtraction | null
) {
    if (status === "ready") {
        const segmentCount = extraction?.segments.length || 0;
        return {
            type: "travel_email_ready",
            title: "Your flight confirmation is ready",
            body:
                segmentCount === 1
                    ? "We found 1 flight segment. Review it before adding it to your trip."
                    : `We found ${segmentCount} flight segments. Review them before adding them to your trip.`,
        };
    }

    if (status === "needs_review") {
        return {
            type: "travel_email_needs_review",
            title: "Your forwarded booking needs a quick check",
            body:
                "We found some flight details, but one or more fields need confirmation.",
        };
    }

    return {
        type: "travel_email_failed",
        title: "We couldn't read this travel confirmation",
        body:
            "Try forwarding the original confirmation again or upload a clearer PDF.",
    };
}

async function ensureNotificationPreference(
    supabase: ServiceSupabase,
    userId: string,
    notificationType: string
) {
    const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("notification_type")
        .eq("user_id", userId)
        .eq("notification_type", notificationType)
        .maybeSingle();

    if (error && error.code !== "PGRST116") throw new Error(error.message);
    if (data) return;

    const fallback: NotificationPreference =
        getDefaultNotificationPreference(notificationType);
    const { error: insertError } = await supabase
        .from("user_notification_preferences")
        .insert({
            user_id: userId,
            notification_type: notificationType,
            in_app_enabled: fallback.inAppEnabled,
            push_enabled: fallback.pushEnabled,
            email_enabled: fallback.emailEnabled,
        });

    if (insertError && insertError.code !== "23505") {
        throw new Error(insertError.message);
    }
}

export async function createTravelEmailImportNotification(
    supabase: ServiceSupabase,
    importRow: Pick<TravelEmailImportRow, "id" | "user_id">,
    status: "ready" | "needs_review" | "failed",
    extraction?: TravelEmailExtraction | null
) {
    const notification = getNotificationForStatus(status, extraction);
    await ensureNotificationPreference(
        supabase,
        importRow.user_id,
        notification.type
    );

    const { error } = await supabase.from("notifications").insert({
        user_id: importRow.user_id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        metadata: {
            url: `/imports/${importRow.id}`,
            importId: importRow.id,
            source: "travel_email_import",
        },
    });

    if (error) {
        console.warn("Could not create travel email import notification.", {
            importId: importRow.id,
            type: notification.type,
            error: sanitizeServerError(error),
        });
    }
}

async function storeExtractionItems(
    supabase: ServiceSupabase,
    importId: string,
    extraction: TravelEmailExtraction
) {
    const rows = extraction.segments.map((segment, index) => ({
        import_id: importId,
        item_type: "flight_segment",
        item_order: index,
        confidence: segment.confidence,
        extracted_data: segment as unknown as Json,
    }));

    if (rows.length === 0) return;

    const { error } = await (supabase.from as any)(
        "travel_email_import_items"
    ).insert(rows);

    if (error) throw new Error(error.message);
}

async function markImportFailed(
    supabase: ServiceSupabase,
    importId: string,
    error: unknown
) {
    const message = sanitizeServerError(error);
    await (supabase.from as any)("travel_email_imports")
        .update({
            status: "failed",
            extraction_error: message,
            requires_data_review: true,
            processed_at: new Date().toISOString(),
        })
        .eq("id", importId);
}

export async function processTravelEmailImport(
    importId: string,
    receivedEmail?: GetReceivingEmailResponseSuccess | null
): Promise<ProcessResult> {
    const supabase = createServiceRoleClient();
    const importRow = await claimImportForProcessing(supabase, importId);

    if (!importRow) {
        const { data, error } = await (supabase.from as any)(
            "travel_email_imports"
        )
            .select("id,status")
            .eq("id", importId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        return {
            status: "skipped",
            reason: data?.status ? `status_${data.status}` : "not_found",
        };
    }

    try {
        const { attachments, warnings } = await retrieveAndStoreAttachments(
            supabase,
            importRow,
            receivedEmail
        );
        const hasMessageText = Boolean(
            importRow.raw_text?.trim() || importRow.raw_html?.trim()
        );

        if (!hasMessageText && attachments.length === 0) {
            throw new Error("No readable email body or supported attachments.");
        }

        const extraction = await extractTravelEmail({
            subject: importRow.subject,
            senderEmail: importRow.sender_email,
            rawText: importRow.raw_text,
            rawHtml: importRow.raw_html,
            attachments,
            attachmentWarnings: warnings,
        });
        const readiness = getTravelEmailReadiness(extraction);
        const status = readiness.ready ? "ready" : "needs_review";
        const extractionWarnings = [
            ...warnings,
            ...readiness.reasons,
            ...extraction.warnings,
        ].filter(Boolean);

        await storeExtractionItems(supabase, importRow.id, extraction);

        const { error: updateError } = await (supabase.from as any)(
            "travel_email_imports"
        )
            .update({
                status,
                import_type: extraction.documentType,
                extracted_data: {
                    ...extraction,
                    warnings: extractionWarnings,
                } as unknown as Json,
                extraction_confidence: extraction.overallConfidence,
                extraction_model: TRAVEL_EMAIL_IMPORT_MODEL,
                requires_data_review: status !== "ready",
                extraction_error:
                    status === "needs_review" ? extractionWarnings.join("; ") : null,
                processed_at: new Date().toISOString(),
            })
            .eq("id", importRow.id);

        if (updateError) throw new Error(updateError.message);

        await createTravelEmailImportNotification(
            supabase,
            importRow,
            status,
            extraction
        );

        return {
            status,
            importId: importRow.id,
            segments: extraction.segments.length,
            reasons: readiness.reasons,
        };
    } catch (error) {
        await markImportFailed(supabase, importRow.id, error);
        await createTravelEmailImportNotification(
            supabase,
            importRow,
            "failed",
            null
        );
        return {
            status: "failed",
            importId: importRow.id,
            segments: 0,
            reasons: [sanitizeServerError(error)],
        };
    }
}
