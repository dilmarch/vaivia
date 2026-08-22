import { listManagedEvents } from "@/lib/events/operations";
import { eventOperationsMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
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
      await listManagedEvents(auth.supabase, auth.user.id),
    );
  } catch (error) {
    return eventOperationsMobileError(request, error);
  }
}
