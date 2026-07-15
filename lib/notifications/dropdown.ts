import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeNotificationPreferences } from "@/lib/notificationTypes";
import type { Database, Json } from "@/src/types/supabase";

export const DROPDOWN_NOTIFICATION_SELECT =
    "id,type,title,body,read_at,created_at,trip_id,invitation_id,metadata,actor_user_id,archived_at";

const ACTION_REQUIRED_NOTIFICATION_TYPES = new Set([
    "trip_invite_received",
    "friend_request_received",
    "passport_stamp_share_received",
    "profile_onboarding_prompt",
    "theme_exploration_prompt",
]);

const ACTION_REQUIRED_UNTIL_READ_TYPES = new Set([
    "profile_onboarding_prompt",
    "theme_exploration_prompt",
]);

type NotificationRow = Pick<
    Database["public"]["Tables"]["notifications"]["Row"],
    | "id"
    | "type"
    | "title"
    | "body"
    | "read_at"
    | "created_at"
    | "trip_id"
    | "invitation_id"
    | "metadata"
    | "actor_user_id"
    | "archived_at"
>;

export type DropdownNotification = Omit<NotificationRow, "metadata"> & {
    metadata?: Record<string, unknown> | null;
};

type NotificationPreferenceRow = {
    notification_type?: string | null;
    in_app_enabled?: boolean | null;
    push_enabled?: boolean | null;
    email_enabled?: boolean | null;
};

type DropdownSupabaseClient = Pick<SupabaseClient<Database>, "from">;

function isRecord(value: Json | undefined) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isActionRequiredNotification(
    notification: Pick<DropdownNotification, "type">
) {
    return Boolean(
        notification.type &&
            ACTION_REQUIRED_NOTIFICATION_TYPES.has(notification.type)
    );
}

export function isBaseActiveDropdownNotification(
    notification: Pick<
        DropdownNotification,
        "archived_at" | "read_at" | "type"
    >
) {
    if (notification.archived_at) return false;
    if (
        notification.type &&
        ACTION_REQUIRED_UNTIL_READ_TYPES.has(notification.type)
    ) {
        return !notification.read_at;
    }

    if (isActionRequiredNotification(notification)) return true;

    return !notification.read_at;
}

function normalizeNotification(row: NotificationRow): DropdownNotification {
    return {
        ...row,
        metadata: isRecord(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : null,
    };
}

export function filterInAppNotifications(
    notifications: DropdownNotification[],
    preferenceRows: NotificationPreferenceRow[]
) {
    const preferencesByType = new Map<string, { inAppEnabled: boolean }>(
        mergeNotificationPreferences(preferenceRows).map((preference) => [
            preference.notificationType,
            preference,
        ])
    );

    return notifications.filter((notification) => {
        if (!notification.type) return true;
        return preferencesByType.get(notification.type)?.inAppEnabled ?? true;
    });
}

function getMetadataString(notification: DropdownNotification, key: string) {
    const value = notification.metadata?.[key];
    return typeof value === "string" ? value : "";
}

export async function resolveActiveDropdownNotifications(
    supabase: DropdownSupabaseClient,
    notifications: DropdownNotification[]
) {
    const baseNotifications = notifications.filter(
        isBaseActiveDropdownNotification
    );
    const tripInviteIds = baseNotifications
        .filter((notification) => notification.type === "trip_invite_received")
        .map((notification) => notification.invitation_id)
        .filter((id): id is string => Boolean(id));
    const friendshipIds = baseNotifications
        .filter((notification) => notification.type === "friend_request_received")
        .map((notification) => getMetadataString(notification, "friendshipId"))
        .filter((id): id is string => Boolean(id));
    const passportShareIds = baseNotifications
        .filter(
            (notification) =>
                notification.type === "passport_stamp_share_received"
        )
        .map((notification) => getMetadataString(notification, "shareId"))
        .filter((id): id is string => Boolean(id));

    const [tripInvitesResult, friendshipsResult, passportSharesResult] =
        await Promise.all([
            tripInviteIds.length > 0
                ? supabase
                      .from("trip_invitations")
                      .select("id,status")
                      .in("id", tripInviteIds)
                : Promise.resolve({ data: [], error: null }),
            friendshipIds.length > 0
                ? supabase
                      .from("user_friendships")
                      .select("id,status")
                      .in("id", friendshipIds)
                : Promise.resolve({ data: [], error: null }),
            passportShareIds.length > 0
                ? supabase
                      .from("user_passport_stamp_shares")
                      .select("id,status")
                      .in("id", passportShareIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

    const pendingTripInviteIds = new Set(
        (tripInvitesResult.data || [])
            .filter((row) => row.status === "pending")
            .map((row) => row.id)
    );
    const pendingFriendshipIds = new Set(
        (friendshipsResult.data || [])
            .filter((row) => row.status === "pending")
            .map((row) => row.id)
    );
    const pendingPassportShareIds = new Set(
        (passportSharesResult.data || [])
            .filter((row) => row.status === "pending")
            .map((row) => row.id)
    );

    return baseNotifications.filter((notification) => {
        if (notification.type === "trip_invite_received") {
            return Boolean(
                notification.invitation_id &&
                    pendingTripInviteIds.has(notification.invitation_id)
            );
        }

        if (notification.type === "friend_request_received") {
            const friendshipId = getMetadataString(notification, "friendshipId");
            return Boolean(friendshipId && pendingFriendshipIds.has(friendshipId));
        }

        if (notification.type === "passport_stamp_share_received") {
            const shareId = getMetadataString(notification, "shareId");
            return Boolean(shareId && pendingPassportShareIds.has(shareId));
        }

        return true;
    });
}

export async function loadActiveDropdownNotifications(
    supabase: DropdownSupabaseClient,
    userId: string
) {
    const [notificationsResult, preferencesResult] = await Promise.all([
        supabase
            .from("notifications")
            .select(DROPDOWN_NOTIFICATION_SELECT)
            .eq("user_id", userId)
            .is("archived_at", null)
            .or(
                "read_at.is.null,type.in.(trip_invite_received,friend_request_received,passport_stamp_share_received,profile_onboarding_prompt,theme_exploration_prompt)"
            )
            .order("created_at", { ascending: false }),
        supabase
            .from("user_notification_preferences")
            .select("notification_type,in_app_enabled,push_enabled,email_enabled")
            .eq("user_id", userId),
    ]);

    if (notificationsResult.error) {
        return {
            data: null,
            error: notificationsResult.error,
        };
    }

    const inAppNotifications = filterInAppNotifications(
        ((notificationsResult.data || []) as NotificationRow[]).map(
            normalizeNotification
        ),
        (preferencesResult.data || []) as NotificationPreferenceRow[]
    );
    const data = await resolveActiveDropdownNotifications(
        supabase,
        inAppNotifications
    );

    return { data, error: null };
}
