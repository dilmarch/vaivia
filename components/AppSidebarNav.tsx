"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
    BedDouble,
    Bot,
    Briefcase,
    CalendarCheck,
    Home,
    Map,
    PiggyBank,
    Settings,
    Sparkles,
    Utensils,
    type LucideIcon,
} from "lucide-react";
import AccountMenu, {
    type UserPreferences,
    type UserProfile,
} from "@/components/AccountMenu";
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

function getNavItems(pathname: string): NavItem[] {
    const currentTripId = getCurrentTripId(pathname);
    const tripHref = currentTripId ? `/trips/${currentTripId}` : undefined;

    if (!tripHref) {
        return [
            {
                label: "Home",
                href: "/",
                icon: Home,
                match: (currentPathname) => currentPathname === "/",
            },
            {
                label: "Trips",
                href: "/trips",
                icon: Briefcase,
                match: (currentPathname) => currentPathname === "/trips",
            },
            {
                label: "Travel Assistant",
                icon: Bot,
                disabled: true,
            },
        ];
    }

    return [
        {
            label: "Home",
            href: "/",
            icon: Home,
            match: (pathname) => pathname === "/",
        },
        {
            label: "Trips",
            href: "/trips",
            icon: Briefcase,
            match: (pathname) => pathname === "/trips",
        },
        {
            label: "Itinerary",
            href: tripHref,
            icon: CalendarCheck,
            match: (pathname, tab) =>
                pathname.startsWith("/trips/") &&
                tab !== "ideas" &&
                tab !== "journey" &&
                tab !== "journey-planning",
        },
        {
            label: "Ideas",
            href: tripHref ? `${tripHref}?tab=ideas` : undefined,
            icon: Sparkles,
            match: (pathname, tab) => pathname.startsWith("/trips/") && tab === "ideas",
        },
        {
            label: "Budget",
            icon: PiggyBank,
            disabled: true,
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
            icon: Utensils,
            disabled: true,
        },
        {
            label: "Accommodations",
            icon: BedDouble,
            disabled: true,
        },
    ];
}

function NavItemButton({
    item,
    isActive,
    mobile = false,
}: {
    item: NavItem;
    isActive: boolean;
    mobile?: boolean;
}) {
    const Icon = item.icon;
    const baseClass = mobile
        ? `flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-3 text-[11px] font-semibold transition ${
              isActive
                  ? "bg-lime-400/10 text-lime-300 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.18)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`
        : `group/item flex h-14 min-h-14 w-14 min-w-14 max-w-14 items-center justify-center gap-0 overflow-hidden rounded-[20px] border p-0 text-left transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:h-16 group-hover/sidebar:min-h-16 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-4 group-hover/sidebar:px-4 group-hover/sidebar:py-3 ${
              isActive
                  ? "border-lime-300/35 bg-[radial-gradient(circle_at_50%_25%,rgba(var(--vaivia-neon-rgb),0.20),rgba(var(--vaivia-neon-rgb),0.08)_48%,rgba(15,23,42,0.38))] text-lime-300 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
          }`;

    const content = (
        <>
            <Icon
                className={`shrink-0 ${mobile ? "h-5 w-5" : "h-6 w-6"}`}
                aria-hidden="true"
            />
            <span
                className={
                    mobile
                        ? "truncate"
                        : "pointer-events-none block w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-left text-sm font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100"
                }
            >
                {item.label}
            </span>
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
    const navItems = getNavItems(pathname);

    return (
        <>
            <aside className="group/sidebar fixed left-0 top-0 z-50 hidden h-screen w-24 flex-col border-r border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.10),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(3,7,18,0.92))] px-4 py-6 text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 ease-out hover:w-72 md:flex">
                <div className="flex max-h-[70vh] shrink-0 flex-col overflow-y-auto pb-4">
                    <Link
                        href="/"
                        className="relative mb-8 flex h-12 w-full items-center justify-center overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:justify-start"
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
                        className="flex flex-col items-center gap-3 px-1 group-hover/sidebar:items-stretch group-hover/sidebar:gap-2 group-hover/sidebar:px-0"
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

                <div className="mt-auto flex flex-col items-center gap-2 group-hover/sidebar:items-stretch">
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

            <nav
                className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t border-white/10 bg-slate-950/95 px-2 py-2 text-white shadow-2xl shadow-black/50 backdrop-blur-xl md:hidden"
                aria-label="Mobile navigation"
            >
                {navItems.slice(0, 5).map((item) => (
                    <NavItemButton
                        key={item.label}
                        item={item}
                        isActive={item.match?.(pathname, tab) || false}
                        mobile
                    />
                ))}
            </nav>
        </>
    );
}
