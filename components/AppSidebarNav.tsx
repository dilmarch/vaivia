"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
    BedDouble,
    BarChart3,
    Bot,
    CalendarCheck,
    ChevronsUp,
    Home,
    LayoutDashboard,
    Map,
    Megaphone,
    MoreHorizontal,
    Newspaper,
    PiggyBank,
    Settings,
    ShieldCheck,
    Sparkles,
    Utensils,
    UsersRound,
    type LucideIcon,
} from "lucide-react";
import AccountMenu, {
    type UserPreferences,
    type UserProfile,
} from "@/components/AccountMenu";
import {
    getEffectiveIsSuperAdmin,
    useRolePreview,
} from "@/components/admin/useRolePreview";
import SidebarLogoutButton from "@/components/SidebarLogoutButton";

type AppSidebarNavProps = {
    userId?: string | null;
    email?: string | null;
    joinedAt?: string | null;
    profile?: Partial<UserProfile> | null;
    preferences?: Partial<UserPreferences> | null;
    firstTripId?: string | null;
};

type NavItem = {
    label: string;
    href?: string;
    icon: LucideIcon;
    disabled?: boolean;
    match?: (pathname: string, tab: string) => boolean;
};

function getCurrentTripId(pathname: string) {
    const match = pathname.match(/^\/trips\/([^/?#]+)/);
    const tripId = match?.[1];

    if (!tripId || tripId === "new") return null;
    return decodeURIComponent(tripId);
}

function isExactTripRoute(pathname: string) {
    return /^\/trips\/[^/?#]+\/?$/.test(pathname);
}

function getAdminItem(): NavItem {
    return {
        label: "Admin",
        href: "/admin",
        icon: ShieldCheck,
        match: (currentPathname) => currentPathname === "/admin",
    };
}

function getAdminUsersItem(): NavItem {
    return {
        label: "Users",
        href: "/admin/users",
        icon: UsersRound,
        match: (currentPathname) => currentPathname.startsWith("/admin/users"),
    };
}

function getAdminStatsItem(): NavItem {
    return {
        label: "Stats",
        href: "/admin/stats",
        icon: BarChart3,
        match: (currentPathname) => currentPathname.startsWith("/admin/stats"),
    };
}

function getAdminMarketingItem(): NavItem {
    return {
        label: "Marketing",
        href: "/admin/marketing",
        icon: Megaphone,
        match: (currentPathname) => currentPathname.startsWith("/admin/marketing"),
    };
}

function getNavItems(pathname: string, isSuperAdmin: boolean): NavItem[] {
    const currentTripId = getCurrentTripId(pathname);
    const tripHref = currentTripId ? `/trips/${currentTripId}` : undefined;
    const showAdminUsers = isSuperAdmin && pathname.startsWith("/admin");
    const showAdminStats = isSuperAdmin && pathname.startsWith("/admin");
    const showAdminMarketing = isSuperAdmin && pathname.startsWith("/admin");

    if (!tripHref) {
        const items: NavItem[] = [
            {
                label: "Home",
                href: "/",
                icon: Home,
                match: (currentPathname) => currentPathname === "/",
            },
            ...(isSuperAdmin
                ? [{
                label: "News Feed",
                href: "/news-feed",
                icon: Newspaper,
                match: (currentPathname: string) =>
                    currentPathname.startsWith("/news-feed"),
            }]
                : []),
            {
                label: "Travel Assistant",
                icon: Bot,
                disabled: true,
            },
        ];

        if (showAdminStats) items.push(getAdminStatsItem());
        if (showAdminUsers) items.push(getAdminUsersItem());
        if (showAdminMarketing) items.push(getAdminMarketingItem());
        return items;
    }

    const items: NavItem[] = [
        {
            label: "Home",
            href: "/",
            icon: Home,
            match: (pathname) => pathname === "/",
        },
        ...(isSuperAdmin
            ? [{
            label: "News Feed",
            href: "/news-feed",
            icon: Newspaper,
            match: (pathname: string) => pathname.startsWith("/news-feed"),
        }]
            : []),
        {
            label: "Itinerary",
            href: tripHref ? `${tripHref}/itinerary` : undefined,
            icon: CalendarCheck,
            match: (pathname, tab) =>
                pathname.startsWith("/trips/") &&
                (pathname.includes("/itinerary") || tab === "itinerary"),
        },
        {
            label: "Ideas",
            href: tripHref ? `${tripHref}?tab=ideas` : undefined,
            icon: Sparkles,
            match: (pathname, tab) => pathname.startsWith("/trips/") && tab === "ideas",
        },
        {
            label: "Budget",
            href: tripHref ? `${tripHref}/budget` : undefined,
            icon: PiggyBank,
            match: (pathname) =>
                pathname.startsWith("/trips/") && pathname.includes("/budget"),
        },
        {
            label: "Journey",
            href: tripHref ? `${tripHref}?tab=journey` : undefined,
            icon: Map,
            match: (pathname, tab) =>
                pathname.startsWith("/trips/") &&
                (tab === "journey" || tab === "journey-planning"),
        },
        {
            label: "Food",
            href: tripHref ? `${tripHref}/food` : undefined,
            icon: Utensils,
            match: (pathname) =>
                pathname.startsWith("/trips/") && pathname.includes("/food"),
        },
        {
            label: "Accommodations",
            href: tripHref ? `${tripHref}/accommodations` : undefined,
            icon: BedDouble,
            match: (pathname) =>
                pathname.startsWith("/trips/") &&
                pathname.includes("/accommodations"),
        },
    ];

    if (showAdminStats) items.push(getAdminStatsItem());
    if (showAdminUsers) items.push(getAdminUsersItem());
    if (showAdminMarketing) items.push(getAdminMarketingItem());
    return items;
}

function NavItemButton({
    item,
    isActive,
    mobile = false,
    onNavigate,
}: {
    item: NavItem;
    isActive: boolean;
    mobile?: boolean;
    onNavigate?: () => void;
}) {
    const Icon = item.icon;
    const baseClass = mobile
        ? `group/item flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] transition ${
              isActive
                  ? "text-lime-200"
                  : "text-slate-200 hover:text-white"
          }`
        : `group/item flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border p-0 text-left transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:h-12 group-hover/sidebar:min-h-12 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2 ${
              isActive
                  ? "border-lime-300/35 bg-[radial-gradient(circle_at_50%_25%,rgba(var(--vaivia-neon-rgb),0.20),rgba(var(--vaivia-neon-rgb),0.08)_48%,rgba(15,23,42,0.38))] text-lime-300 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
          }`;

    const content = (
        <>
            {mobile ? (
                <span
                    className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border px-1.5 shadow-2xl shadow-black/35 backdrop-blur-xl transition ${
                        isActive
                            ? "border-lime-300/55 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.28)]"
                            : "border-white/10 bg-[#1f2937] text-slate-100 group-hover/item:border-lime-300/55 group-hover/item:bg-lime-300 group-hover/item:text-slate-950"
                    }`}
                >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="line-clamp-2 max-w-full break-words text-center">
                        {item.label}
                    </span>
                </span>
            ) : (
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            {!mobile ? (
                <span className="pointer-events-none block w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-left text-xs font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
                    {item.label}
                </span>
            ) : null}
        </>
    );

    if (item.disabled || !item.href) {
        return (
            <button
                type="button"
                disabled
                aria-label={`${item.label} coming soon`}
                title={`${item.label} coming soon`}
                className={`${baseClass} cursor-not-allowed opacity-45`}
            >
                {content}
            </button>
        );
    }

    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className={baseClass}
            prefetch
        >
            {content}
        </Link>
    );
}

export default function AppSidebarNav({
    userId,
    email,
    joinedAt,
    profile,
    preferences,
}: AppSidebarNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab") || "";
    const realIsSuperAdmin = profile?.role === "super_admin";
    const previewRole = useRolePreview(realIsSuperAdmin);
    const isSuperAdmin = getEffectiveIsSuperAdmin({
        realIsSuperAdmin,
        previewRole,
    });
    const navItems = getNavItems(pathname, isSuperAdmin);
    const adminItem = getAdminItem();
    const adminUsersItem = getAdminUsersItem();
    const adminStatsItem = getAdminStatsItem();
    const adminMarketingItem = getAdminMarketingItem();
    const newsFeedItem = navItems.find((item) => item.label === "News Feed");
    const isAdminRoute = pathname.startsWith("/admin");
    const [mobileMenu, setMobileMenu] = useState<"view" | "more" | null>(null);
    const mobileDockRef = useRef<HTMLDivElement | null>(null);
    const currentTripId = getCurrentTripId(pathname);
    const mobileTripOverviewItem: NavItem | null = currentTripId
        ? {
              label: "Trip overview",
              href: `/trips/${currentTripId}`,
              icon: LayoutDashboard,
              match: (currentPathname, currentTab) =>
                  isExactTripRoute(currentPathname) && !currentTab,
          }
        : null;
    const mobileViewItems = [
        ...(mobileTripOverviewItem ? [mobileTripOverviewItem] : []),
        ...navItems.filter((item) =>
            [
                "News Feed",
                "Itinerary",
                "Budget",
                "Ideas",
                "Journey",
                "Food",
                "Accommodations",
            ].includes(item.label)
        ),
    ];
    const mobileAdminItems =
        isSuperAdmin && isAdminRoute
            ? [
                  ...(newsFeedItem ? [newsFeedItem] : []),
                  adminItem,
                  adminStatsItem,
                  adminUsersItem,
                  adminMarketingItem,
              ]
            : [
                  ...(isSuperAdmin ? [adminItem] : []),
                  ...(isSuperAdmin && isAdminRoute
                      ? [adminStatsItem, adminUsersItem]
                      : []),
                  ...(isSuperAdmin && isAdminRoute ? [adminMarketingItem] : []),
              ];

    useEffect(() => {
        setMobileMenu(null);
    }, [pathname, tab]);

    useEffect(() => {
        if (!mobileMenu) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                mobileDockRef.current &&
                !mobileDockRef.current.contains(event.target as Node)
            ) {
                setMobileMenu(null);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [mobileMenu]);

    return (
        <>
            <aside className="group/sidebar fixed left-0 top-0 z-50 hidden h-screen w-24 flex-col border-r border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.10),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(3,7,18,0.92))] px-4 py-6 text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 ease-out hover:w-72 md:flex">
                <div className="flex min-h-0 flex-1 flex-col pb-4">
                    <Link
                        href="/"
                        className="relative mb-5 flex h-12 w-full items-center justify-center overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:justify-start"
                        aria-label="VAIVIA home"
                    >
                        <span className="flex h-12 w-12 items-center justify-center text-3xl font-black tracking-normal text-lime-300 drop-shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.55)] transition-all duration-300 group-hover/sidebar:opacity-0">
                            V
                        </span>
                        <span className="absolute left-0 max-w-0 overflow-hidden whitespace-nowrap text-lg font-black tracking-[0.18em] text-lime-300 opacity-0 transition-all duration-300 group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100">
                            VAIVIA
                        </span>
                    </Link>

                    <nav
                        className="flex flex-col items-center gap-2 px-1 group-hover/sidebar:items-stretch group-hover/sidebar:gap-1.5 group-hover/sidebar:px-0"
                        aria-label="Primary navigation"
                    >
                        {navItems.map((item) => (
                            <NavItemButton
                                key={item.label}
                                item={item}
                                isActive={item.match?.(pathname, tab) || false}
                            />
                        ))}
                    </nav>
                </div>

                <div className="mt-4 flex flex-col items-center gap-2 border-t border-white/10 pt-4 group-hover/sidebar:items-stretch">
                    {isSuperAdmin ? (
                        <NavItemButton
                            item={adminItem}
                            isActive={adminItem.match?.(pathname, tab) || false}
                        />
                    ) : null}
                    {userId ? (
                        <AccountMenu
                            userId={userId}
                            email={email}
                            joinedAt={joinedAt}
                            profile={profile}
                            preferences={preferences}
                            variant="sidebar-profile"
                        />
                    ) : null}
                    {userId ? (
                        <AccountMenu
                            userId={userId}
                            email={email}
                            joinedAt={joinedAt}
                            profile={profile}
                            preferences={preferences}
                            variant="sidebar-settings"
                        />
                    ) : null}
                    {userId ? (
                        <SidebarLogoutButton />
                    ) : (
                        <Link
                            href="/auth/login"
                            className="flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-transparent p-0 text-sm font-semibold text-slate-300 transition-all duration-300 ease-out hover:border-white/10 hover:bg-white/[0.06] hover:text-white group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2"
                        >
                            <Settings className="h-5 w-5" aria-hidden="true" />
                            <span className="pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
                                Sign in
                            </span>
                        </Link>
                    )}
                </div>
            </aside>

            <Link
                href="/"
                className="fixed left-[calc(1rem+var(--safe-area-left))] top-[calc(1rem+var(--safe-area-top))] z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950/70 text-2xl font-black text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] backdrop-blur-xl transition hover:border-lime-300/50 hover:bg-white/[0.08] md:hidden"
                aria-label="VAIVIA home"
                prefetch
            >
                V
            </Link>

            <nav
                ref={mobileDockRef}
                className="vaivia-mobile-fixed-dock fixed inset-x-0 bottom-0 z-50 h-[calc(5.5rem+var(--safe-area-bottom))] text-white md:hidden"
                aria-label="Mobile navigation"
            >
                {mobileMenu === "view" ? (
                    <div className="absolute bottom-[calc(5rem+var(--safe-area-bottom))] left-[calc(0.75rem+var(--safe-area-left))] right-[calc(0.75rem+var(--safe-area-right))] grid grid-cols-4 gap-3">
                        {mobileViewItems.length > 0 ? (
                            mobileViewItems.map((item, index) => (
                                <div
                                    key={item.label}
                                    className="animate-vaivia-add-fan-out min-w-0"
                                    style={{ animationDelay: `${index * 32}ms` }}
                                >
                                    <NavItemButton
                                        item={item}
                                        isActive={
                                            item.label === "Itinerary" &&
                                            mobileTripOverviewItem &&
                                            isExactTripRoute(pathname) &&
                                            !tab
                                                ? false
                                                : item.match?.(pathname, tab) || false
                                        }
                                        mobile
                                        onNavigate={() => setMobileMenu(null)}
                                    />
                                </div>
                            ))
                        ) : (
                            <Link
                                href="/trips"
                                className="group/item animate-vaivia-add-fan-out flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] text-slate-200"
                                onClick={() => setMobileMenu(null)}
                                prefetch
                            >
                                <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-white/10 bg-[#1f2937] px-1.5 text-slate-100 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover/item:border-lime-300/55 group-hover/item:bg-lime-300 group-hover/item:text-slate-950">
                                    <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="line-clamp-2 max-w-full break-words text-center">
                                    Trips
                                    </span>
                                </span>
                            </Link>
                        )}
                    </div>
                ) : null}

                {mobileMenu === "more" ? (
                    <div className="absolute bottom-[calc(5rem+var(--safe-area-bottom))] left-[calc(0.75rem+var(--safe-area-left))] right-[calc(0.75rem+var(--safe-area-right))] flex flex-wrap items-start justify-end gap-4">
                        {mobileAdminItems.length > 0
                            ? mobileAdminItems.map((item, index) => (
                                  <div
                                      key={item.label}
                                      className="animate-vaivia-add-fan-out min-w-0"
                                      style={{ animationDelay: `${index * 32}ms` }}
                                  >
                                      <NavItemButton
                                          item={item}
                                          isActive={item.match?.(pathname, tab) || false}
                                          mobile
                                          onNavigate={() => setMobileMenu(null)}
                                      />
                                  </div>
                              ))
                            : null}
                        {!isAdminRoute ? (
                            <>
                                <Link
                                    href="/settings"
                                    onClick={() => setMobileMenu(null)}
                                    className="group/item animate-vaivia-add-fan-out flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] text-slate-200 transition hover:text-white"
                                    prefetch
                                >
                                    <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-white/10 bg-[#1f2937] px-1.5 text-slate-100 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover/item:border-lime-300/55 group-hover/item:bg-lime-300 group-hover/item:text-slate-950">
                                        <Settings
                                            className="h-4 w-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="line-clamp-2 max-w-full break-words text-center">
                                            Settings
                                        </span>
                                    </span>
                                </Link>
                                {userId ? (
                                    <div className="animate-vaivia-add-fan-out min-w-0">
                                        <AccountMenu
                                            userId={userId}
                                            email={email}
                                            joinedAt={joinedAt}
                                            profile={profile}
                                            preferences={preferences}
                                            variant="mobile-profile"
                                        />
                                    </div>
                                ) : (
                                    <Link
                                        href="/auth/login"
                                        onClick={() => setMobileMenu(null)}
                                        className="group/item animate-vaivia-add-fan-out flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] text-slate-200 transition hover:text-white"
                                    >
                                        <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-white/10 bg-[#1f2937] px-1.5 text-slate-100 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover/item:border-lime-300/55 group-hover/item:bg-lime-300 group-hover/item:text-slate-950">
                                            <Settings
                                                className="h-4 w-4 shrink-0"
                                                aria-hidden="true"
                                            />
                                            <span className="line-clamp-2 max-w-full break-words text-center">
                                                Sign in
                                            </span>
                                        </span>
                                    </Link>
                                )}
                            </>
                        ) : null}
                    </div>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+var(--safe-area-bottom))] flex items-center justify-center gap-24">
                    <div className="relative grid place-items-center">
                        <span
                            className="pointer-events-none absolute -inset-1.5 z-0 rounded-full bg-slate-300/45 blur-md"
                            aria-hidden="true"
                        />
                        <span
                            className="pointer-events-none absolute -inset-1 z-0 rounded-full bg-slate-500/35 blur-sm"
                            aria-hidden="true"
                        />
                        <button
                            type="button"
                            onClick={() =>
                                setMobileMenu((current) =>
                                    current === "view" ? null : "view"
                                )
                            }
                            data-vaivia-mobile-tour-target="trip-apps"
                            className="pointer-events-auto relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#0c0115]/90 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:border-lime-300/40 hover:bg-white/[0.08] hover:text-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                            aria-label="Open trip views"
                            aria-expanded={mobileMenu === "view"}
                        >
                            <ChevronsUp className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="relative grid place-items-center">
                        <span
                            className="pointer-events-none absolute -inset-1.5 z-0 rounded-full bg-slate-300/45 blur-md"
                            aria-hidden="true"
                        />
                        <span
                            className="pointer-events-none absolute -inset-1 z-0 rounded-full bg-slate-500/35 blur-sm"
                            aria-hidden="true"
                        />
                        <button
                            type="button"
                            onClick={() =>
                                setMobileMenu((current) =>
                                    current === "more" ? null : "more"
                                )
                            }
                            className="pointer-events-auto relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#0c0115]/90 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:border-lime-300/40 hover:bg-white/[0.08] hover:text-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                            aria-label="Open more options"
                            aria-expanded={mobileMenu === "more"}
                        >
                            <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </nav>
        </>
    );
}
