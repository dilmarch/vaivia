import { NextResponse, type NextRequest } from "next/server";
import type {
    GetReceivingEmailResponseSuccess,
    WebhookEventPayload,
} from "resend";

import { getResendClient } from "@/lib/email/resend";
import { getEmailImportDomain } from "@/lib/emailImportAddresses";
import {
    extractInboundRecipientToken,
    getUtf8ByteLength,
    getInboundRecipientCandidates,
    MAX_INBOUND_ATTACHMENTS,
    MAX_INBOUND_EMAIL_BODY_BYTES,
    MAX_INBOUND_WEBHOOK_BYTES,
    maskEmailAddress,
    normalizeEmailAddress,
    sanitizeServerError,
    type InboundRecipientMatch,
} from "@/lib/emailImportInbound";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processTravelEmailImport } from "@/lib/travelEmailImportProcessor";

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
    count?: number | null;
}>;

type InsertResult<T> = Promise<{
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
    gte: (column: string, value: string) => SelectChain<T>;
    limit: (count: number) => SelectChain<T>;
    maybeSingle: () => MaybeSingleResult<T>;
};

type EmailImportWebhookSupabase = {
    from: (table: "travel_email_imports") => {
        select: (
            columns: string,
            options?: { count?: "exact"; head?: boolean }
        ) => SelectChain<TravelEmailImportRow>;
        insert: (values: Record<string, unknown>) => {
            select: (columns: string) => {
                maybeSingle: () => InsertResult<TravelEmailImportRow>;
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

const MAX_IMPORTS_PER_ALIAS_PER_HOUR = 60;
const MAX_IMPORTS_PER_SENDER_AND_ALIAS_PER_HOUR = 20;

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
        eventPresent: Boolean(providerEmailId),
        recipients: candidates.map(maskEmailAddress),
    });

    return null;
}

async function isRateLimited(
    supabase: EmailImportWebhookSupabase,
    recipientAddress: string,
    senderAddress: string | null
) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const aliasQuery = supabase
        .from("travel_email_imports")
        .select("id", { count: "exact", head: true })
        .eq("recipient_email", recipientAddress)
        .gte("created_at", since);
    const senderQuery = senderAddress
        ? supabase
              .from("travel_email_imports")
              .select("id", { count: "exact", head: true })
              .eq("recipient_email", recipientAddress)
              .eq("sender_email", senderAddress)
              .gte("created_at", since)
        : null;

    const [aliasResult, senderResult] = await Promise.all([
        aliasQuery as unknown as Promise<{
            count: number | null;
            error: DbError | null;
        }>,
        senderQuery
            ? (senderQuery as unknown as Promise<{
                  count: number | null;
                  error: DbError | null;
              }>)
            : Promise.resolve({ count: 0, error: null }),
    ]);

    if (aliasResult.error || senderResult.error) {
        throw new Error("Could not enforce inbound email rate limit.");
    }

    return (
        (aliasResult.count || 0) >= MAX_IMPORTS_PER_ALIAS_PER_HOUR ||
        (senderResult.count || 0) >=
            MAX_IMPORTS_PER_SENDER_AND_ALIAS_PER_HOUR
    );
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

    if (!data?.id) {
        throw new Error("Could not store travel email import.");
    }

    console.info("travel_email_import_stored", {
        importId: data.id,
        provider: "resend",
    });

    return { status: "inserted" as const, importId: data.id };
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
        extraction_error:
            sanitizeServerError(error) === "resend_api_key_requires_full_access"
                ? "resend_api_key_requires_full_access"
                : "email_retrieval_failed",
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
        return jsonResponse({ received: true, ignored: true });
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
        return jsonResponse({ received: true, ignored: true });
    }

    const senderAddress = event.data.from
        ? normalizeEmailAddress(event.data.from)
        : null;
    if (
        await isRateLimited(
            supabase,
            recipient.address,
            senderAddress
        )
    ) {
        console.warn("inbound_travel_email_rate_limited", {
            alias: maskEmailAddress(recipient.address),
            hasSender: Boolean(senderAddress),
        });
        return jsonResponse({ received: true, ignored: true });
    }

    if ((event.data.attachments?.length || 0) > MAX_INBOUND_ATTACHMENTS) {
        const insertResult = await insertFailedImport(
            supabase,
            event.data,
            recipient,
            new Error("attachment_limit_exceeded")
        );
        return jsonResponse({
            received: true,
            stored: insertResult.status === "inserted",
            status: "failed",
            alreadyProcessed: insertResult.status === "duplicate",
        });
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

        return jsonResponse({
            received: true,
            stored: insertResult.status === "inserted",
            status: "failed",
            alreadyProcessed: insertResult.status === "duplicate",
        });
    }

    const bodyBytes =
        getUtf8ByteLength(receivedEmail.text) +
        getUtf8ByteLength(receivedEmail.html);
    if (
        bodyBytes > MAX_INBOUND_EMAIL_BODY_BYTES ||
        (receivedEmail.attachments?.length || 0) > MAX_INBOUND_ATTACHMENTS
    ) {
        const insertResult = await insertFailedImport(
            supabase,
            event.data,
            recipient,
            new Error("email_size_limit_exceeded")
        );
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

    if (insertResult.status === "inserted" && insertResult.importId) {
        try {
            await processTravelEmailImport(insertResult.importId);
        } catch {
            return jsonResponse({
                received: true,
                stored: true,
                status: "failed",
            });
        }
    }

    return jsonResponse({
        received: true,
        stored: insertResult.status === "inserted",
        alreadyProcessed: insertResult.status === "duplicate",
    });
}

export async function POST(request: NextRequest) {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_INBOUND_WEBHOOK_BYTES
    ) {
        return jsonResponse({ error: "Webhook payload is too large." }, 413);
    }

    const payload = await request.text();
    if (getUtf8ByteLength(payload) > MAX_INBOUND_WEBHOOK_BYTES) {
        return jsonResponse({ error: "Webhook payload is too large." }, 413);
    }
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
            errorType: error instanceof Error ? error.name : "unknown",
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
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return jsonResponse({ error: "Could not process inbound travel email." }, 503);
    }
}
