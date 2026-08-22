import { loadCheckoutStatus } from "@/lib/events/attendee";
import { eventMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ orderId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadCheckoutStatus(auth.supabase, auth.user.id, (await params).orderId),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}
