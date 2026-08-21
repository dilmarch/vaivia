import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLoading } from "./components/AppLoading";
import { MobileAppChrome } from "./components/MobileAppChrome";
import { useMobileAuth } from "./auth/AuthProvider";
import { LoginScreen } from "./screens/LoginScreen";
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
import { MobileApiClient } from "./lib/apiClient";
import { getMobileEnvironment } from "./lib/environment";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import {
  DEFAULT_MOBILE_ROUTE,
  isImplementedMobileRoute,
  type MobileTripView,
} from "./navigation/routes";
import { useMobileNavigation } from "./navigation/MobileNavigationProvider";

export default function App() {
  const { session, isInitializing, signOut } = useMobileAuth();
  const { route, push, reset, back } = useMobileNavigation();
  const [availableTrips, setAvailableTrips] = useState<MobileTripSummary[]>([]);
  const environment = useMemo(() => getMobileEnvironment(), []);
  const accessToken = session?.access_token || null;
  const authenticatedUserId = session?.user.id || null;
  const sessionExists = Boolean(session);
  const selectedTripId = route.name === "trip" ? route.tripId : null;
  const activeTripView = route.name === "trip" ? route.view : null;

  const returnToLogin = useCallback(async () => {
    reset(DEFAULT_MOBILE_ROUTE);
    try {
      await signOut();
    } catch {
      // The local auth state will still be reconciled by Supabase's listener.
    }
  }, [reset, signOut]);

  useEffect(() => {
    if (!isInitializing && !session) reset(DEFAULT_MOBILE_ROUTE);
  }, [isInitializing, reset, session]);

  useEffect(() => {
    if (session && !isImplementedMobileRoute(route)) {
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

  if (isInitializing) return <AppLoading />;
  if (!session) return <LoginScreen />;

  function selectTrip(tripId: string) {
    push({ name: "trip", tripId, view: "overview" });
  }

  function openTrips() {
    push(DEFAULT_MOBILE_ROUTE);
  }

  function openNotificationHistory() {
    push({ name: "notifications" });
  }

  function openTripView(view: MobileTripView) {
    if (!selectedTripId) return;
    push({ name: "trip", tripId: selectedTripId, view });
  }

  const authenticatedScreen = route.name === "notifications" ? (
    <NotificationHistoryScreen
      apiClient={apiClient}
      supportedTripIds={availableTrips.map((trip) => trip.id)}
      onBack={() => back(DEFAULT_MOBILE_ROUTE)}
      onOpenTrip={selectTrip}
    />
  ) : selectedTripId ? (
    activeTripView === "itinerary" ? (
      <TripItineraryScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "ideas" ? (
      <TripIdeasScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "budget" ? (
      <TripBudgetScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "transport" ? (
      <TripTransportScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "food" ? (
      <TripFoodScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "stays" ? (
      <TripStaysScreen apiClient={apiClient} tripId={selectedTripId} />
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
      <MobileAppChrome
        apiClient={apiClient}
        trips={availableTrips}
        activeTripId={selectedTripId}
        activeTripView={selectedTripId ? activeTripView : null}
        userEmail={session.user.email}
        userRole={
          typeof session.user.app_metadata?.role === "string"
            ? session.user.app_metadata.role
            : null
        }
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
        onSignOut={async () => {
          reset(DEFAULT_MOBILE_ROUTE);
          await signOut();
        }}
      />
    </div>
  );
}
