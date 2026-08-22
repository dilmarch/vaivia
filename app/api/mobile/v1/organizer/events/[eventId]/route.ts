import { loadManagedEvent } from "@/lib/events/operations";
import { eventOperationsMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ eventId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadManagedEvent(
        auth.supabase,
        auth.user.id,
        (await params).eventId,
      ),
    );
  } catch (error) {
    return eventOperationsMobileError(request, error);
  }
}
