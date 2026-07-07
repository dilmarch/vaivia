"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
    Bot,
    Briefcase,
    CalendarCheck,
    Home,
    Map,
    PiggyBank,
    Settings,
    Sparkles,
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

function getNavItems(firstTripId?: string | null): NavItem[] {
    const tripHref = firstTripId ? `/trips/${firstTripId}` : undefined;

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
            disabled: !tripHref,
            match: (pathname, tab) =>
                pathname.startsWith("/trips/") && tab !== "ideas" && tab !== "journey",
        },
        {
            label: "Ideas",
            href: tripHref ? `${tripHref}?tab=ideas` : undefined,
            icon: Sparkles,
            disabled: !tripHref,
            match: (pathname, tab) => pathname.startsWith("/trips/") && tab === "ideas",
        },
        {
            label: "Journey",
            href: tripHref ? `${tripHref}?tab=journey` : undefined,
            icon: Map,
            disabled: !tripHref,
            match: (pathname, tab) => pathname.startsWith("/trips/") && tab === "journey",
        },
        {
            label: "Budget",
            icon: PiggyBank,
            disabled: true,
        },
        {
            label: "AI",
            icon: Bot,
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
                  ? "bg-lime-400/10 text-lime-300 shadow-[0_0_18px_rgba(190,242,100,0.18)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`
        : `group/item flex h-16 min-h-16 w-16 min-w-16 max-w-16 items-center justify-center gap-0 overflow-hidden rounded-[22px] border p-0 transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-4 group-hover/sidebar:px-4 group-hover/sidebar:py-3 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-4 group-focus-within/sidebar:px-4 group-focus-within/sidebar:py-3 ${
              isActive
                  ? "border-lime-300/35 bg-[radial-gradient(circle_at_50%_25%,rgba(190,242,100,0.20),rgba(190,242,100,0.08)_48%,rgba(15,23,42,0.38))] text-lime-300 shadow-[0_0_34px_rgba(190,242,100,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
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
                        : "pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:w-40 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100"
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
    firstTripId,
}: AppSidebarNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab") || "";
    const navItems = getNavItems(firstTripId);

    return (
        <>
            <aside className="group/sidebar fixed left-0 top-0 z-50 hidden h-screen w-24 flex-col border-r border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(190,242,100,0.10),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(3,7,18,0.92))] px-4 py-6 text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 ease-out hover:w-72 focus-within:w-72 md:flex">
                <Link
                    href="/"
                    className="relative mb-10 flex h-12 w-full items-center justify-center overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:justify-start group-focus-within/sidebar:justify-start"
                    aria-label="VAIVIA home"
                >
                    <span className="flex h-12 w-12 items-center justify-center text-3xl font-black tracking-normal text-lime-300 drop-shadow-[0_0_18px_rgba(190,242,100,0.55)] transition-all duration-300 group-hover/sidebar:opacity-0 group-focus-within/sidebar:opacity-0">
                        V
                    </span>
                    <span className="absolute left-0 max-w-0 overflow-hidden whitespace-nowrap text-lg font-black tracking-[0.18em] text-lime-300 opacity-0 transition-all duration-300 group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-44 group-focus-within/sidebar:opacity-100">
                        VAIVIA
                    </span>
                </Link>

                <nav
                    className="flex flex-col items-center gap-2 group-hover/sidebar:items-stretch group-focus-within/sidebar:items-stretch"
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

                <div className="mt-auto flex flex-col items-center gap-2 group-hover/sidebar:items-stretch group-focus-within/sidebar:items-stretch">
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
                            className="flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-transparent p-0 text-sm font-semibold text-slate-300 transition-all duration-300 ease-out hover:border-white/10 hover:bg-white/[0.06] hover:text-white group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3 group-focus-within/sidebar:px-3 group-focus-within/sidebar:py-2"
                        >
                            <Settings className="h-5 w-5" aria-hidden="true" />
                            <span className="pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:w-40 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
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
