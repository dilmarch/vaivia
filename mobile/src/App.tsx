import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLoading } from "./components/AppLoading";
import { MobileAppChrome } from "./components/MobileAppChrome";
import { useMobileAuth } from "./auth/AuthProvider";
import { AuthScreen } from "./screens/AuthScreens";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TripDetailScreen } from "./screens/TripDetailScreen";
import { TripItineraryScreen } from "./screens/TripItineraryScreen";
import { TripIdeasScreen } from "./screens/TripIdeasScreen";
import { TripBudgetScreen } from "./screens/TripBudgetScreen";
import { TripTransportScreen } from "./screens/TripTransportScreen";
import { TripStaysScreen } from "./screens/TripStaysScreen";
import { TripFoodScreen } from "./screens/TripFoodScreen";
import { TripHealthSafetyScreen } from "./screens/TripHealthSafetyScreen";
import { TripAssistantScreen } from "./screens/TripAssistantScreen";
import { NotificationHistoryScreen } from "./screens/NotificationHistoryScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { TripCreateScreen } from "./screens/TripCreateScreen";
import { TripManageScreen } from "./screens/TripManageScreen";
import { ItineraryItemEditorScreen } from "./screens/ItineraryItemEditorScreen";
import { TravelImportsScreen } from "./screens/TravelImportsScreen";
import { TravelImportReviewScreen } from "./screens/TravelImportReviewScreen";
import { FriendProfileScreen } from "./screens/FriendProfileScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { EventDetailScreen } from "./screens/EventDetailScreen";
import { MyEventsScreen } from "./screens/MyEventsScreen";
import { EventTicketScreen } from "./screens/EventTicketScreen";
import { EventCheckoutScreen } from "./screens/EventCheckoutScreen";
import { MobileApiClient } from "./lib/apiClient";
import { getMobileEnvironment } from "./lib/environment";
import type {
  MobileNotificationDestination,
  MobileTripSummary,
} from "@/lib/mobileApi/contracts";
import {
  DEFAULT_MOBILE_ROUTE,
  MOBILE_AUTH_LOGIN_ROUTE,
  isImplementedMobileRoute,
  type MobileTripView,
} from "./navigation/routes";
import { useMobileNavigation } from "./navigation/MobileNavigationProvider";

