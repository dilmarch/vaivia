import type { ReactNode, Ref } from "react";
import {
    Bell,
    Briefcase,
    ChevronsUp,
    Inbox,
    Minus,
    MoreHorizontal,
    Plus,
    Search,
    type LucideIcon,
} from "lucide-react";

export type MobileChromeMenu = "view" | "more" | null;

type ActionRenderProps = {
    children: ReactNode;
    className: string;
    "aria-label": string;
    "aria-current"?: "page";
};

type MobileLogoControlPresentationProps = {
    renderAction: (props: ActionRenderProps) => ReactNode;
    logo: ReactNode;
};

export function MobileLogoControlPresentation({
    renderAction,
    logo,
}: MobileLogoControlPresentationProps) {
    return renderAction({
        className:
            "fixed left-[calc(1rem+var(--safe-area-left))] top-[calc(1rem+var(--safe-area-top))] z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950/70 text-2xl font-black text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] backdrop-blur-xl transition hover:border-lime-300/50 hover:bg-white/[0.08] md:hidden",
        "aria-label": "VAIVIA home",
        children: logo,
    });
}

type MobileTopActionControlsPresentationProps = {
    children: ReactNode;
    containerRef?: Ref<HTMLDivElement>;
    overlayPriority?: boolean;
};

export function MobileTopActionControlsPresentation({
    children,
    containerRef,
    overlayPriority = false,
}: MobileTopActionControlsPresentationProps) {
    return (
        <div
            className={`pointer-events-none fixed left-0 right-0 top-0 px-[calc(1rem+var(--safe-area-right))] pt-[calc(1rem+var(--safe-area-top))] md:left-24 md:px-8 md:pt-6 ${
                overlayPriority ? "z-[90]" : "z-[45]"
            }`}
        >
            <div
                ref={containerRef}
                className="pointer-events-auto ml-auto flex w-fit items-start gap-3"
            >
                {children}
            </div>
        </div>
    );
}

type TripsTopControlPresentationProps = {
    isExpanded?: boolean;
    onPress: () => void;
    opensMenu?: boolean;
};

export function TripsTopControlPresentation({
    isExpanded,
    onPress,
    opensMenu = true,
}: TripsTopControlPresentationProps) {
    return (
        <button
            type="button"
            onClick={onPress}
            data-vaivia-mobile-tour-target="trip-switcher"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-bold text-slate-950 shadow-[0_16px_34px_rgba(0,0,0,0.36),0_0_28px_rgba(var(--vaivia-neon-rgb),0.26)] transition hover:-translate-y-0.5 hover:bg-lime-200 hover:shadow-[0_18px_40px_rgba(0,0,0,0.42),0_0_34px_rgba(var(--vaivia-neon-rgb),0.34)] focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
            aria-label={opensMenu ? "Open trips menu" : "Trips"}
            aria-haspopup={opensMenu ? "menu" : undefined}
            aria-expanded={opensMenu ? isExpanded : undefined}
        >
            <Briefcase className="h-5 w-5" aria-hidden="true" />
            Trips
        </button>
    );
}

type TripsTopMenuPresentationProps = {
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
    renderSeeAll: (props: ActionRenderProps) => ReactNode;
    onMouseLeave?: () => void;
    constrainToViewport?: boolean;
};

