import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BedDouble,
  Bot,
  CalendarCheck,
  CalendarRange,
  HeartPulse,
  LayoutDashboard,
  Map,
  Newspaper,
  PiggyBank,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  UsersRound,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import {
  MobileAppChromePresentation,
  MobileNavItemPresentation,
  MobileQuickAddControlPresentation,
  NotificationItemPresentation,
  NotificationMenuFooterPresentation,
  NotificationMessagePresentation,
  NotificationsTopControlPresentation,
  QuickAddMenuItemPresentation,
  QuickAddMenuPresentation,
  SearchControlPresentation,
  TripsMenuItemPresentation,
  TripsTopMenuPresentation,
  type MobileChromeMenu,
} from "@/components/navigation/MobileAppChromePresentation";
import { isActionRequiredNotification } from "@/lib/notifications/dropdown";
import type {
  MobileNotification,
  MobileTripSummary,
} from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";

type MobileAppChromeProps = {
  apiClient: MobileApiClient;
  trips: MobileTripSummary[];
  activeTripId: string | null;
  activeTripView: "overview" | "itinerary" | "ideas" | "budget" | null;
  userEmail?: string | null;
  userRole?: string | null;
  onTrips: () => void;
  onSelectTrip: (tripId: string) => void;
  onTripOverview: () => void;
  onTripItinerary: () => void;
  onTripIdeas: () => void;
  onTripBudget: () => void;
  onSignOut: () => Promise<void>;
};

type MenuDestination = {
  label: string;
  icon: LucideIcon;
  iconContent?: ReactNode;
  active?: boolean;
  supported?: boolean;
  action?: () => void;
};

const BASE_DESTINATIONS: MenuDestination[] = [
  { label: "Events", icon: CalendarRange },
  { label: "My Events", icon: TicketCheck },
  { label: "Ask Concierge", icon: Bot },
];

const TRIP_DESTINATIONS: MenuDestination[] = [
  { label: "Trip overview", icon: LayoutDashboard },
  { label: "Itinerary", icon: CalendarCheck },
  { label: "Trip Ideas", icon: Sparkles },
  { label: "Budget", icon: PiggyBank },
  { label: "Transport", icon: Map },
  { label: "Eat & Drink", icon: Utensils },
  { label: "Stays", icon: BedDouble },
  { label: "Ask Concierge", icon: Bot },
  { label: "Health & Safety", icon: HeartPulse },
];

const QUICK_ADD_LABELS = [
  "Add trip",
  "Add transportation",
  "Add stay",
  "Add expense",
  "Add food or restaurant",
  "Add things to do",
  "Suggest new feature",
];

function DestinationItem({
  destination,
  index,
}: {
  destination: MenuDestination;
  index: number;
}) {
  const disabled = !destination.supported;

  return (
    <div
      className="animate-vaivia-add-fan-out min-w-0"
      style={{ animationDelay: `${index * 32}ms` }}
    >
      <MobileNavItemPresentation
        label={destination.label}
        icon={destination.icon}
        iconContent={destination.iconContent}
        isActive={destination.active}
        disabled={disabled}
        renderAction={(props) => (
          <button
            type="button"
            disabled={disabled}
            title={disabled ? `${destination.label} unavailable` : undefined}
            onClick={destination.action}
            {...props}
          />
        )}
      />
    </div>
  );
}

