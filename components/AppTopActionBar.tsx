"use client";

import Link from "next/link";
import {
    Bell,
    Briefcase,
    CalendarDays,
    Check,
    ChevronsUp,
    Home,
    ListChecks,
    Plus,
    Search,
    Stamp,
    type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import FriendInviteReviewModal from "@/components/FriendInviteReviewModal";
import PassportStampCard from "@/components/PassportStamp";
import PassportStampShareReviewModal from "@/components/PassportStampShareReviewModal";
import Portal from "@/components/Portal";
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
import {
    dismissOnboarding,
    markOnboardingStepCompleted,
    type OnboardingProgress,
} from "@/lib/onboarding";
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
    onboardingProgress?: OnboardingProgress | null;
};

export type AppNotification = DropdownNotification;

type MobileTourKind = "home" | "trip-overview";

type MobileTourStep = {
    title: string;
    description: string;
    icon: LucideIcon;
    targetSelector: string;
    highlightShape?: "circle" | "rounded";
    scrollIntoView?: boolean;
    placement:
        | "top-right"
        | "calendar-section"
        | "task-section"
        | "bottom-right"
        | "bottom-left";
};

type MobileTourHighlightRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type ProminentSharedStamp = {
    country_code: string;
    country_name: string | null;
    flag_emoji: string | null;
    first_visited_on: string | null;
    first_entry_iata_code: string | null;
    first_entry_icao_code: string | null;
    first_entry_city: string | null;
    first_entry_airport_name: string | null;
    welcome_label_snapshot: string | null;
    arrival_label_snapshot: string | null;
    stamp_display_country_name: string | null;
    stamp_display_flag: string | null;
    visit_city: string | null;
    port_of_entry_name: string | null;
};

type ProminentPassportSharePreview = {
    sender?: {
        displayName?: string | null;
        avatarUrl?: string | null;
    } | null;
    source_stamp?: ProminentSharedStamp | null;
};

function tripLabel(trip: TopNavTrip) {
    return trip.title?.trim() || "Untitled trip";
}

function getNotificationMetadataString(
    notification: AppNotification,
    key: string
) {
    const value = notification.metadata?.[key];
    return typeof value === "string" ? value : "";
}

function getInitials(name: string) {
    const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return initials || "V";
}

function isProminentActionNotification(notification: AppNotification) {
    return (
        notification.type === "trip_invite_received" ||
        notification.type === "friend_request_received" ||
        notification.type === "passport_stamp_share_received" ||
        notification.type === "profile_onboarding_prompt"
    );
}

function getProminentActionCopy(notification: AppNotification) {
    if (notification.type === "trip_invite_received") {
        return {
            eyebrow: "Trip invitation",
            title: notification.title || "You have a trip invite",
            body:
                notification.body ||
                "Someone invited you to join a trip on VAIVIA.",
            acceptLabel: "Review invite",
            remindLabel: "Remind me later",
            showDecline: true,
        };
    }

    if (notification.type === "friend_request_received") {
        return {
            eyebrow: "Friend request",
            title: notification.title || "You have a friend request",
            body:
                notification.body ||
                "Someone added you as a friend on VAIVIA.",
            acceptLabel: "Review request",
            remindLabel: "Remind me later",
            showDecline: true,
        };
    }

    if (notification.type === "profile_onboarding_prompt") {
        return {
            eyebrow: "Profile",
            title: notification.title || "Make your profile feel travelled-in",
            body:
                notification.body ||
                "Update your profile, collect digital passport stamps, scratch countries off your map, and create a wishlist of places you want to go.",
            acceptLabel: "Take me to profile",
            remindLabel: "Maybe later",
            showDecline: false,
        };
    }

    if (notification.type === "theme_exploration_prompt") {
        return {
            eyebrow: "Themes",
            title: notification.title || "Explore VAIVIA themes",
            body:
                notification.body ||
                "Try the different VAIVIA themes and choose the travel mood that feels most like you.",
            acceptLabel: "Review themes",
            remindLabel: "Maybe later",
            showDecline: false,
        };
    }

    const senderName =
        typeof notification.metadata?.senderName === "string"
            ? notification.metadata.senderName
            : "";

    return {
        eyebrow: "Passport stamp",
        title: senderName
            ? `${senderName} sent you a passport stamp`
            : "A friend sent you a passport stamp",
        body: notification.body || "A friend sent you a passport stamp to review.",
        acceptLabel: "Review stamp",
        remindLabel: "Remind me later",
        showDecline: true,
    };
}

