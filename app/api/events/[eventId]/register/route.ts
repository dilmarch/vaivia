import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  EventAttendeeError,
  registerAttendeeForEvent,
  type EventRegistrationInput,
} from "@/lib/events/attendee";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
        loginUrl: `/auth/login?next=${encodeURIComponent(request.nextUrl.pathname)}`,
      },
      { status: 401 },
    );
  }

  let body: EventRegistrationInput;
  try {
    body = (await request.json()) as EventRegistrationInput;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await registerAttendeeForEvent({
      supabase,
      user,
      eventId,
      input: { ...body, mobile: false },
    });
    return NextResponse.json({
      ok: true,
      ...result,
      ...(result.mode === "free" ? { redirectUrl: "/my-events" } : {}),
    });
  } catch (error) {
    if (error instanceof EventAttendeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Registration could not be completed." },
      { status: 500 },
    );
  }
}
