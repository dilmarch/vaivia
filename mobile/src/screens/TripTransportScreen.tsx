import { useEffect, useMemo, useState } from "react";
import {
  ItineraryCalendarFrame,
  ItineraryHeaderPresentation,
  ItineraryListPresentation,
  type ItineraryListEntry,
} from "@/components/itinerary/ItineraryListPresentation";
import {
  TransportLoadingPresentation,
  TransportPresentation,
} from "@/components/transport/TransportPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type {
  MobileItineraryItem,
  MobileTripDetailResponse,
} from "@/lib/mobileApi/contracts";
import { getLocalTimezone } from "@/lib/sessionTimezone";
import { MobileItineraryCard } from "../components/MobileItineraryCard";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localizedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour) % 24,
    Number(values.minute),
    Number(values.second),
  );
  return Math.round((localizedAsUtc - date.getTime()) / 60_000);
}

function zonedDateTimeToUtc(dateKey: string, time: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  let utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  for (let index = 0; index < 2; index += 1) {
    const offset = getTimezoneOffsetMinutes(timezone, utcDate);
    utcDate = new Date(
      Date.UTC(year, month - 1, day, hours, minutes) - offset * 60_000,
    );
  }
  return utcDate;
}

function getDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatInstant(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getTransportEntry(
  item: MobileItineraryItem,
  displayTimezone: string,
): ItineraryListEntry<MobileItineraryItem> {
  if (!item.start_time) {
    return {
      item,
      dateKey: item.item_date,
      timeLabel: "No time",
      sortKey: `${item.item_date}T99:99-${item.title}`,
    };
  }

  const departureTimezone =
    item.departure_timezone || item.timezone || displayTimezone;
  const arrivalTimezone = item.arrival_timezone || departureTimezone;
  const start = zonedDateTimeToUtc(
    item.item_date,
    item.start_time,
    departureTimezone,
  );
  let end = item.end_time
    ? zonedDateTimeToUtc(
        item.end_date || item.item_date,
        item.end_time,
        arrivalTimezone,
      )
    : new Date(start.getTime() + 60 * 60_000);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000);

  const dateKey = getDateKey(start, displayTimezone);
  return {
    item,
    dateKey,
    timeLabel: `${formatInstant(start, displayTimezone)} - ${formatInstant(
      end,
      displayTimezone,
    )}`,
    sortKey: `${dateKey}T${String(start.getTime())}-${item.title}`,
  };
}

function groupEntries(entries: ItineraryListEntry<MobileItineraryItem>[]) {
  return [...entries]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .reduce<Record<string, ItineraryListEntry<MobileItineraryItem>[]>>(
      (groups, entry) => {
        groups[entry.dateKey] = [...(groups[entry.dateKey] || []), entry];
        return groups;
      },
      {},
    );
}

function formatDateHeader(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TripTransportScreen({
  apiClient,
  tripId,
}: {
  apiClient: MobileApiClient;
  tripId: string;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");

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
          error instanceof Error ? error.message : "Could not load trip transport.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  const transportationItems = useMemo(
    () =>
      (data?.itinerary || []).filter(
        (item) =>
          item.source === "transportation" && !item.is_flight_departure_buffer,
      ),
    [data?.itinerary],
  );
  const visibleItems = useMemo(
    () =>
      showAll
        ? transportationItems
        : transportationItems.filter(
            (item) => item.is_assigned_to_viewer !== false,
          ),
    [showAll, transportationItems],
  );
  const displayTimezone = useMemo(() => {
    const todayKey = getLocalDateKey(new Date());
    const tripHasStarted = !data?.trip.start_date || todayKey >= data.trip.start_date;
    return tripHasStarted
      ? getLocalTimezone()
      : visibleItems[0]?.departure_timezone ||
          visibleItems[0]?.timezone ||
          data?.itineraryTimezones[0] ||
          getLocalTimezone();
  }, [data?.itineraryTimezones, data?.trip.start_date, visibleItems]);
  const groupedItems = useMemo(
    () =>
      groupEntries(
        visibleItems.map((item) => getTransportEntry(item, displayTimezone)),
      ),
    [displayTimezone, visibleItems],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip transport"
          />
        </header>
        <TransportLoadingPresentation />
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip Transport unavailable"
          message={errorMessage || "This trip transport could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={data.trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
        >
          <TripHeaderTitlePresentation
            tripTitle={data.trip.title || "Untitled trip"}
            pageLabel="Transport"
          />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TransportPresentation
          mode="transport"
          showAll={showAll}
          onShowAllChange={setShowAll}
          compareFlightsDisabled
        >
          <ItineraryCalendarFrame
            header={<ItineraryHeaderPresentation title="Transport" listOnly />}
          >
            <div className="animate-in fade-in slide-in-from-bottom-2 p-4 duration-300 sm:p-6">
              <ItineraryListPresentation
                groupedPastEvents={{}}
                groupedEarlierItems={{}}
                groupedUpcomingItems={groupedItems}
                hasFutureItems={false}
                formatDateHeader={formatDateHeader}
                renderEntry={(entry) => (
                  <MobileItineraryCard
                    key={entry.item.id}
                    item={entry.item}
                    timeLabel={entry.timeLabel}
                  />
                )}
              />
            </div>
          </ItineraryCalendarFrame>
        </TransportPresentation>
      </div>
    </main>
  );
}
