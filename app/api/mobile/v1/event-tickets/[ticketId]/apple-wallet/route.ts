import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";
import { getOwnedTicketWithSecret } from "@/lib/events/tickets";
import { createAppleWalletPass } from "@/lib/events/wallet";
import {
  authenticateMobileRequest,
  getMobileCorsHeaders,
  mobileError,
  mobileOptions,
} from "@/lib/mobileApi/server";

type Context = { params: Promise<{ ticketId: string }> };

export function OPTIONS(request: Request) {
  return mobileOptions(request, "GET, OPTIONS");
}

export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  const { ticketId } = await params;
  const result = await getOwnedTicketWithSecret(ticketId, auth.user.id);
  if (!result?.redemptionSecret || !["active", "checked_in"].includes(result.ticket.status)) {
    return mobileError(request, {
      status: 403,
      code: "forbidden",
      message: "This ticket cannot be added to a wallet.",
    });
  }
  const event = Array.isArray(result.ticket.events) ? result.ticket.events[0] : result.ticket.events;
  const tier = Array.isArray(result.ticket.event_ticket_types)
    ? result.ticket.event_ticket_types[0]
    : result.ticket.event_ticket_types;
  if (!event) {
    return mobileError(request, {
      status: 404,
      code: "not_found",
      message: "Event unavailable.",
    });
  }
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
  if (!pass) {
    return mobileError(request, {
      status: 503,
      code: "wallet_unavailable",
      message: "Apple Wallet isn’t configured yet.",
      retryable: false,
    });
  }
  const headers = getMobileCorsHeaders(request, "GET, OPTIONS");
  headers.set("Content-Type", "application/vnd.apple.pkpass");
  headers.set(
    "Content-Disposition",
    `attachment; filename="vaivia-${result.ticket.ticket_number}.pkpass"`,
  );
  return new Response(new Uint8Array(pass), { headers });
}
