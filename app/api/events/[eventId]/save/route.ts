import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase
    .from("saved_events")
    .upsert(
      { event_id: eventId, user_id: user.id },
      { onConflict: "event_id,user_id", ignoreDuplicates: true },
    );
  if (error)
    return NextResponse.json(
      { error: "This event could not be saved." },
      { status: 400 },
    );
  return NextResponse.json({ saved: true });
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
  await supabase
    .from("saved_events")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  return NextResponse.json({ saved: false });
}