function getNotificationActionHref(notification: AppNotification) {
    if (notification.type === "profile_onboarding_prompt") {
        return "/profile#passport-stamps";
    }

    if (notification.type === "theme_exploration_prompt") {
        return "/settings";
    }

    return "";
}

function getYearFromDate(value?: string | null) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.getFullYear();
}

function getProminentActionInitial(notification: AppNotification) {
    if (notification.type === "passport_stamp_share_received") {
        const senderName =
            typeof notification.metadata?.senderName === "string"
                ? notification.metadata.senderName
                : "";
        return senderName ? getInitials(senderName) : "S";
    }

    return notification.title?.trim()[0]?.toUpperCase() || "V";
}

const MOBILE_TOUR_STORAGE_KEYS: Record<MobileTourKind, string> = {
    home: "vaivia:mobile-tour:home:v4",
    "trip-overview": "vaivia:mobile-tour:trip-overview:v4",
};

const MOBILE_TOUR_STEPS: Record<MobileTourKind, MobileTourStep[]> = {
    home: [
        {
            title: "Select a trip",
            description:
                "Use your trips widget to jump into upcoming plans without digging around.",
            icon: Briefcase,
            targetSelector: '[data-vaivia-mobile-tour-target="home-trips-widget"]',
            placement: "calendar-section",
            highlightShape: "rounded",
            scrollIntoView: true,
        },
        {
            title: "See your calendar",
            description:
                "Your dashboard keeps the near-term trip calendar close so plans and dates stay visible.",
            icon: CalendarDays,
            targetSelector: '[data-vaivia-mobile-tour-target="home-calendar"]',
            placement: "calendar-section",
            highlightShape: "rounded",
            scrollIntoView: true,
        },
        {
            title: "Track essentials",
            description:
                "Use your reminders and task list for accommodations, transportation, and the little things that make trips easier.",
            icon: ListChecks,
            targetSelector: '[data-vaivia-mobile-tour-target="home-tasks"]',
            placement: "task-section",
            highlightShape: "rounded",
            scrollIntoView: true,
        },
    ],
    "trip-overview": [
        {
            title: "Add trip items",
            description:
                "Tap the green + button to add transportation, activities, ideas, accommodations, and more.",
            icon: Plus,
            targetSelector: '[data-vaivia-mobile-tour-target="quick-add"]',
            placement: "bottom-right",
            highlightShape: "circle",
        },
        {
            title: "Open trip apps",
            description:
                "Tap the ^ button to jump into itinerary, budget, accommodations, journey planning, food, and ideas.",
            icon: ChevronsUp,
            targetSelector: '[data-vaivia-mobile-tour-target="trip-apps"]',
            placement: "bottom-left",
            highlightShape: "circle",
        },
        {
            title: "Toggle trips",
            description:
                "Use Trips at the top to switch between your trips from anywhere.",
            icon: Briefcase,
            targetSelector: '[data-vaivia-mobile-tour-target="trip-switcher"]',
            placement: "top-right",
            highlightShape: "rounded",
        },
    ],
};

function getTripOverviewRoute(pathname: string | null) {
    if (!pathname) return false;
    const match = pathname.match(/^\/trips\/([^/]+)\/?$/);
    return Boolean(match && match[1] !== "new");
}

function getMobileTourForPath(pathname: string | null): MobileTourKind | null {
    if (pathname === "/") return "home";
    if (getTripOverviewRoute(pathname)) return "trip-overview";
    return null;
}

function getMobileTourCardClass(placement: MobileTourStep["placement"]) {
    const base =
        "fixed z-[125] w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-lime-300/25 bg-[#050712]/95 text-white shadow-2xl shadow-black/70 backdrop-blur-2xl md:hidden";

    switch (placement) {
        case "top-right":
            return `${base} right-[calc(1rem+var(--safe-area-right))] top-[calc(4.75rem+var(--safe-area-top))]`;
        case "calendar-section":
            return `${base} left-4 top-[calc(48vh+var(--safe-area-top))]`;
        case "task-section":
            return `${base} right-4 top-[calc(58vh+var(--safe-area-top))]`;
        case "bottom-left":
            return `${base} left-4 bottom-[calc(6.35rem+var(--safe-area-bottom))]`;
        case "bottom-right":
        default:
            return `${base} right-4 bottom-[calc(6.35rem+var(--safe-area-bottom))]`;
    }
}

