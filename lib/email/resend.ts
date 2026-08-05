import "server-only";

import { Resend } from "resend";
import { getAppUrl } from "@/lib/appUrl";

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
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!from) {
        throw new Error("RESEND_FROM_EMAIL is not configured.");
    }
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL || undefined;
    const appUrl = getAppUrl();

    return {
        from,
        replyTo,
        appUrl: appUrl.replace(/\/+$/, ""),
    };
}
