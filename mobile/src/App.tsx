import { useMemo, useState } from "react";
import { AppLoading } from "./components/AppLoading";
import { MobileAppChrome } from "./components/MobileAppChrome";
import { useMobileAuth } from "./auth/AuthProvider";
import { LoginScreen } from "./screens/LoginScreen";
import { TripDetailScreen } from "./screens/TripDetailScreen";
import { TripItineraryScreen } from "./screens/TripItineraryScreen";
import { TripIdeasScreen } from "./screens/TripIdeasScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { MobileApiClient } from "./lib/apiClient";
import { getMobileEnvironment } from "./lib/environment";
import type { MobileTripSummary } from "@/lib/mobileApi/contracts";

export default function App() {
  const { session, isInitializing, signOut } = useMobileAuth();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activeTripView, setActiveTripView] = useState<
    "overview" | "itinerary" | "ideas"
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
    setSelectedTripId(tripId);
    setActiveTripView("overview");
  }

  function openTrips() {
    setSelectedTripId(null);
    setActiveTripView("overview");
  }

  const authenticatedScreen = selectedTripId ? (
    activeTripView === "itinerary" ? (
      <TripItineraryScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : activeTripView === "ideas" ? (
      <TripIdeasScreen apiClient={apiClient} tripId={selectedTripId} />
    ) : (
      <TripDetailScreen
        apiClient={apiClient}
        tripId={selectedTripId}
        onItinerary={() => setActiveTripView("itinerary")}
        onIdeas={() => setActiveTripView("ideas")}
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
        onSignOut={async () => {
          openTrips();
          await signOut();
        }}
      />
    </div>
  );
}
