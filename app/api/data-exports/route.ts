import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
    buildUserDataExportZip,
    DATA_EXPORT_BUCKET,
    DATA_EXPORT_RATE_LIMIT_HOURS,
    DATA_EXPORT_SCHEMA_VERSION,
    getDataExportExpirationDate,
    isRecentEnoughAuth,
} from "@/lib/data-export/exportBuilder";

type ExportStatus = "requested" | "preparing" | "ready" | "expired" | "failed";

function exportError(message: string, status = 400, code = "export_error") {
    return NextResponse.json({ error: message, code }, { status });
}

async function getAuthenticatedUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return { supabase, user };
}

export async function GET() {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return exportError("Sign in to view data exports.", 401, "not_authenticated");

    const { data, error } = await supabase
        .from("user_data_exports")
        .select(
            "id,status,requested_at,processing_started_at,completed_at,expires_at,export_schema_version,failure_code,downloaded_at"
        )
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(10);

    if (error) {
        return exportError("Could not load data export requests.", 500, "load_failed");
    }

    return NextResponse.json({ exports: data || [] });
}

export async function POST() {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user)
        return exportError(
            "Sign in to request a data export.",
            401,
            "not_authenticated"
        );

    if (!isRecentEnoughAuth(user.last_sign_in_at)) {
        return exportError(
            "Please sign in again before downloading your data.",
            403,
            "reauth_required"
        );
    }

    const rateLimitSince = new Date(
        Date.now() - DATA_EXPORT_RATE_LIMIT_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: recentExports, error: recentError } = await supabase
        .from("user_data_exports")
        .select("id,status,requested_at,expires_at")
        .eq("user_id", user.id)
        .gte("requested_at", rateLimitSince)
        .in("status", ["requested", "preparing", "ready"]);

    if (recentError) {
        return exportError("Could not verify export rate limit.", 500, "rate_limit_check_failed");
    }

    const reusableExport = (recentExports || []).find(
        (item) =>
            item.status === "ready" &&
            item.expires_at &&
            new Date(item.expires_at).getTime() > Date.now()
    );

    if (reusableExport) {
        return NextResponse.json(
            {
                exportId: reusableExport.id,
                status: reusableExport.status as ExportStatus,
                message:
                    "A recent data export is already ready. Download it before requesting another export.",
            },
            { status: 200 }
        );
    }

    if ((recentExports || []).length > 0) {
        return exportError(
            `You can request another data export after ${DATA_EXPORT_RATE_LIMIT_HOURS} hours.`,
            429,
            "rate_limited"
        );
    }

    let serviceSupabase: ReturnType<typeof createServiceRoleClient>;
    try {
        serviceSupabase = createServiceRoleClient();
    } catch (error) {
        console.error("Data export service client is not configured:", error);
        return exportError(
            "The data export service is not configured for this environment.",
            500,
            "service_not_configured"
        );
    }
    const now = new Date();
    const expiresAt = getDataExportExpirationDate(now);

    const { data: exportRecord, error: insertError } = await serviceSupabase
        .from("user_data_exports")
        .insert({
            user_id: user.id,
            status: "preparing",
            processing_started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            export_schema_version: DATA_EXPORT_SCHEMA_VERSION,
        })
        .select("id")
        .single();

    if (insertError || !exportRecord) {
        return exportError("Could not create data export request.", 500, "create_failed");
    }

    try {
        const exportZip = await buildUserDataExportZip({
            supabase,
            userId: user.id,
            email: user.email,
            expiresAt,
        });

        const { error: uploadError } = await serviceSupabase.storage
            .from(DATA_EXPORT_BUCKET)
            .upload(exportZip.storagePath, exportZip.archive, {
                contentType: "application/zip",
                upsert: false,
            });

        if (uploadError) throw uploadError;

        const { error: updateError } = await serviceSupabase
            .from("user_data_exports")
            .update({
                status: "ready",
                completed_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                storage_path: exportZip.storagePath,
                updated_at: new Date().toISOString(),
            })
            .eq("id", exportRecord.id)
            .eq("user_id", user.id);

        if (updateError) throw updateError;

        return NextResponse.json({
            exportId: exportRecord.id,
            status: "ready" satisfies ExportStatus,
            expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
        const failureCode =
            error instanceof Error ? error.message.slice(0, 160) : "unknown_error";

        await serviceSupabase
            .from("user_data_exports")
            .update({
                status: "failed",
                failure_code: failureCode,
                updated_at: new Date().toISOString(),
            })
            .eq("id", exportRecord.id)
            .eq("user_id", user.id);

        return exportError("Could not prepare your data export.", 500, "prepare_failed");
    }
}
