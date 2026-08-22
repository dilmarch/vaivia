import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database } from "@/src/types/supabase";
import { getPublicEventByIdentifier, listPublicEvents } from "@/lib/events/data";
import { formatEventMoney } from "@/lib/events/format";
import { getEventStripeClient, getEventStripeConfig } from "@/lib/events/stripe";
import { getEventCheckoutRedirectUrls } from "@/lib/events/urls";
import { sendOrderConfirmation, sendRsvpConfirmation } from "@/lib/events/order-confirmation";
import { createTicketQrDataUrl, getOwnedTicketWithSecret } from "@/lib/events/tickets";
import { getAppleWalletStatus } from "@/lib/events/wallet";

type EventClient = SupabaseClient<Database>;

function attendeeEvent(event: Awaited<ReturnType<typeof listPublicEvents>>["events"][number]) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    short_summary: event.short_summary,
    description: event.description ?? null,
    category: event.category,
    tags: event.tags,
    cover_image_storage_path: event.cover_image_storage_path,
    cover_image_alt: event.cover_image_alt,
    coverImageUrl: event.coverImageUrl || null,
    status: event.status,
    visibility: event.visibility,
    registration_mode: event.registration_mode,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    venue_type: event.venue_type,
    venue_name: event.venue_name,
    city: event.city,
    region: event.region,
    country: event.country,
    organizer_display_name: event.organizer_display_name ?? null,
    accessibility_info: event.accessibility_info ?? null,
    attendee_notes: event.attendee_notes ?? null,
    age_restriction: event.age_restriction ?? null,
    refund_policy: event.refund_policy ?? null,
    overall_capacity: event.overall_capacity ?? null,
  };
}

export class EventAttendeeError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
    this.name = "EventAttendeeError";
  }
}

export type EventRegistrationInput = {
  mode?: "rsvp" | "tickets";
  attendeeName?: string;
  idempotencyKey?: string;
  selections?: Array<{ ticketTypeId: string; quantity: number }>;
  mobile?: boolean;
};

export async function listAttendeeEvents(filters: Parameters<typeof listPublicEvents>[0]) {
  const result = await listPublicEvents(filters);
  const ids = result.events.map((event) => event.id);
  const service = createServiceRoleClient();
  const { data: tiers } = ids.length
    ? await service.from("event_ticket_types").select("event_id,price_minor,currency").in("event_id", ids).eq("state", "active").order("price_minor")
    : { data: [] };
  const prices = new Map<string, { amount: number; currency: string }>();
  for (const tier of tiers || []) if (!prices.has(tier.event_id)) prices.set(tier.event_id, { amount: tier.price_minor, currency: tier.currency });
  return {
    ...result,
    events: result.events.map((event) => {
      const price = prices.get(event.id);
      return {
        ...attendeeEvent(event),
        priceLabel: event.registration_mode === "rsvp" ? "RSVP" : !price || price.amount === 0 ? "Free" : `From ${formatEventMoney(price.amount, price.currency)}`,
      };
    }),
  };
}

export async function loadAttendeeEvent(supabase: EventClient, userId: string, identifier: string) {
  const result = await getPublicEventByIdentifier(identifier);
  if (!result) throw new EventAttendeeError("Event was not found.", "not_found", 404);
  const saved = await supabase.from("saved_events").select("id").eq("event_id", result.event.id).eq("user_id", userId).maybeSingle();
  if (saved.error) throw saved.error;
  return {
    event: attendeeEvent(result.event),
    ticketTypes: result.ticketTypes,
    saved: Boolean(saved.data),
  };
}

export async function setEventSaved(supabase: EventClient, userId: string, eventId: string, saved: boolean) {
  if (saved) {
    const result = await supabase.from("saved_events").upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id", ignoreDuplicates: true });
    if (result.error) throw new EventAttendeeError("This event could not be saved.", "operation_failed", 400);
  } else {
    const result = await supabase.from("saved_events").delete().eq("event_id", eventId).eq("user_id", userId);
    if (result.error) throw new EventAttendeeError("This event could not be removed from saved events.", "operation_failed", 400);
  }
  return { eventId, saved };
}

