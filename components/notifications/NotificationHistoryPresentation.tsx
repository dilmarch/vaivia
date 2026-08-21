import type { ReactNode } from "react";
import { Archive, Bell, CheckCircle2, RotateCcw } from "lucide-react";
import WeatherAlertNotificationDetails from "@/components/weather/WeatherAlertNotificationDetails";

export type NotificationHistoryItem = {
    id: string;
    type: string | null;
    title: string | null;
    body: string | null;
    read_at: string | null;
    created_at: string | null;
    trip_id: string | null;
    invitation_id: string | null;
    archived_at: string | null;
    actor_user_id?: string | null;
    metadata?: Record<string, unknown> | null;
};

type ActionRenderProps = {
    className: string;
    children: ReactNode;
    "aria-label"?: string;
};

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

export function NotificationHistoryActionsPresentation({
    notification,
    actionRequired,
    renderReviewAction,
    renderReadAction,
    renderArchiveAction,
    renderRestoreAction,
}: {
    notification: NotificationHistoryItem;
    actionRequired: boolean;
    renderReviewAction?: (props: ActionRenderProps) => ReactNode;
    renderReadAction?: (props: ActionRenderProps) => ReactNode;
    renderArchiveAction?: (props: ActionRenderProps) => ReactNode;
    renderRestoreAction?: (props: ActionRenderProps) => ReactNode;
}) {
    return (
        <div className="flex shrink-0 flex-wrap gap-2">
            {actionRequired && renderReviewAction
                ? renderReviewAction({
                      className:
                          "inline-flex h-9 items-center rounded-full bg-lime-300 px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-lime-200",
                      "aria-label":
                          notification.type === "weather_alert"
                              ? "Review plans"
                              : "Review",
                      children:
                          notification.type === "weather_alert"
                              ? "Review plans"
                              : "Review",
                  })
                : null}
            {!notification.read_at && renderReadAction
                ? renderReadAction({
                      className:
                          "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]",
                      "aria-label": "Mark notification read",
                      children: (
                          <>
                              <CheckCircle2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                              />
                              Read
                          </>
                      ),
                  })
                : null}
            {notification.archived_at && renderRestoreAction
                ? renderRestoreAction({
                      className:
                          "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]",
                      "aria-label": "Restore notification",
                      children: (
                          <>
                              <RotateCcw
                                  className="h-4 w-4"
                                  aria-hidden="true"
                              />
                              Restore
                          </>
                      ),
                  })
                : !notification.archived_at && renderArchiveAction
                  ? renderArchiveAction({
                        className:
                            "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-xs font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]",
                        "aria-label":
                            notification.type === "weather_alert"
                                ? "Dismiss notification"
                                : "Archive notification",
                        children: (
                            <>
                                <Archive
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                                {notification.type === "weather_alert"
                                    ? "Dismiss"
                                    : "Archive"}
                            </>
                        ),
                    })
                  : null}
        </div>
    );
}

export function NotificationHistoryPresentation({
    notifications,
    activeActionNotificationIds = [],
    isLoading = false,
    error = "",
    renderBackAction,
    renderActions,
    renderRetryAction,
    safeAreaHandledExternally = false,
}: {
    notifications: NotificationHistoryItem[];
    activeActionNotificationIds?: readonly string[];
    isLoading?: boolean;
    error?: string;
    renderBackAction: (props: ActionRenderProps) => ReactNode;
    renderActions: (args: {
        notification: NotificationHistoryItem;
        actionRequired: boolean;
    }) => ReactNode;
    renderRetryAction?: (props: ActionRenderProps) => ReactNode;
    safeAreaHandledExternally?: boolean;
}) {
    const activeActionIds = new Set(activeActionNotificationIds);

    return (
        <main
            className={`min-h-screen bg-[#0c0115] px-4 pb-8 text-white md:py-8 md:pl-28 ${
                safeAreaHandledExternally
                    ? "pt-32"
                    : "pt-[calc(8rem+var(--safe-area-top))]"
            }`}
        >
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
                        {renderBackAction({
                            className:
                                "rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]",
                            "aria-label": "Back home",
                            children: "Back home",
                        })}
                    </div>
                </div>

                {isLoading ? (
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/20">
                        <p className="text-lg font-black">Loading notifications...</p>
                        <p className="mt-2 text-sm font-semibold text-slate-400">
                            Fetching your VAIVIA notification history.
                        </p>
                    </div>
                ) : error ? (
                    <div
                        className="rounded-[2rem] border border-red-300/20 bg-red-300/[0.08] p-8 text-center shadow-2xl shadow-black/20"
                        role="alert"
                    >
                        <p className="text-lg font-black">
                            Notifications are unavailable.
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-300">
                            {error}
                        </p>
                        {renderRetryAction
                            ? renderRetryAction({
                                  className:
                                      "mt-4 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200",
                                  "aria-label": "Retry notifications",
                                  children: "Try again",
                              })
                            : null}
                    </div>
                ) : notifications.length > 0 ? (
                    <div className="space-y-3">
                        {notifications.map((notification) => {
                            const actionRequired = activeActionIds.has(
                                notification.id
                            );
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
                                                {notification.type ===
                                                "weather_alert" ? (
                                                    <WeatherAlertNotificationDetails
                                                        metadata={
                                                            notification.metadata
                                                        }
                                                    />
                                                ) : null}
                                                <p className="mt-2 text-xs font-bold text-slate-500">
                                                    {formatNotificationDate(
                                                        notification.created_at
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {renderActions({
                                            notification,
                                            actionRequired,
                                        })}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/20">
                        <p className="text-lg font-black">
                            No notifications yet.
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-400">
                            Trip updates and collaboration invites will appear here.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
