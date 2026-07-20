import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAppleWalletPass } from "@/lib/events/wallet";
import { getOwnedTicketWithSecret } from "@/lib/events/tickets";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const result = await getOwnedTicketWithSecret(ticketId, user.id);
  if (
    !result ||
    !result.redemptionSecret ||
    !["active", "checked_in"].includes(result.ticket.status)
  )
    return NextResponse.json(
      { error: "This ticket cannot be added to a wallet." },
      { status: 403 },
    );
  const event = Array.isArray(result.ticket.events)
    ? result.ticket.events[0]
    : result.ticket.events;
  const tier = Array.isArray(result.ticket.event_ticket_types)
    ? result.ticket.event_ticket_types[0]
    : result.ticket.event_ticket_types;
  if (!event)
    return NextResponse.json({ error: "Event unavailable." }, { status: 404 });
  const pass = await createAppleWalletPass({
    ticketId,
    ticketNumber: result.ticket.ticket_number,
    eventName: event.title,
    eventDateLabel: formatEventDateTime(event.starts_at, event.timezone),
    venueName: eventLocationLabel(event),
    tierName: tier?.name || "Admission",
    attendeeName: result.ticket.attendee_name,
    barcodeValue: result.redemptionSecret,
  }).catch(() => null);
  if (!pass)
    return NextResponse.json(
      { error: "Apple Wallet isn’t configured yet." },
      { status: 503 },
    );
  return new NextResponse(new Uint8Array(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="vaivia-${result.ticket.ticket_number}.pkpass"`,
      "Cache-Control": "private, no-store",
    },
  });
}
