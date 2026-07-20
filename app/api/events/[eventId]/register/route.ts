import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getEventStripeClient,
  getEventStripeConfig,
} from "@/lib/events/stripe";
import {
  sendOrderConfirmation,
  sendRsvpConfirmation,
} from "@/lib/events/order-confirmation";

export const runtime = "nodejs";
export const maxDuration = 30;

type RegisterBody = {
  mode?: "rsvp" | "tickets";
  attendeeName?: string;
  idempotencyKey?: string;
  selections?: Array<{ ticketTypeId: string; quantity: number }>;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
        loginUrl: `/auth/login?next=${encodeURIComponent(request.nextUrl.pathname)}`,
      },
      { status: 401 },
    );
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.mode === "rsvp") {
    const { data, error } = await supabase.rpc("register_event_rsvp", {
      target_event_id: eventId,
      attendee_name_input:
        String(body.attendeeName || "")
          .trim()
          .slice(0, 160) || null,
    });
    if (error)
      return NextResponse.json(
        {
          error: error.message.includes("capacity")
            ? "This event is at capacity."
            : "Could not confirm your RSVP.",
        },
        { status: 409 },
      );
    const rsvpId =
      data && typeof data === "object" && "id" in data ? String(data.id) : "";
    if (rsvpId) await sendRsvpConfirmation(rsvpId).catch(() => undefined);
    return NextResponse.json({ ok: true, mode: "rsvp", rsvp: data });
  }

  const selections = Array.isArray(body.selections)
    ? body.selections
        .slice(0, 20)
        .map((selection) => ({
          ticket_type_id: selection.ticketTypeId,
          quantity: Number(selection.quantity),
        }))
    : [];
  if (!body.idempotencyKey || !selections.length)
    return NextResponse.json(
      { error: "Choose at least one ticket." },
      { status: 400 },
    );

  const { data: reserved, error: reserveError } = await supabase.rpc(
    "reserve_event_order",
    {
      selections,
      request_idempotency_key: body.idempotencyKey,
    },
  );
  if (reserveError || !reserved || typeof reserved !== "object") {
    const message = reserveError?.message || "Could not reserve tickets.";
    return NextResponse.json(
      {
        error: message.includes("inventory")
          ? "Those tickets are no longer available."
          : message,
      },
      { status: 409 },
    );
  }

  const order = reserved as {
    order_id: string;
    status: string;
    requires_payment: boolean;
    hold_expires_at?: string | null;
  };
  if (!order.requires_payment) {
    await sendOrderConfirmation(order.order_id).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      mode: "free",
      orderId: order.order_id,
      redirectUrl: "/my-events",
    });
  }

  if (!getEventStripeConfig().configured) {
    await createServiceRoleClient().rpc("release_event_order_hold", {
      target_order_id: order.order_id,
      release_status: "failed",
    });
    return NextResponse.json(
      { error: "Paid event checkout is temporarily unavailable." },
      { status: 503 },
    );
  }

  const service = createServiceRoleClient();
  const { data: orderRow } = await service
    .from("event_orders")
    .select(
      "id,event_id,user_id,currency,total_minor,hold_expires_at,events(title,slug),event_order_items(ticket_name_snapshot,unit_price_minor,unit_fee_minor,unit_tax_minor,currency,quantity)",
    )
    .eq("id", order.order_id)
    .eq("user_id", user.id)
    .single();
  if (!orderRow)
    return NextResponse.json(
      { error: "Reserved order could not be loaded." },
      { status: 500 },
    );
  const event = Array.isArray(orderRow.events)
    ? orderRow.events[0]
    : orderRow.events;
  const items = Array.isArray(orderRow.event_order_items)
    ? orderRow.event_order_items
    : [];
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  ).replace(/\/$/, "");

  try {
    const stripe = getEventStripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: user.email,
        client_reference_id: orderRow.id,
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: item.currency.toLowerCase(),
            unit_amount:
              item.unit_price_minor + item.unit_fee_minor + item.unit_tax_minor,
            product_data: {
              name: item.ticket_name_snapshot,
              description: event?.title || "VAIVIA Event",
            },
          },
        })),
        metadata: {
          vaivia_event_order_id: orderRow.id,
          vaivia_user_id: user.id,
        },
        payment_intent_data: {
          metadata: {
            vaivia_event_order_id: orderRow.id,
            vaivia_user_id: user.id,
          },
        },
        success_url: `${appUrl}/events/checkout/success?order=${encodeURIComponent(orderRow.id)}`,
        cancel_url: `${appUrl}/events/${encodeURIComponent(event?.slug || "")}?checkout=cancelled`,
        expires_at: Math.floor(
          new Date(
            orderRow.hold_expires_at || Date.now() + 30 * 60 * 1000,
          ).getTime() / 1000,
        ),
      },
      { idempotencyKey: `vaivia-event-order-${orderRow.id}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    const { error: updateError } = await service
      .from("event_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", orderRow.id)
      .eq("status", "pending");
    if (updateError) throw updateError;
    return NextResponse.json({
      ok: true,
      mode: "paid",
      orderId: orderRow.id,
      checkoutUrl: session.url,
    });
  } catch {
    await service.rpc("release_event_order_hold", {
      target_order_id: orderRow.id,
      release_status: "failed",
    });
    return NextResponse.json(
      { error: "Checkout could not be started. No payment was taken." },
      { status: 502 },
    );
  }
}
