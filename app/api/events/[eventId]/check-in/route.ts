import { NextRequest, NextResponse } from "next/server";
import { requireEventManager } from "@/lib/events/auth";
import {
  checkInEventTicket,
  EventOperationsError,
} from "@/lib/events/operations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventManager(eventId);
  const body = (await request.json().catch(() => ({}))) as { value?: string };
  const value = String(body.value || "").trim();
  if (!value) return NextResponse.json({ result: "invalid" }, { status: 400 });
  try {
    const result = await checkInEventTicket(
      auth.supabase,
      auth.user.id,
      eventId,
      value,
    );
    return NextResponse.json(result, {
      status: result.result === "invalid" ? 404 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      { result: "error" },
      { status: error instanceof EventOperationsError ? error.status : 400 },
    );
  }
}
