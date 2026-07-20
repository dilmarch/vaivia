import { NextRequest, NextResponse } from "next/server";
import { hashEventSecret } from "@/lib/events/tickets";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventManager(eventId);
  const body = (await request.json().catch(() => ({}))) as { value?: string };
  const value = String(body.value || "").trim();
  if (!value) return NextResponse.json({ result: "invalid" }, { status: 400 });
  let redemptionHash = "";
  if (value.startsWith("vaivia:event-ticket:"))
    redemptionHash = hashEventSecret(
      value.slice("vaivia:event-ticket:".length),
    );
  else {
    const service = createServiceRoleClient();
    const { data: ticket } = await service
      .from("event_tickets")
      .select("redemption_hash")
      .eq("event_id", eventId)
      .ilike("ticket_number", value)
      .maybeSingle();
    redemptionHash = ticket?.redemption_hash || "";
  }
  if (!redemptionHash)
    return NextResponse.json({ result: "invalid" }, { status: 404 });
  const { data, error } = await auth.supabase.rpc("check_in_event_ticket", {
    target_event_id: eventId,
    target_redemption_hash: redemptionHash,
  });
  if (error) return NextResponse.json({ result: "error" }, { status: 400 });
  return NextResponse.json(data);
}
