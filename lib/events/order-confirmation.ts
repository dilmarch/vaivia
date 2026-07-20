import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendEventTicketConfirmationEmail } from "@/lib/events/emails";
import { sendEventStatusEmail } from "@/lib/events/emails";
import { eventLocationLabel } from "@/lib/events/format";

export async function sendOrderConfirmation(orderId: string) {
  const service = createServiceRoleClient();
  const { data: order } = await service
    .from("event_orders")
    .select(
      "id,status,total_minor,currency,user_id,events(title,slug,starts_at,timezone,venue_type,venue_name,city,region,organizer_contact_email,refund_policy),event_order_items(ticket_name_snapshot,quantity)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order || !["paid", "free"].includes(order.status)) return;
  const { data: profile } = await service
    .from("user_profiles")
    .select("email")
    .eq("id", order.user_id)
    .maybeSingle();
  if (!profile?.email || !order.events) return;
  const event = Array.isArray(order.events) ? order.events[0] : order.events;
  if (!event) return;
  const items = Array.isArray(order.event_order_items)
    ? order.event_order_items
    : [];
  await sendEventTicketConfirmationEmail({
    recipient: profile.email,
    eventTitle: event.title,
    eventSlug: event.slug,
    startsAt: event.starts_at,
    timezone: event.timezone,
    venue: eventLocationLabel(event),
    contactEmail: event.organizer_contact_email,
    refundPolicy: event.refund_policy,
    orderId: order.id,
    ticketLines: items.map(
      (item) => `${item.quantity} × ${item.ticket_name_snapshot}`,
    ),
    totalMinor: order.total_minor,
    currency: order.currency,
    paid: order.status === "paid",
  });
}

export async function sendRsvpConfirmation(rsvpId: string) {
  const service = createServiceRoleClient();
  const { data: rsvp } = await service
    .from("event_rsvps")
    .select(
      "id,attendee_email,events(title,slug,starts_at,timezone,venue_type,venue_name,city,region,organizer_contact_email,refund_policy)",
    )
    .eq("id", rsvpId)
    .maybeSingle();
  const event = rsvp
    ? Array.isArray(rsvp.events)
      ? rsvp.events[0]
      : rsvp.events
    : null;
  if (!rsvp?.attendee_email || !event) return;
  await sendEventTicketConfirmationEmail({
    recipient: rsvp.attendee_email,
    eventTitle: event.title,
    eventSlug: event.slug,
    startsAt: event.starts_at,
    timezone: event.timezone,
    venue: eventLocationLabel(event),
    contactEmail: event.organizer_contact_email,
    refundPolicy: event.refund_policy,
    orderId: `rsvp-${rsvp.id}`,
    ticketLines: ["1 × Confirmed RSVP"],
    totalMinor: 0,
    currency: "CAD",
    paid: false,
  });
}

export async function sendRefundNotices(
  orderId: string,
  kind: "refunded" | "void" = "refunded",
) {
  const service = createServiceRoleClient();
  const { data: order } = await service
    .from("event_orders")
    .select(
      "id,events(title,slug,starts_at,timezone,venue_type,venue_name,city,region,organizer_contact_email,refund_policy),event_tickets(id,attendee_email)",
    )
    .eq("id", orderId)
    .maybeSingle();
  const event = order
    ? Array.isArray(order.events)
      ? order.events[0]
      : order.events
    : null;
  if (!order || !event) return;
  const tickets = Array.isArray(order.event_tickets) ? order.event_tickets : [];
  await Promise.all(
    tickets.map((ticket) =>
      ticket.attendee_email
        ? sendEventStatusEmail({
            recipient: ticket.attendee_email,
            eventTitle: event.title,
            eventSlug: event.slug,
            startsAt: event.starts_at,
            timezone: event.timezone,
            venue: eventLocationLabel(event),
            contactEmail: event.organizer_contact_email,
            refundPolicy: event.refund_policy,
            kind,
            idempotencyKey: `event-${kind}-${orderId}-${ticket.id}`,
          }).catch(() => undefined)
        : Promise.resolve(),
    ),
  );
}