export async function cancelAttendeeRsvp(supabase: EventClient, eventId: string) {
  const result = await supabase.rpc("cancel_event_rsvp", { target_event_id: eventId });
  if (result.error || !result.data) throw new EventAttendeeError("That RSVP could not be cancelled.", "operation_failed", 409);
  return { eventId, cancelled: true as const };
}

export async function registerAttendeeForEvent({ supabase, user, eventId, input }: { supabase: EventClient; user: User; eventId: string; input: EventRegistrationInput }) {
  if (input.mode === "rsvp") {
    const { data, error } = await supabase.rpc("register_event_rsvp", {
      target_event_id: eventId,
      attendee_name_input:
        String(input.attendeeName || "").trim().slice(0, 160) || undefined,
    });
    if (error) throw new EventAttendeeError(error.message.includes("capacity") ? "This event is at capacity." : "Could not confirm your RSVP.", "capacity_or_conflict", 409);
    const rsvpId = data && typeof data === "object" && "id" in data ? String(data.id) : "";
    if (rsvpId) await sendRsvpConfirmation(rsvpId).catch(() => undefined);
    return { mode: "rsvp" as const, rsvp: data };
  }
  const selections = Array.isArray(input.selections) ? input.selections.slice(0, 20).map((selection) => ({ ticket_type_id: selection.ticketTypeId, quantity: Number(selection.quantity) })).filter((selection) => selection.ticket_type_id && Number.isInteger(selection.quantity) && selection.quantity > 0) : [];
  if (!input.idempotencyKey || !selections.length) throw new EventAttendeeError("Choose at least one ticket.", "validation_error", 422);
  const { data: reserved, error: reserveError } = await supabase.rpc("reserve_event_order", { selections, request_idempotency_key: input.idempotencyKey });
  if (reserveError || !reserved || typeof reserved !== "object") {
    const message = reserveError?.message || "Could not reserve tickets.";
    throw new EventAttendeeError(message.includes("inventory") ? "Those tickets are no longer available." : message, "capacity_or_conflict", 409);
  }
  const order = reserved as { order_id: string; requires_payment: boolean };
  if (!order.requires_payment) {
    await sendOrderConfirmation(order.order_id).catch(() => undefined);
    return { mode: "free" as const, orderId: order.order_id };
  }
  const service = createServiceRoleClient();
  if (!getEventStripeConfig().configured) {
    await service.rpc("release_event_order_hold", { target_order_id: order.order_id, release_status: "failed" });
    throw new EventAttendeeError("Paid event checkout is temporarily unavailable.", "checkout_unavailable", 503);
  }
  const { data: orderRow } = await service.from("event_orders").select("id,event_id,user_id,currency,total_minor,hold_expires_at,events(title,slug),event_order_items(ticket_name_snapshot,unit_price_minor,unit_fee_minor,unit_tax_minor,currency,quantity)").eq("id", order.order_id).eq("user_id", user.id).single();
  if (!orderRow) throw new EventAttendeeError("Reserved order could not be loaded.", "operation_failed", 500);
  const event = Array.isArray(orderRow.events) ? orderRow.events[0] : orderRow.events;
  const items = Array.isArray(orderRow.event_order_items) ? orderRow.event_order_items : [];
  const urls = getEventCheckoutRedirectUrls({ orderId: orderRow.id, eventSlug: event?.slug || "", mobile: Boolean(input.mobile) });
  try {
    const session = await getEventStripeClient().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      client_reference_id: orderRow.id,
      line_items: items.map((item) => ({ quantity: item.quantity, price_data: { currency: item.currency.toLowerCase(), unit_amount: item.unit_price_minor + item.unit_fee_minor + item.unit_tax_minor, product_data: { name: item.ticket_name_snapshot, description: event?.title || "VAIVIA Event" } } })),
      metadata: { vaivia_event_order_id: orderRow.id, vaivia_user_id: user.id },
      payment_intent_data: { metadata: { vaivia_event_order_id: orderRow.id, vaivia_user_id: user.id } },
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      expires_at: Math.floor(new Date(orderRow.hold_expires_at || Date.now() + 30 * 60 * 1000).getTime() / 1000),
    }, { idempotencyKey: `vaivia-event-order-${orderRow.id}` });
    if (!session.url) throw new Error("missing_checkout_url");
    const updated = await service.from("event_orders").update({ stripe_checkout_session_id: session.id }).eq("id", orderRow.id).eq("user_id", user.id).eq("status", "pending");
    if (updated.error) throw updated.error;
    return { mode: "paid" as const, orderId: orderRow.id, checkoutUrl: session.url };
  } catch {
    await service.rpc("release_event_order_hold", { target_order_id: orderRow.id, release_status: "failed" });
    throw new EventAttendeeError("Checkout could not be started. No payment was taken.", "checkout_failed", 502);
  }
}

