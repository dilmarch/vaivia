import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getEventStripeClient,
  getStripeWebhookSecret,
} from "@/lib/events/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendOrderConfirmation } from "@/lib/events/order-confirmation";
import { sendRefundNotices } from "@/lib/events/order-confirmation";

export const runtime = "nodejs";
export const maxDuration = 30;

function objectId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id || null;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  let stripeEvent: Stripe.Event;
  try {
    const rawBody = await request.text();
    stripeEvent = getEventStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: inserted, error: insertError } = await service
    .from("event_webhook_events")
    .insert({
      provider: "stripe",
      provider_event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      processing_status: "processing",
    })
    .select("id")
    .maybeSingle();
  if (insertError?.code === "23505") {
    const { data: existing } = await service
      .from("event_webhook_events")
      .select("id,processing_status")
      .eq("provider", "stripe")
      .eq("provider_event_id", stripeEvent.id)
      .single();
    if (existing?.processing_status === "processed")
      return NextResponse.json({ received: true, replay: true });
    if (!existing)
      return NextResponse.json(
        { error: "Webhook state unavailable." },
        { status: 500 },
      );
    await service
      .from("event_webhook_events")
      .update({ processing_status: "processing", error_code: null })
      .eq("id", existing.id);
  } else if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Webhook could not be recorded." },
      { status: 500 },
    );
  }
  const webhookId =
    inserted?.id ||
    (
      await service
        .from("event_webhook_events")
        .select("id")
        .eq("provider_event_id", stripeEvent.id)
        .single()
    ).data?.id;
  if (!webhookId) {
    return NextResponse.json(
      { error: "Webhook state unavailable." },
      { status: 500 },
    );
  }

  try {
    let orderId: string | null = null;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(stripeEvent.type)
    ) {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      orderId =
        session.metadata?.vaivia_event_order_id ||
        session.client_reference_id ||
        null;
      if (!orderId || session.payment_status !== "paid")
        throw new Error("checkout_not_paid");
      const { error: finalizeError } = await service.rpc(
        "finalize_event_order",
        {
          target_order_id: orderId,
          provider_checkout_session_id: session.id,
          provider_payment_intent_id:
            objectId(session.payment_intent) || undefined,
          provider_charge_id: undefined,
        },
      );
      if (finalizeError) throw new Error("order_finalize_failed");
      await sendOrderConfirmation(orderId).catch(() => undefined);
    } else if (
      [
        "checkout.session.expired",
        "checkout.session.async_payment_failed",
      ].includes(stripeEvent.type)
    ) {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      orderId =
        session.metadata?.vaivia_event_order_id ||
        session.client_reference_id ||
        null;
      if (orderId) {
        const { error: releaseError } = await service.rpc(
          "release_event_order_hold",
          {
            target_order_id: orderId,
            release_status: stripeEvent.type.endsWith("expired")
              ? "expired"
              : "failed",
          },
        );
        if (releaseError) throw new Error("order_release_failed");
      }
    } else if (stripeEvent.type === "charge.refunded") {
      const charge = stripeEvent.data.object as Stripe.Charge;
      const paymentIntentId = objectId(charge.payment_intent);
      const { data: order } = paymentIntentId
        ? await service
            .from("event_orders")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle()
        : await service
            .from("event_orders")
            .select("id")
            .eq("stripe_charge_id", charge.id)
            .maybeSingle();
      orderId = order?.id || null;
      if (orderId && charge.refunded) {
        const { error: refundError } = await service.rpc("refund_event_order", {
          target_order_id: orderId,
        });
        if (refundError) throw new Error("order_refund_failed");
        await sendRefundNotices(orderId, "refunded");
      }
    } else if (stripeEvent.type === "charge.dispute.created") {
      const dispute = stripeEvent.data.object as Stripe.Dispute;
      const paymentIntentId = objectId(dispute.payment_intent);
      const { data: order } = paymentIntentId
        ? await service
            .from("event_orders")
            .select("id,event_id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle()
        : { data: null };
      orderId = order?.id || null;
      if (orderId) {
        const { error: disputeOrderError } = await service
          .from("event_orders")
          .update({ status: "disputed" })
          .eq("id", orderId);
        if (disputeOrderError) throw new Error("dispute_order_update_failed");
        const { error: disputeTicketError } = await service
          .from("event_tickets")
          .update({ status: "void", voided_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .in("status", ["active", "checked_in"]);
        if (disputeTicketError) throw new Error("dispute_ticket_update_failed");
        await sendRefundNotices(orderId, "void");
      }
    }
    const { error: processedError } = await service
      .from("event_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        order_id: orderId,
      })
      .eq("id", webhookId);
    if (processedError) throw new Error("webhook_status_update_failed");
    return NextResponse.json({ received: true });
  } catch (error) {
    await service
      .from("event_webhook_events")
      .update({
        processing_status: "failed",
        error_code:
          error instanceof Error
            ? error.message.slice(0, 120)
            : "processing_failed",
      })
      .eq("id", webhookId);
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
