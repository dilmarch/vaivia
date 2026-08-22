import {
  cancelAttendeeRsvp,
  loadAttendeeEvent,
  registerAttendeeForEvent,
  setEventSaved,
  type EventRegistrationInput,
} from "@/lib/events/attendee";
import { eventMobileError } from "@/lib/events/mobileResponse";
import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ eventId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, POST, PATCH, DELETE, OPTIONS");
}

export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await loadAttendeeEvent(auth.supabase, auth.user.id, (await params).eventId),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  let body: EventRegistrationInput;
  try {
    body = (await request.json()) as EventRegistrationInput;
  } catch {
    return mobileError(request, {
      status: 400,
      code: "validation_error",
      message: "Registration details are required.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await registerAttendeeForEvent({
        supabase: auth.supabase,
        user: auth.user,
        eventId: (await params).eventId,
        input: { ...body, mobile: true },
      }),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as { saved?: unknown } | null;
  if (!body || typeof body.saved !== "boolean") {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "A saved state is required.",
    });
  }
  try {
    return mobileSuccess(
      request,
      await setEventSaved(auth.supabase, auth.user.id, (await params).eventId, body.saved),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  try {
    return mobileSuccess(
      request,
      await cancelAttendeeRsvp(auth.supabase, (await params).eventId),
    );
  } catch (error) {
    return eventMobileError(request, error);
  }
}
