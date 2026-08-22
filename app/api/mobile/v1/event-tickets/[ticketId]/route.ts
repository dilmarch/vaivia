import { loadAttendeeTicket } from "@/lib/events/attendee";
import { eventMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ ticketId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadAttendeeTicket((await params).ticketId, auth.user.id),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}