function getMobileTourPointerClass(placement: MobileTourStep["placement"]) {
    switch (placement) {
        case "top-right":
            return "absolute -top-3 right-10 h-6 w-6 rotate-45 border-l border-t border-lime-300/25 bg-[#050712]/95";
        case "bottom-left":
            return "absolute -bottom-3 left-12 h-6 w-6 rotate-45 border-b border-r border-lime-300/25 bg-[#050712]/95";
        case "bottom-right":
            return "absolute -bottom-3 right-12 h-6 w-6 rotate-45 border-b border-r border-lime-300/25 bg-[#050712]/95";
        case "calendar-section":
            return "absolute -top-3 left-12 h-6 w-6 rotate-45 border-l border-t border-lime-300/25 bg-[#050712]/95";
        case "task-section":
        default:
            return "absolute -top-3 right-12 h-6 w-6 rotate-45 border-l border-t border-lime-300/25 bg-[#050712]/95";
    }
}

function getMobileTourHighlightStyle(
    rect: MobileTourHighlightRect | null,
    step: MobileTourStep | null
) {
    if (!rect || !step) return undefined;

    const padding = step.highlightShape === "circle" ? 7 : 8;
    return {
        left: `${Math.max(8, rect.left - padding)}px`,
        top: `${Math.max(8, rect.top - padding)}px`,
        width: `${rect.width + padding * 2}px`,
        height: `${rect.height + padding * 2}px`,
        borderRadius:
            step.highlightShape === "circle" ? "9999px" : "1.5rem",
    };
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
    onboardingProgress = null,
}: AppTopActionBarProps) {
    const pathname = usePathname();
    const router = useRouter();
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
    const [prominentActionNotification, setProminentActionNotification] =
        useState<AppNotification | null>(null);
    const [prominentActionError, setProminentActionError] = useState("");
    const [prominentPassportSharePreview, setProminentPassportSharePreview] =
        useState<ProminentPassportSharePreview | null>(null);
    const [isLoadingProminentPassportPreview, setIsLoadingProminentPassportPreview] =
        useState(false);
    const [isSubmittingProminentAction, setIsSubmittingProminentAction] =
        useState(false);
    const [isOnboardingWelcomeOpen, setIsOnboardingWelcomeOpen] = useState(
        () =>
            onboardingProgress?.status === "in_progress" &&
            onboardingProgress.current_step === "welcome"
    );
    const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);
    const [activeMobileTour, setActiveMobileTour] =
        useState<MobileTourKind | null>(null);
    const [activeMobileTourIndex, setActiveMobileTourIndex] = useState(0);
    const [mobileTourHighlightRect, setMobileTourHighlightRect] =
        useState<MobileTourHighlightRect | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const openMenuRef = useRef<"trips" | "notifications" | null>(openMenu);
    const previousOpenMenuRef = useRef<"trips" | "notifications" | null>(openMenu);
    const remindedActionNotificationIdsRef = useRef<Set<string>>(new Set());
    const dropdownPreviewNotifications = visibleNotifications.slice(0, 7);
    const dropdownNotificationCount = hasSyncedNotifications
        ? visibleNotifications.length
        : 0;
    const activeMobileTourSteps = activeMobileTour
        ? MOBILE_TOUR_STEPS[activeMobileTour]
        : [];
    const activeMobileTourStep =
        activeMobileTourSteps[activeMobileTourIndex] || null;

    function exitRolePreview() {
        setStoredRolePreview(null);
        window.location.reload();
    }

    function completeMobileTour(tourKind: MobileTourKind | null) {
        if (tourKind && typeof window !== "undefined") {
            window.localStorage.setItem(
                MOBILE_TOUR_STORAGE_KEYS[tourKind],
                "complete"
            );
        }

        setActiveMobileTour(null);
        setActiveMobileTourIndex(0);
        setMobileTourHighlightRect(null);
    }

    useEffect(() => {
        if (hasSyncedNotifications) return;
        setVisibleNotifications(notifications);
    }, [hasSyncedNotifications, notifications]);

    useEffect(() => {
        setIsOnboardingWelcomeOpen(
            onboardingProgress?.status === "in_progress" &&
                onboardingProgress.current_step === "welcome"
        );
    }, [onboardingProgress]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (activeMobileTour) return;
        if (prominentActionNotification) return;
        if (isOnboardingWelcomeOpen) return;
        if (onboardingProgress?.status === "in_progress") return;

        const tourKind = getMobileTourForPath(pathname);
        if (!tourKind) return;

        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        if (!isMobile) return;

        const storageKey = MOBILE_TOUR_STORAGE_KEYS[tourKind];
        if (window.localStorage.getItem(storageKey) === "complete") return;

        let attempt = 0;
        let timeoutId: number | undefined;

        const tryStartTour = () => {
            const firstStep = MOBILE_TOUR_STEPS[tourKind][0];
            const target = document.querySelector(firstStep.targetSelector);
            const loadingScreen = document.querySelector(".vaivia-loading-screen");

            if (target && !loadingScreen) {
                setActiveMobileTour(tourKind);
                setActiveMobileTourIndex(0);
                return;
            }

            attempt += 1;
            if (attempt < 24) {
                timeoutId = window.setTimeout(tryStartTour, 250);
            }
        };

        timeoutId = window.setTimeout(tryStartTour, 450);

        return () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [
        activeMobileTour,
        isOnboardingWelcomeOpen,
        onboardingProgress?.status,
        pathname,
        prominentActionNotification,
    ]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!activeMobileTourStep) {
            setMobileTourHighlightRect(null);
            return;
        }

        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        function measureTarget({ scroll }: { scroll: boolean }) {
            const target = document.querySelector<HTMLElement>(
                activeMobileTourStep.targetSelector
            );

            if (!target) {
                setMobileTourHighlightRect(null);
                return;
            }

            if (scroll && activeMobileTourStep.scrollIntoView) {
                target.scrollIntoView({
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                    block: "center",
                    inline: "nearest",
                });
            }

            window.requestAnimationFrame(() => {
                const nextRect = target.getBoundingClientRect();
                setMobileTourHighlightRect({
                    left: nextRect.left,
                    top: nextRect.top,
                    width: nextRect.width,
                    height: nextRect.height,
                });
            });
        }

        const handleViewportChange = () => measureTarget({ scroll: false });

        measureTarget({ scroll: true });
        const settleTimeout = window.setTimeout(
            handleViewportChange,
            activeMobileTourStep.scrollIntoView ? 420 : 80
        );

        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, {
            passive: true,
        });

        return () => {
            window.clearTimeout(settleTimeout);
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange);
        };
    }, [activeMobileTourStep]);

    useEffect(() => {
        void refreshNotifications();
    }, []);

    useEffect(() => {
        function handleNotificationsChanged() {
            void refreshNotifications();
        }

        window.addEventListener(
            "vaivia:notifications-changed",
            handleNotificationsChanged
        );

        return () => {
            window.removeEventListener(
                "vaivia:notifications-changed",
                handleNotificationsChanged
            );
        };
    }, []);

    useEffect(() => {
        if (
            !hasSyncedNotifications ||
            prominentActionNotification ||
            activeInviteNotification ||
            activeFriendNotification ||
            activePassportStampNotification
        ) {
            return;
        }

        const nextNotification = visibleNotifications.find(
            (notification) =>
                isProminentActionNotification(notification) &&
                !remindedActionNotificationIdsRef.current.has(notification.id)
        );

        if (nextNotification) {
            setProminentActionError("");
            setProminentActionNotification(nextNotification);
        }
    }, [
        activeFriendNotification,
        activeInviteNotification,
        activePassportStampNotification,
        hasSyncedNotifications,
        prominentActionNotification,
        visibleNotifications,
    ]);

    useEffect(() => {
        if (
            !prominentActionNotification ||
            prominentActionNotification.type !== "passport_stamp_share_received"
        ) {
            setProminentPassportSharePreview(null);
            setIsLoadingProminentPassportPreview(false);
            return;
        }

        const shareId = getNotificationMetadataString(
            prominentActionNotification,
            "shareId"
        );

        if (!shareId) {
            setProminentPassportSharePreview(null);
            setIsLoadingProminentPassportPreview(false);
            return;
        }

        let isCancelled = false;

        async function loadPassportStampPreview() {
            const supabase = createClient();
            setIsLoadingProminentPassportPreview(true);

            const { data, error } = await supabase.rpc(
                "get_passport_stamp_share_review",
                { share_id: shareId }
            );

            if (isCancelled) return;

            if (error) {
                console.warn("Could not load passport stamp preview:", {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                });
                setProminentPassportSharePreview(null);
            } else {
                setProminentPassportSharePreview(
                    (data as ProminentPassportSharePreview | null) || null
                );
            }

            setIsLoadingProminentPassportPreview(false);
        }

        void loadPassportStampPreview();

        return () => {
            isCancelled = true;
        };
    }, [prominentActionNotification]);

    useEffect(() => {
        openMenuRef.current = openMenu;

        if (
            previousOpenMenuRef.current === "notifications" &&
            openMenu !== "notifications"
        ) {
            void refreshNotifications();
        }

        previousOpenMenuRef.current = openMenu;
    }, [openMenu]);

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
                        if (openMenuRef.current === "notifications") return;
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

    async function refreshNotifications() {
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
        if (notification.read_at) return true;

        const supabase = createClient();
        const { error } = await supabase.rpc("mark_app_alert_read", {
            alert_id: notification.id,
        });

        if (error) {
            console.warn("Could not mark notification read:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            return false;
        }

        return true;
    }

    async function handleNotificationClick(notification: AppNotification) {
        const actionHref = getNotificationActionHref(notification);
        if (actionHref) {
            const didMarkRead = await markNotificationRead(notification);
            if (!didMarkRead) return;

            setVisibleNotifications((current) =>
                current.filter(
                    (currentNotification) =>
                        currentNotification.id !== notification.id
                )
            );
            setOpenMenu(null);
            router.push(actionHref);
            router.refresh();
            return;
        }

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

        const didMarkRead = await markNotificationRead(notification);
        if (!didMarkRead) return;

        setVisibleNotifications((current) =>
            current.filter(
                (currentNotification) => currentNotification.id !== notification.id
            )
        );
    }

    function handleProminentAccept(notification: AppNotification) {
        remindedActionNotificationIdsRef.current.add(notification.id);
        setProminentActionNotification(null);
        void handleNotificationClick(notification);
    }

    async function handleProminentDecline(notification: AppNotification) {
        const supabase = createClient();
        setIsSubmittingProminentAction(true);
        setProminentActionError("");

        try {
            if (notification.type === "trip_invite_received") {
                if (!notification.invitation_id) {
                    throw new Error("This trip invitation could not be found.");
                }

                const { error } = await supabase.rpc("decline_trip_invitation", {
                    invitation_id: notification.invitation_id,
                });

                if (error) throw error;
            } else if (notification.type === "friend_request_received") {
                const friendshipId = getNotificationMetadataString(
                    notification,
                    "friendshipId"
                );

                if (!friendshipId) {
                    throw new Error("This friend request could not be found.");
                }

                const { error } = await supabase.rpc("respond_to_friend_invitation", {
                    friendship_id: friendshipId,
                    next_status: "declined",
                });

                if (error) throw error;
            } else if (notification.type === "passport_stamp_share_received") {
                const shareId = getNotificationMetadataString(notification, "shareId");

                if (!shareId) {
                    throw new Error("This passport stamp could not be found.");
                }

                const { error } = await supabase.rpc(
                    "respond_to_passport_stamp_share",
                    {
                        share_id: shareId,
                        next_status: "declined",
                        stamp_patch: {},
                    }
                );

                if (error) throw error;
            }

            await supabase.rpc("mark_app_alert_read", {
                alert_id: notification.id,
            });
            setVisibleNotifications((current) =>
                current.filter(
                    (currentNotification) => currentNotification.id !== notification.id
                )
            );
            setProminentActionNotification(null);
            void refreshNotifications();
        } catch (error) {
            setProminentActionError(
                error instanceof Error
                    ? error.message
                    : "Could not update this invitation."
            );
        } finally {
            setIsSubmittingProminentAction(false);
        }
    }

    function handleProminentRemindLater(notification: AppNotification) {
        remindedActionNotificationIdsRef.current.add(notification.id);
        setProminentActionNotification(null);
        setProminentActionError("");
    }

    async function planFirstTripFromWelcome() {
        if (!onboardingProgress) return;
        setIsSubmittingOnboarding(true);
        const supabase = createClient();
        const { error } = await markOnboardingStepCompleted({
            supabase,
            userId: onboardingProgress.user_id,
            step: "welcome",
            nextStep: "create_trip",
        });
        setIsSubmittingOnboarding(false);

        if (error) {
            console.warn("Could not update onboarding progress:", {
                message: error.message,
                code: error.code,
                details: error.details,
            });
            return;
        }

        setIsOnboardingWelcomeOpen(false);
        router.push("/trips/new?onboarding=1");
    }

    async function dismissWelcomeOnboarding() {
        if (!onboardingProgress) {
            setIsOnboardingWelcomeOpen(false);
            return;
        }

        setIsSubmittingOnboarding(true);
        const supabase = createClient();
        const { error } = await dismissOnboarding(
            supabase,
            onboardingProgress.user_id
        );
        setIsSubmittingOnboarding(false);

        if (error) {
            console.warn("Could not dismiss onboarding:", {
                message: error.message,
                code: error.code,
                details: error.details,
            });
        }

        setIsOnboardingWelcomeOpen(false);
        router.refresh();
    }

    const prominentActionCopy = prominentActionNotification
        ? getProminentActionCopy(prominentActionNotification)
        : null;
    const prominentPassportStamp =
        prominentActionNotification?.type === "passport_stamp_share_received"
            ? prominentPassportSharePreview?.source_stamp || null
            : null;
    const prominentPassportSenderName =
        prominentActionNotification?.type === "passport_stamp_share_received"
            ? prominentPassportSharePreview?.sender?.displayName ||
              getNotificationMetadataString(
                  prominentActionNotification,
                  "senderName"
              ) ||
              "A friend"
            : "";
    const prominentPassportSenderAvatarUrl =
        prominentActionNotification?.type === "passport_stamp_share_received"
            ? prominentPassportSharePreview?.sender?.avatarUrl ||
              getNotificationMetadataString(
                  prominentActionNotification,
                  "senderAvatarUrl"
              )
            : "";

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
            {prominentActionNotification && prominentActionCopy ? (
                <Portal>
                    <AnimatedModal
                        onClose={() =>
                            handleProminentRemindLater(prominentActionNotification)
                        }
                        className="z-[130] items-center bg-slate-950/70"
                        panelClassName="max-w-lg overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/70"
                        labelledBy="prominent-action-notification-title"
                    >
                        {() => (
                            <div className="space-y-5 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-lime-300/25 bg-lime-300/10 text-sm font-black uppercase text-lime-100 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.18)]">
                                            {prominentActionNotification.type ===
                                                "passport_stamp_share_received" &&
                                            prominentPassportSenderAvatarUrl ? (
                                                <img
                                                    src={prominentPassportSenderAvatarUrl}
                                                    alt=""
                                                    className="h-full w-full rounded-full object-cover"
                                                />
                                            ) : prominentActionNotification.type ===
                                              "passport_stamp_share_received" ? (
                                                getInitials(prominentPassportSenderName)
                                            ) : (
                                                getProminentActionInitial(
                                                    prominentActionNotification
                                                )
                                            )}
                                        </span>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                                {prominentActionCopy.eyebrow}
                                            </p>
                                            <h2
                                                id="prominent-action-notification-title"
                                                className="mt-1 text-2xl font-black"
                                            >
                                                {prominentActionCopy.title}
                                            </h2>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleProminentRemindLater(
                                                prominentActionNotification
                                            )
                                        }
                                        disabled={isSubmittingProminentAction}
                                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-50"
                                        aria-label="Remind me later"
                                    >
                                        ×
                                    </button>
                                </div>

                                {prominentActionNotification.type !==
                                "passport_stamp_share_received" ? (
                                    <p className="text-sm font-semibold leading-6 text-slate-300">
                                        {prominentActionCopy.body}
                                    </p>
                                ) : null}

                                {prominentActionNotification.type ===
                                "passport_stamp_share_received" ? (
                                    <div className="mt-4 flex justify-center">
                                        {isLoadingProminentPassportPreview ? (
                                            <div className="flex h-40 w-40 items-center justify-center rounded-full border border-lime-300/20 bg-slate-950/70 text-center text-xs font-black uppercase tracking-[0.18em] text-lime-100">
                                                Loading stamp
                                            </div>
                                        ) : prominentPassportStamp ? (
                                            <PassportStampCard
                                                countryName={
                                                    prominentPassportStamp.stamp_display_country_name ||
                                                    prominentPassportStamp.country_name ||
                                                    prominentPassportStamp.country_code
                                                }
                                                countryCode={
                                                    prominentPassportStamp.country_code
                                                }
                                                flagEmoji={
                                                    prominentPassportStamp.stamp_display_flag ||
                                                    prominentPassportStamp.flag_emoji ||
                                                    ""
                                                }
                                                firstVisitYear={getYearFromDate(
                                                    prominentPassportStamp.first_visited_on
                                                )}
                                                welcomeLabel={
                                                    prominentPassportStamp.welcome_label_snapshot ||
                                                    prominentPassportStamp.arrival_label_snapshot ||
                                                    "WELCOME"
                                                }
                                                airportCode={
                                                    prominentPassportStamp.first_entry_iata_code ||
                                                    prominentPassportStamp.first_entry_icao_code
                                                }
                                                airportCity={
                                                    prominentPassportStamp.visit_city ||
                                                    prominentPassportStamp.first_entry_city
                                                }
                                                portOfEntryLabel={
                                                    prominentPassportStamp.port_of_entry_name ||
                                                    prominentPassportStamp.first_entry_airport_name
                                                }
                                                size="sm"
                                            />
                                        ) : (
                                            <div className="flex h-40 w-40 items-center justify-center rounded-full border border-lime-300/20 bg-slate-950/70 p-5 text-center text-xs font-bold leading-5 text-slate-300">
                                                Stamp preview will appear when you
                                                review.
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {prominentActionError ? (
                                    <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                        {prominentActionError}
                                    </p>
                                ) : null}

                                <div
                                    className={`grid gap-2 border-t border-white/10 pt-4 ${
                                        prominentActionCopy.showDecline === false
                                            ? "sm:grid-cols-2"
                                            : "sm:grid-cols-3"
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleProminentRemindLater(
                                                prominentActionNotification
                                            )
                                        }
                                        disabled={isSubmittingProminentAction}
                                        className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                                    >
                                        {prominentActionCopy.remindLabel ||
                                            "Remind me later"}
                                    </button>
                                    {prominentActionCopy.showDecline === false ? null : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleProminentDecline(
                                                    prominentActionNotification
                                                )
                                            }
                                            disabled={isSubmittingProminentAction}
                                            className="rounded-full border border-red-300/30 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-400/10 disabled:opacity-50"
                                        >
                                            {isSubmittingProminentAction
                                                ? "Saving..."
                                                : "Decline"}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleProminentAccept(
                                                prominentActionNotification
                                            )
                                        }
                                        disabled={isSubmittingProminentAction}
                                        className="rounded-full bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-50"
                                    >
                                        {prominentActionCopy.acceptLabel}
                                    </button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {isOnboardingWelcomeOpen && !prominentActionNotification ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => void dismissWelcomeOnboarding()}
                        className="z-[120] items-center bg-slate-950/70"
                        panelClassName="max-w-lg overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/70"
                        labelledBy="onboarding-welcome-title"
                    >
                        {() => (
                            <div className="space-y-5 p-6">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                                        Welcome to VAIVIA
                                    </p>
                                    <h2
                                        id="onboarding-welcome-title"
                                        className="mt-3 text-3xl font-black tracking-tight"
                                    >
                                        Your whole trip, finally in one place.
                                    </h2>
                                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                                        Save ideas, build the plan, keep bookings
                                        together, and travel with your people.
                                    </p>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                    <button
                                        type="button"
                                        onClick={() => void planFirstTripFromWelcome()}
                                        disabled={isSubmittingOnboarding}
                                        className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-60"
                                    >
                                        Plan my first trip
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void dismissWelcomeOnboarding()}
                                        disabled={isSubmittingOnboarding}
                                        className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-60"
                                    >
                                        Explore on my own
                                    </button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {activeMobileTour && activeMobileTourStep ? (
                <Portal>
                    {(() => {
                        const Icon = activeMobileTourStep.icon;
                        const isFirst = activeMobileTourIndex === 0;
                        const isLast =
                            activeMobileTourIndex ===
                            activeMobileTourSteps.length - 1;

                        return (
                            <>
                                <div
                                    className="pointer-events-none fixed z-[124] border-2 border-lime-300/75 bg-lime-300/10 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.45)] transition-[left,top,width,height,border-radius] duration-300 md:hidden"
                                    style={getMobileTourHighlightStyle(
                                        mobileTourHighlightRect,
                                        activeMobileTourStep
                                    )}
                                    aria-hidden="true"
                                />
                                <aside
                                    className={getMobileTourCardClass(
                                        activeMobileTourStep.placement
                                    )}
                                    role="dialog"
                                    aria-modal="false"
                                    aria-labelledby="mobile-context-tour-title"
                                >
                                    <span
                                        className={getMobileTourPointerClass(
                                            activeMobileTourStep.placement
                                        )}
                                        aria-hidden="true"
                                    />
                                    <div className="relative z-10 space-y-4 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.16)]">
                                                    <Icon
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200">
                                                        Quick tour{" "}
                                                        {activeMobileTourIndex + 1} of{" "}
                                                        {activeMobileTourSteps.length}
                                                    </p>
                                                    <h2
                                                        id="mobile-context-tour-title"
                                                        className="mt-1 text-xl font-black"
                                                    >
                                                        {activeMobileTourStep.title}
                                                    </h2>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    completeMobileTour(
                                                        activeMobileTour
                                                    )
                                                }
                                                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.1]"
                                                aria-label="Close tour"
                                            >
                                                ×
                                            </button>
                                        </div>

                                        <p className="rounded-[1.15rem] border border-white/10 bg-white/[0.05] p-3 text-sm font-semibold leading-6 text-slate-300">
                                            {activeMobileTourStep.description}
                                        </p>

                                        <div className="flex justify-center gap-2">
                                            {activeMobileTourSteps.map(
                                                (step, index) => (
                                                    <button
                                                        key={step.title}
                                                        type="button"
                                                        onClick={() =>
                                                            setActiveMobileTourIndex(
                                                                index
                                                            )
                                                        }
                                                        className={`h-2.5 rounded-full transition-all ${
                                                            index ===
                                                            activeMobileTourIndex
                                                                ? "w-8 bg-lime-300"
                                                                : "w-2.5 bg-white/20"
                                                        }`}
                                                        aria-label={`Show tour step ${
                                                            index + 1
                                                        }`}
                                                    />
                                                )
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setActiveMobileTourIndex(
                                                        (current) =>
                                                            Math.max(current - 1, 0)
                                                    )
                                                }
                                                disabled={isFirst}
                                                className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isLast) {
                                                        completeMobileTour(
                                                            activeMobileTour
                                                        );
                                                        return;
                                                    }

                                                    setActiveMobileTourIndex(
                                                        (current) => current + 1
                                                    );
                                                }}
                                                className="rounded-full bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                            >
                                                {isLast ? "Finish" : "Next"}
                                            </button>
                                        </div>
                                    </div>
                                </aside>
                            </>
                        );
                    })()}
                </Portal>
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
                        data-vaivia-mobile-tour-target="trip-switcher"
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
                            ) : dropdownPreviewNotifications.length > 0 ? (
                                dropdownPreviewNotifications.map((notification) => {
                                    const isPassportStampShare =
                                        notification.type ===
                                        "passport_stamp_share_received";
                                    const isActionRequired =
                                        isActionRequiredNotification(notification);
                                    const senderName = getNotificationMetadataString(
                                        notification,
                                        "senderName"
                                    );
                                    const senderAvatarUrl =
                                        getNotificationMetadataString(
                                            notification,
                                            "senderAvatarUrl"
                                    );

                                    return (
                                        <div
                                            key={notification.id}
                                            className={`block w-full rounded-2xl px-3 py-2 text-left transition hover:bg-white/10 ${
                                                notification.read_at
                                                    ? "bg-transparent"
                                                    : "bg-lime-300/10"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                {!isActionRequired ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleNotificationClick(
                                                                notification
                                                            )
                                                        }
                                                        className="mt-1 inline-flex !h-5 !min-h-5 !w-5 !min-w-5 shrink-0 items-center justify-center rounded-full border border-lime-300/45 bg-slate-950/80 p-0 text-lime-200 transition hover:border-lime-200 hover:bg-lime-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                                                        aria-label="Mark notification done"
                                                        title="Mark done"
                                                    >
                                                        <Check
                                                            className="h-3 w-3"
                                                            aria-hidden="true"
                                                        />
                                                    </button>
                                                ) : isPassportStampShare ? (
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-lime-300/25 bg-slate-950 text-[10px] font-black uppercase text-lime-100">
                                                        {senderAvatarUrl ? (
                                                            <img
                                                                src={senderAvatarUrl}
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : senderName ? (
                                                            getInitials(senderName)
                                                        ) : (
                                                            <Stamp
                                                                className="h-4 w-4 text-lime-200"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime-300" />
                                                )}

                                                <div className="min-w-0 flex-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (isActionRequired) {
                                                                void handleNotificationClick(
                                                                    notification
                                                                );
                                                            }
                                                        }}
                                                        disabled={!isActionRequired}
                                                        className="block w-full min-h-0 rounded-xl text-left disabled:cursor-default"
                                                    >
                                                        <span className="block text-sm font-semibold text-white">
                                                            {isPassportStampShare &&
                                                            senderName
                                                                ? senderName
                                                                : notification.title ||
                                                                  "Notification"}
                                                        </span>
                                                        {isPassportStampShare ? (
                                                            <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                                                                Passport stamp
                                                                received
                                                            </span>
                                                        ) : null}
                                                        <span className="mt-0.5 block text-xs text-slate-400">
                                                            {notification.body}
                                                        </span>
                                                    </button>

                                                    {isActionRequired ? (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleNotificationClick(
                                                                    notification
                                                                )
                                                            }
                                                            className="mt-2 inline-flex rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-slate-950 transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                                                        >
                                                            Review
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
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
