import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/src/types/supabase";

type NotificationClient = SupabaseClient<Database>;

export class NotificationActionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "NotificationActionError";
  }
}

type NotificationAction = "read" | "archive" | "restore";
type ReviewAction = "accept" | "decline" | "open";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(metadata: Json | null, key: string) {
  const value = record(metadata)[key];
  return typeof value === "string" ? value : "";
}

async function ownedNotification(
  supabase: NotificationClient,
  userId: string,
  notificationId: string,
) {
  if (!notificationId) {
    throw new NotificationActionError(
      "Notification is required.",
      "validation_error",
      422,
    );
  }
  const result = await supabase
    .from("notifications")
    .select(
      "id,type,trip_id,invitation_id,metadata,read_at,archived_at,actor_user_id",
    )
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new NotificationActionError(
      "Notification was not found.",
      "not_found",
      404,
    );
  }
  return result.data;
}

export async function updateNotificationState({
  supabase,
  userId,
  notificationId,
  action,
}: {
  supabase: NotificationClient;
  userId: string;
  notificationId: string;
  action: NotificationAction;
}) {
  await ownedNotification(supabase, userId, notificationId);
  const now = new Date().toISOString();
  const patch =
    action === "archive"
      ? { archived_at: now, read_at: now }
      : action === "restore"
        ? { archived_at: null }
        : { read_at: now };
  const result = await supabase
    .from("notifications")
    .update(patch)
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select(
      "id,type,title,body,read_at,created_at,trip_id,invitation_id,metadata,actor_user_id,archived_at",
    )
    .single();
  if (result.error) throw result.error;
  return { notification: result.data };
}

function notificationDestination(notification: {
  type: string;
  trip_id: string | null;
  actor_user_id?: string | null;
  metadata: Json | null;
}) {
  const importId = metadataString(notification.metadata, "importId");
  const deepLink = metadataString(notification.metadata, "deepLink");
  if (notification.type === "weather_alert" && notification.trip_id) {
    return {
      name: "trip" as const,
      tripId: notification.trip_id,
      view: "overview" as const,
    };
  }
  if (notification.type.startsWith("travel_email_") && importId) {
    return { name: "travel-import" as const, importId };
  }
  if (notification.type === "profile_onboarding_prompt") {
    return { name: "profile" as const, section: "passport" };
  }
  if (notification.type === "theme_exploration_prompt") {
    return { name: "settings" as const };
  }
  if (notification.actor_user_id && notification.type.startsWith("friend_")) {
    return {
      name: "friend-profile" as const,
      userId: notification.actor_user_id,
    };
  }
  if (notification.trip_id || deepLink.startsWith("/trips/")) {
    return notification.trip_id
      ? {
          name: "trip" as const,
          tripId: notification.trip_id,
          view: "overview" as const,
        }
      : null;
  }
  return null;
}

export async function reviewNotification({
  supabase,
  userId,
  notificationId,
  action,
  stampPatch,
}: {
  supabase: NotificationClient;
  userId: string;
  notificationId: string;
  action: ReviewAction;
  stampPatch?: Record<string, unknown>;
}) {
  const notification = await ownedNotification(
    supabase,
    userId,
    notificationId,
  );
  if (action === "open") {
    await supabase.rpc("mark_app_alert_read", { alert_id: notificationId });
    return {
      handled: true,
      destination: notificationDestination(notification),
    };
  }

  if (notification.type === "trip_invite_received") {
    if (!notification.invitation_id) {
      throw new NotificationActionError(
        "Trip invitation was not found.",
        "not_found",
        404,
      );
    }
    const invitation = await supabase
      .from("trip_invitations")
      .select("id,status,invited_start_date,invited_end_date")
      .eq("id", notification.invitation_id)
      .maybeSingle();
    if (invitation.error) throw invitation.error;
    if (!invitation.data || invitation.data.status !== "pending") {
      throw new NotificationActionError(
        "This invitation has already been handled.",
        "conflict",
        409,
      );
    }
    const response =
      action === "accept"
        ? await supabase.rpc("accept_trip_invitation_with_scope", {
            target_invitation_id: invitation.data.id,
            target_confirmed_start_date:
              invitation.data.invited_start_date || undefined,
            target_confirmed_end_date:
              invitation.data.invited_end_date || undefined,
            target_personal_start_date:
              invitation.data.invited_start_date || undefined,
            target_personal_end_date:
              invitation.data.invited_end_date || undefined,
            target_joining_leg_ids: undefined,
          })
        : await supabase.rpc("decline_trip_invitation", {
            invitation_id: invitation.data.id,
          });
    if (response.error) throw response.error;
  } else if (notification.type === "friend_request_received") {
    const friendshipId = metadataString(notification.metadata, "friendshipId");
    const friendship = await supabase
      .from("user_friendships")
      .select("id,status,addressee_user_id")
      .eq("id", friendshipId)
      .eq("addressee_user_id", userId)
      .maybeSingle();
    if (friendship.error) throw friendship.error;
    if (!friendship.data || friendship.data.status !== "pending") {
      throw new NotificationActionError(
        "This friend request has already been handled.",
        "conflict",
        409,
      );
    }
    const response = await supabase.rpc("respond_to_friend_invitation", {
      friendship_id: friendship.data.id,
      next_status: action === "accept" ? "accepted" : "declined",
    });
    if (response.error) throw response.error;
  } else if (notification.type === "passport_stamp_share_received") {
    const shareId = metadataString(notification.metadata, "shareId");
    const share = await supabase
      .from("user_passport_stamp_shares")
      .select("id,status,recipient_user_id")
      .eq("id", shareId)
      .eq("recipient_user_id", userId)
      .maybeSingle();
    if (share.error) throw share.error;
    if (!share.data || share.data.status !== "pending") {
      throw new NotificationActionError(
        "This passport stamp has already been handled.",
        "conflict",
        409,
      );
    }
    const response = await supabase.rpc("respond_to_passport_stamp_share", {
      share_id: share.data.id,
      next_status: action === "accept" ? "accepted" : "declined",
      stamp_patch: record(stampPatch) as Json,
    });
    if (response.error) throw response.error;
  } else {
    throw new NotificationActionError(
      "This notification does not support that action.",
      "unsupported_action",
      422,
    );
  }

  const read = await supabase.rpc("mark_app_alert_read", {
    alert_id: notificationId,
  });
  if (read.error) throw read.error;
  return {
    handled: true,
    destination:
      action === "accept" ? notificationDestination(notification) : null,
  };
}
