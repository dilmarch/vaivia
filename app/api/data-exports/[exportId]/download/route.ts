import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { DATA_EXPORT_BUCKET } from "@/lib/data-export/exportBuilder";

type RouteContext = {
    params: Promise<{
        exportId: string;
    }>;
};

function downloadError(message: string, status = 400, code = "download_error") {
    return NextResponse.json({ error: message, code }, { status });
}

export async function POST(_request: Request, context: RouteContext) {
    const { exportId } = await context.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return downloadError("Sign in to download your data export.", 401, "not_authenticated");
    }

    const { data: exportRecord, error } = await supabase
        .from("user_data_exports")
        .select("id,status,expires_at,storage_path")
        .eq("id", exportId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        return downloadError("Could not load this data export.", 500, "load_failed");
    }

    if (!exportRecord) {
        return downloadError("Data export not found.", 404, "not_found");
    }

    let serviceSupabase: ReturnType<typeof createServiceRoleClient>;
    try {
        serviceSupabase = createServiceRoleClient();
    } catch (error) {
        console.error("Data export download service client is not configured:", error);
        return downloadError(
            "The data export download service is not configured for this environment.",
            500,
            "service_not_configured"
        );
    }

    if (
        exportRecord.status !== "ready" ||
        !exportRecord.storage_path ||
        !exportRecord.expires_at
    ) {
        return downloadError("This data export is not ready to download.", 409, "not_ready");
    }

    if (new Date(exportRecord.expires_at).getTime() <= Date.now()) {
        await serviceSupabase
            .from("user_data_exports")
            .update({
                status: "expired",
                updated_at: new Date().toISOString(),
            })
            .eq("id", exportRecord.id)
            .eq("user_id", user.id);

        return downloadError("This data export has expired.", 410, "expired");
    }

    const { data: signedUrlData, error: signedUrlError } =
        await serviceSupabase.storage
            .from(DATA_EXPORT_BUCKET)
            .createSignedUrl(exportRecord.storage_path, 10 * 60, {
                download: "vaivia-data-export.zip",
            });

    if (signedUrlError || !signedUrlData?.signedUrl) {
        return downloadError("Could not create a download link.", 500, "signed_url_failed");
    }

    await serviceSupabase
        .from("user_data_exports")
        .update({
            downloaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id)
        .eq("user_id", user.id);

    return NextResponse.json({
        url: signedUrlData.signedUrl,
        expiresInSeconds: 10 * 60,
    });
}
