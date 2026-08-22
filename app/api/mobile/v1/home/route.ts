import { loadHomeDashboard } from "@/lib/dashboard/loadHomeDashboard";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  const result = await loadHomeDashboard(context.supabase, context.user);
  if (result.tripLoadError) {
    console.error("Mobile home request failed:", {
      userId: context.user.id,
      code: result.tripLoadError.code,
      message: result.tripLoadError.message,
    });
    return mobileError(request, {
      status: 500,
      code: "home_unavailable",
      message: "Could not load your dashboard.",
      retryable: true,
    });
  }

  return mobileSuccess(request, result.data);
}
