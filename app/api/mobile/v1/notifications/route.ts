import type { MobileNotification } from "@/lib/mobileApi/contracts";
import {
  authenticateMobileRequest,
  mobileJson,
  mobileOptions,
} from "@/lib/mobileApi/server";
import {
  loadActiveDropdownNotifications,
  loadNotificationHistory,
} from "@/lib/notifications/dropdown";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const context = await authenticateMobileRequest(request);
  if (context instanceof Response) return context;

  if (new URL(request.url).searchParams.get("view") === "history") {
    const history = await loadNotificationHistory(
      context.supabase,
      context.user.id,
    );

    if (history.error) {
      console.error("Mobile notification history request failed:", {
        userId: context.user.id,
        message: history.error.message,
        code: history.error.code,
      });
      return mobileJson(
        request,
        { error: "Could not load notification history" },
        { status: 500 },
      );
    }

    const notifications: MobileNotification[] = (history.data || []).map(
      (notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        read_at: notification.read_at,
        created_at: notification.created_at,
        trip_id: notification.trip_id,
        invitation_id: notification.invitation_id,
        archived_at: notification.archived_at,
        actor_user_id: notification.actor_user_id || null,
        metadata: notification.metadata || null,
      }),
    );

    return mobileJson(request, {
      notifications,
      activeActionNotificationIds: history.activeActionNotificationIds,
    });
  }

  const [result, profileResult, pendingImportsResult] = await Promise.all([
    loadActiveDropdownNotifications(context.supabase, context.user.id),
    context.supabase
      .from("user_profiles")
      .select("role,avatar_url")
      .eq("id", context.user.id)
      .maybeSingle(),
    context.supabase
      .from("travel_email_imports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.user.id)
      .in("status", ["needs_review", "ready"]),
  ]);

  if (result.error) {
    console.error("Mobile notifications request failed:", {
      userId: context.user.id,
      message: result.error.message,
      code: result.error.code,
    });
    return mobileJson(
      request,
      { error: "Could not load notifications" },
      { status: 500 },
    );
  }

  const notifications: MobileNotification[] = (result.data || []).map(
    (notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      read_at: notification.read_at,
      created_at: notification.created_at,
      trip_id: notification.trip_id,
      invitation_id: notification.invitation_id,
      archived_at: notification.archived_at,
      actor_user_id: notification.actor_user_id || null,
      metadata: notification.metadata || null,
    }),
  );

  if (profileResult.error) {
    console.warn("Mobile navigation profile request failed:", {
      userId: context.user.id,
      message: profileResult.error.message,
      code: profileResult.error.code,
    });
  }
  if (pendingImportsResult.error) {
    console.warn("Mobile pending imports request failed:", {
      userId: context.user.id,
      message: pendingImportsResult.error.message,
      code: pendingImportsResult.error.code,
    });
  }

  return mobileJson(request, {
    notifications,
    navigationProfile: profileResult.data || null,
    pendingImportCount: pendingImportsResult.count || 0,
  });
}
