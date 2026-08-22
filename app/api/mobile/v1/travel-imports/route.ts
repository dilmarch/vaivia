import { loadTravelImportInbox } from "@/lib/travel-imports/domain";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadTravelImportInbox(auth.supabase, auth.user.id),
    );
  } catch (error) {
    console.error("Mobile travel import inbox failed:", {
      userId: auth.user.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return mobileError(request, {
      status: 500,
      code: "travel_imports_failed",
      message: "VAIVIA could not load travel imports.",
    });
  }
}
