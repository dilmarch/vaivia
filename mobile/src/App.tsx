import { useMemo, useState } from "react";
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

export default function App() {
  const { session, isInitializing, signOut } = useMobileAuth();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activeGlobalView, setActiveGlobalView] = useState<
    "trips" | "notifications"
  >("trips");
  const [activeTripView, setActiveTripView] = useState<
    | "overview"
    | "itinerary"
    | "ideas"
    | "budget"
    | "transport"
    | "food"
    | "stays"
    | "assistant"
    | "health-safety"
  >("overview");
  const [availableTrips, setAvailableTrips] = useState<MobileTripSummary[]>([]);
  const environment = useMemo(() => getMobileEnvironment(), []);
  const accessToken = session?.access_token || null;
  const authenticatedUserId = session?.user.id || null;
  const sessionExists = Boolean(session);
  const apiClient = useMemo(
    () =>
      new MobileApiClient({
        baseUrl: environment.apiBaseUrl,
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
      sessionExists,
    ],
  );

  if (isInitializing) return <AppLoading />;
  if (!session) return <LoginScreen />;

  function selectTrip(tripId: string) {
    setActiveGlobalView("trips");
    setSelectedTripId(tripId);
    setActiveTripView("overview");
  }

  function openTrips() {
    setActiveGlobalView("trips");
    setSelectedTripId(null);
    setActiveTripView("overview");
  }

  function openNotificationHistory() {
    setSelectedTripId(null);
    setActiveGlobalView("notifications");
  }

  const authenticatedScreen = activeGlobalView === "notifications" ? (
    <NotificationHistoryScreen
      apiClient={apiClient}
      supportedTripIds={availableTrips.map((trip) => trip.id)}
      onBack={openTrips}
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
        onItinerary={() => setActiveTripView("itinerary")}
        onIdeas={() => setActiveTripView("ideas")}
        onTransport={() => setActiveTripView("transport")}
        onFood={() => setActiveTripView("food")}
        onStays={() => setActiveTripView("stays")}
      />
    )
  ) : (
    <TripsScreen
      apiClient={apiClient}
      onSelectTrip={selectTrip}
      onTripsLoaded={setAvailableTrips}
      onSignOut={async () => {
        openTrips();
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
        onTripOverview={() => setActiveTripView("overview")}
        onTripItinerary={() => setActiveTripView("itinerary")}
        onTripIdeas={() => setActiveTripView("ideas")}
        onTripBudget={() => setActiveTripView("budget")}
        onTripTransport={() => setActiveTripView("transport")}
        onTripFood={() => setActiveTripView("food")}
        onTripStays={() => setActiveTripView("stays")}
        onTripAssistant={() => setActiveTripView("assistant")}
        onTripHealthSafety={() => setActiveTripView("health-safety")}
        onNotificationHistory={openNotificationHistory}
        onSignOut={async () => {
          openTrips();
          await signOut();
        }}
      />
    </div>
  );
}
