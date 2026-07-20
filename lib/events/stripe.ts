import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getEventStripeConfig() {
  return {
    configured: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  };
}

export function getEventStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Event payments are temporarily unavailable.");
  stripeClient ||= new Stripe(secret, { typescript: true });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Event payment webhooks are not configured.");
  return secret;
}
