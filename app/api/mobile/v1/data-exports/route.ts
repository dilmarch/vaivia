import {
  DataExportServiceError,
  listUserDataExports,
  requestUserDataExport,
} from "@/lib/data-export/exportService";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

function handleError(request: Request, error: unknown) {
  if (error instanceof DataExportServiceError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  console.error("Mobile data export operation failed", {
    message: error instanceof Error ? error.message : "unknown_error",
  });
  return mobileError(request, {
    status: 500,
    code: "export_error",
    message: "Could not complete the data export request.",
  });
}

export async function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, OPTIONS");
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  try {
    const records = await listUserDataExports(context.supabase, context.user.id);
    return mobileSuccess(request, {
      exports: records.map((record) => ({
        id: record.id,
        status: record.status,
        requestedAt: record.requested_at,
        processingStartedAt: record.processing_started_at,
        completedAt: record.completed_at,
        expiresAt: record.expires_at,
        schemaVersion: record.export_schema_version,
        failureCode: record.failure_code,
        downloadedAt: record.downloaded_at,
      })),
    });
  } catch (error) {
    return handleError(request, error);
  }
}

export async function POST(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;
  try {
    return mobileSuccess(
      request,
      await requestUserDataExport(context.supabase, context.user),
    );
  } catch (error) {
    return handleError(request, error);
  }
}
