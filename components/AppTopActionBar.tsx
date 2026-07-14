"use client";

import Link from "next/link";
import { Bell, Briefcase, Home, Search, Stamp } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FriendInviteReviewModal from "@/components/FriendInviteReviewModal";
import PassportStampShareReviewModal from "@/components/PassportStampShareReviewModal";
import TripInviteReviewModal from "@/components/TripInviteReviewModal";
import ViewAsRoleSwitcher from "@/components/admin/ViewAsRoleSwitcher";
import {
    getRolePreviewLabel,
    setStoredRolePreview,
    useRolePreview,
} from "@/components/admin/useRolePreview";
import {
    isActionRequiredNotification,
    loadActiveDropdownNotifications,
    type DropdownNotification,
} from "@/lib/notifications/dropdown";
import { createClient } from "@/lib/supabase/client";
import { getTripRouteSegment } from "@/lib/tripRoutes";

type TopNavTrip = {
    id: string;
    slug?: string | null;
    title: string | null;
};

type AppTopActionBarProps = {
    trips: TopNavTrip[];
    notifications?: AppNotification[];
    isSuperAdmin?: boolean;
};

export type AppNotification = DropdownNotification;

type RefreshNotificationsOptions = {
    markPassiveAsViewed?: boolean;
};

function tripLabel(trip: TopNavTrip) {
    return trip.title?.trim() || "Untitled trip";
}

function getTripSwitchHref({
    targetTrip,
    pathname,
    searchParams,
}: {
    targetTrip: TopNavTrip;
    pathname: string;
    searchParams: URLSearchParams;
}) {
    const baseHref = `/trips/${getTripRouteSegment(targetTrip)}`;
    const match = pathname.match(/^\/trips\/([^/]+)(.*)$/);

    if (!match || match[1] === "new") return baseHref;

    const suffix = match[2] || "";

    if (suffix.startsWith("/accommodations")) {
        return `${baseHref}/accommodations`;
    }

    if (suffix.startsWith("/food")) {
        return `${baseHref}/food`;
    }

    if (suffix.startsWith("/budget/expenses")) {
        return `${baseHref}/budget/expenses`;
    }

    if (suffix.startsWith("/budget")) {
        return `${baseHref}/budget`;
    }

    const tab = searchParams.get("tab");
    if (tab === "ideas" || tab === "journey" || tab === "journey-planning") {
        return `${baseHref}?tab=${tab}`;
    }

    return baseHref;
}

