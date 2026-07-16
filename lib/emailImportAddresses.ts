import "server-only";

import { randomBytes } from "crypto";

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
    created_at: string;
    rotated_at: string | null;
};

export function getEmailImportDomain() {
    const domain = process.env.EMAIL_IMPORT_DOMAIN?.trim();
    if (!domain) {
        throw new Error("EMAIL_IMPORT_DOMAIN is not configured.");
    }

    return domain;
}

export function formatEmailImportAddress(inboundToken: string) {
    return `trips+${inboundToken}@${getEmailImportDomain()}`;
}

export function generateEmailImportToken() {
    return randomBytes(24).toString("hex");
}

export async function generateUniqueEmailImportToken(
    supabase: EmailImportAddressSupabase,
    maxAttempts = 8
) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const token = generateEmailImportToken();
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

    throw new Error("Could not generate a unique email import token.");
}

export function serializeEmailImportAddress(row: UserEmailImportAddress) {
    return {
        id: row.id,
        address: formatEmailImportAddress(row.inbound_token),
        createdAt: row.created_at,
        rotatedAt: row.rotated_at,
    };
}
