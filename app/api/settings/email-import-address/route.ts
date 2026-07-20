import { NextResponse, type NextRequest } from "next/server";
import {
    generateUniqueEmailImportLocalPart,
    serializeEmailImportAddress,
    type UserEmailImportAddress,
} from "@/lib/emailImportAddresses";
import {
    getUsernameValidationError,
    normalizeUsername,
} from "@/lib/usernames";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const ADDRESS_COLUMNS =
    "id,user_id,inbound_token,is_active,is_primary,address_format,request_key,created_at,rotated_at,retired_at";

type EmailImportRouteError = {
    code?: string;
    message?: string;
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
    order: (
        column: string,
        options: { ascending: boolean }
    ) => EmailImportRouteSelectBuilder;
    maybeSingle: () => Promise<EmailImportRouteResult>;
};

type EmailImportAddressTable = {
    select: (columns: string) => EmailImportRouteSelectBuilder;
};

type UserProfileTable = {
    select: (columns: string) => EmailImportRouteSelectBuilder;
};

type EmailImportRouteSupabase = {
    from(table: "user_email_import_addresses"): EmailImportAddressTable;
    from(table: "user_profiles"): UserProfileTable;
    rpc: (
        fn: "rotate_user_email_import_address",
        args: {
            target_user_id: string;
            new_inbound_token: string;
            deactivate_previous: boolean;
            request_key: string | null;
        }
    ) => Promise<EmailImportRouteResult>;
};

function isUniqueViolation(error: EmailImportRouteError | null | undefined) {
    return error?.code === "23505";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
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

async function getUsername(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string
) {
    const { data, error } = await adminSupabase
        .from("user_profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

    if (error && error.code !== "PGRST116") {
        throw new Error("Could not load profile username.");
    }

    const username = normalizeUsername(
        typeof (data as { username?: unknown } | null)?.username === "string"
            ? String((data as { username: string }).username)
            : ""
    );
    return getUsernameValidationError(username) ? null : username;
}

async function getAddresses(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string
) {
    const query = adminSupabase
        .from("user_email_import_addresses")
        .select(ADDRESS_COLUMNS)
        .eq("user_id", userId)
        .order("is_primary", { ascending: false })
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });
    const { data, error } = await (query as unknown as Promise<EmailImportRouteResult>);

    if (error) throw new Error("Could not load forwarding addresses.");
    return (Array.isArray(data) ? data : []) as UserEmailImportAddress[];
}

async function issueAddress(
    adminSupabase: ReturnType<typeof getAdminClient>,
    userId: string,
    username: string,
    options: {
        deactivatePrevious: boolean;
        requestKey: string | null;
    }
) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const localPart = await generateUniqueEmailImportLocalPart(
            adminSupabase,
            username
        );
        const { data, error } = await adminSupabase.rpc(
            "rotate_user_email_import_address",
            {
                target_user_id: userId,
                new_inbound_token: localPart,
                deactivate_previous: options.deactivatePrevious,
                request_key: options.requestKey,
            }
        );

        if (!error && data) return data as UserEmailImportAddress;
        if (isUniqueViolation(error)) continue;
        throw new Error("Could not create forwarding address.");
    }

    throw new Error("Could not create a unique forwarding address.");
}

function serializeAddressState(
    addresses: UserEmailImportAddress[],
    usernameRequired: boolean
) {
    const serialized = addresses.map(serializeEmailImportAddress);
    return {
        primary: serialized.find((address) => address.isPrimary) || null,
        addresses: serialized,
        usernameRequired,
    };
}

export async function GET() {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const adminSupabase = getAdminClient();
        const username = await getUsername(adminSupabase, userId);
        let addresses = await getAddresses(adminSupabase, userId);
        const hasCurrentRecognizablePrimary = addresses.some(
            (address) =>
                address.is_primary &&
                address.is_active &&
                address.address_format === "username" &&
                Boolean(username) &&
                address.inbound_token.startsWith(`${username}.`)
        );

        if (!hasCurrentRecognizablePrimary && username) {
            await issueAddress(adminSupabase, userId, username, {
                deactivatePrevious: false,
                requestKey: null,
            });
            addresses = await getAddresses(adminSupabase, userId);
        }

        return NextResponse.json(serializeAddressState(addresses, !username));
    } catch (error) {
        console.error("email_import_address_load_failed", {
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return NextResponse.json(
            { error: "Could not load forwarding addresses." },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
        deactivatePrevious?: unknown;
        requestKey?: unknown;
    } | null;
    const requestKey =
        typeof body?.requestKey === "string" ? body.requestKey.trim() : "";
    if (!isUuid(requestKey)) {
        return NextResponse.json(
            { error: "A valid rotation request is required." },
            { status: 400 }
        );
    }

    try {
        const adminSupabase = getAdminClient();
        const username = await getUsername(adminSupabase, userId);
        if (!username) {
            return NextResponse.json(
                {
                    code: "username_required",
                    error: "Choose a valid username before creating a new forwarding address.",
                },
                { status: 409 }
            );
        }

        await issueAddress(adminSupabase, userId, username, {
            deactivatePrevious: body?.deactivatePrevious === true,
            requestKey,
        });
        const addresses = await getAddresses(adminSupabase, userId);

        return NextResponse.json(serializeAddressState(addresses, false));
    } catch (error) {
        console.error("email_import_address_rotation_failed", {
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return NextResponse.json(
            { error: "Could not create a new forwarding address." },
            { status: 500 }
        );
    }
}
