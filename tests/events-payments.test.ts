import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("events payment lifecycle", () => {
  const checkout = read("app/api/events/[eventId]/register/route.ts");
  const webhook = read("app/api/events/stripe/webhook/route.ts");
  const success = read("app/events/checkout/success/page.tsx");

  it("calculates Checkout line items from reserved database snapshots", () => {
    expect(checkout).toContain('"reserve_event_order"');
    expect(checkout).toContain(
      "event_order_items(ticket_name_snapshot,unit_price_minor",
    );
    expect(checkout).toContain(
      "unit_price_minor + item.unit_fee_minor + item.unit_tax_minor",
    );
    expect(checkout).toContain(
      "idempotencyKey: `vaivia-event-order-${orderRow.id}`",
    );
    expect(checkout).toContain("expires_at:");
    expect(checkout).not.toContain("destination:");
    expect(checkout).not.toContain("transfer_data");
  });

  it("verifies the raw Stripe webhook and handles replay-safe lifecycle events", () => {
    expect(webhook).toContain("await request.text()");
    expect(webhook).toContain("constructEvent(");
    expect(webhook).toContain("rawBody");
    expect(webhook).toContain("signature");
    expect(webhook).toContain('insertError?.code === "23505"');
    for (const event of [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "charge.dispute.created",
    ])
      expect(webhook).toContain(event);
    expect(webhook).toContain('"finalize_event_order"');
    expect(webhook).toContain("finalizeError");
    expect(webhook).toContain('"release_event_order_hold"');
    expect(webhook).toContain("releaseError");
    expect(webhook).toContain('"refund_event_order"');
    expect(webhook).toContain("refundError");
  });

  it("never issues tickets from the success redirect", () => {
    expect(success).toContain('from("event_orders")');
    expect(success).toContain('select("status")');
    expect(success).not.toContain("finalize_event_order");
    expect(success).not.toContain("event_tickets");
  });
});
