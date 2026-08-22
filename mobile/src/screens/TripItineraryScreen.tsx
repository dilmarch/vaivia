import { useEffect, useMemo, useRef, useState } from "react";
import {
  ItineraryCalendarFrame,
  ItineraryHeaderPresentation,
  ItineraryGridPresentation,
  ItineraryListPresentation,
  ItineraryTimezoneCardPresentation,
  type ItineraryCalendarView,
  type ItineraryListEntry,
} from "@/components/itinerary/ItineraryListPresentation";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import { DateInput } from "@/components/ui/date-input";
import { getDefaultItineraryDateKey } from "@/lib/itineraryDefaults";
import {
  getLocalTimezone,
  readSessionTimezone,
  writeSessionTimezone,
} from "@/lib/sessionTimezone";
import type {
  MobileItineraryItem,
  MobileTripDetailResponse,
} from "@/lib/mobileApi/contracts";
import { MobileItineraryCard } from "../components/MobileItineraryCard";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

type TripItineraryScreenProps = {
  apiClient: MobileApiClient;
  tripId: string;
  onAdd: () => void;
  onEdit: (itemId: string) => void;
};

const INITIAL_LIST_DAYS = 7;
const LIST_LOAD_INCREMENT_DAYS = 14;

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

function formatDateHeader(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTimezoneDisplayName(timezone: string) {
  return timezone.split("/").at(-1)?.replaceAll("_", " ") || timezone;
}

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

function getGmtOffsetLabel(timezone: string, date: Date) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, date);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  return `GMT${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(
    absoluteMinutes % 60,
  ).padStart(2, "0")}`;
}

