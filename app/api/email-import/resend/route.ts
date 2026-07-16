import { NextResponse, type NextRequest } from "next/server";
import type {
    GetReceivingEmailResponseSuccess,
    WebhookEventPayload,
} from "resend";

import { getResendClient } from "@/lib/email/resend";
import { getEmailImportDomain } from "@/lib/emailImportAddresses";
import {
    extractInboundRecipientToken,
    getInboundRecipientCandidates,
    maskEmailAddress,
    normalizeEmailAddress,
    sanitizeServerError,
    type InboundRecipientMatch,
} from "@/lib/emailImportInbound";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
    createTravelEmailImportNotification,
    processTravelEmailImport,
} from "@/lib/travelEmailImportProcessor";

export const runtime = "nodejs";

type DbError = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

type MaybeSingleResult<T> = Promise<{
    data: T | null;
    error: DbError | null;
}>;

type EmailImportAddressRow = {
    user_id: string;
    inbound_token: string;
};

type TravelEmailImportRow = {
    id: string;
};

type SelectChain<T> = {
    eq: (column: string, value: string | boolean) => SelectChain<T>;
    maybeSingle: () => MaybeSingleResult<T>;
};

type EmailImportWebhookSupabase = {
    from: (table: "travel_email_imports") => {
        select: (columns: string) => SelectChain<TravelEmailImportRow>;
        insert: (values: Record<string, unknown>) => {
            select: (columns: string) => {
                maybeSingle: () => MaybeSingleResult<TravelEmailImportRow>;
            };
        };
    };
} & {
    from: (table: "user_email_import_addresses") => {
        select: (columns: string) => SelectChain<EmailImportAddressRow>;
    };
};

type ResolvedRecipient = InboundRecipientMatch & {
    userId: string;
};

type EmailReceivedWebhookEvent = Extract<
    WebhookEventPayload,
    { type: "email.received" }
>;

type ReceivedEmailEventData = EmailReceivedWebhookEvent["data"];

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function getWebhookSecret() {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
        throw new Error("RESEND_WEBHOOK_SECRET is not configured.");
    }

    return secret;
}

function isUniqueViolation(error: DbError | null) {
    return error?.code === "23505";
}

async function alreadyImported(
    supabase: EmailImportWebhookSupabase,
    providerEmailId: string
) {
    const { data, error } = await supabase
        .from("travel_email_imports")
        .select("id")
        .eq("provider_email_id", providerEmailId)
        .maybeSingle();

    if (error && error.code !== "PGRST116") {
        throw new Error(error.message || "Could not check email import idempotency.");
    }

    return Boolean(data);
}

async function resolveRecipientUser(
    supabase: EmailImportWebhookSupabase,
    data: ReceivedEmailEventData,
    expectedDomain: string,
    providerEmailId: string
): Promise<ResolvedRecipient | null> {
    const candidates = getInboundRecipientCandidates(data);

    for (const candidate of candidates) {
        const match = extractInboundRecipientToken(candidate, expectedDomain);
        if (!match) continue;

        const { data: addressRow, error } = await supabase
            .from("user_email_import_addresses")
            .select("user_id,inbound_token")
            .eq("inbound_token", match.token)
            .eq("is_active", true)
            .maybeSingle();

        if (error && error.code !== "PGRST116") {
            throw new Error(error.message || "Could not resolve email import user.");
        }

        if (addressRow) {
            return {
                ...match,
                userId: addressRow.user_id,
            };
        }
    }

    console.info("Inbound travel email ignored: no active VAIVIA recipient.", {
        providerEmailId,
        recipients: candidates.map(maskEmailAddress),
    });

    return null;
}

function getEventEmailMetadata(data: ReceivedEmailEventData) {
    return {
        message_id: data.message_id || null,
        sender_email: data.from ? normalizeEmailAddress(data.from) : null,
        subject: data.subject || null,
        attachment_count: data.attachments?.length || 0,
    };
}

function getFetchedEmailMetadata(email: GetReceivingEmailResponseSuccess) {
    return {
        message_id: email.message_id || null,
        sender_email: email.from ? normalizeEmailAddress(email.from) : null,
        subject: email.subject || null,
        raw_text: email.text || null,
        raw_html: email.html || null,
        attachment_count: email.attachments?.length || 0,
    };
}

