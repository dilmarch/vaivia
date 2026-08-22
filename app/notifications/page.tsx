import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import NotificationActionButton from "@/components/NotificationActionButton";
import {
    NotificationHistoryActionsPresentation,
    NotificationHistoryPresentation,
} from "@/components/notifications/NotificationHistoryPresentation";
import { loadNotificationHistory } from "@/lib/notifications/dropdown";
import { createClient } from "@/lib/supabase/server";
import { updateNotificationState } from "@/lib/notifications/actions";

async function markNotificationRead(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const notificationId = String(formData.get("notification_id") || "");
    await updateNotificationState({
        supabase,
        userId: user.id,
        notificationId,
        action: "read",
    });

    revalidatePath("/notifications");
}

async function archiveNotification(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const notificationId = String(formData.get("notification_id") || "");
    await updateNotificationState({
        supabase,
        userId: user.id,
        notificationId,
        action: "archive",
    });

    revalidatePath("/notifications");
}

async function restoreNotification(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const notificationId = String(formData.get("notification_id") || "");
    await updateNotificationState({
        supabase,
        userId: user.id,
        notificationId,
        action: "restore",
    });

    revalidatePath("/notifications");
}

function notificationForm(
    action: (formData: FormData) => Promise<void>,
    notificationId: string,
    props: { className: string; children: ReactNode; "aria-label"?: string }
) {
    return (
        <form action={action}>
            <input type="hidden" name="notification_id" value={notificationId} />
            <button type="submit" {...props} />
        </form>
    );
}

export default async function NotificationsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const result = await loadNotificationHistory(supabase, user.id);
    if (result.error) {
        console.error("Error loading notifications page:", {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
            hint: result.error.hint,
        });
        throw new Error("Could not load notifications");
    }

    return (
        <NotificationHistoryPresentation
            notifications={result.data || []}
            activeActionNotificationIds={result.activeActionNotificationIds}
            renderBackAction={(props) => <Link href="/" {...props} />}
            renderActions={({ notification, actionRequired }) => (
                <NotificationHistoryActionsPresentation
                    notification={notification}
                    actionRequired={actionRequired}
                    renderReviewAction={
                        actionRequired
                            ? () => (
                                  <NotificationActionButton
                                          notification={{
                                              ...notification,
                                              type: notification.type ?? "",
                                              title: notification.title ?? "",
                                              actor_user_id:
                                                  notification.actor_user_id ??
                                                  null,
                                          }}
                                  />
                              )
                            : undefined
                    }
                    renderReadAction={
                        notification.read_at
                            ? undefined
                            : (props) =>
                                  notificationForm(
                                      markNotificationRead,
                                      notification.id,
                                      props
                                  )
                    }
                    renderArchiveAction={
                        notification.archived_at
                            ? undefined
                            : (props) =>
                                  notificationForm(
                                      archiveNotification,
                                      notification.id,
                                      props
                                  )
                    }
                    renderRestoreAction={
                        notification.archived_at
                            ? (props) =>
                                  notificationForm(
                                      restoreNotification,
                                      notification.id,
                                      props
                                  )
                            : undefined
                    }
                />
            )}
        />
    );
}