export default function App() {
  const { session, isInitializing, signOut, authCallback, clearAuthCallback } =
    useMobileAuth();
  const { route, push, replace, reset, back } = useMobileNavigation();
  const [availableTrips, setAvailableTrips] = useState<
    Array<Pick<MobileTripSummary, "id" | "title">>
  >([]);
  const [accountSetupError, setAccountSetupError] = useState("");
  const handledConfirmationRef = useRef(false);
  const environment = useMemo(() => getMobileEnvironment(), []);
  const accessToken = session?.access_token || null;
  const authenticatedUserId = session?.user.id || null;
  const sessionExists = Boolean(session);
  const selectedTripId =
    route.name === "trip" || route.name === "trip-manage" ? route.tripId : null;
  const activeTripView = route.name === "trip" ? route.view : null;

  const returnToLogin = useCallback(async () => {
    reset(MOBILE_AUTH_LOGIN_ROUTE);
    try {
      await signOut();
    } catch {
      // The local auth state will still be reconciled by Supabase's listener.
    }
  }, [reset, signOut]);

  useEffect(() => {
    if (!isInitializing && !session && route.name !== "auth") {
      reset(MOBILE_AUTH_LOGIN_ROUTE);
    }
  }, [isInitializing, reset, route.name, session]);

  useEffect(() => {
    if (session && !isImplementedMobileRoute(route)) {
      reset(DEFAULT_MOBILE_ROUTE);
    }
  }, [reset, route, session]);

  useEffect(() => {
    if (session && route.name === "auth" && route.view !== "update-password") {
      reset(DEFAULT_MOBILE_ROUTE);
    }
  }, [reset, route, session]);

  const apiClient = useMemo(
    () =>
      new MobileApiClient({
        baseUrl: environment.apiBaseUrl,
        onUnauthorized: returnToLogin,
        getAuthState() {
          return {
            sessionExists,
            accessToken,
            authenticatedUserId,
          };
        },
      }),
    [
      accessToken,
      authenticatedUserId,
      environment.apiBaseUrl,
      returnToLogin,
      sessionExists,
    ],
  );

  const handleHomeTripsLoaded = useCallback(
    (trips: Array<{ id: string; title: string }>) => {
      setAvailableTrips(trips.map(({ id, title }) => ({ id, title })));
    },
    [],
  );

  useEffect(() => {
    if (!session || !authCallback) return;
    if (
      authCallback.kind === "recovery" &&
      authCallback.status === "complete"
    ) {
      replace({ name: "auth", view: "update-password" });
      return;
    }
    if (
      authCallback.kind !== "confirmation" ||
      authCallback.status !== "complete" ||
      handledConfirmationRef.current
    )
      return;
    handledConfirmationRef.current = true;
    void apiClient
      .confirmAccount({ idempotencyKey: `confirmation:${session.user.id}` })
      .then(() => {
        clearAuthCallback();
        setAccountSetupError("");
        reset(DEFAULT_MOBILE_ROUTE);
      })
      .catch((error: unknown) => {
        handledConfirmationRef.current = false;
        setAccountSetupError(
          error instanceof Error
            ? error.message
            : "VAIVIA could not finish account setup.",
        );
      });
  }, [apiClient, authCallback, clearAuthCallback, replace, reset, session]);

  if (isInitializing) return <AppLoading />;
  if (!session) {
    const authRoute = route.name === "auth" ? route : MOBILE_AUTH_LOGIN_ROUTE;
    return (
      <AuthScreen
        view={authRoute.view}
        initialEmail={"email" in authRoute ? authRoute.email : undefined}
        callbackError={
          authCallback?.status === "error" ? authCallback.message : undefined
        }
        onNavigate={(view, email) => push({ name: "auth", view, email })}
        onAuthenticated={() => reset(DEFAULT_MOBILE_ROUTE)}
      />
    );
  }
  if (route.name === "auth") {
    if (route.view !== "update-password") {
      return <AppLoading />;
    }
    return (
      <AuthScreen
        view="update-password"
        onNavigate={() => reset(DEFAULT_MOBILE_ROUTE)}
        onAuthenticated={() => reset(DEFAULT_MOBILE_ROUTE)}
      />
    );
  }

  function selectTrip(tripId: string) {
    push({ name: "trip", tripId, view: "overview" });
  }

  function openTrips() {
    push({ name: "trips" });
  }

  function openHome() {
    push({ name: "home" });
  }

  function openNotificationHistory() {
    push({ name: "notifications" });
  }

  function openNotificationDestination(
    destination: MobileNotificationDestination,
  ) {
    if (destination.name === "trip")
      push({
        name: "trip",
        tripId: destination.tripId,
        view: destination.view,
      });
    else if (destination.name === "travel-import")
      push({ name: "travel-import", importId: destination.importId });
    else if (destination.name === "friend-profile")
      push({ name: "friend-profile", userId: destination.userId });
    else if (destination.name === "settings") push({ name: "settings" });
    else push({ name: "profile" });
  }

  function openTripView(view: MobileTripView) {
    if (!selectedTripId) return;
    push({ name: "trip", tripId: selectedTripId, view });
  }

  const authenticatedScreen =
    route.name === "home" ? (
      <HomeScreen
        apiClient={apiClient}
        onTripsLoaded={handleHomeTripsLoaded}
        onTrips={openTrips}
        onTrip={(tripId, view) => push({ name: "trip", tripId, view })}
        onProfile={() => push({ name: "profile" })}
      />
    ) : route.name === "profile" ? (
      <ProfileScreen
        apiClient={apiClient}
        onSettings={() => push({ name: "settings" })}
        onSignOut={returnToLogin}
        onFriend={(userId) => push({ name: "friend-profile", userId })}
      />
    ) : route.name === "friend-profile" ? (
      <FriendProfileScreen
        apiClient={apiClient}
        userId={route.userId}
        onBack={() => back({ name: "profile" })}
      />
    ) : route.name === "travel-imports" ? (
      <TravelImportsScreen
        apiClient={apiClient}
        onOpen={(importId) => push({ name: "travel-import", importId })}
        onSettings={() => push({ name: "settings", section: "communications" })}
      />
    ) : route.name === "travel-import" ? (
      <TravelImportReviewScreen
        apiClient={apiClient}
        importId={route.importId}
        currentUserId={session.user.id}
        onTrip={(tripId) =>
          replace({ name: "trip", tripId, view: "transport" })
        }
        onBack={() => back({ name: "travel-imports" })}
      />
    ) : route.name === "settings" ? (
      <SettingsScreen
        apiClient={apiClient}
        section={route.section}
        onSection={(section) => replace({ name: "settings", section })}
        onProfile={() => push({ name: "profile" })}
        onAccountClosed={returnToLogin}
      />
    ) : route.name === "events" ? (
      <EventsScreen
        apiClient={apiClient}
        onEvent={(eventId) => push({ name: "event", eventId })}
        onMyEvents={() => push({ name: "my-events" })}
      />
    ) : route.name === "event" ? (
      <EventDetailScreen
        apiClient={apiClient}
        eventId={route.eventId}
        onCheckout={(orderId, result) =>
          push({ name: "event-checkout", orderId, result })
        }
        onMyEvents={() => replace({ name: "my-events" })}
      />
    ) : route.name === "my-events" ? (
      <MyEventsScreen
        apiClient={apiClient}
        onBrowse={() => push({ name: "events" })}
        onEvent={(eventId) => push({ name: "event", eventId })}
        onTicket={(ticketId) => push({ name: "event-ticket", ticketId })}
      />
    ) : route.name === "event-ticket" ? (
      <EventTicketScreen
        apiClient={apiClient}
        ticketId={route.ticketId}
        onBack={() => back({ name: "my-events" })}
      />
    ) : route.name === "event-checkout" ? (
      <EventCheckoutScreen
        apiClient={apiClient}
        orderId={route.orderId}
        resultHint={route.result}
        onMyEvents={() => replace({ name: "my-events" })}
      />
    ) : route.name === "notifications" ? (
      <NotificationHistoryScreen
        apiClient={apiClient}
        onBack={() => back(DEFAULT_MOBILE_ROUTE)}
        onNavigate={openNotificationDestination}
      />
    ) : route.name === "trip-create" ? (
      <TripCreateScreen
        apiClient={apiClient}
        onCreated={(tripId) => {
          setAvailableTrips((current) =>
            current.some((trip) => trip.id === tripId)
              ? current
              : [...current, { id: tripId, title: "New trip" }],
          );
          replace({ name: "trip", tripId, view: "overview" });
        }}
      />
    ) : route.name === "trip-manage" ? (
      <TripManageScreen
        apiClient={apiClient}
        tripId={route.tripId}
        onDeleted={() => reset({ name: "trips" })}
        onUpdated={() =>
          replace({ name: "trip", tripId: route.tripId, view: "overview" })
        }
      />
    ) : selectedTripId ? (
      activeTripView === "itinerary" ? (
        route.name === "trip" && route.itemId ? (
          <ItineraryItemEditorScreen
            apiClient={apiClient}
            tripId={selectedTripId}
            itemId={route.itemId === "new" ? undefined : route.itemId}
            onSaved={() =>
              replace({
                name: "trip",
                tripId: selectedTripId,
                view: "itinerary",
              })
            }
            onCancel={() =>
              back({ name: "trip", tripId: selectedTripId, view: "itinerary" })
            }
          />
        ) : (
          <TripItineraryScreen
            apiClient={apiClient}
            tripId={selectedTripId}
            onAdd={() =>
              push({
                name: "trip",
                tripId: selectedTripId,
                view: "itinerary",
                itemId: "new",
              })
            }
            onEdit={(itemId) =>
              push({
                name: "trip",
                tripId: selectedTripId,
                view: "itinerary",
                itemId,
              })
            }
          />
        )
      ) : activeTripView === "ideas" ? (
        <TripIdeasScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          editorAction={route.name === "trip" ? route.itemId : undefined}
          onEditorAction={(itemId) =>
            push({
              name: "trip",
              tripId: selectedTripId,
              view: "ideas",
              itemId,
            })
          }
          onEditorClose={() =>
            back({ name: "trip", tripId: selectedTripId, view: "ideas" })
          }
        />
      ) : activeTripView === "budget" ? (
        <TripBudgetScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          editorAction={route.name === "trip" ? route.itemId : undefined}
          onEditorAction={(itemId) =>
            push({
              name: "trip",
              tripId: selectedTripId,
              view: "budget",
              itemId,
            })
          }
          onEditorClose={() =>
            back({ name: "trip", tripId: selectedTripId, view: "budget" })
          }
        />
      ) : activeTripView === "transport" ? (
        <TripTransportScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          editorAction={route.name === "trip" ? route.itemId : undefined}
          onEditorAction={(itemId) =>
            push({
              name: "trip",
              tripId: selectedTripId,
              view: "transport",
              itemId,
            })
          }
          onEditorClose={() =>
            back({ name: "trip", tripId: selectedTripId, view: "transport" })
          }
        />
      ) : activeTripView === "food" ? (
        <TripFoodScreen apiClient={apiClient} tripId={selectedTripId} />
      ) : activeTripView === "stays" ? (
        <TripStaysScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          editorAction={route.name === "trip" ? route.itemId : undefined}
          onEditorAction={(itemId) =>
            push({
              name: "trip",
              tripId: selectedTripId,
              view: "stays",
              itemId,
            })
          }
          onEditorClose={() =>
            back({ name: "trip", tripId: selectedTripId, view: "stays" })
          }
        />
      ) : activeTripView === "assistant" ? (
        <TripAssistantScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          tripTitle={
            availableTrips.find((trip) => trip.id === selectedTripId)?.title ||
            "your trip"
          }
        />
      ) : activeTripView === "health-safety" ? (
        <TripHealthSafetyScreen apiClient={apiClient} tripId={selectedTripId} />
      ) : (
        <TripDetailScreen
          apiClient={apiClient}
          tripId={selectedTripId}
          onItinerary={() => openTripView("itinerary")}
          onIdeas={() => openTripView("ideas")}
          onTransport={() => openTripView("transport")}
          onFood={() => openTripView("food")}
          onStays={() => openTripView("stays")}
          onManage={() => push({ name: "trip-manage", tripId: selectedTripId })}
        />
      )
    ) : (
      <TripsScreen
        apiClient={apiClient}
        onSelectTrip={selectTrip}
        onTripsLoaded={setAvailableTrips}
        onSignOut={async () => {
          reset(DEFAULT_MOBILE_ROUTE);
          await signOut();
        }}
      />
    );

  return (
    <div className="min-h-screen pb-[calc(8.5rem+var(--safe-area-bottom))] pt-[var(--safe-area-top)]">
      {authenticatedScreen}
      {accountSetupError ? (
        <p
          className="fixed left-4 right-4 top-[calc(1rem+var(--safe-area-top))] z-[100] rounded-2xl border border-red-300/25 bg-red-950/95 p-4 text-sm font-bold text-red-100"
          role="alert"
        >
          {accountSetupError}
        </p>
      ) : null}
      <MobileAppChrome
        apiClient={apiClient}
        activeRootRoute={route.name}
        trips={availableTrips}
        activeTripId={selectedTripId}
        activeTripView={selectedTripId ? activeTripView : null}
        userEmail={session.user.email}
        userRole={
          typeof session.user.app_metadata?.role === "string"
            ? session.user.app_metadata.role
            : null
        }
        onHome={openHome}
        onTrips={openTrips}
        onSelectTrip={selectTrip}
        onTripOverview={() => openTripView("overview")}
        onTripItinerary={() => openTripView("itinerary")}
        onTripIdeas={() => openTripView("ideas")}
        onTripBudget={() => openTripView("budget")}
        onTripTransport={() => openTripView("transport")}
        onTripFood={() => openTripView("food")}
        onTripStays={() => openTripView("stays")}
        onTripAssistant={() => openTripView("assistant")}
        onTripHealthSafety={() => openTripView("health-safety")}
        onNotificationHistory={openNotificationHistory}
        onTravelImports={() => push({ name: "travel-imports" })}
        onProfile={() => push({ name: "profile" })}
        onSettings={() => push({ name: "settings" })}
        onEvents={() => push({ name: "events" })}
        onMyEvents={() => push({ name: "my-events" })}
        onCreateTrip={() => push({ name: "trip-create" })}
        onCreateIdea={
          selectedTripId
            ? () =>
                push({
                  name: "trip",
                  tripId: selectedTripId,
                  view: "ideas",
                  itemId: "new",
                })
            : undefined
        }
        onCreateExpense={
          selectedTripId
            ? () =>
                push({
                  name: "trip",
                  tripId: selectedTripId,
                  view: "budget",
                  itemId: "add-expense",
                })
            : undefined
        }
        onCreateTransportation={
          selectedTripId
            ? () =>
                push({
                  name: "trip",
                  tripId: selectedTripId,
                  view: "transport",
                  itemId: "new",
                })
            : undefined
        }
        onCreateStay={
          selectedTripId
            ? () =>
                push({
                  name: "trip",
                  tripId: selectedTripId,
                  view: "stays",
                  itemId: "new",
                })
            : undefined
        }
        onSignOut={async () => {
          await returnToLogin();
        }}
      />
    </div>
  );
}