export function TripsTopMenuPresentation({
    isOpen,
    onToggle,
    children,
    renderSeeAll,
    onMouseLeave,
    constrainToViewport = false,
}: TripsTopMenuPresentationProps) {
    return (
        <div className="relative" onMouseLeave={onMouseLeave}>
            <TripsTopControlPresentation
                onPress={onToggle}
                isExpanded={isOpen}
            />
            {isOpen ? (
                <div
                    className={
                        constrainToViewport
                            ? "fixed left-[calc(1rem+var(--safe-area-left))] right-[calc(1rem+var(--safe-area-right))] top-[calc(4rem+var(--safe-area-top))] flex flex-col items-end gap-2 py-4"
                            : "absolute -right-4 top-12 flex w-[22rem] flex-col items-end gap-2 p-4"
                    }
                >
                    <div className="w-72 max-w-full rounded-[24px] border border-lime-300/20 bg-[#0c0115]/90 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-lime-200">
                            Upcoming trips
                        </p>
                        <div className="max-h-64 overflow-y-auto">{children}</div>
                        {renderSeeAll({
                            className:
                                "mt-2 block rounded-full border border-lime-300/20 bg-lime-300/10 px-5 py-2.5 text-right text-sm font-bold text-lime-100 transition hover:bg-lime-300/20",
                            "aria-label": "See all trips",
                            children: "See all trips",
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function TripsMenuItemPresentation({
    label,
    onPress,
    animationDelay,
}: {
    label: string;
    onPress: () => void;
    animationDelay?: string;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="animate-vaivia-add-fan-out mb-2 block w-full rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
            style={{ animationDelay }}
        >
            {label}
        </button>
    );
}

type NotificationsTopControlPresentationProps = {
    isOpen: boolean;
    count: number;
    onToggle: () => void;
    children: ReactNode;
    footer: ReactNode;
    constrainToViewport?: boolean;
};

export function NotificationsTopControlPresentation({
    isOpen,
    count,
    onToggle,
    children,
    footer,
    constrainToViewport = false,
}: NotificationsTopControlPresentationProps) {
    return (
        <div className="relative">
            <button
                type="button"
                onClick={onToggle}
                className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                aria-label="Open notifications"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {count > 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-300 px-1 text-[10px] font-black text-slate-950 shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.9)]">
                        {count > 99 ? "99+" : count}
                    </span>
                ) : null}
            </button>
            {isOpen ? (
                <div
                    className={`${constrainToViewport ? "fixed left-[calc(1rem+var(--safe-area-left))] right-[calc(1rem+var(--safe-area-right))] top-[calc(4.5rem+var(--safe-area-top))]" : "absolute right-0 top-14 w-[min(360px,calc(100vw-2rem))]"} rounded-[24px] border border-white/10 bg-slate-950/85 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-xl ${
                        constrainToViewport
                            ? "max-h-[calc(100dvh-var(--safe-area-top)-6rem)] overflow-y-auto"
                            : "overflow-hidden"
                    }`}
                >
                    <div className="px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-lime-200">
                            Notifications
                        </p>
                    </div>
                    {children}
                    <div className="border-t border-white/10 px-3 py-2">
                        {footer}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function NotificationMessagePresentation({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <p className="px-3 py-6 text-center text-sm text-slate-400">
            {children}
        </p>
    );
}

export function NotificationItemPresentation({
    title,
    body,
    read,
    actionRequired,
}: {
    title: string;
    body: string | null;
    read: boolean;
    actionRequired?: boolean;
}) {
    return (
        <div
            className={`block w-full rounded-2xl px-3 py-2 text-left transition hover:bg-white/10 ${
                read ? "bg-transparent" : "bg-lime-300/10"
            }`}
        >
            <div className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime-300" />
                <div className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                        {title}
                    </span>
                    {body ? (
                        <span className="mt-0.5 block text-xs text-slate-400">
                            {body}
                        </span>
                    ) : null}
                    {actionRequired ? (
                        <span className="mt-2 inline-flex rounded-full bg-lime-300/45 px-3 py-1 text-xs font-black text-slate-950/75">
                            Review on web
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function NotificationMenuFooterPresentation({
    pendingImportCount,
    renderImportsAction,
    renderHistoryAction,
}: {
    pendingImportCount?: number;
    renderImportsAction: (props: ActionRenderProps) => ReactNode;
    renderHistoryAction: (props: ActionRenderProps) => ReactNode;
}) {
    return (
        <>
            {renderImportsAction({
                className:
                    "mb-2 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-100 transition hover:bg-white/[0.08]",
                "aria-label": "Travel imports",
                children: (
                    <>
                        <span className="inline-flex items-center gap-2">
                            <Inbox className="h-4 w-4 text-lime-200" />
                            Travel imports
                        </span>
                        {pendingImportCount ? (
                            <span className="rounded-full bg-lime-300 px-2 py-0.5 text-[10px] text-slate-950">
                                {pendingImportCount > 99
                                    ? "99+"
                                    : pendingImportCount}
                            </span>
                        ) : null}
                    </>
                ),
            })}
            {renderHistoryAction({
                className:
                    "block rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.14em] text-lime-100 transition hover:bg-lime-300/20",
                "aria-label": "See previous notifications",
                children: "See previous notifications",
            })}
        </>
    );
}

export function SearchControlPresentation({
    value,
    onChange,
}: {
    value?: string;
    onChange?: (value: string) => void;
}) {
    return (
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
                value={value}
                onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            />
        </div>
    );
}

type MobileNavItemPresentationProps = {
    label: string;
    icon?: LucideIcon;
    iconContent?: ReactNode;
    isActive?: boolean;
    disabled?: boolean;
    renderAction: (props: ActionRenderProps) => ReactNode;
};

export function MobileNavItemPresentation({
    label,
    icon: Icon,
    iconContent,
    isActive = false,
    disabled = false,
    renderAction,
}: MobileNavItemPresentationProps) {
    const className = `group/item flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] transition ${
        isActive ? "text-lime-200" : "text-slate-200 hover:text-white"
    }${disabled ? " cursor-not-allowed opacity-45" : ""}`;

    return renderAction({
        className,
        "aria-label": disabled ? `${label} coming soon` : label,
        "aria-current": isActive ? "page" : undefined,
        children: (
            <span
                className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border px-1.5 shadow-2xl shadow-black/35 backdrop-blur-xl transition ${
                    isActive
                        ? "border-lime-300/55 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.28)]"
                        : "border-white/10 bg-[#1f2937] text-slate-100 group-hover/item:border-lime-300/55 group-hover/item:bg-lime-300 group-hover/item:text-slate-950"
                }`}
            >
                {iconContent ??
                    (Icon ? (
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null)}
                <span className="line-clamp-2 max-w-full break-words text-center">
                    {label}
                </span>
            </span>
        ),
    });
}

type MobileBottomNavigationPresentationProps = {
    menu: MobileChromeMenu;
    onToggleView: () => void;
    onToggleMore: () => void;
    children?: ReactNode;
    viewMenu?: ReactNode;
    moreMenu?: ReactNode;
    containerRef?: Ref<HTMLElement>;
};

function DockControl({
    label,
    expanded,
    onPress,
    icon: Icon,
    tourTarget,
}: {
    label: string;
    expanded: boolean;
    onPress: () => void;
    icon: LucideIcon;
    tourTarget?: string;
}) {
    return (
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
                onClick={onPress}
                data-vaivia-mobile-tour-target={tourTarget}
                className="pointer-events-auto relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#0c0115]/90 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:border-lime-300/40 hover:bg-white/[0.08] hover:text-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                aria-label={label}
                aria-expanded={expanded}
            >
                <Icon className="h-6 w-6" aria-hidden="true" />
            </button>
        </div>
    );
}

export function MobileBottomNavigationPresentation({
    menu,
    onToggleView,
    onToggleMore,
    children,
    viewMenu,
    moreMenu,
    containerRef,
}: MobileBottomNavigationPresentationProps) {
    return (
        <nav
            ref={containerRef}
            className="vaivia-mobile-fixed-dock fixed inset-x-0 bottom-0 z-50 h-[calc(5.5rem+var(--safe-area-bottom))] text-white md:hidden"
            aria-label="Mobile navigation"
        >
            {children ?? (menu === "view" ? (
                <div className="absolute bottom-[calc(5rem+var(--safe-area-bottom))] left-[calc(0.75rem+var(--safe-area-left))] right-[calc(0.75rem+var(--safe-area-right))] grid grid-cols-4 gap-3">
                    {viewMenu}
                </div>
            ) : null)}

            {children ? null : menu === "more" ? (
                <div className="absolute bottom-[calc(5rem+var(--safe-area-bottom))] left-[calc(0.75rem+var(--safe-area-left))] right-[calc(0.75rem+var(--safe-area-right))] flex flex-wrap items-start justify-end gap-4">
                    {moreMenu}
                </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+var(--safe-area-bottom))] flex items-center justify-center gap-24">
                <DockControl
                    label="Open trip views"
                    expanded={menu === "view"}
                    onPress={onToggleView}
                    icon={ChevronsUp}
                    tourTarget="trip-apps"
                />
                <DockControl
                    label="Open more options"
                    expanded={menu === "more"}
                    onPress={onToggleMore}
                    icon={MoreHorizontal}
                />
            </div>
        </nav>
    );
}

type MobileQuickAddControlPresentationProps = {
    isOpen?: boolean;
    disabled?: boolean;
    onToggle?: () => void;
    menu?: ReactNode;
    footer?: ReactNode;
    containerRef?: Ref<HTMLDivElement>;
    responsiveClassName?: string;
};

type MobileQuickAddButtonPresentationProps = Pick<
    MobileQuickAddControlPresentationProps,
    "isOpen" | "disabled" | "onToggle"
>;

export function QuickAddMenuPresentation({
    children,
    constrainToViewport = false,
}: {
    children: ReactNode;
    constrainToViewport?: boolean;
}) {
    return (
        <div
            className={`mb-3 flex flex-col items-center gap-2 md:items-end ${
                constrainToViewport
                    ? "max-h-[calc(100dvh-8rem-var(--safe-area-top)-var(--safe-area-bottom))] overflow-y-auto md:max-h-none md:overflow-visible"
                    : ""
            }`}
        >
            {children}
        </div>
    );
}

export function QuickAddMenuItemPresentation({
    label,
    disabled = false,
    onPress,
    animationDelay,
}: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
    animationDelay?: string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onPress}
            className={`animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right ${
                disabled ? "cursor-not-allowed opacity-55" : ""
            }`}
            style={{ animationDelay }}
        >
            {label}
        </button>
    );
}

export function MobileQuickAddButtonPresentation({
    isOpen = false,
    disabled = false,
    onToggle,
}: MobileQuickAddButtonPresentationProps) {
    const label = disabled
        ? "Quick add unavailable"
        : isOpen
          ? "Close quick add menu"
          : "Open quick add menu";

    return (
        <div className="relative grid place-items-center">
            <span
                className="pointer-events-none absolute -inset-4 z-0 rounded-full bg-slate-500/60 blur-2xl"
                aria-hidden="true"
            />
            <span
                className="pointer-events-none absolute -inset-2 z-0 rounded-full bg-slate-700/45 blur-xl"
                aria-hidden="true"
            />
            <button
                type="button"
                onClick={onToggle}
                disabled={disabled}
                data-vaivia-mobile-tour-target="quick-add"
                className="vaivia-mobile-quick-add-button relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.30)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950 md:h-14 md:w-14 md:shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]"
                aria-label={label}
                aria-expanded={disabled ? undefined : isOpen}
            >
                <span
                    className={`grid place-items-center transition-transform duration-300 ${
                        isOpen ? "-rotate-180" : "rotate-0"
                    }`}
                >
                    {isOpen ? (
                        <Minus className="h-6 w-6" aria-hidden="true" />
                    ) : (
                        <Plus className="h-6 w-6" aria-hidden="true" />
                    )}
                </span>
            </button>
        </div>
    );
}

export function MobileQuickAddControlPresentation({
    isOpen = false,
    disabled = false,
    onToggle,
    menu,
    footer,
    containerRef,
    responsiveClassName = "md:hidden",
}: MobileQuickAddControlPresentationProps) {
    return (
        <div
            ref={containerRef}
            className={`vaivia-mobile-fixed-dock vaivia-mobile-quick-add-dock fixed bottom-[calc(0.75rem+var(--safe-area-bottom))] left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center ${responsiveClassName}`}
        >
            {menu}
            <MobileQuickAddButtonPresentation
                isOpen={isOpen}
                disabled={disabled}
                onToggle={onToggle}
            />
            {footer}
        </div>
    );
}

type MobileAppChromePresentationProps = {
    logo: ReactNode;
    renderLogoAction: MobileLogoControlPresentationProps["renderAction"];
    topControls: ReactNode;
    menu: MobileChromeMenu;
    onToggleView: () => void;
    onToggleMore: () => void;
    viewMenu: ReactNode;
    moreMenu: ReactNode;
    quickAdd: ReactNode;
    dockRef?: Ref<HTMLElement>;
    topRef?: Ref<HTMLDivElement>;
};

export function MobileAppChromePresentation({
    logo,
    renderLogoAction,
    topControls,
    menu,
    onToggleView,
    onToggleMore,
    viewMenu,
    moreMenu,
    quickAdd,
    dockRef,
    topRef,
}: MobileAppChromePresentationProps) {
    return (
        <>
            <MobileLogoControlPresentation
                logo={logo}
                renderAction={renderLogoAction}
            />
            <MobileTopActionControlsPresentation
                containerRef={topRef}
                overlayPriority
            >
                {topControls}
            </MobileTopActionControlsPresentation>
            <MobileBottomNavigationPresentation
                containerRef={dockRef}
                menu={menu}
                onToggleView={onToggleView}
                onToggleMore={onToggleMore}
                viewMenu={viewMenu}
                moreMenu={moreMenu}
            />
            {quickAdd}
        </>
    );
}
