import "server-only";

export const EMAIL_IMPORT_LOCAL_PREFIX = "trips+";
export const EMAIL_IMPORT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

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
    );
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
    if (!localPart.startsWith(EMAIL_IMPORT_LOCAL_PREFIX)) return null;

    const token = localPart.slice(EMAIL_IMPORT_LOCAL_PREFIX.length);
    if (!EMAIL_IMPORT_TOKEN_PATTERN.test(token)) return null;

    return {
        address: normalizedAddress,
        token,
    };
}

export function sanitizeServerError(error: unknown) {
    if (!error) return "Unknown error";

    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }

    if (typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") return message.slice(0, 500);
    }

    if (typeof error === "string") return error.slice(0, 500);

    return "Unknown error";
}
