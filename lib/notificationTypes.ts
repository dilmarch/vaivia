export const NOTIFICATION_CHANNELS = ["in_app", "push", "email"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationPreference = {
    notificationType: string;
    inAppEnabled: boolean;
    pushEnabled: boolean;
    emailEnabled: boolean;
};

export const NOTIFICATION_TYPE_OPTIONS = [
    {
        type: "trip_invite_received",
        label: "Trip invitations",
        description: "When someone invites you to a trip.",
    },
    {
        type: "trip_invite_accepted",
        label: "Trip members joined",
        description: "When someone joins a trip after accepting an invite.",
    },
    {
        type: "trip_invite_declined",
        label: "Trip invite declined",
        description: "When someone declines your trip invite.",
    },
    {
        type: "trip_updated",
        label: "Trip updates",
        description: "When shared trip details change.",
    },
    {
        type: "trip_item_added",
        label: "Trip items added",
        description: "New itinerary, food, stay, or transportation items.",
    },
    {
        type: "trip_item_updated",
        label: "Trip items updated",
        description: "Changes to existing trip items.",
    },
    {
        type: "trip_item_deleted",
        label: "Trip items deleted",
        description: "When a shared trip item is removed.",
    },
    {
        type: "accommodation_cancellation_reminder",
        label: "Free cancellation reminders",
        description:
            "48 hours before free cancellation ends for a stay booking.",
    },
    {
        type: "trip_slug_changed",
        label: "Trip URL changes",
        description: "When VAIVIA changes a trip URL slug.",
    },
    {
        type: "friend_request_received",
        label: "Friend requests",
        description: "When someone adds you as a friend.",
    },
    {
        type: "friend_request_accepted",
        label: "Friend request accepted",
        description: "When someone accepts your friend request.",
    },
    {
        type: "passport_stamp_share_received",
        label: "Passport stamps shared with you",
        description: "When a friend sends you a passport stamp.",
    },
    {
        type: "passport_stamp_share_accepted",
        label: "Passport stamp accepted",
        description: "When a shared passport stamp is accepted.",
    },
    {
        type: "passport_stamp_share_declined",
        label: "Passport stamp declined",
        description: "When a shared passport stamp is declined.",
    },
    {
        type: "passport_stamp_added",
        label: "Passport stamps added",
        description: "When VAIVIA adds a stamp to your passport.",
    },
    {
        type: "feature_suggestion_implemented",
        label: "Feature requests implemented",
        description: "When something you suggested becomes available.",
    },
    {
        type: "terms_updated",
        label: "Terms updates",
        description: "When VAIVIA makes a minor Terms and Conditions update.",
    },
    {
        type: "terms_acceptance_required",
        label: "Terms acceptance required",
        description: "When a major Terms update requires your acceptance.",
    },
    {
        type: "profile_onboarding_prompt",
        label: "Profile reminders",
        description: "Tips to complete your travel profile and passport area.",
    },
    {
        type: "theme_exploration_prompt",
        label: "Theme reminders",
        description: "Tips to explore VAIVIA's visual themes.",
    },
    {
        type: "travel_email_ready",
        label: "Travel imports ready",
        description: "When a forwarded confirmation is ready to review.",
    },
    {
        type: "travel_email_needs_review",
        label: "Travel imports needing review",
        description: "When a forwarded booking needs a quick check.",
    },
    {
        type: "travel_email_failed",
        label: "Travel import issues",
        description: "When a forwarded confirmation could not be processed.",
    },
] as const;

const REQUIRED_NOTIFICATION_TYPE_VALUES = ["terms_updated"] as const;
const DEFAULT_EMAIL_NOTIFICATION_TYPE_VALUES = [
    "trip_invite_received",
    "friend_request_received",
    "trip_slug_changed",
    "passport_stamp_share_received",
    "travel_email_failed",
] as const;

const REQUIRED_NOTIFICATION_TYPE_SET = new Set<string>(
    REQUIRED_NOTIFICATION_TYPE_VALUES
);
const DEFAULT_EMAIL_NOTIFICATION_TYPE_SET = new Set<string>(
    DEFAULT_EMAIL_NOTIFICATION_TYPE_VALUES
);

export const CONFIGURABLE_NOTIFICATION_TYPE_OPTIONS =
    NOTIFICATION_TYPE_OPTIONS.filter(
        (option) => !REQUIRED_NOTIFICATION_TYPE_SET.has(option.type)
    );

export const NOTIFICATION_TYPES = NOTIFICATION_TYPE_OPTIONS.map(
    (option) => option.type
);

export function isRequiredNotificationType(notificationType: string) {
    return REQUIRED_NOTIFICATION_TYPE_SET.has(notificationType);
}

export function isKnownNotificationType(value: unknown): value is string {
    return (
        typeof value === "string" &&
        NOTIFICATION_TYPES.includes(
            value as (typeof NOTIFICATION_TYPES)[number]
        )
    );
}

export function getDefaultNotificationPreference(
    notificationType: string
): NotificationPreference {
    return {
        notificationType,
        inAppEnabled: true,
        pushEnabled: true,
        emailEnabled:
            DEFAULT_EMAIL_NOTIFICATION_TYPE_SET.has(notificationType),
    };
}

export function mergeNotificationPreferences(
    rows: Array<{
        notification_type?: string | null;
        in_app_enabled?: boolean | null;
        push_enabled?: boolean | null;
        email_enabled?: boolean | null;
    }>
) {
    const rowsByType = new Map(
        rows
            .filter((row) => isKnownNotificationType(row.notification_type))
            .map((row) => [row.notification_type as string, row])
    );

    return NOTIFICATION_TYPES.map((notificationType) => {
        const row = rowsByType.get(notificationType);
        const fallback = getDefaultNotificationPreference(notificationType);

        return {
            notificationType,
            inAppEnabled:
                typeof row?.in_app_enabled === "boolean"
                    ? row.in_app_enabled
                    : fallback.inAppEnabled,
            pushEnabled:
                typeof row?.push_enabled === "boolean"
                    ? row.push_enabled
                    : fallback.pushEnabled,
            emailEnabled:
                typeof row?.email_enabled === "boolean"
                    ? row.email_enabled
                    : fallback.emailEnabled,
        };
    });
}
