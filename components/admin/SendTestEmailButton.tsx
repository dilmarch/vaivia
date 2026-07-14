"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";

type TestEmailResponse = {
    ok?: boolean;
    notificationId?: string;
    message?: string;
    error?: string;
};

export default function SendTestEmailButton() {
    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<TestEmailResponse | null>(null);

    async function sendTestEmail() {
        setIsSending(true);
        setResult(null);

        try {
            const response = await fetch("/api/notifications/email/test", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = (await response.json()) as TestEmailResponse;

            setResult({
                ...data,
                ok: response.ok && data.ok !== false,
            });
        } catch (error) {
            setResult({
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not send test email request.",
            });
        } finally {
            setIsSending(false);
        }
    }

    return (
        <div className="flex max-w-sm flex-col items-start gap-2">
            <button
                type="button"
                onClick={sendTestEmail}
                disabled={isSending}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-55"
            >
                <MailCheck className="h-4 w-4" aria-hidden="true" />
                {isSending ? "Sending test..." : "Send test email"}
            </button>
            {result ? (
                <p
                    className={`text-xs font-semibold leading-5 ${
                        result.ok ? "text-lime-100" : "text-red-200"
                    }`}
                >
                    {result.ok
                        ? result.message || "Test notification created."
                        : result.error || "Could not create test notification."}
                    {result.notificationId ? (
                        <span className="block text-slate-400">
                            Notification: {result.notificationId}
                        </span>
                    ) : null}
                </p>
            ) : null}
        </div>
    );
}