export function MobileAppChrome({
  apiClient,
  trips,
  activeTripId,
  activeTripView,
  userEmail,
  userRole,
  onTrips,
  onSelectTrip,
  onTripOverview,
  onTripItinerary,
  onTripIdeas,
  onTripBudget,
  onSignOut,
}: MobileAppChromeProps) {
  const [bottomMenu, setBottomMenu] = useState<MobileChromeMenu>(null);
  const [topMenu, setTopMenu] = useState<"trips" | "notifications" | null>(
    null,
  );
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [navigationRole, setNavigationRole] = useState(userRole || null);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string | null>(null);
  const [pendingImportCount, setPendingImportCount] = useState(0);
  const dockRef = useRef<HTMLElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const quickAddRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingNotifications(true);

    void apiClient
      .getNotifications(controller.signal)
      .then(
        ({
          notifications: loadedNotifications,
          navigationProfile,
          pendingImportCount: loadedPendingImportCount,
        }) => {
          setNotifications(loadedNotifications);
          setNavigationRole(navigationProfile?.role || userRole || null);
          setAccountAvatarUrl(navigationProfile?.avatar_url || null);
          setPendingImportCount(loadedPendingImportCount || 0);
          setNotificationsError("");
        },
      )
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNotificationsError(
          error instanceof Error
            ? error.message
            : "Could not load notifications.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingNotifications(false);
      });

    return () => controller.abort();
  }, [apiClient, userRole]);

  useEffect(() => {
    if (!bottomMenu && !topMenu && !isQuickAddOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (topRef.current && !topRef.current.contains(target)) setTopMenu(null);
      if (dockRef.current && !dockRef.current.contains(target)) {
        setBottomMenu(null);
        setIsAccountOpen(false);
      }
      if (quickAddRef.current && !quickAddRef.current.contains(target)) {
        setIsQuickAddOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [bottomMenu, isQuickAddOpen, topMenu]);

  function closeMenus() {
    setBottomMenu(null);
    setTopMenu(null);
    setIsQuickAddOpen(false);
    setIsAccountOpen(false);
  }

  function openTrips() {
    closeMenus();
    onTrips();
  }

  function selectTrip(tripId: string) {
    closeMenus();
    onSelectTrip(tripId);
  }

  const isSuperAdmin = navigationRole === "super_admin";
  const isEventOrganizer =
    isSuperAdmin || navigationRole === "event_organizer";
  const baseDestinations = [
    ...(isSuperAdmin
      ? [{ label: "News Feed", icon: Newspaper } satisfies MenuDestination]
      : []),
    BASE_DESTINATIONS[0],
    BASE_DESTINATIONS[1],
    ...(isEventOrganizer
      ? [{ label: "Manage Events", icon: UsersRound } satisfies MenuDestination]
      : []),
    BASE_DESTINATIONS[2],
  ];
  const destinations = activeTripId
    ? TRIP_DESTINATIONS.map((destination, index) => ({
        ...destination,
        active:
          (index === 0 && activeTripView === "overview") ||
          (index === 1 && activeTripView === "itinerary") ||
          (index === 2 && activeTripView === "ideas") ||
          (index === 3 && activeTripView === "budget"),
        supported: index === 0 || index === 1 || index === 2 || index === 3,
        action:
          index === 0
            ? () => {
                closeMenus();
                onTripOverview();
              }
            : index === 1
              ? () => {
                  closeMenus();
                  onTripItinerary();
                }
              : index === 2
                ? () => {
                    closeMenus();
                    onTripIdeas();
                  }
              : index === 3
                ? () => {
                    closeMenus();
                    onTripBudget();
                  }
              : undefined,
      }))
    : baseDestinations;
  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

  const disabledFooterAction = (props: {
    children: ReactNode;
    className: string;
    "aria-label": string;
  }) => (
    <button
      type="button"
      disabled
      title={`${props["aria-label"]} unavailable`}
      {...props}
      className={`${props.className} cursor-not-allowed opacity-50`}
    />
  );

  return (
    <MobileAppChromePresentation
      logo={
        // Capacitor uses the emitted local asset rather than next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="./icons/vaivia-favicon.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 rounded-[0.9rem] object-cover"
        />
      }
      renderLogoAction={(props) => (
        <button type="button" onClick={openTrips} {...props} />
      )}
      topRef={topRef}
      topControls={
        <>
          <TripsTopMenuPresentation
            isOpen={topMenu === "trips"}
            onToggle={() => {
              setTopMenu((current) =>
                current === "trips" ? null : "trips",
              );
              setBottomMenu(null);
              setIsQuickAddOpen(false);
            }}
            constrainToViewport
            renderSeeAll={(props) => (
              <button type="button" onClick={openTrips} {...props} />
            )}
          >
            {trips.length > 0 ? (
              trips.map((trip, index) => (
                <TripsMenuItemPresentation
                  key={trip.id}
                  label={trip.title?.trim() || "Untitled trip"}
                  onPress={() => selectTrip(trip.id)}
                  animationDelay={`${index * 34}ms`}
                />
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">
                No upcoming trips yet.
              </p>
            )}
          </TripsTopMenuPresentation>
          <NotificationsTopControlPresentation
            isOpen={topMenu === "notifications"}
            count={unreadCount}
            onToggle={() => {
              setTopMenu((current) =>
                current === "notifications" ? null : "notifications",
              );
              setBottomMenu(null);
              setIsQuickAddOpen(false);
            }}
            constrainToViewport
            footer={
              <NotificationMenuFooterPresentation
                pendingImportCount={pendingImportCount}
                renderImportsAction={disabledFooterAction}
                renderHistoryAction={disabledFooterAction}
              />
            }
          >
            {isLoadingNotifications ? (
              <NotificationMessagePresentation>
                Loading notifications...
              </NotificationMessagePresentation>
            ) : notificationsError ? (
              <NotificationMessagePresentation>
                {notificationsError}
              </NotificationMessagePresentation>
            ) : notifications.length > 0 ? (
              notifications.slice(0, 7).map((notification) => (
                <NotificationItemPresentation
                  key={notification.id}
                  title={notification.title || "Notification"}
                  body={notification.body}
                  read={Boolean(notification.read_at)}
                  actionRequired={isActionRequiredNotification(notification)}
                />
              ))
            ) : (
              <NotificationMessagePresentation>
                No notifications yet.
              </NotificationMessagePresentation>
            )}
          </NotificationsTopControlPresentation>
          <SearchControlPresentation
            value={searchValue}
            onChange={setSearchValue}
          />
        </>
      }
      menu={bottomMenu}
      onToggleView={() => {
        setBottomMenu((current) => (current === "view" ? null : "view"));
        setTopMenu(null);
        setIsQuickAddOpen(false);
        setIsAccountOpen(false);
      }}
      onToggleMore={() => {
        setBottomMenu((current) => (current === "more" ? null : "more"));
        setTopMenu(null);
        setIsQuickAddOpen(false);
        setIsAccountOpen(false);
      }}
      dockRef={dockRef}
      viewMenu={destinations.map((destination, index) => (
        <DestinationItem
          key={destination.label}
          destination={destination}
          index={index}
        />
      ))}
      moreMenu={
        isAccountOpen ? (
          <div className="animate-vaivia-add-fan-out w-72 rounded-[24px] border border-lime-300/20 bg-[#0c0115]/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setIsAccountOpen(false)}
              className="rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-lime-100"
            >
              Back
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
              VAIVIA account
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-slate-300">
              {userEmail || "Signed in"}
            </p>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="mt-4 w-full rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950"
            >
              Sign out
            </button>
          </div>
        ) : (
          <>
            {isSuperAdmin ? (
              <DestinationItem
                destination={{ label: "Admin", icon: ShieldCheck }}
                index={0}
              />
            ) : null}
            <DestinationItem
              destination={{ label: "Settings", icon: Settings }}
              index={isSuperAdmin ? 1 : 0}
            />
            <DestinationItem
              destination={{
                label: "Account",
                icon: UserRound,
                iconContent: accountAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={accountAvatarUrl}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : undefined,
                supported: true,
                action: () => setIsAccountOpen(true),
              }}
              index={isSuperAdmin ? 2 : 1}
            />
          </>
        )
      }
      quickAdd={
        <MobileQuickAddControlPresentation
          containerRef={quickAddRef}
          isOpen={isQuickAddOpen}
          onToggle={() => {
            setIsQuickAddOpen((current) => !current);
            setTopMenu(null);
            setBottomMenu(null);
            setIsAccountOpen(false);
          }}
          menu={
            isQuickAddOpen ? (
              <QuickAddMenuPresentation constrainToViewport>
                {QUICK_ADD_LABELS.map((label, index) => (
                  <QuickAddMenuItemPresentation
                    key={label}
                    label={label}
                    disabled
                    animationDelay={`${index * 34}ms`}
                  />
                ))}
              </QuickAddMenuPresentation>
            ) : null
          }
        />
      }
    />
  );
}
