import {
  createUserDataExportDownload,
  DataExportServiceError,
} from "@/lib/data-export/exportService";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type RouteContext = { params: Promise<{ exportId: string }> };

export async function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const { exportId } = await context.params;
  try {
    return mobileSuccess(
      request,
      await createUserDataExportDownload(auth.supabase, auth.user.id, exportId),
    );
  } catch (error) {
    if (error instanceof DataExportServiceError) {
      return mobileError(request, {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }
    return mobileError(request, {
      status: 500,
      code: "download_error",
      message: "Could not create a download link.",
    });
  }
}
