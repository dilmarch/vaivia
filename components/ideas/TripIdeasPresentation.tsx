"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import {
  IDEA_CATEGORIES,
  IDEA_DAYS,
  IDEA_TIME_OF_DAY_OPTIONS,
  formatIdeaAgePolicy,
  formatIdeaTicketPolicy,
  getIdeaDayForDate,
  isIdeaAvailableOnDate,
  type IdeaDay,
  type IdeaTimeOfDay,
  type TripIdea,
} from "@/lib/tripIdeas";

type DayFilter = "" | IdeaDay | "Today" | "Tomorrow" | "Weekdays" | "Weekends";
type IdeaLocationTab = { key: string; label: string; count: number };

const NO_IDEA_LOCATION_KEY = "no-location";

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeLocationPart(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function getIdeaLocationTab(idea: TripIdea) {
  const city = normalizeLocationPart(idea.location_city);
  const region = normalizeLocationPart(idea.location_region);
  const country = normalizeLocationPart(idea.location_country);
  const countryCode = normalizeLocationPart(idea.location_country_code);
  if (city) {
    return {
      key: `city:${city.toLocaleLowerCase()}:${(countryCode || country).toLocaleLowerCase()}`,
      label: city,
    };
  }
  if (region) {
    return {
      key: `region:${region.toLocaleLowerCase()}:${country.toLocaleLowerCase()}`,
      label: region,
    };
  }
  if (country) {
    return { key: `country:${country.toLocaleLowerCase()}`, label: country };
  }
  return { key: NO_IDEA_LOCATION_KEY, label: "NO LOCATION" };
}

function buildIdeaLocationTabs(ideas: TripIdea[]): IdeaLocationTab[] {
  const tabsByKey = new Map<string, IdeaLocationTab>();
  ideas.forEach((idea) => {
    const location = getIdeaLocationTab(idea);
    const existingTab = tabsByKey.get(location.key);
    tabsByKey.set(location.key, {
      ...location,
      count: (existingTab?.count || 0) + 1,
    });
  });
  return Array.from(tabsByKey.values()).sort((left, right) => {
    if (left.key === NO_IDEA_LOCATION_KEY) return 1;
    if (right.key === NO_IDEA_LOCATION_KEY) return -1;
    return left.label.localeCompare(right.label);
  });
}

const browserInputProps = {
  autoComplete: "off",
  "data-form-type": "other",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
} as const;

export function TripIdeasLoadingPresentation() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading trip ideas">
      <div className="h-28 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.045] motion-reduce:animate-none" />
      <div className="h-16 animate-pulse rounded-[1.35rem] border border-white/10 bg-[#03030a] motion-reduce:animate-none" />
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-[1.75rem] border border-white/10 bg-[#03030a]/90 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export function TripIdeasPresentation({
  ideas,
  beforeContent,
  renderIdeaCard,
}: {
  ideas: TripIdea[];
  beforeContent?: ReactNode;
  renderIdeaCard: (idea: TripIdea) => ReactNode;
}) {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [dayFilter, setDayFilter] = useState<DayFilter>("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const visibleIdeas = showArchived
    ? ideas
    : ideas.filter((idea) => !idea.is_archived);
  const locationTabs = buildIdeaLocationTabs(visibleIdeas);
  const activeLocationFilter = locationTabs.some(
    (tab) => tab.key === locationFilter,
  )
    ? locationFilter
    : "";
  const hasAnyActiveIdeas = ideas.some((idea) => !idea.is_archived);
  const todayDate = new Date();
  const tomorrowDate = addDays(todayDate, 1);
  const today = getIdeaDayForDate(todayDate);
  const requestedTags = parseTags(tagFilter.toLowerCase());
  const query = searchQuery.trim().toLowerCase();
  const filteredIdeas = visibleIdeas.filter((idea) => {
    if (
      activeLocationFilter &&
      getIdeaLocationTab(idea).key !== activeLocationFilter
    ) {
      return false;
    }
    if (
      query &&
      ![
        idea.title,
        idea.description || "",
        idea.category,
        idea.location || "",
        idea.address || "",
        idea.formatted_address || "",
        idea.location_city || "",
        idea.location_website || "",
        idea.ticket_website || "",
        idea.ticket_policy ? formatIdeaTicketPolicy(idea.ticket_policy) : "",
        idea.age_policy || "",
        idea.age_policy ? formatIdeaAgePolicy(idea.age_policy) : "",
        idea.dress_code || "",
        idea.other_notes || "",
        ...idea.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (categoryFilter && idea.category !== categoryFilter) return false;
    if (
      timeFilter &&
      !idea.time_of_day.includes(timeFilter as IdeaTimeOfDay)
    ) {
      return false;
    }
    if (dayFilter === "Today" && !isIdeaAvailableOnDate(idea, todayDate)) {
      return false;
    }
    if (
      dayFilter === "Tomorrow" &&
      !isIdeaAvailableOnDate(idea, tomorrowDate)
    ) {
      return false;
    }
    if (
      dayFilter === "Weekdays" &&
      idea.days_available.length > 0 &&
      !idea.days_available.some((day) =>
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(day),
      )
    ) {
      return false;
    }
    if (
      dayFilter === "Weekends" &&
      idea.days_available.length > 0 &&
      !idea.days_available.some((day) => ["Saturday", "Sunday"].includes(day))
    ) {
      return false;
    }
    if (
      IDEA_DAYS.includes(dayFilter as IdeaDay) &&
      idea.days_available.length > 0 &&
      !idea.days_available.includes(dayFilter as IdeaDay)
    ) {
      return false;
    }
    if (
      requestedTags.length > 0 &&
      !requestedTags.every((tag) =>
        idea.tags.some((ideaTag) => ideaTag.toLowerCase().includes(tag)),
      )
    ) {
      return false;
    }
    return true;
  });

  return (
    <section className="space-y-6" data-trip-ideas-presentation>
      {beforeContent}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Things to Do
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Browse loose possibilities for free time, rainy days, late nights,
            and plans that are still taking shape.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Filter things to do by location"
          className="flex min-w-max gap-2 rounded-[1.35rem] border border-white/10 bg-[#03030a] p-2 shadow-2xl shadow-black/20"
        >
          <button
            type="button"
            role="tab"
            aria-label={`All locations, ${visibleIdeas.length} things to do`}
            aria-selected={!activeLocationFilter}
            aria-controls="things-to-do-grid"
            onClick={() => setLocationFilter("")}
            className={`rounded-[0.95rem] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition ${
              !activeLocationFilter
                ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)]"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            ALL <span className="ml-2 opacity-70">{visibleIdeas.length}</span>
          </button>
          {locationTabs.map((tab) => {
            const isActive = activeLocationFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-label={`${tab.label}, ${tab.count} ${
                  tab.count === 1 ? "thing" : "things"
                } to do`}
                aria-selected={isActive}
                aria-controls="things-to-do-grid"
                onClick={() => setLocationFilter(tab.key)}
                className={`rounded-[0.95rem] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition ${
                  isActive
                    ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.label}
                <span className="ml-2 opacity-70">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search ideas</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search activities, tags, categories, or notes"
              {...browserInputProps}
              className="w-full rounded-full border border-white/10 bg-white px-4 py-2 pl-9 text-slate-900 shadow-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((isVisible) => !isVisible)}
            aria-expanded={showFilters}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block text-sm font-semibold text-slate-200">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
              >
                <option value="">All categories</option>
                {IDEA_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-200">
              Day
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value as DayFilter)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
              >
                <option value="">All days</option>
                <option value="Today">Today</option>
                <option value="Tomorrow">Tomorrow</option>
                <option value="Weekdays">Weekdays</option>
                <option value="Weekends">Weekends</option>
                {IDEA_DAYS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-200">
              Time
              <select
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
              >
                <option value="">All times</option>
                {IDEA_TIME_OF_DAY_OPTIONS.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-200">
              Tags
              <input
                type="text"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                placeholder="cheap, rainy day"
                {...browserInputProps}
                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
              />
            </label>
          </div>
          <label className="mt-4 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-slate-200">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-lime-300"
            />
            Show archived
          </label>
        </div>
      ) : null}

      <div id="things-to-do-grid" role="tabpanel" aria-live="polite">
        {!hasAnyActiveIdeas && !showArchived ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.045] p-8 text-center">
            <h3 className="text-lg font-bold text-white">No trip ideas yet</h3>
            <p className="mt-2 text-sm text-slate-300">
              Add a restaurant, museum, park walk, bar, or anything you might
              want to remember.
            </p>
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.045] p-8 text-center">
            <h3 className="text-lg font-bold text-white">
              No trip ideas match these filters
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Try loosening the category, day, time, or tag filters.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {filteredIdeas.map(renderIdeaCard)}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Today is {today}. Filter snapshots use your computer date:{" "}
        {getLocalDateKey(new Date())}.
      </p>
    </section>
  );
}