export async function loadMyEvents(supabase: EventClient, userId: string) {
  const [tickets, rsvps, saves] = await Promise.all([
    supabase.from("event_tickets").select("id,ticket_number,status,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region)").eq("owner_user_id", userId).order("issued_at", { ascending: false }),
    supabase.from("event_rsvps").select("id,status,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region)").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("saved_events").select("id,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region,status,visibility)").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (tickets.error || rsvps.error || saves.error) throw tickets.error || rsvps.error || saves.error;
  return { tickets: tickets.data || [], rsvps: rsvps.data || [], saved: saves.data || [] };
}

export async function loadAttendeeTicket(ticketId: string, userId: string) {
  const result = await getOwnedTicketWithSecret(ticketId, userId);
  if (!result) throw new EventAttendeeError("Ticket was not found.", "not_found", 404);
  const event = Array.isArray(result.ticket.events) ? result.ticket.events[0] : result.ticket.events;
  if (!event) throw new EventAttendeeError("Event was not found.", "not_found", 404);
  const service = createServiceRoleClient();
  const { data: privateDetails } = await service.from("event_private_details").select("online_url").eq("event_id", event.id).maybeSingle();
  const usable = ["active", "checked_in"].includes(result.ticket.status) && Boolean(result.redemptionSecret);
  const tier = Array.isArray(result.ticket.event_ticket_types)
    ? result.ticket.event_ticket_types[0]
    : result.ticket.event_ticket_types;
  return {
    ticket: {
      id: result.ticket.id,
      ticket_number: result.ticket.ticket_number,
      attendee_name: result.ticket.attendee_name,
      status: result.ticket.status,
      events: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        timezone: event.timezone,
        venue_type: event.venue_type,
        venue_name: event.venue_name,
        city: event.city,
        region: event.region,
      },
      event_ticket_types: tier
        ? {
            name: tier.name,
            attendee_instructions: tier.attendee_instructions,
          }
        : null,
    },
    privateDetails: usable ? privateDetails : null,
    qrDataUrl:
      usable && result.redemptionSecret
        ? await createTicketQrDataUrl(result.redemptionSecret)
        : null,
    appleWalletAvailable: usable && getAppleWalletStatus().configured,
  };
}

export async function loadCheckoutStatus(supabase: EventClient, userId: string, orderId: string) {
  const result = await supabase.from("event_orders").select("id,status,event_id,event_tickets(id)").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new EventAttendeeError("Checkout was not found.", "not_found", 404);
  return { orderId, status: result.data.status, ready: ["paid", "free"].includes(result.data.status), ticketIds: (result.data.event_tickets || []).map((ticket) => ticket.id) };
}