export default function AppTopActionBar({
    trips,
    notifications = [],
    isSuperAdmin = false,
}: AppTopActionBarProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const previewRole = useRolePreview(isSuperAdmin);
    const [openMenu, setOpenMenu] = useState<"trips" | "notifications" | null>(
        null
    );
    const [visibleNotifications, setVisibleNotifications] =
        useState<AppNotification[]>(notifications);
    const [hasSyncedNotifications, setHasSyncedNotifications] = useState(false);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const [activeInviteNotification, setActiveInviteNotification] =
        useState<AppNotification | null>(null);
    const [activeFriendNotification, setActiveFriendNotification] =
        useState<AppNotification | null>(null);
    const [activePassportStampNotification, setActivePassportStampNotification] =
        useState<AppNotification | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const dropdownNotificationCount = hasSyncedNotifications
        ? visibleNotifications.length
        : 0;

    function exitRolePreview() {
        setStoredRolePreview(null);
        window.location.reload();
    }

    useEffect(() => {
        if (hasSyncedNotifications) return;
        setVisibleNotifications(notifications);
    }, [hasSyncedNotifications, notifications]);

    useEffect(() => {
        void refreshNotifications();
    }, []);

    useEffect(() => {
        let isMounted = true;
        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
            null;
        const supabase = createClient();

        async function subscribeToNotifications() {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!isMounted || !user) return;

            channel = supabase
                .channel(`app-notifications-${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "notifications",
                        filter: `user_id=eq.${user.id}`,
                    },
                    () => {
                        void refreshNotifications();
                    }
                )
                .subscribe();
        }

        void subscribeToNotifications();

        return () => {
            isMounted = false;
            if (channel) {
                void supabase.removeChannel(channel);
            }
        };
    }, []);

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

    async function refreshNotifications({
        markPassiveAsViewed = false,
    }: RefreshNotificationsOptions = {}) {
        setIsLoadingNotifications(true);

        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setVisibleNotifications([]);
            setHasSyncedNotifications(true);
            setIsLoadingNotifications(false);
            return;
        }

        const { data, error } = await loadActiveDropdownNotifications(
            supabase,
            user.id
        );

        if (error) {
            console.warn("Could not refresh notifications:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            setVisibleNotifications([]);
            setHasSyncedNotifications(true);
        } else {
            const dropdownNotifications = data || [];
            setVisibleNotifications(dropdownNotifications);
            setHasSyncedNotifications(true);

            if (markPassiveAsViewed) {
                void markViewedPassiveNotifications(dropdownNotifications);
            }
        }

        setIsLoadingNotifications(false);
    }

    function toggleMenu(menu: "trips" | "notifications") {
        setOpenMenu((current) => {
            const nextMenu = current === menu ? null : menu;

            if (nextMenu === "notifications") {
                void refreshNotifications({ markPassiveAsViewed: true });
            }

            return nextMenu;
        });
    }

    async function markViewedPassiveNotifications(
        nextNotifications: AppNotification[]
    ) {
        const passiveUnreadIds = nextNotifications
            .filter(
                (notification) =>
                    !notification.read_at &&
                    !isActionRequiredNotification(notification)
            )
            .map((notification) => notification.id);

        if (passiveUnreadIds.length === 0) return;

        const readAt = new Date().toISOString();
        setVisibleNotifications((current) =>
            current.filter(
                (notification) => !passiveUnreadIds.includes(notification.id)
            )
        );

        const supabase = createClient();
        const { error } = await supabase
            .from("notifications")
            .update({ read_at: readAt })
            .in("id", passiveUnreadIds);

        if (error) {
            console.warn("Could not mark viewed notifications read:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            return;
        }
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

        if (notification.type === "friend_request_received") {
            setActiveFriendNotification(notification);
            return;
        }

        if (notification.type === "passport_stamp_share_received") {
            setActivePassportStampNotification(notification);
            return;
        }

        await markNotificationRead(notification);
        setVisibleNotifications((current) =>
            current.filter(
                (currentNotification) => currentNotification.id !== notification.id
            )
        );
    }

    return (
        <>
            {previewRole ? (
                <div className="pointer-events-none fixed left-24 right-0 top-[calc(4.75rem+var(--safe-area-top))] z-[44] hidden justify-center px-8 md:flex">
                    <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-lime-300/25 bg-slate-950/85 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-lime-100 shadow-2xl shadow-black/30 backdrop-blur-xl">
                        Viewing as {getRolePreviewLabel(previewRole)}
                        <button
                            type="button"
                            onClick={exitRolePreview}
                            className="rounded-full bg-lime-300 px-3 py-1 text-[10px] font-black text-slate-950 transition hover:bg-lime-200"
                        >
                            Exit
                        </button>
                    </div>
                </div>
            ) : null}
            <div className="pointer-events-none fixed left-0 right-0 top-0 z-[45] px-[calc(1rem+var(--safe-area-right))] pt-[calc(1rem+var(--safe-area-top))] md:left-24 md:px-8 md:pt-6">
                <div
                    ref={wrapperRef}
                    className="pointer-events-auto ml-auto flex w-fit items-start gap-3"
                >
                <Link
                    href="/"
                    className="hidden h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50 md:flex"
                    aria-label="Home"
                    title="Home"
                >
                    <Home className="h-5 w-5" aria-hidden="true" />
                </Link>
                <ViewAsRoleSwitcher isSuperAdmin={isSuperAdmin} />
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
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-bold text-slate-950 shadow-[0_16px_34px_rgba(0,0,0,0.36),0_0_28px_rgba(var(--vaivia-neon-rgb),0.26)] transition hover:-translate-y-0.5 hover:bg-lime-200 hover:shadow-[0_18px_40px_rgba(0,0,0,0.42),0_0_34px_rgba(var(--vaivia-neon-rgb),0.34)] focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
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
                                                href={getTripSwitchHref({
                                                    targetTrip: trip,
                                                    pathname,
                                                    searchParams,
                                                })}
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
                        {dropdownNotificationCount > 0 ? (
                            <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-300 px-1 text-[10px] font-black text-slate-950 shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.9)]">
                                {dropdownNotificationCount > 99
                                    ? "99+"
                                    : dropdownNotificationCount}
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
                                            {notification.type ===
                                            "passport_stamp_share_received" ? (
                                                <Stamp
                                                    className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                            <span className="block">
                                                {notification.title || "Notification"}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-400">
                                            {notification.body}
                                        </span>
                                        {isActionRequiredNotification(notification) ? (
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
                            <div className="border-t border-white/10 px-3 py-2">
                                <Link
                                    href="/notifications"
                                    className="block rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.14em] text-lime-100 transition hover:bg-lime-300/20"
                                    onClick={() => setOpenMenu(null)}
                                >
                                    See previous notifications
                                </Link>
                            </div>
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
            <FriendInviteReviewModal
                notification={activeFriendNotification}
                open={Boolean(activeFriendNotification)}
                onOpenChange={(open) => {
                    if (!open) setActiveFriendNotification(null);
                }}
                onHandled={() => {
                    setActiveFriendNotification(null);
                    void refreshNotifications();
                }}
            />
            <PassportStampShareReviewModal
                notification={activePassportStampNotification}
                open={Boolean(activePassportStampNotification)}
                onOpenChange={(open) => {
                    if (!open) setActivePassportStampNotification(null);
                }}
                onHandled={() => {
                    setActivePassportStampNotification(null);
                    void refreshNotifications();
                }}
            />
        </>
    );
}
