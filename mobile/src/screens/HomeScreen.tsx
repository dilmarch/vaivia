import { useEffect, useState, type ReactNode } from "react";
import {
  DashboardPresentation,
  type DashboardActionRenderProps,
  type DashboardDestination,
} from "@/components/dashboard/DashboardPresentation";
import { TripCardPresentation } from "@/components/trips/TripCardPresentation";
import type { DashboardData, DashboardTrip } from "@/lib/dashboard/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

type HomeScreenProps = {
  apiClient: MobileApiClient;
  onTripsLoaded: (trips: DashboardTrip[]) => void;
  onTrips: () => void;
  onTrip: (tripId: string, view: "overview" | "stays" | "transport") => void;
  onProfile: () => void;
};

function actionForDestination(
  destination: DashboardDestination,
  callbacks: Pick<HomeScreenProps, "onTrips" | "onTrip" | "onProfile">,
) {
  if (destination.name === "trips") return callbacks.onTrips;
  if (destination.name === "trip") {
    return () => callbacks.onTrip(destination.tripId, destination.view);
  }
  if (destination.name === "profile") return callbacks.onProfile;
  return null;
}

export function HomeScreen({
  apiClient,
  onTripsLoaded,
  onTrips,
  onTrip,
  onProfile,
}: HomeScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void apiClient.getHome(controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      setData(loaded);
      onTripsLoaded(loaded.trips);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Could not load your dashboard.");
    });
    return () => controller.abort();
  }, [apiClient, onTripsLoaded, reloadKey]);

  if (!data) {
    return <main className="min-h-screen bg-[#0c0115] px-4 pb-16 pt-24 text-white">{error ? <ScreenMessage title="Home is unavailable" message={error} actionLabel="Try again" onAction={() => setReloadKey((key) => key + 1)} /> : <div role="status" aria-live="polite"><ScreenMessage title="Preparing your dashboard" message="Getting your next adventures ready." /></div>}</main>;
  }

  const renderAction = ({
    destination,
    className,
    children,
    ariaLabel,
    style,
  }: DashboardActionRenderProps): ReactNode => {
    const action = actionForDestination(destination, { onTrips, onTrip, onProfile });
    return action ? <button type="button" onClick={action} className={className} aria-label={ariaLabel} style={style}>{children}</button> : <span className={`${className} cursor-not-allowed opacity-60`} aria-disabled="true" title="Unavailable in the mobile app" style={style}>{children}</span>;
  };

  return <DashboardPresentation
    data={data}
    renderAction={renderAction}
    renderTrip={(trip, index) => (
      <TripCardPresentation
        trip={trip}
        index={index}
        coverImageUrl={trip.cover_image_url || trip.trip_cover_image_url || null}
        memberProfiles={(trip.memberProfiles || []).filter((member) => member.id !== data.currentUserId)}
        disableHoverTransform
        renderAction={({ children, className, ariaLabel }) => <button type="button" onClick={() => onTrip(trip.id, "overview")} className={className} aria-label={ariaLabel}>{children}</button>}
      />
    )}
  />;
}
