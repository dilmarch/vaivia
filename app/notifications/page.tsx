import { Archive, Bell, CheckCircle2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import NotificationActionButton from "@/components/NotificationActionButton";
import {
    DROPDOWN_NOTIFICATION_SELECT,
    filterInAppNotifications,
    isActionRequiredNotification,
    resolveActiveDropdownNotifications,
    type DropdownNotification,
} from "@/lib/notifications/dropdown";
import { mergeNotificationPreferences } from "@/lib/notificationTypes";
import { createClient } from "@/lib/supabase/server";

function normalizeNotification(row: DropdownNotification): DropdownNotification {
    return {
        ...row,
        metadata:
            row.metadata &&
            typeof row.metadata === "object" &&
            !Array.isArray(row.metadata)
                ? row.metadata
                : null,
    };
}

function formatNotificationDate(value?: string | null) {
    if (!value) return "";

    return new Date(value).toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

async function markNotificationRead(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const notificationId = String(formData.get("notification_id") || "");
    const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error marking notification read:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            notificationId,
        });
        throw new Error("Could not update notification");
    }

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
    const { error } = await supabase
        .from("notifications")
        .update({
            archived_at: new Date().toISOString(),
            read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error archiving notification:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            notificationId,
        });
        throw new Error("Could not archive notification");
    }

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
    const { error } = await supabase
        .from("notifications")
        .update({ archived_at: null })
        .eq("id", notificationId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error restoring notification:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            notificationId,
        });
        throw new Error("Could not restore notification");
    }

    revalidatePath("/notifications");
}

export default async function NotificationsPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data, error },
        { data: notificationPreferenceRows },
    ] = await Promise.all([
        supabase
            .from("notifications")
            .select(DROPDOWN_NOTIFICATION_SELECT)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        (supabase.from as any)("user_notification_preferences")
            .select(
                "notification_type,in_app_enabled,push_enabled,email_enabled"
            )
            .eq("user_id", user.id),
    ]);

    if (error) {
        console.error("Error loading notifications page:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        throw new Error("Could not load notifications");
    }

    const preferencesByType = new Map<string, { inAppEnabled: boolean }>(
        mergeNotificationPreferences(
            (notificationPreferenceRows || []) as Array<{
                notification_type?: string | null;
                in_app_enabled?: boolean | null;
                push_enabled?: boolean | null;
                email_enabled?: boolean | null;
            }>
        ).map((preference) => [preference.notificationType, preference])
    );
    const notifications = filterInAppNotifications(
        ((data || []) as DropdownNotification[]).map(normalizeNotification),
        (notificationPreferenceRows || []) as Array<{
            notification_type?: string | null;
            in_app_enabled?: boolean | null;
            push_enabled?: boolean | null;
            email_enabled?: boolean | null;
        }>
    ).filter(
        (notification) =>
            !notification.type ||
            (preferencesByType.get(notification.type)?.inAppEnabled ?? true)
    );
    const activeActionNotifications = await resolveActiveDropdownNotifications(
        supabase,
        notifications.filter((notification) =>
            isActionRequiredNotification(notification)
        )
    );
    const activeActionNotificationIds = new Set(
        activeActionNotifications.map((notification) => notification.id)
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-8 pt-[calc(8rem+var(--safe-area-top))] text-white md:py-8 md:pl-28">
            <div className="mx-auto max-w-5xl space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        Notifications
                    </p>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-4xl font-black tracking-tight">
                                Notification history
                            </h1>
                            <p className="mt-2 text-sm font-semibold text-slate-400">
                                Includes unread, read, action-required, and archived
                                notifications.
                            </p>
                        </div>
                        <Link
                            href="/"
                            className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                        >
                            Back home
                        </Link>
                    </div>
                </div>

                {notifications.length > 0 ? (
                    <div className="space-y-3">
                        {notifications.map((notification) => {
                            const actionRequired =
                                activeActionNotificationIds.has(notification.id);
                            return (
                                <article
                                    key={notification.id}
                                    className={`rounded-[1.5rem] border p-4 shadow-xl shadow-black/20 ${
                                        notification.archived_at
                                            ? "border-white/5 bg-white/[0.035] opacity-70"
                                            : actionRequired
                                              ? "border-lime-300/35 bg-lime-300/10"
                                              : notification.read_at
                                                ? "border-white/10 bg-white/[0.06]"
                                                : "border-lime-300/25 bg-white/[0.08]"
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="flex min-w-0 gap-3">
                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 text-lime-200 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.12)]">
                                                <Bell
                                                    className="h-5 w-5"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="text-lg font-black text-white">
                                                        {notification.title ||
                                                            "Notification"}
                                                    </h2>
                                                    {actionRequired ? (
                                                        <span className="rounded-full bg-lime-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950">
                                                            Action required
                                                        </span>
                                                    ) : null}
                                                    {notification.archived_at ? (
                                                        <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                                                            Archived
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {notification.body ? (
                                                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">
                                                        {notification.body}
                                                    </p>
                                                ) : null}
                                                <p className="mt-2 text-xs font-bold text-slate-500">
                                                    {formatNotificationDate(
                                                        notification.created_at
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 flex-wrap gap-2">
                                            {actionRequired ? (
                                                <NotificationActionButton
                                                    notification={notification}
                                                />
                                            ) : null}
                                            {!notification.read_at ? (
                                                <form action={markNotificationRead}>
                                                    <input
                                                        type="hidden"
                                                        name="notification_id"
                                                        value={notification.id}
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                                    >
                                                        <CheckCircle2
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Read
                                                    </button>
                                                </form>
                                            ) : null}
                                            {notification.archived_at ? (
                                                <form action={restoreNotification}>
                                                    <input
                                                        type="hidden"
                                                        name="notification_id"
                                                        value={notification.id}
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                                    >
                                                        <RotateCcw
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Restore
                                                    </button>
                                                </form>
                                            ) : (
                                                <form action={archiveNotification}>
                                                    <input
                                                        type="hidden"
                                                        name="notification_id"
                                                        value={notification.id}
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                                    >
                                                        <Archive
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Archive
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/20">
                        <p className="text-lg font-black">No notifications yet.</p>
                        <p className="mt-2 text-sm font-semibold text-slate-400">
                            Trip updates and collaboration invites will appear here.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