async function insertTravelEmailImport(
    supabase: EmailImportWebhookSupabase,
    payload: Record<string, unknown>
) {
    const { data, error } = await supabase
        .from("travel_email_imports")
        .insert(payload)
        .select("id")
        .maybeSingle();

    if (isUniqueViolation(error)) {
        return { status: "duplicate" as const, importId: null };
    }

    if (error) {
        throw new Error(error.message || "Could not store travel email import.");
    }

    return { status: "inserted" as const, importId: data?.id || null };
}

async function insertFailedImport(
    supabase: EmailImportWebhookSupabase,
    data: ReceivedEmailEventData,
    recipient: ResolvedRecipient,
    error: unknown
) {
    const result = await insertTravelEmailImport(supabase, {
        user_id: recipient.userId,
        provider: "resend",
        provider_email_id: data.email_id,
        recipient_email: recipient.address,
        status: "failed",
        extraction_error: sanitizeServerError(error),
        processed_at: new Date().toISOString(),
        ...getEventEmailMetadata(data),
    });

    return result;
}

async function handleEmailReceived(
    event: EmailReceivedWebhookEvent
) {
    const resend = getResendClient();
    const domain = getEmailImportDomain();
    const supabase = createServiceRoleClient() as unknown as EmailImportWebhookSupabase;
    const providerEmailId = event.data.email_id;

    if (!providerEmailId) {
        return jsonResponse({ received: true, ignored: true, reason: "missing_email_id" });
    }

    if (await alreadyImported(supabase, providerEmailId)) {
        return jsonResponse({ received: true, alreadyProcessed: true });
    }

    const recipient = await resolveRecipientUser(
        supabase,
        event.data,
        domain,
        providerEmailId
    );

    if (!recipient) {
        return jsonResponse({ received: true, ignored: true, reason: "no_active_recipient" });
    }

    const { data: receivedEmail, error: receiveError } =
        await resend.emails.receiving.get(providerEmailId, { html_format: "cid" });

    if (receiveError || !receivedEmail) {
        const insertResult = await insertFailedImport(
            supabase,
            event.data,
            recipient,
            receiveError || new Error("Resend returned no received email content.")
        );

        if (insertResult.status === "inserted" && insertResult.importId) {
            await createTravelEmailImportNotification(
                createServiceRoleClient(),
                {
                    id: insertResult.importId,
                    user_id: recipient.userId,
                },
                "failed",
                null
            );
        }

        return jsonResponse({
            received: true,
            stored: insertResult.status === "inserted",
            status: "failed",
            alreadyProcessed: insertResult.status === "duplicate",
        });
    }

    const insertResult = await insertTravelEmailImport(supabase, {
        user_id: recipient.userId,
        provider: "resend",
        provider_email_id: receivedEmail.id || providerEmailId,
        recipient_email: recipient.address,
        status: "received",
        ...getFetchedEmailMetadata(receivedEmail),
    });

    let processResult: Awaited<ReturnType<typeof processTravelEmailImport>> | null =
        null;

    if (insertResult.status === "inserted" && insertResult.importId) {
        processResult = await processTravelEmailImport(
            insertResult.importId,
            receivedEmail
        );
    }

    return jsonResponse({
        received: true,
        stored: insertResult.status === "inserted",
        alreadyProcessed: insertResult.status === "duplicate",
        importId: insertResult.importId,
        processing: processResult,
    });
}

export async function POST(request: NextRequest) {
    const payload = await request.text();
    const id = request.headers.get("svix-id");
    const timestamp = request.headers.get("svix-timestamp");
    const signature = request.headers.get("svix-signature");

    if (!id || !timestamp || !signature) {
        return jsonResponse({ error: "Missing Resend webhook signature headers." }, 400);
    }

    let event: WebhookEventPayload;

    try {
        event = getResendClient().webhooks.verify({
            payload,
            headers: {
                id,
                timestamp,
                signature,
            },
            webhookSecret: getWebhookSecret(),
        });
    } catch (error) {
        console.warn("Invalid Resend inbound webhook signature.", {
            error: sanitizeServerError(error),
        });
        return jsonResponse({ error: "Invalid webhook signature." }, 401);
    }

    if (event.type !== "email.received") {
        return jsonResponse({ received: true, ignored: true, type: event.type });
    }

    try {
        return await handleEmailReceived(event);
    } catch (error) {
        console.error("Could not process inbound travel email webhook.", {
            error: sanitizeServerError(error),
            providerEmailId: event.data.email_id,
        });
        return jsonResponse({ error: "Could not process inbound travel email." }, 503);
    }
}
