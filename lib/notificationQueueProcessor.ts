import "server-only";

import { processNotificationEmailOutbox } from "@/lib/emailNotifications";
import { processExternalInviteEmailOutbox } from "@/lib/externalInviteEmails";
import { processNotificationPushOutbox } from "@/lib/pushNotifications";

type QueueResult = {
    id: string;
    status?: string;
    reason?: string;
    error?: string;
    sentCount?: number;
};

type QueueChannel = "push" | "email";

type QueueError = {
    channel: QueueChannel;
    error: string;
};

type QueueCounts = {
    claimed: number;
    sent: number;
    cancelled: number;
    retried: number;
    failed: number;
};

export type NotificationQueueProcessResult = {
    ok: boolean;
    processed: number;
    counts: QueueCounts;
    push: {
        processed: number;
        counts: QueueCounts;
        results: QueueResult[];
    };
    email: {
        processed: number;
        counts: QueueCounts;
        results: QueueResult[];
    };
    externalEmail: {
        processed: number;
        counts: QueueCounts;
        results: QueueResult[];
    };
    errors: QueueError[];
};

function getEmptyCounts(): QueueCounts {
    return {
        claimed: 0,
        sent: 0,
        cancelled: 0,
        retried: 0,
        failed: 0,
    };
}

function summarizeQueueResults(results: QueueResult[]): QueueCounts {
    return results.reduce<QueueCounts>((counts, result) => {
        counts.claimed += 1;

        if (result.status === "sent") {
            counts.sent += 1;
        } else if (result.status === "cancelled" || result.status === "skipped") {
            counts.cancelled += 1;
        } else if (result.status === "queued" || result.status === "pending") {
            counts.retried += 1;
        } else if (result.status === "failed") {
            counts.failed += 1;
        }

        return counts;
    }, getEmptyCounts());
}

function combineCounts(first: QueueCounts, second: QueueCounts): QueueCounts {
    return {
        claimed: first.claimed + second.claimed,
        sent: first.sent + second.sent,
        cancelled: first.cancelled + second.cancelled,
        retried: first.retried + second.retried,
        failed: first.failed + second.failed,
    };
}

function getQueueError(channel: QueueChannel, reason: unknown): QueueError {
    return {
        channel,
        error:
            reason instanceof Error
                ? reason.message
                : `Could not process ${channel} notifications.`,
    };
}

export async function processNotificationQueues(limit = 25) {
    const [pushResult, emailResult, externalEmailResult] = await Promise.allSettled([
        processNotificationPushOutbox(limit),
        processNotificationEmailOutbox(limit),
        processExternalInviteEmailOutbox(limit),
    ]);
    const pushResults =
        pushResult.status === "fulfilled" ? (pushResult.value as QueueResult[]) : [];
    const emailResults =
        emailResult.status === "fulfilled"
            ? (emailResult.value as QueueResult[])
            : [];
    const externalEmailResults =
        externalEmailResult.status === "fulfilled"
            ? (externalEmailResult.value as QueueResult[])
            : [];
    const pushCounts = summarizeQueueResults(pushResults);
    const emailCounts = summarizeQueueResults(emailResults);
    const externalEmailCounts = summarizeQueueResults(externalEmailResults);
    const combinedEmailCounts = combineCounts(emailCounts, externalEmailCounts);
    const errors = [
        pushResult.status === "rejected"
            ? getQueueError("push", pushResult.reason)
            : null,
        emailResult.status === "rejected"
            ? getQueueError("email", emailResult.reason)
            : null,
        externalEmailResult.status === "rejected"
            ? getQueueError("email", externalEmailResult.reason)
            : null,
    ].filter((error): error is QueueError => Boolean(error));

    return {
        ok: errors.length === 0,
        processed: pushResults.length + emailResults.length + externalEmailResults.length,
        counts: combineCounts(pushCounts, combinedEmailCounts),
        push: {
            processed: pushResults.length,
            counts: pushCounts,
            results: pushResults,
        },
        email: {
            processed: emailResults.length + externalEmailResults.length,
            counts: combinedEmailCounts,
            results: [...emailResults, ...externalEmailResults],
        },
        externalEmail: {
            processed: externalEmailResults.length,
            counts: externalEmailCounts,
            results: externalEmailResults,
        },
        errors,
    } satisfies NotificationQueueProcessResult;
}
