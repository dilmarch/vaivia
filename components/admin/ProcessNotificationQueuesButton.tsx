"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type QueueCounts = {
    claimed: number;
    sent: number;
    cancelled: number;
    retried: number;
    failed: number;
};

type QueueProcessResponse = {
    ok?: boolean;
    processed?: number;
    counts?: QueueCounts;
    error?: string;
    errors?: Array<{
        channel: string;
        error: string;
    }>;
};

const emptyCounts: QueueCounts = {
    claimed: 0,
    sent: 0,
    cancelled: 0,
    retried: 0,
    failed: 0,
};

export default function ProcessNotificationQueuesButton() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<QueueProcessResponse | null>(null);

    async function processQueues() {
        setIsProcessing(true);
        setResult(null);

        try {
            const response = await fetch("/api/admin/notification-queues/process", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = (await response.json()) as QueueProcessResponse;

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
                        : "Could not process notification queues.",
            });
        } finally {
            setIsProcessing(false);
        }
    }

    const counts = result?.counts || emptyCounts;

    return (
        <div className="flex max-w-md flex-col items-start gap-2">
            <button
                type="button"
                onClick={processQueues}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-55"
            >
                <RefreshCw
                    className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                />
                {isProcessing
                    ? "Processing queues..."
                    : "Process notification queues now"}
            </button>
            {result ? (
                <div
                    className={`rounded-2xl border px-4 py-3 text-xs font-semibold leading-5 ${
                        result.ok
                            ? "border-lime-300/20 bg-lime-300/10 text-lime-100"
                            : "border-red-300/20 bg-red-400/10 text-red-100"
                    }`}
                >
                    {result.ok ? (
                        <p>
                            Processed {result.processed || 0} queue item
                            {(result.processed || 0) === 1 ? "" : "s"}.
                        </p>
                    ) : (
                        <p>{result.error || "Could not process queues."}</p>
                    )}
                    <p className="mt-1 text-slate-300">
                        Claimed {counts.claimed} · Sent {counts.sent} · Cancelled{" "}
                        {counts.cancelled} · Retried {counts.retried} · Failed{" "}
                        {counts.failed}
                    </p>
                    {result.errors?.length ? (
                        <div className="mt-2 space-y-1 text-red-100/85">
                            {result.errors.map((error) => (
                                <p key={`${error.channel}-${error.error}`}>
                                    {error.channel}: {error.error}
                                </p>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
