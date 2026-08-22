import "server-only";

import { getAppUrl } from "@/lib/appUrl";

export function getEventCheckoutRedirectUrls({
    orderId,
    eventSlug,
    appUrl = getAppUrl(),
    mobile = false,
}: {
    orderId: string;
    eventSlug: string;
    appUrl?: string;
    mobile?: boolean;
}) {
    const successUrl = new URL(mobile ? "/events/checkout/mobile" : "/events/checkout/success", `${appUrl}/`);
    successUrl.searchParams.set("order", orderId);
    if (mobile) successUrl.searchParams.set("result", "success");

    const cancelUrl = mobile
      ? new URL(`/events/checkout/mobile?order=${encodeURIComponent(orderId)}&result=cancelled`, `${appUrl}/`)
      : new URL(`/events/${encodeURIComponent(eventSlug)}?checkout=cancelled`, `${appUrl}/`);

    return {
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
    };
}
