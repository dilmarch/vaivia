import "server-only";

import { randomBytes } from "crypto";
import {
    getUsernameValidationError,
    normalizeUsername,
} from "@/lib/usernames";

export const LEGACY_EMAIL_IMPORT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
export const USERNAME_EMAIL_IMPORT_LOCAL_PART_PATTERN =
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*\.[a-f0-9]{12}$/;

type EmailImportAddressResult = {
    data: unknown;
    error: { code?: string; message?: string } | null;
};

type EmailImportAddressSelectBuilder = {
    eq: (
        column: string,
        value: string | boolean
    ) => EmailImportAddressSelectBuilder;
    maybeSingle: () => Promise<EmailImportAddressResult>;
};

export type EmailImportAddressSupabase = {
    from: (table: "user_email_import_addresses") => {
        select: (columns: string) => {
            eq: (
                column: string,
                value: string | boolean
            ) => EmailImportAddressSelectBuilder;
        };
    };
};

export type UserEmailImportAddress = {
    id: string;
    user_id: string;
    inbound_token: string;
    is_active: boolean;
    is_primary: boolean;
    address_format: "legacy" | "username";
    request_key: string | null;
    created_at: string;
    rotated_at: string | null;
    retired_at: string | null;
};

export function getEmailImportDomain() {
    const domain = process.env.EMAIL_IMPORT_DOMAIN?.trim();
    if (!domain) {
        throw new Error("EMAIL_IMPORT_DOMAIN is not configured.");
    }

    return domain;
}

export function formatEmailImportAddress(inboundToken: string) {
    const normalizedToken = inboundToken.trim().toLowerCase();
    const localPart = LEGACY_EMAIL_IMPORT_TOKEN_PATTERN.test(normalizedToken)
        ? `trips+${normalizedToken}`
        : normalizedToken;
    return `${localPart}@${getEmailImportDomain()}`;
}

export function generateEmailImportLocalPart(username: string) {
    const normalizedUsername = normalizeUsername(username);
    const validationError = getUsernameValidationError(normalizedUsername);
    if (validationError) {
        throw new Error("A valid username is required before creating a forwarding address.");
    }

    // Six random bytes produce a compact 48-bit lowercase suffix. Hex avoids
    // visually confusing letters such as i, l and o while remaining email-safe.
    return `${normalizedUsername}.${randomBytes(6).toString("hex")}`;
}

export async function generateUniqueEmailImportLocalPart(
    supabase: EmailImportAddressSupabase,
    username: string,
    maxAttempts = 8
) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const token = generateEmailImportLocalPart(username);
        const { data, error } = await supabase
            .from("user_email_import_addresses")
            .select("id")
            .eq("inbound_token", token)
            .maybeSingle();

        if (!error && !data) return token;

        if (error && error.code !== "PGRST116") {
            throw new Error(error.message || "Could not verify email import token.");
        }
    }

    throw new Error("Could not generate a unique email import address.");
}

export function serializeEmailImportAddress(row: UserEmailImportAddress) {
    return {
        id: row.id,
        address: formatEmailImportAddress(row.inbound_token),
        isActive: row.is_active,
        isPrimary: row.is_primary,
        addressFormat: row.address_format,
        createdAt: row.created_at,
        rotatedAt: row.rotated_at,
        retiredAt: row.retired_at,
    };
}
