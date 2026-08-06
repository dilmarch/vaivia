import "server-only";

export type NotificationDeliveryChannel = "in_app" | "email" | "web_push";

export type NotificationDeliveryResult = {
    id: string;
    status?: string;
    reason?: string;
    error?: string;
    providerMessageId?: string | null;
    sentCount?: number;
};

export interface NotificationChannelAdapter<Result> {
    channel: NotificationDeliveryChannel;
    delivery: "canonical" | "queued";
    process(limit: number): Promise<Result[]>;
}

/** In-app delivery is the canonical notification row, not a duplicate outbox. */
export const inAppNotificationChannel = {
    channel: "in_app",
    delivery: "canonical",
} as const satisfies Pick<
    NotificationChannelAdapter<never>,
    "channel" | "delivery"
>;

export type SettledNotificationChannel<Result> = {
    channel: NotificationDeliveryChannel;
    results: Result[];
    error: unknown | null;
};

export function isNotificationChannelEnabled(
    preference: {
        master_enabled?: boolean | null;
        email_enabled?: boolean | null;
        push_enabled?: boolean | null;
    } | null,
    channel: "email" | "web_push"
) {
    if (!preference?.master_enabled) return false;
    return channel === "email"
        ? preference.email_enabled === true
        : preference.push_enabled === true;
}

/** Runs independent channels without allowing one provider failure to block another. */
export async function dispatchNotificationChannels<Result>(
    adapters: NotificationChannelAdapter<Result>[],
    limit: number
): Promise<SettledNotificationChannel<Result>[]> {
    const settled = await Promise.allSettled(
        adapters.map((adapter) => adapter.process(limit))
    );
    return settled.map((result, index) => ({
        channel: adapters[index].channel,
        results: result.status === "fulfilled" ? result.value : [],
        error: result.status === "rejected" ? result.reason : null,
    }));
}
