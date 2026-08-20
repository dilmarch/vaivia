import { useMemo, useState } from "react";
import { AppLoading } from "./components/AppLoading";
import { useMobileAuth } from "./auth/AuthProvider";
import { LoginScreen } from "./screens/LoginScreen";
import { TripDetailScreen } from "./screens/TripDetailScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { MobileApiClient } from "./lib/apiClient";
import { getMobileEnvironment } from "./lib/environment";

export default function App() {
  const { session, isInitializing, signOut } = useMobileAuth();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
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

  if (selectedTripId) {
    return (
      <TripDetailScreen
        apiClient={apiClient}
        tripId={selectedTripId}
        onBack={() => setSelectedTripId(null)}
      />
    );
  }

  return (
    <TripsScreen
      apiClient={apiClient}
      onSelectTrip={setSelectedTripId}
      onSignOut={async () => {
        setSelectedTripId(null);
        await signOut();
      }}
    />
  );
}
