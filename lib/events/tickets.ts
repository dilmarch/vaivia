import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { createServiceRoleClient } from "@/lib/supabase/service";

export function hashEventSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function safeHashEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function getOwnedTicketWithSecret(
  ticketId: string,
  userId: string,
) {
  const service = createServiceRoleClient();
  const { data: ticket } = await service
    .from("event_tickets")
    .select("*,events(*),event_ticket_types(name,attendee_instructions)")
    .eq("id", ticketId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (!ticket) return null;
  const { data: secret } = await service.rpc("get_event_ticket_secret", {
    target_ticket_id: ticketId,
  });
  return { ticket, redemptionSecret: secret || null };
}

export async function createTicketQrDataUrl(secret: string) {
  return QRCode.toDataURL(`vaivia:event-ticket:${secret}`, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 560,
    color: { dark: "#080511", light: "#ffffff" },
  });
}
