import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  buildUserDataExportZip,
  DATA_EXPORT_BUCKET,
  DATA_EXPORT_RATE_LIMIT_HOURS,
  DATA_EXPORT_SCHEMA_VERSION,
  getDataExportExpirationDate,
  isRecentEnoughAuth,
} from "@/lib/data-export/exportBuilder";
import type { Database } from "@/src/types/supabase";

type ExportClient = SupabaseClient<Database>;
export type ExportStatus = "requested" | "preparing" | "ready" | "expired" | "failed";

export class DataExportServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DataExportServiceError";
  }
}

export async function listUserDataExports(supabase: ExportClient, userId: string) {
  const { data, error } = await supabase
    .from("user_data_exports")
    .select(
      "id,status,requested_at,processing_started_at,completed_at,expires_at,export_schema_version,failure_code,downloaded_at",
    )
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new DataExportServiceError(
      "Could not load data export requests.",
      "load_failed",
      500,
    );
  }
  return data || [];
}

export async function requestUserDataExport(
  supabase: ExportClient,
  user: User,
) {
  if (!isRecentEnoughAuth(user.last_sign_in_at)) {
    throw new DataExportServiceError(
      "Please sign in again before downloading your data.",
      "reauth_required",
      403,
    );
  }
  const rateLimitSince = new Date(
    Date.now() - DATA_EXPORT_RATE_LIMIT_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentExports, error: recentError } = await supabase
    .from("user_data_exports")
    .select("id,status,requested_at,expires_at")
    .eq("user_id", user.id)
    .gte("requested_at", rateLimitSince)
    .in("status", ["requested", "preparing", "ready"]);
  if (recentError) {
    throw new DataExportServiceError(
      "Could not verify export rate limit.",
      "rate_limit_check_failed",
      500,
    );
  }
  const reusable = (recentExports || []).find(
    (item) =>
      item.status === "ready" &&
      item.expires_at &&
      new Date(item.expires_at).getTime() > Date.now(),
  );
  if (reusable) {
    return {
      exportId: reusable.id,
      status: reusable.status as ExportStatus,
      message:
        "A recent data export is already ready. Download it before requesting another export.",
    };
  }
  if ((recentExports || []).length) {
    throw new DataExportServiceError(
      `You can request another data export after ${DATA_EXPORT_RATE_LIMIT_HOURS} hours.`,
      "rate_limited",
      429,
    );
  }

  let serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  try {
    serviceSupabase = createServiceRoleClient();
  } catch {
    throw new DataExportServiceError(
      "The data export service is not configured for this environment.",
      "service_not_configured",
      500,
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
    throw new DataExportServiceError(
      "Could not create data export request.",
      "create_failed",
      500,
    );
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
    return {
      exportId: exportRecord.id,
      status: "ready" as const,
      expiresAt: expiresAt.toISOString(),
    };
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
    throw new DataExportServiceError(
      "Could not prepare your data export.",
      "prepare_failed",
      500,
    );
  }
}

export async function createUserDataExportDownload(
  supabase: ExportClient,
  userId: string,
  exportId: string,
) {
  const { data: record, error } = await supabase
    .from("user_data_exports")
    .select("id,status,expires_at,storage_path")
    .eq("id", exportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new DataExportServiceError(
      "Could not load this data export.",
      "load_failed",
      500,
    );
  }
  if (!record) throw new DataExportServiceError("Data export not found.", "not_found", 404);
  let serviceSupabase: ReturnType<typeof createServiceRoleClient>;
  try {
    serviceSupabase = createServiceRoleClient();
  } catch {
    throw new DataExportServiceError(
      "The data export download service is not configured for this environment.",
      "service_not_configured",
      500,
    );
  }
  if (record.status !== "ready" || !record.storage_path || !record.expires_at) {
    throw new DataExportServiceError(
      "This data export is not ready to download.",
      "not_ready",
      409,
    );
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await serviceSupabase
      .from("user_data_exports")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", record.id)
      .eq("user_id", userId);
    throw new DataExportServiceError(
      "This data export has expired.",
      "expired",
      410,
    );
  }
  const { data, error: signedUrlError } = await serviceSupabase.storage
    .from(DATA_EXPORT_BUCKET)
    .createSignedUrl(record.storage_path, 10 * 60, {
      download: "vaivia-data-export.zip",
    });
  if (signedUrlError || !data?.signedUrl) {
    throw new DataExportServiceError(
      "Could not create a download link.",
      "signed_url_failed",
      500,
    );
  }
  await serviceSupabase
    .from("user_data_exports")
    .update({ downloaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("user_id", userId);
  return { url: data.signedUrl, expiresInSeconds: 10 * 60 };
}
