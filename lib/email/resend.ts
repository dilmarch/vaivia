import "server-only";

import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }

    return resendClient;
}

export function getEmailSenderConfig() {
    const from =
        process.env.RESEND_FROM_EMAIL ||
        "VAIVIA <notifications@updates.thetravellinglinguist.com>";
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL || undefined;
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://app.thetravellinglinguist.com";

    return {
        from,
        replyTo,
        appUrl: appUrl.replace(/\/+$/, ""),
    };
}
