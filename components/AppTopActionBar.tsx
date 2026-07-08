"use client";

import Link from "next/link";
import { Bell, Briefcase, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import TripInviteReviewModal from "@/components/TripInviteReviewModal";
import { createClient } from "@/lib/supabase/client";

type TopNavTrip = {
    id: string;
    title: string | null;
};

type AppTopActionBarProps = {
    trips: TopNavTrip[];
    notifications?: AppNotification[];
};

export type AppNotification = {
    id: string;
    type: string | null;
    title: string | null;
    body: string | null;
    read_at: string | null;
    created_at: string | null;
    trip_id: string | null;
    invitation_id: string | null;
    metadata?: Record<string, unknown> | null;
    actor_user_id: string | null;
};

function tripLabel(trip: TopNavTrip) {
    return trip.title?.trim() || "Untitled trip";
}

export default function AppTopActionBar({
    trips,
    notifications = [],
}: AppTopActionBarProps) {
    const [openMenu, setOpenMenu] = useState<"trips" | "notifications" | null>(
        null
    );
    const [visibleNotifications, setVisibleNotifications] =
        useState<AppNotification[]>(notifications);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const [activeInviteNotification, setActiveInviteNotification] =
        useState<AppNotification | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const unreadCount = visibleNotifications.filter(
        (notification) => !notification.read_at
    ).length;

    useEffect(() => {
        setVisibleNotifications(notifications);
    }, [notifications]);

    useEffect(() => {
        if (!openMenu) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node)
            ) {
                setOpenMenu(null);
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpenMenu(null);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [openMenu]);

    async function refreshNotifications() {
        setIsLoadingNotifications(true);

        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setVisibleNotifications([]);
            setIsLoadingNotifications(false);
            return;
        }

        const { data, error } = await supabase
            .from("notifications")
            .select(
                "id,type,title,body,read_at,created_at,trip_id,invitation_id,metadata,actor_user_id"
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) {
            console.warn("Could not refresh notifications:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
        } else {
            setVisibleNotifications((data || []) as AppNotification[]);
        }

        setIsLoadingNotifications(false);
    }

    function toggleMenu(menu: "trips" | "notifications") {
        setOpenMenu((current) => {
            const nextMenu = current === menu ? null : menu;

            if (nextMenu === "notifications") {
                void refreshNotifications();
            }

            return nextMenu;
        });
    }

    async function markNotificationRead(notification: AppNotification) {
        if (notification.read_at) return;

        const supabase = createClient();
        await supabase.rpc("mark_app_alert_read", {
            alert_id: notification.id,
        });
    }

    async function handleNotificationClick(notification: AppNotification) {
        if (notification.type === "trip_invite_received") {
            setActiveInviteNotification(notification);
            return;
        }

        await markNotificationRead(notification);
        setVisibleNotifications((current) =>
            current.map((currentNotification) =>
                currentNotification.id === notification.id
                    ? {
                          ...currentNotification,
                          read_at:
                              currentNotification.read_at ||
                              new Date().toISOString(),
                      }
                    : currentNotification
            )
        );
    }

    return (
        <>
            <div className="pointer-events-none fixed left-0 right-0 top-0 z-[45] px-4 pt-4 md:left-24 md:px-8 md:pt-6">
                <div
                    ref={wrapperRef}
                    className="pointer-events-auto ml-auto flex w-fit items-start gap-3"
                >
                <div
                    className="relative"
                    onMouseLeave={() => {
                        if (openMenu === "trips") {
                            setOpenMenu(null);
                        }
                    }}
                >
                    <button
                        type="button"
                        onClick={() => toggleMenu("trips")}
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
                        aria-label="Open trips menu"
                        aria-haspopup="menu"
                        aria-expanded={openMenu === "trips"}
                    >
                        <Briefcase className="h-5 w-5" aria-hidden="true" />
                        Trips
                    </button>

                    {openMenu === "trips" ? (
                        <div className="absolute -right-4 top-12 flex w-[22rem] flex-col items-end gap-2 p-4">
                            <div className="w-72 rounded-[24px] border border-lime-300/20 bg-[#0c0115]/90 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                                <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-lime-200">
                                    Upcoming trips
                                </p>
                                <div className="max-h-64 overflow-y-auto">
                                    {trips.length > 0 ? (
                                        trips.map((trip, index) => (
                                            <Link
                                                key={trip.id}
                                                href={`/trips/${trip.id}`}
                                                className="animate-vaivia-add-fan-out mb-2 block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                                                style={{
                                                    animationDelay: `${index * 34}ms`,
                                                }}
                                            >
                                                {tripLabel(trip)}
                                            </Link>
                                        ))
                                    ) : (
                                        <p className="px-3 py-2 text-sm text-slate-400">
                                            No upcoming trips yet.
                                        </p>
                                    )}
                                </div>
                                <Link
                                    href="/trips"
                                    className="mt-2 block rounded-full border border-lime-300/20 bg-lime-300/10 px-5 py-2.5 text-right text-sm font-bold text-lime-100 transition hover:bg-lime-300/20"
                                >
                                    See all trips
                                </Link>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => toggleMenu("notifications")}
                        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                        aria-label="Open notifications"
                        aria-haspopup="menu"
                        aria-expanded={openMenu === "notifications"}
                    >
                        <Bell className="h-5 w-5" aria-hidden="true" />
                        {unreadCount > 0 ? (
                            <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-300 px-1 text-[10px] font-black text-slate-950 shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.9)]">
                                {unreadCount}
                            </span>
                        ) : null}
                    </button>

                    {openMenu === "notifications" ? (
                        <div className="absolute right-0 top-14 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/85 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                            <div className="px-3 py-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-lime-200">
                                    Notifications
                                </p>
                            </div>
                            {isLoadingNotifications ? (
                                <p className="px-3 py-6 text-center text-sm text-slate-400">
                                    Loading notifications...
                                </p>
                            ) : visibleNotifications.length > 0 ? (
                                visibleNotifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        onClick={() =>
                                            handleNotificationClick(notification)
                                        }
                                        className={`block w-full rounded-2xl px-3 py-2 text-left transition hover:bg-white/10 ${
                                            notification.read_at
                                                ? "bg-transparent"
                                                : "bg-lime-300/10"
                                        }`}
                                    >
                                        <span className="flex items-start gap-2 text-sm font-semibold text-white">
                                            {!notification.read_at ? (
                                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime-300" />
                                            ) : null}
                                            <span className="block">
                                                {notification.title || "Notification"}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-400">
                                            {notification.body}
                                        </span>
                                        {notification.type ===
                                        "trip_invite_received" ? (
                                            <span className="mt-2 inline-flex rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-slate-950">
                                                Review
                                            </span>
                                        ) : null}
                                    </button>
                                ))
                            ) : (
                                <p className="px-3 py-6 text-center text-sm text-slate-400">
                                    No notifications yet.
                                </p>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="group/search relative flex h-12 w-12 items-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition-all duration-300 hover:w-64 focus-within:w-64 hover:border-lime-300/30 hover:bg-white/10">
                    <Search
                        className="pointer-events-none absolute left-3.5 h-5 w-5"
                        aria-hidden="true"
                    />
                    <input
                        aria-label="Search VAIVIA"
                        placeholder="Search VAIVIA..."
                        className="h-full w-full rounded-full bg-transparent pl-11 pr-4 text-sm font-medium text-white opacity-0 outline-none placeholder:text-slate-400 transition-opacity duration-200 group-hover/search:opacity-100 group-focus-within/search:opacity-100"
                        type="search"
                    />
                </div>
                </div>
            </div>
            <TripInviteReviewModal
                notification={activeInviteNotification}
                open={Boolean(activeInviteNotification)}
                onOpenChange={(open) => {
                    if (!open) setActiveInviteNotification(null);
                }}
                onHandled={() => {
                    setActiveInviteNotification(null);
                    void refreshNotifications();
                }}
            />
        </>
    );
}
