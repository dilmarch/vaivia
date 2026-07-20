import "server-only";

export const EMAIL_IMPORT_LOCAL_PREFIX = "trips+";
export const EMAIL_IMPORT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
export const EMAIL_IMPORT_USERNAME_ALIAS_PATTERN =
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*\.[a-f0-9]{12}$/;
export const MAX_INBOUND_RECIPIENT_CANDIDATES = 50;
export const MAX_INBOUND_WEBHOOK_BYTES = 1_000_000;
export const MAX_INBOUND_EMAIL_BODY_BYTES = 2_000_000;
export const MAX_INBOUND_ATTACHMENTS = 25;

export type InboundRecipientMatch = {
    address: string;
    token: string;
};

type RecipientSource = {
    received_for?: string[] | null;
    to?: string[] | null;
    cc?: string[] | null;
    bcc?: string[] | null;
};

export function normalizeEmailAddress(value: string) {
    const trimmed = value.trim();
    const angleAddress = trimmed.match(/<([^>]+)>/);
    return (angleAddress?.[1] || trimmed).trim().toLowerCase();
}

export function maskEmailAddress(value: string) {
    const normalized = normalizeEmailAddress(value);
    const [localPart, domain] = normalized.split("@");

    if (!localPart || !domain) return "invalid-address";

    const prefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${prefix}${localPart.length > 2 ? "***" : "*"}@${domain}`;
}

export function getInboundRecipientCandidates(source: RecipientSource) {
    const candidates = [
        ...(source.received_for || []),
        ...(source.to || []),
        ...(source.cc || []),
        ...(source.bcc || []),
    ];

    return Array.from(
        new Map(
            candidates
                .filter((candidate) => typeof candidate === "string")
                .map((candidate) => [
                    normalizeEmailAddress(candidate),
                    normalizeEmailAddress(candidate),
                ])
        ).values()
    ).slice(0, MAX_INBOUND_RECIPIENT_CANDIDATES);
}

export function extractInboundRecipientToken(
    address: string,
    expectedDomain: string
): InboundRecipientMatch | null {
    const normalizedAddress = normalizeEmailAddress(address);
    const atIndex = normalizedAddress.lastIndexOf("@");

    if (atIndex <= 0) return null;

    const localPart = normalizedAddress.slice(0, atIndex);
    const domain = normalizedAddress.slice(atIndex + 1);

    if (domain.toLowerCase() !== expectedDomain.trim().toLowerCase()) return null;
    const legacyToken = localPart.startsWith(EMAIL_IMPORT_LOCAL_PREFIX)
        ? localPart.slice(EMAIL_IMPORT_LOCAL_PREFIX.length)
        : null;
    const token =
        legacyToken && EMAIL_IMPORT_TOKEN_PATTERN.test(legacyToken)
            ? legacyToken
            : EMAIL_IMPORT_USERNAME_ALIAS_PATTERN.test(localPart)
              ? localPart
              : null;
    if (!token) return null;

    return {
        address: normalizedAddress,
        token,
    };
}

export function getUtf8ByteLength(value: string | null | undefined) {
    return value ? Buffer.byteLength(value, "utf8") : 0;
}

export function sanitizeServerError(error: unknown) {
    const fallback = "Unknown error";

    if (!error) return "Unknown error";

    const inspectable =
        typeof error === "object" && error !== null
            ? (error as Record<string, unknown>)
            : null;
    const errorName =
        typeof inspectable?.name === "string" ? inspectable.name : "";
    const errorType =
        typeof inspectable?.type === "string" ? inspectable.type : "";
    const errorCode =
        typeof inspectable?.code === "string" ? inspectable.code : "";
    const rawMessage =
        error instanceof Error
            ? error.message
            : typeof inspectable?.message === "string"
              ? inspectable.message
              : typeof error === "string"
                ? error
                : "";
    const normalizedMessage = rawMessage.toLowerCase();

    if (
        errorName === "restricted_api_key" ||
        errorType === "restricted_api_key" ||
        errorCode === "restricted_api_key" ||
        normalizedMessage.includes("restricted_api_key") ||
        (normalizedMessage.includes("api key") &&
            normalizedMessage.includes("full access"))
    ) {
        return "resend_api_key_requires_full_access";
    }

    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }

    if (typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") return message.slice(0, 500);
    }

    if (typeof error === "string") return error.slice(0, 500);

    return fallback;
}
