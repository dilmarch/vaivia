import { useEffect, useMemo, useState } from "react";
import AccommodationCoverageTimeline from "@/components/accommodations/AccommodationCoverageTimeline";
import {
  AccommodationPageTabsPresentation,
  StaysLoadingPresentation,
  StaysPresentation,
} from "@/components/accommodations/StaysPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import { StoredPlacesMapPresentation } from "@/components/travel/StoredPlacesMapPresentation";
import { MobileStayEditor } from "../components/MobileTravelEditors";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function TripStaysScreen({
  apiClient,
  tripId,
  editorAction,
  onEditorAction,
  onEditorClose,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  editorAction?: string;
  onEditorAction?: (itemId: string) => void;
  onEditorClose?: () => void;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<"stays" | "planning">("stays");

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");

    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load trip stays.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip stays"
          />
        </header>
        <StaysLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Stays unavailable"
          message={errorMessage || "This trip's stays could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const { trip, stays } = data;
  if (!stays) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Stays unavailable"
          message="This trip's stays could not be found."
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const editorStay = editorAction && editorAction !== "new" && editorAction !== "new-option"
    ? [...stays.accommodations, ...(stays.planningOptions || [])].find((stay) => stay.id === editorAction)
    : null;
  const editor = editorAction ? (
    <MobileStayEditor
      apiClient={apiClient}
      tripId={tripId}
      stayId={editorAction === "new" || editorAction === "new-option" ? undefined : editorAction}
      stays={stays}
      planning={editorAction === "new-option" || Boolean(editorStay?.is_planning_option)}
      onCancel={() => onEditorClose?.()}
      onSaved={() => { setReloadKey((key) => key + 1); onEditorClose?.(); }}
    />
  ) : null;

  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
        >
          <TripHeaderTitlePresentation
            tripTitle={trip.title || "Untitled trip"}
            pageLabel="Stays"
          />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
        <AccommodationPageTabsPresentation
          activeTab={activeTab}
          renderTab={(tab, props) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={tab.id === activeTab ? "page" : undefined}
              {...props}
            />
          )}
        />

        {editor ? editor : activeTab === "stays" ? <><AccommodationCoverageTimeline
          tripStartDate={trip.start_date}
          tripEndDate={trip.end_date}
          travelers={stays.travelers}
          legs={stays.legs}
          accommodations={stays.accommodations}
          participants={stays.participants}
        />

        <StaysPresentation
          accommodations={stays.accommodations}
          audienceOptions={stays.audienceOptions}
          audienceParticipants={stays.participants}
          currentUserTripMemberId={stays.currentUserTripMemberId}
          googleMapsEnabled
          onAddStay={() => onEditorAction?.("new")}
          onEditStay={(stay) => onEditorAction?.(stay.id)}
        /></> : <StayComparison apiClient={apiClient} options={stays.planningOptions || []} onAdd={() => onEditorAction?.("new-option")} onEdit={(stayId) => onEditorAction?.(stayId)} />}
      </div>
    </main>
  );
}

function StayComparison({ apiClient, options, onAdd, onEdit }: { apiClient: MobileApiClient; options: NonNullable<MobileTripDetailResponse["stays"]>["accommodations"]; onAdd: () => void; onEdit: (stayId: string) => void }) {
  const [selectedId, setSelectedId] = useState(options[0]?.id || "");
  const [nearbyKind, setNearbyKind] = useState<"attractions" | "food" | null>(null);
  const [nearby, setNearby] = useState<Array<{ placeId: string; name: string; address: string | null; mapsUrl: string }>>([]);
  const [error, setError] = useState("");
  const selected = useMemo(() => options.find((option) => option.id === selectedId) || options[0], [options, selectedId]);
  useEffect(() => { if (!selectedId && options[0]) setSelectedId(options[0].id); }, [options, selectedId]);
  useEffect(() => {
    if (!nearbyKind || !selected?.latitude || !selected?.longitude) { setNearby([]); return; }
    const controller = new AbortController();
    setError("");
    void apiClient.searchNearbyPlaces(nearbyKind === "food" ? "restaurants and cafes" : "tourist attractions", selected.latitude, selected.longitude, controller.signal)
      .then(({ places }) => setNearby(places))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Nearby places are unavailable."); });
    return () => controller.abort();
  }, [apiClient, nearbyKind, selected?.latitude, selected?.longitude]);
  return (
    <section className="space-y-5">
      <div className="flex justify-end"><button type="button" onClick={onAdd} className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950">Add stay option</button></div>
      {options.length ? <><div className="grid gap-3 sm:grid-cols-2">{options.map((option) => <button key={option.id} type="button" onClick={() => setSelectedId(option.id)} className={`rounded-[1.5rem] border p-4 text-left ${selected?.id === option.id ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-white/[0.05]"}`}><span className="block text-lg font-black">{option.hotel_name}</span><span className="mt-1 block text-sm font-semibold text-slate-400">{option.address || option.city || "Location not set"}</span><span onClick={(event) => { event.stopPropagation(); onEdit(option.id); }} className="mt-3 inline-block rounded-full border border-white/10 px-3 py-1 text-xs font-black">Edit</span></button>)}</div>{selected ? <StoredPlacesMapPresentation title={selected.hotel_name} label={selected.address || selected.city || selected.hotel_name} latitude={selected.latitude} longitude={selected.longitude} mapsUrl={selected.google_maps_url}><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setNearbyKind("attractions")} className="rounded-full border border-white/10 px-4 py-2 text-sm font-black">Nearby attractions</button><button type="button" onClick={() => setNearbyKind("food")} className="rounded-full border border-white/10 px-4 py-2 text-sm font-black">Nearby food</button></div>{error ? <p role="alert" className="text-sm font-bold text-red-200">{error}</p> : null}{nearby.length ? <ul className="space-y-2">{nearby.map((place) => <li key={place.placeId}><a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-white/10 bg-white/[0.05] p-3"><span className="font-black">{place.name}</span>{place.address ? <span className="mt-1 block text-xs font-semibold text-slate-400">{place.address}</span> : null}</a></li>)}</ul> : null}</StoredPlacesMapPresentation> : null}</> : <p className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center font-bold text-slate-300">Add stay options to compare areas, nearby places and transit access.</p>}
    </section>
  );
}
