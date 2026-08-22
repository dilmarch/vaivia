"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
} from "lucide-react";

export type ItineraryListEntry<T> = {
  item: T;
  dateKey: string;
  timeLabel: string;
  sortKey: string;
};

export type ItineraryCalendarView = "list" | "day" | "week" | "month";

const ITINERARY_VIEWS = [
  { key: "list" as const, label: "List", icon: List },
  { key: "day" as const, label: "Day", icon: CalendarDays },
  { key: "week" as const, label: "Week", icon: Columns3 },
  { key: "month" as const, label: "Month", icon: CalendarRange },
];

export function ItineraryDateHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-lime-300/20 pb-3 text-2xl font-black tracking-tight text-lime-300">
      {children}
    </h3>
  );
}

export function ItineraryCalendarFrame({
  beforeHeader,
  header,
  children,
}: {
  beforeHeader?: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="vaivia-itinerary-calendar overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/30">
      {beforeHeader}
      {header}
      {children}
    </section>
  );
}

export function ItineraryGridPresentation<T>({
  dates,
  entriesByDate,
  renderEntry,
  compact = false,
}: {
  dates: string[];
  entriesByDate: Record<string, ItineraryListEntry<T>[]>;
  renderEntry: (entry: ItineraryListEntry<T>) => ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 ${compact ? "grid-cols-7" : "grid-cols-1 sm:grid-cols-7"}`}>
      {dates.map((date) => (
        <section key={date} className="min-h-28 min-w-0 bg-[#080511] p-2 sm:min-h-40">
          <h3 className="truncate text-xs font-black uppercase tracking-wide text-lime-200">
            {new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", { weekday: "short", day: "numeric" })}
          </h3>
          <div className="mt-2 space-y-2">{(entriesByDate[date] || []).map(renderEntry)}</div>
        </section>
      ))}
    </div>
  );
}

export function ItineraryHeaderPresentation({
  title,
  activeView = "list",
  disabledViews = [],
  onViewChange,
  dateControl,
  onPrevious,
  onToday,
  onNext,
  timezoneContent,
  listOnly = false,
}: {
  title: ReactNode;
  activeView?: ItineraryCalendarView;
  disabledViews?: ItineraryCalendarView[];
  onViewChange?: (view: ItineraryCalendarView) => void;
  dateControl?: ReactNode;
  onPrevious?: () => void;
  onToday?: () => void;
  onNext?: () => void;
  timezoneContent?: ReactNode;
  listOnly?: boolean;
}) {
  return (
    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(255,54,190,0.18),transparent_26%),radial-gradient(circle_at_8%_100%,rgba(var(--vaivia-neon-soft-rgb),0.10),transparent_28%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)] p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.55em] text-lime-200/80">
            Travel plan
          </p>
          <h2 className="mt-2 text-3xl font-black text-white">{title}</h2>
        </div>

        {!listOnly ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-4 rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-inner shadow-black/20">
                {ITINERARY_VIEWS.map(({ key, label, icon: Icon }) => {
                  const disabled = disabledViews.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onViewChange?.(key)}
                      disabled={disabled}
                      aria-current={activeView === key ? "page" : undefined}
                      title={disabled ? `${label} view unavailable` : undefined}
                      className={`flex min-h-9 items-center justify-center gap-2 rounded-full px-3 text-sm font-black uppercase tracking-wide transition ${
                        activeView === key
                          ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {dateControl}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrevious}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onToday}
                  className="h-9 rounded-full bg-lime-300 px-4 text-xs font-black uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                >
                  TODAY
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {timezoneContent ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-3 shadow-inner shadow-black/20">
                <p className="mb-3 text-sm font-black uppercase tracking-wide text-white">
                  Viewing time zone
                </p>
                {timezoneContent}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ItineraryTimezoneCardPresentation({
  cityLabel,
  gmtOffsetLabel,
  metadataLabel,
  relativeOffsetLabel,
  isActive,
  onSelect,
  title,
}: {
  cityLabel: string;
  gmtOffsetLabel: string;
  metadataLabel: string;
  relativeOffsetLabel: string;
  isActive: boolean;
  onSelect: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={isActive}
      data-form-type="other"
      data-lpignore="true"
      data-1p-ignore="true"
      onClick={onSelect}
      className={`min-h-20 rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10 ${
        isActive
          ? "border-lime-300/40 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
          : "border-white/10 bg-white/[0.06] text-slate-300 hover:text-white"
      }`}
    >
      <span className="block truncate text-sm font-semibold">{cityLabel}</span>
      <span
        className={`mt-0.5 block truncate text-[11px] ${
          isActive ? "text-slate-700" : "text-slate-400"
        }`}
      >
        {gmtOffsetLabel}
      </span>
      <span
        className={`mt-1 block text-[10px] font-bold uppercase leading-tight ${
          isActive ? "text-slate-700" : "text-slate-500"
        }`}
      >
        {metadataLabel}
      </span>
      <span
        className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${
          isActive ? "bg-slate-950 text-white" : "bg-white/10 text-slate-300"
        }`}
      >
        {relativeOffsetLabel}
      </span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-8 text-center">
      <h3 className="text-lg font-medium text-slate-900">No itinerary items yet</h3>
      <p className="mt-2 text-sm text-slate-500">
        Add flights, work obligations, activities, or loose ideas.
      </p>
    </div>
  );
}

export function ItineraryListPresentation<T>({
  groupedPastEvents,
  groupedEarlierItems,
  groupedUpcomingItems,
  hasFutureItems,
  formatDateHeader,
  renderEntry,
}: {
  groupedPastEvents: Record<string, ItineraryListEntry<T>[]>;
  groupedEarlierItems: Record<string, ItineraryListEntry<T>[]>;
  groupedUpcomingItems: Record<string, ItineraryListEntry<T>[]>;
  hasFutureItems: boolean;
  formatDateHeader: (dateKey: string) => string;
  renderEntry: (entry: ItineraryListEntry<T>) => ReactNode;
}) {
  const pastDateKeys = Object.keys(groupedPastEvents);
  const earlierDateKeys = Object.keys(groupedEarlierItems);
  const upcomingDateKeys = Object.keys(groupedUpcomingItems);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const pastEventCount = pastDateKeys.reduce(
    (count, dateKey) => count + groupedPastEvents[dateKey].length,
    0,
  );

  if (
    pastDateKeys.length === 0 &&
    earlierDateKeys.length === 0 &&
    upcomingDateKeys.length === 0
  ) {
    return <EmptyState />;
  }

  const renderSection = (dateKey: string, entries: ItineraryListEntry<T>[]) => (
    <section key={dateKey} className="space-y-3">
      <ItineraryDateHeading>{formatDateHeader(dateKey)}</ItineraryDateHeading>
      <div className="space-y-3">{entries.map(renderEntry)}</div>
    </section>
  );

  return (
    <div className="space-y-6">
      {pastDateKeys.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPastEvents((isVisible) => !isVisible)}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-300 shadow-sm transition hover:border-white/20 hover:bg-white/[0.10] hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            aria-expanded={showPastEvents}
          >
            {showPastEvents ? "Hide Past Items" : "Show Past Items"}
            {pastEventCount > 0 ? ` (${pastEventCount})` : ""}
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${
              showPastEvents
                ? "mt-4 grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 transition-transform duration-300 ease-out ${
                  showPastEvents ? "translate-y-0" : "-translate-y-2"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                  Past events
                </p>
                {pastDateKeys.map((dateKey) =>
                  renderSection(dateKey, groupedPastEvents[dateKey]),
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {earlierDateKeys.length > 0 ? (
          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              Earlier events
            </p>
            {earlierDateKeys.map((dateKey) =>
              renderSection(dateKey, groupedEarlierItems[dateKey]),
            )}
          </div>
        ) : null}
        {upcomingDateKeys.map((dateKey) =>
          renderSection(dateKey, groupedUpcomingItems[dateKey]),
        )}
      </div>

      {hasFutureItems ? (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          Loading more as you scroll...
        </div>
      ) : null}
    </div>
  );
}
