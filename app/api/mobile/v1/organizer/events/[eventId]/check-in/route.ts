import {
  checkInEventTicket,
  undoEventTicketCheckIn,
} from "@/lib/events/operations";
import { eventOperationsMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ eventId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, DELETE, OPTIONS");
}

export async function POST(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as {
    value?: unknown;
  } | null;
  if (!body || typeof body.value !== "string") {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "A ticket number or QR value is required.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await checkInEventTicket(
        auth.supabase,
        auth.user.id,
        (await params).eventId,
        body.value,
      ),
    );
  } catch (error) {
    return eventOperationsMobileError(request, error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as {
    ticketId?: unknown;
  } | null;
  if (!body || typeof body.ticketId !== "string" || !body.ticketId.trim()) {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "A ticket is required.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await undoEventTicketCheckIn(
        auth.supabase,
        auth.user.id,
        (await params).eventId,
        body.ticketId,
      ),
    );
  } catch (error) {
    return eventOperationsMobileError(request, error);
  }
}