function getRelativeOffsetLabel(
  timezone: string,
  activeTimezone: string,
  date: Date,
) {
  if (timezone === activeTimezone) return "Active";
  const difference =
    getTimezoneOffsetMinutes(timezone, date) -
    getTimezoneOffsetMinutes(activeTimezone, date);
  const sign = difference >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(difference);
  const minutes = absoluteMinutes % 60;
  return `${sign}${Math.floor(absoluteMinutes / 60)}h${minutes ? ` ${minutes}m` : ""}`;
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

function getDateParts(date: Date, timezone: string) {
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

function getDisplayEntry(
  item: MobileItineraryItem,
  displayTimezone: string,
): ItineraryListEntry<MobileItineraryItem> & { endDateKey: string } {
  if (!item.start_time) {
    return {
      item,
      dateKey: item.item_date,
      endDateKey: item.end_date || item.item_date,
      timeLabel: "No time",
      sortKey: `${item.item_date}T99:99-${item.title}`,
    };
  }
  const startTimezone =
    (item.source === "transportation" ? item.departure_timezone : null) ||
    item.timezone ||
    displayTimezone;
  const endTimezone =
    (item.source === "transportation" ? item.arrival_timezone : null) ||
    startTimezone;
  const start = zonedDateTimeToUtc(item.item_date, item.start_time, startTimezone);
  let end = item.end_time
    ? zonedDateTimeToUtc(
        item.end_date || item.item_date,
        item.end_time,
        endTimezone,
      )
    : new Date(start.getTime() + 60 * 60_000);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000);
  const dateKey = getDateParts(start, displayTimezone);
  const endDateKey = getDateParts(end, displayTimezone);
  return {
    item,
    dateKey,
    endDateKey,
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

export function TripItineraryScreen({
  apiClient,
  tripId,
  onAdd,
  onEdit,
}: TripItineraryScreenProps) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");
  const [listStartDate, setListStartDate] = useState(() => getLocalDateKey(new Date()));
  const [listDayCount, setListDayCount] = useState(INITIAL_LIST_DAYS);
  const [activeTimezone, setActiveTimezone] = useState(() =>
    readSessionTimezone() || getLocalTimezone(),
  );
  const [activeView, setActiveView] = useState<ItineraryCalendarView>("list");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");
    void apiClient
      .getTrip(tripId, controller.signal)
      .then((loadedData) => {
        setData(loadedData);
        setListStartDate(
          getDefaultItineraryDateKey({
            tripStartDate: loadedData.trip.start_date,
            tripEndDate: loadedData.trip.end_date,
            todayKey: getLocalDateKey(new Date()),
          }),
        );
        setListDayCount(INITIAL_LIST_DAYS);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load this itinerary.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  const browserTimezone = getLocalTimezone();
  const timezoneOptions = useMemo(
    () => {
      const destinationTimezones = Array.from(
        new Set(data?.itineraryTimezones || []),
      ).filter((timezone) => timezone !== browserTimezone);
      const options = [
        { timezone: browserTimezone, metadataLabel: "Current location" },
        ...destinationTimezones.map((timezone, index) => ({
          timezone,
          metadataLabel: `Destination ${index + 1}`,
        })),
      ];
      if (!options.some((option) => option.timezone === activeTimezone)) {
        options.push({
          timezone: activeTimezone,
          metadataLabel: "Session selection",
        });
      }
      return options;
    }, [activeTimezone, browserTimezone, data?.itineraryTimezones],
  );
  const groupedEntries = useMemo(() => {
    const entries = (data?.itinerary || []).map((item) =>
      getDisplayEntry(item, activeTimezone),
    );
    const todayKey = getLocalDateKey(new Date());
    const listEndDate = addDays(listStartDate, listDayCount - 1);
    return {
      past: groupEntries(
        entries.filter(
          (entry) =>
            entry.endDateKey < listStartDate && entry.endDateKey < todayKey,
        ),
      ),
      earlier: groupEntries(
        entries.filter(
          (entry) =>
            entry.endDateKey < listStartDate && entry.endDateKey >= todayKey,
        ),
      ),
      upcoming: groupEntries(
        entries.filter(
          (entry) =>
            entry.dateKey <= listEndDate && entry.endDateKey >= listStartDate,
        ),
      ),
      hasFuture: entries.some((entry) => entry.dateKey > listEndDate),
    };
  }, [activeTimezone, data?.itinerary, listDayCount, listStartDate]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !groupedEntries.hasFuture ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setListDayCount((dayCount) => dayCount + LIST_LOAD_INCREMENT_DAYS);
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [groupedEntries.hasFuture]);

  function updateListStartDate(nextDate: string) {
    setListStartDate(nextDate);
    setListDayCount(INITIAL_LIST_DAYS);
  }

  const gridDates = useMemo(() => {
    const date = parseDateKey(listStartDate);
    if (activeView === "week") date.setDate(date.getDate() - date.getDay());
    if (activeView === "month") {
      date.setDate(1);
      date.setDate(date.getDate() - date.getDay());
    }
    const count = activeView === "month" ? 42 : activeView === "week" ? 7 : 1;
    return Array.from({ length: count }, (_, index) => addDays(getLocalDateKey(date), index));
  }, [activeView, listStartDate]);

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading itinerary"
          />
        </header>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-96 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Itinerary unavailable"
          message={errorMessage || "This itinerary could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const selectedTimezoneDate = parseDateKey(listStartDate);
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
            pageLabel="Itinerary"
          />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ItineraryCalendarFrame
          header={
            <ItineraryHeaderPresentation
              title={<span className="flex flex-wrap items-center gap-3">Itinerary <button type="button" onClick={onAdd} className="rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-950">Add item</button></span>}
              activeView={activeView}
              onViewChange={setActiveView}
              dateControl={
                <label className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-sm font-bold text-slate-200">
                  <span>Date</span>
                  <DateInput
                    id="mobileItineraryViewDate"
                    name="mobileItineraryViewDate"
                    value={listStartDate}
                    onChange={(event) => {
                      if (event.target.value.length === 10) {
                        updateListStartDate(event.target.value);
                      }
                    }}
                    className="bg-transparent text-sm text-white outline-none [color-scheme:dark]"
                  />
                </label>
              }
              onPrevious={() => updateListStartDate(addDays(listStartDate, -7))}
              onToday={() => updateListStartDate(getLocalDateKey(new Date()))}
              onNext={() => updateListStartDate(addDays(listStartDate, 7))}
              timezoneContent={
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-3">
                  {timezoneOptions.map(({ timezone, metadataLabel }) => {
                    const isActive = timezone === activeTimezone;
                    return (
                      <ItineraryTimezoneCardPresentation
                        key={timezone}
                        title={`${metadataLabel}: ${getTimezoneDisplayName(timezone)}, ${timezone}`}
                        cityLabel={getTimezoneDisplayName(timezone)}
                        gmtOffsetLabel={getGmtOffsetLabel(
                          timezone,
                          selectedTimezoneDate,
                        )}
                        metadataLabel={metadataLabel}
                        relativeOffsetLabel={getRelativeOffsetLabel(
                          timezone,
                          activeTimezone,
                          selectedTimezoneDate,
                        )}
                        isActive={isActive}
                        onSelect={() => {
                          setActiveTimezone(timezone);
                          writeSessionTimezone(timezone);
                        }}
                      />
                    );
                  })}
                </div>
              }
            />
          }
        >
          <div className="animate-in fade-in slide-in-from-bottom-2 p-4 duration-300 sm:p-6">
            {activeView === "list" ? (
              <ItineraryListPresentation
                groupedPastEvents={groupedEntries.past}
                groupedEarlierItems={groupedEntries.earlier}
                groupedUpcomingItems={groupedEntries.upcoming}
                hasFutureItems={groupedEntries.hasFuture}
                formatDateHeader={formatDateHeader}
                renderEntry={(entry) => (
                  <MobileItineraryCard key={entry.item.id} item={entry.item} timeLabel={entry.timeLabel} onEdit={entry.item.source === "itinerary" ? () => onEdit(entry.item.id) : undefined} />
                )}
              />
            ) : activeView === "day" ? (
              <div className="space-y-4">
                <h3 className="text-2xl font-black text-lime-300">{formatDateHeader(gridDates[0])}</h3>
                {(groupedEntries.upcoming[gridDates[0]] || []).map((entry) => <MobileItineraryCard key={entry.item.id} item={entry.item} timeLabel={entry.timeLabel} onEdit={entry.item.source === "itinerary" ? () => onEdit(entry.item.id) : undefined} />)}
              </div>
            ) : (
              <ItineraryGridPresentation
                dates={gridDates}
                entriesByDate={groupedEntries.upcoming}
                compact={activeView === "month"}
                renderEntry={(entry) => (
                  <button key={entry.item.id} type="button" onClick={entry.item.source === "itinerary" ? () => onEdit(entry.item.id) : undefined} disabled={entry.item.source !== "itinerary"} className="w-full truncate rounded-lg border border-white/10 bg-white/[0.08] px-2 py-1 text-left text-[10px] font-bold text-white">
                    {entry.timeLabel} {entry.item.title}
                  </button>
                )}
              />
            )}
            <div ref={loadMoreRef} className="h-1" />
          </div>
        </ItineraryCalendarFrame>
      </div>
    </main>
  );
}
