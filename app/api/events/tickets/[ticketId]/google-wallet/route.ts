import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGoogleWalletSaveUrl } from "@/lib/events/wallet";
import { getOwnedTicketWithSecret } from "@/lib/events/tickets";
import { eventLocationLabel } from "@/lib/events/format";

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
  if (!event)
    return NextResponse.json({ error: "Event unavailable." }, { status: 404 });
  const url = await createGoogleWalletSaveUrl({
    ticketId,
    ticketNumber: result.ticket.ticket_number,
    eventName: event.title,
    startDateTime: event.starts_at,
    venueName: eventLocationLabel(event),
    barcodeValue: result.redemptionSecret,
  }).catch(() => null);
  if (!url)
    return NextResponse.json(
      { error: "Google Wallet isn’t configured yet." },
      { status: 503 },
    );
  return NextResponse.redirect(url);
}
