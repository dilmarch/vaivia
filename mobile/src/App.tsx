import { useMemo, useState } from "react";
import { AppLoading } from "./components/AppLoading";
import { useMobileAuth } from "./auth/AuthProvider";
import { LoginScreen } from "./screens/LoginScreen";
import { TripDetailScreen } from "./screens/TripDetailScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { MobileApiClient } from "./lib/apiClient";
import { getMobileEnvironment } from "./lib/environment";
import { getMobileSupabaseClient } from "./lib/supabase";

export default function App() {
  const { session, isInitializing, signOut } = useMobileAuth();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const environment = useMemo(() => getMobileEnvironment(), []);
  const apiClient = useMemo(
    () =>
      new MobileApiClient({
        baseUrl: environment.apiBaseUrl,
        async getAccessToken() {
          const {
            data: { session: currentSession },
          } = await getMobileSupabaseClient().auth.getSession();
          return currentSession?.access_token || null;
        },
      }),
    [environment.apiBaseUrl],
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
