import "server-only";

import { getAppUrl } from "@/lib/appUrl";

export function getEventCheckoutRedirectUrls({
    orderId,
    eventSlug,
    appUrl = getAppUrl(),
}: {
    orderId: string;
    eventSlug: string;
    appUrl?: string;
}) {
    const successUrl = new URL("/events/checkout/success", `${appUrl}/`);
    successUrl.searchParams.set("order", orderId);

    const cancelUrl = new URL(
        `/events/${encodeURIComponent(eventSlug)}?checkout=cancelled`,
        `${appUrl}/`
    );

    return {
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
    };
}
