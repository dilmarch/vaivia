import { NextResponse } from "next/server";
import {
    generateUniqueEmailImportToken,
    serializeEmailImportAddress,
    type UserEmailImportAddress,
} from "@/lib/emailImportAddresses";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type EmailImportRouteError = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

type EmailImportRouteResult = {
    data: unknown;
    error: EmailImportRouteError | null;
};

type EmailImportRouteSelectBuilder = {
    eq: (
        column: string,
        value: string | boolean
    ) => EmailImportRouteSelectBuilder;
    maybeSingle: () => Promise<EmailImportRouteResult>;
    single: () => Promise<EmailImportRouteResult>;
};

type EmailImportRouteInsertBuilder = {
    select: (columns: string) => {
        single: () => Promise<EmailImportRouteResult>;
    };
};

type EmailImportRouteTable = {
    select: (columns: string) => EmailImportRouteSelectBuilder;
    insert: (values: Record<string, unknown>) => EmailImportRouteInsertBuilder;
};

type EmailImportRouteSupabase = {
    from: (table: "user_email_import_addresses") => EmailImportRouteTable;
    rpc: (
        fn: "rotate_user_email_import_address",
        args: Record<string, unknown>
    ) => Promise<EmailImportRouteResult>;
};

function isUniqueViolation(error: { code?: string } | null | undefined) {
    return error?.code === "23505";
}

async function getAuthenticatedUserId() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return user?.id || null;
}

function getAdminClient() {
    return createServiceRoleClient() as unknown as EmailImportRouteSupabase;
}

async function getActiveAddress(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string
) {
    const { data, error } = await adminSupabase
        .from("user_email_import_addresses")
        .select("id,user_id,inbound_token,is_active,created_at,rotated_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

    if (error && error.code !== "PGRST116") {
        throw error;
    }

    return (data || null) as UserEmailImportAddress | null;
}

async function createAddress(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string
) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const token = await generateUniqueEmailImportToken(adminSupabase);
        const { data, error } = await adminSupabase
            .from("user_email_import_addresses")
            .insert({
                user_id: userId,
                inbound_token: token,
            })
            .select("id,user_id,inbound_token,is_active,created_at,rotated_at")
            .single();

        if (!error && data) return data as UserEmailImportAddress;

        if (isUniqueViolation(error)) {
            const existing = await getActiveAddress(adminSupabase, userId);
            if (existing) return existing;
            continue;
        }

        throw error || new Error("Could not create email import address.");
    }

    throw new Error("Could not create a unique email import address.");
}

async function rotateAddress(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string
) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const token = await generateUniqueEmailImportToken(adminSupabase);
        const { data, error } = await adminSupabase.rpc(
            "rotate_user_email_import_address",
            {
                target_user_id: userId,
                new_inbound_token: token,
            }
        );

        if (!error && data) return data as UserEmailImportAddress;

        if (isUniqueViolation(error)) continue;

        throw error || new Error("Could not regenerate email import address.");
    }

    throw new Error("Could not regenerate a unique email import address.");
}

export async function GET() {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const adminSupabase = getAdminClient();
        const existing = await getActiveAddress(adminSupabase, userId);
        const row = existing || (await createAddress(adminSupabase, userId));

        return NextResponse.json(serializeEmailImportAddress(row));
    } catch (error) {
        console.error("Could not load email import address:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not load email import address.",
            },
            { status: 500 }
        );
    }
}

export async function POST() {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const adminSupabase = getAdminClient();
        const row = await rotateAddress(adminSupabase, userId);

        return NextResponse.json(serializeEmailImportAddress(row));
    } catch (error) {
        console.error("Could not regenerate email import address:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not regenerate email import address.",
            },
            { status: 500 }
        );
    }
}
