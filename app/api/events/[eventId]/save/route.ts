import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EventAttendeeError, setEventSaved } from "@/lib/events/attendee";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      {
        error: "Authentication required.",
        loginUrl: `/auth/login?next=${encodeURIComponent(`/events/${eventId}?intent=save`)}`,
      },
      { status: 401 },
    );
  try {
    return NextResponse.json(await setEventSaved(supabase, user.id, eventId, true));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof EventAttendeeError ? error.message : "This event could not be saved." },
      { status: error instanceof EventAttendeeError ? error.status : 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  try {
    return NextResponse.json(await setEventSaved(supabase, user.id, eventId, false));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof EventAttendeeError ? error.message : "This event could not be removed from saved events." },
      { status: error instanceof EventAttendeeError ? error.status : 500 },
    );
  }
}
