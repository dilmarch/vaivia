"use client";
/* eslint-disable @next/next/no-img-element */

import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hotel,
  Plane,
  Stamp,
  UserRound,
  Wand2,
} from "lucide-react";
import {
  useMemo,
  useState,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";
import DashboardHero from "@/components/DashboardHero";
import PassportStampCard from "@/components/PassportStamp";
import { TripCardPresentation } from "@/components/trips/TripCardPresentation";
import {
  getPrimaryDestination,
  getTripDestinationNames,
  getTripDisplayDateRange,
} from "@/components/trips/TripCardPresentation";
import type {
  DashboardData,
  DashboardEvent,
  DashboardTrip,
} from "@/lib/dashboard/contracts";
import { isTripVisibleOnDashboard } from "@/lib/tripDashboardVisibility";
import { getTripAccentColor } from "@/lib/tripPresentation";
import { getTripHref } from "@/lib/tripRoutes";

export type DashboardDestination =
  | { name: "trips" }
  | { name: "trip"; tripId: string; view: "overview" | "stays" | "transport" }
  | { name: "events" }
  | { name: "my-events" }
  | { name: "manage-events" }
  | { name: "profile"; section?: "passport-stamps" | "bucket-list" }
  | { name: "create-trip" };

export type DashboardActionRenderProps = {
  destination: DashboardDestination;
  href: string;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
  style?: CSSProperties;
};

type DashboardPresentationProps = {
  data: DashboardData;
  renderAction: (props: DashboardActionRenderProps) => ReactNode;
  renderTrip?: (trip: DashboardTrip, index: number) => ReactNode;
  renderTripControls?: (trip: DashboardTrip, index: number) => ReactNode;
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function upcomingTrips(trips: DashboardTrip[]) {
  const today = localDateKey(new Date());
  return trips.filter((trip) => {
    const range = getTripDisplayDateRange(trip);
    const end = range.endDate || range.startDate || trip.end_date || trip.start_date;
    return !end || isTripVisibleOnDashboard(end, today);
  });
}

function defaultTripCard(trip: DashboardTrip, index: number, currentUserId: string) {
  return (
    <TripCardPresentation
      trip={trip}
      index={index}
      coverImageUrl={trip.cover_image_url || trip.trip_cover_image_url || null}
      memberProfiles={(trip.memberProfiles || []).filter((member) => member.id !== currentUserId)}
      disableHoverTransform
      renderAction={({ children, className, ariaLabel }) => (
        <span className={className} aria-label={ariaLabel} role="group">
          {children}
        </span>
      )}
    />
  );
}

export function TripCarouselPresentation({
  trips,
  currentUserId,
  renderAction,
  renderTrip,
  renderTripControls,
}: Pick<DashboardPresentationProps, "renderAction" | "renderTrip" | "renderTripControls"> & {
  trips: DashboardTrip[];
  currentUserId: string;
}) {
  if (!trips.length) {
    return (
      <div className="rounded-[2rem] border border-dashed border-white/20 bg-white/[0.03] p-8 text-center">
        <h2 className="text-lg font-medium text-white">No trips yet</h2>
        <p className="mt-2 text-sm text-slate-400">Create your first VAIVIA trip to start planning.</p>
        {renderAction({
          destination: { name: "create-trip" },
          href: "/trips/new",
          className: "mt-5 inline-block rounded-full bg-lime-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200",
          children: "Create first trip",
        })}
      </div>
    );
  }

  return (
    <section data-vaivia-mobile-tour-target="home-trips-widget" className="relative min-h-[620px] w-full overflow-hidden rounded-[2rem] bg-[#03030a] px-6 py-8 text-white md:px-8 md:py-9">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(255,54,190,0.24),transparent_24%),radial-gradient(circle_at_8%_88%,rgba(var(--vaivia-neon-soft-rgb),0.16),transparent_26%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%,rgba(0,0,0,0.3))]" />
      </div>
      <div className="relative z-10">
        <div className="relative z-20 mb-8 flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.55em] text-white/80">Upcoming Trips</p>
          {renderAction({
            destination: { name: "trips" },
            href: "/trips",
            className: "text-sm font-extrabold text-[var(--vaivia-neon-soft-solid)] transition hover:text-white",
            children: <>See all trips →</>,
          })}
        </div>
        <div className="your-trips-scroll relative z-10 flex snap-x snap-mandatory items-start gap-12 overflow-x-auto px-2 pb-10 pt-6 [scrollbar-width:none] md:gap-14 md:overflow-visible xl:gap-20">
          {trips.slice(0, 3).map((trip, index) => (
            <div key={trip.id} data-trip-card-shell className="relative transition-all duration-500 ease-out hover:-translate-y-3 hover:scale-110">
              {renderTrip?.(trip, index) || defaultTripCard(trip, index, currentUserId)}
              {renderTripControls?.(trip, index)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function UpcomingEventsPresentation({
  events,
  canManageEvents,
  renderAction,
}: {
  events: DashboardEvent[];
  canManageEvents: boolean;
  renderAction: DashboardPresentationProps["renderAction"];
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#080511]/90 p-5 shadow-2xl shadow-black/25 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.3em] text-lime-300">My Events</p><h2 className="mt-2 text-2xl font-black text-white">Next on the guest list</h2></div>
        <div className="flex gap-3">
          {renderAction({ destination: { name: "my-events" }, href: "/my-events", className: "rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white", children: "View all" })}
          {canManageEvents ? renderAction({ destination: { name: "manage-events" }, href: "/organizer/events", className: "rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950", children: "Manage events" }) : null}
        </div>
      </div>
      {events.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {events.slice(0, 3).map((event) => <Fragment key={`${event.admissionType}-${event.id}`}>{renderAction({
            destination: { name: "my-events" },
            href: "/my-events",
            className: "rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 transition hover:border-lime-300/30",
            ariaLabel: `Open ${event.title}`,
            children: <><CalendarDays className="h-5 w-5 text-lime-300" aria-hidden="true" /><h3 className="mt-3 line-clamp-2 text-lg font-black text-white">{event.title}</h3><p className="mt-2 text-xs font-semibold text-slate-400">{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))}</p><p className="mt-1 truncate text-xs font-semibold text-slate-400">{event.venue}</p><span className="mt-3 inline-flex rounded-full bg-lime-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-lime-200">{event.admissionType} · {event.status.replace("_", " ")}</span></>,
          })}</Fragment>)}
        </div>
      ) : (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 p-5">
          <p className="text-sm font-semibold text-slate-400">No upcoming events yet.</p>
          {renderAction({ destination: { name: "events" }, href: "/events", className: "mt-3 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-slate-950", children: "Browse events" })}
        </div>
      )}
    </section>
  );
}

function monthGridStart(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return addDays(first, -first.getDay());
}

function weekSegments(week: Date[], trips: DashboardTrip[]) {
  const first = localDateKey(week[0]);
  const last = localDateKey(week[6]);
  return trips.flatMap((trip) => {
    const range = getTripDisplayDateRange(trip);
    if (!range.startDate) return [];
    const end = range.endDate || range.startDate;
    if (end < first || range.startDate > last) return [];
    const startIndex = week.findIndex((date) => localDateKey(date) >= range.startDate! && localDateKey(date) <= end);
    const endIndex = week.map(localDateKey).findLastIndex((key) => key >= range.startDate! && key <= end);
    return startIndex < 0 || endIndex < 0 ? [] : [{ trip, startIndex, endIndex }];
  });
}

export function TripCalendarPresentation({ trips, renderAction }: { trips: DashboardTrip[]; renderAction: DashboardPresentationProps["renderAction"] }) {
  const [anchorDate, setAnchorDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const visibleTrips = useMemo(() => upcomingTrips(trips), [trips]);
  const visibleDates = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart(anchorDate), index)), [anchorDate]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, index) => visibleDates.slice(index * 7, index * 7 + 7)), [visibleDates]);
  const today = localDateKey(new Date());
  return (
    <section data-vaivia-mobile-tour-target="home-calendar" className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">Calendar</p><h2 className="mt-2 text-2xl font-black text-white">{anchorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><p className="mt-1 text-sm text-slate-400">Upcoming trips by date</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10" aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => { const now = new Date(); setAnchorDate(new Date(now.getFullYear(), now.getMonth(), 1)); }} className="h-9 rounded-full bg-lime-300 px-4 text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200">This month</button>
          <button type="button" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10" aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10">
        <div className="grid grid-cols-7 gap-px">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="bg-white/[0.05] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{day}</div>)}</div>
        <div className="space-y-px">{weeks.map((week) => {
          const segments = weekSegments(week, visibleTrips);
          return <div key={localDateKey(week[0])} className="relative grid min-h-28 grid-cols-7 gap-px bg-white/10">
            {week.map((date) => { const key = localDateKey(date); return <div key={key} className={`bg-[#12051c] p-2 ${date.getMonth() !== anchorDate.getMonth() ? "opacity-35" : ""}`}><p className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${key === today ? "bg-lime-300 text-slate-950" : "text-slate-300"}`}>{date.getDate()}</p></div>; })}
            {segments.slice(0, 3).map((segment, index) => <Fragment key={`${segment.trip.id}-${localDateKey(week[0])}`}>{renderAction({
              destination: { name: "trip", tripId: segment.trip.id, view: "overview" },
              href: getTripHref(segment.trip),
              className: "absolute z-10 flex h-5 items-center truncate px-2 text-[10px] font-black uppercase leading-none text-slate-950 shadow-[0_0_16px_rgba(0,0,0,0.20)] transition hover:brightness-110",
              ariaLabel: `Open ${segment.trip.title}`,
              style: { left: `${(segment.startIndex / 7) * 100}%`, top: `${34 + index * 23}px`, width: `${((segment.endIndex - segment.startIndex + 1) / 7) * 100}%`, backgroundColor: getTripAccentColor(trips.findIndex((item) => item.id === segment.trip.id)), borderRadius: "9999px" },
              children: segment.trip.title,
            })}</Fragment>)}
            {segments.length > 3 ? <p className="absolute bottom-2 left-2 text-[10px] font-semibold text-slate-400">+{segments.length - 3} more</p> : null}
          </div>;
        })}</div>
      </div>
    </section>
  );
}

type DashboardTask = { id: string; tripId: string; tripTitle: string; title: string; detail: string; href: string; type: "accommodation" | "transportation" };

function parseDate(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

type DashboardDateGap = { start: Date; end: Date };

function dateRangeGaps(
  tripStartDate?: string | null,
  tripEndDate?: string | null,
  accommodations: NonNullable<DashboardTrip["planning"]>["accommodations"] = [],
) {
  const start = parseDate(tripStartDate);
  const returnDate = parseDate(tripEndDate || tripStartDate);
  if (!start || !returnDate || returnDate <= start) return [];
  const lastRequiredNight = addDays(returnDate, -1);
  const stays = accommodations
    .filter((stay) => stay.status !== "cancelled")
    .map((stay) => ({ start: parseDate(stay.check_in_date), end: parseDate(stay.check_out_date) }))
    .filter((stay): stay is { start: Date; end: Date } => Boolean(stay.start && stay.end))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  if (!stays.length) return [{ start, end: lastRequiredNight }];
  const cursor = new Date(start);
  const gaps: DashboardDateGap[] = [];
  for (const stay of stays) {
    const stayStart = new Date(Math.max(stay.start.getTime(), start.getTime()));
    const stayEnd = new Date(Math.min(stay.end.getTime(), returnDate.getTime()));
    if (stayEnd <= start || stayStart >= returnDate) continue;
    if (stayStart > cursor) gaps.push({ start: new Date(cursor), end: addDays(stayStart, -1) });
    if (stayEnd > cursor) cursor.setTime(stayEnd.getTime());
    if (cursor >= returnDate) return gaps;
  }
  if (cursor < returnDate) gaps.push({ start: new Date(cursor), end: lastRequiredNight });
  return gaps;
}

function taskDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return localDateKey(start) === localDateKey(end)
    ? formatter.format(start)
    : `${formatter.format(start)}-${formatter.format(end)}`;
}

function taskDateRanges(gaps: DashboardDateGap[]) {
  const labels = gaps.map((gap) => taskDateRange(gap.start, gap.end));
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function normalized(value?: string | null) {
  return (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function dashboardTasks(trips: DashboardTrip[]) {
  const tasks: DashboardTask[] = [];
  for (const trip of upcomingTrips(trips)) {
    const title = trip.title || getPrimaryDestination(trip);
    const range = getTripDisplayDateRange(trip);
    const stays = trip.planning?.accommodations || [];
    const gaps = dateRangeGaps(range.startDate, range.endDate, stays);
    if (gaps.length) {
      tasks.push({ id: `${trip.id}-accommodation-gap`, tripId: trip.id, tripTitle: title, type: "accommodation", title: stays.length ? "Finish stay coverage" : "Add stays", detail: stays.length ? `You still need somewhere to stay for ${taskDateRanges(gaps)}.` : `${title} has no stays added yet. You need somewhere to stay for ${taskDateRanges(gaps)}.`, href: getTripHref(trip, "/accommodations") });
    }
    const transportText = normalized((trip.planning?.transportation || []).filter((item) => item.status !== "cancelled").map((item) => [item.title, item.departure_location, item.arrival_location, item.transport_type].join(" ")).join(" "));
    getTripDestinationNames(trip).filter((destination) => { const value = normalized(destination); return value && !transportText.includes(value); }).slice(0, 3).forEach((destination) => tasks.push({ id: `${trip.id}-transportation-${destination}`, tripId: trip.id, tripTitle: title, type: "transportation", title: `No transportation booked to ${destination}`, detail: `Add flight, train, car, or transfer details for ${title}.`, href: getTripHref(trip, "?tab=journey") }));
  }
  return tasks.slice(0, 8);
}

export function PlanningTasksPresentation({ trips, renderAction }: { trips: DashboardTrip[]; renderAction: DashboardPresentationProps["renderAction"] }) {
  const tasks = useMemo(() => dashboardTasks(trips), [trips]);
  return <section data-vaivia-mobile-tour-target="home-tasks" className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">Tasks</p><h2 className="mt-2 text-2xl font-black text-white">Planning checklist</h2><p className="mt-1 text-sm text-slate-400">Gaps disappear here once they are handled.</p></div><div className="flex h-10 w-10 items-center justify-center rounded-full border border-lime-300/20 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.12)]">{tasks.length}</div></div>
    {!tasks.length ? <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-6"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span><div><h3 className="text-base font-black text-white">No planning gaps found</h3><p className="mt-1 text-sm text-slate-400">Your upcoming trips have the basics covered.</p></div></div></div> : <div className="space-y-3">{tasks.map((task) => <Fragment key={task.id}>{renderAction({ destination: { name: "trip", tripId: task.tripId, view: task.type === "accommodation" ? "stays" : "transport" }, href: task.href, className: "group flex gap-3 rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/[0.08]", children: <><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-lime-200 transition group-hover:border-lime-300/40 group-hover:bg-lime-300 group-hover:text-slate-950">{task.type === "accommodation" ? <Hotel className="h-5 w-5" aria-hidden="true" /> : <Plane className="h-5 w-5" aria-hidden="true" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-white">{task.title}</span><span className="mt-1 block text-sm leading-5 text-slate-400">{task.detail}</span><span className="mt-2 block truncate text-xs font-bold uppercase tracking-[0.16em] text-lime-200/80">{task.tripTitle}</span></span></> })}</Fragment>)}</div>}
  </section>;
}

export function PassportPreviewPresentation({ data, renderAction }: Pick<DashboardPresentationProps, "data" | "renderAction">) {
  const stamps = data.passportStamps.slice(0, 4);
  return <section className="flex h-full w-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">Passport stamps</p><h2 className="mt-2 text-2xl font-black text-white">Places visited</h2><p className="mt-1 text-sm text-slate-400">Add all the places you have visited and keep them close.</p></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]"><Stamp className="h-5 w-5" aria-hidden="true" /></span></div>
    {stamps.length ? <div className="flex flex-1 flex-col"><div className="mt-5 grid flex-1 grid-cols-2 content-center justify-items-center gap-3">{stamps.map((stamp, index) => <div key={stamp.id} className={index > 1 ? "hidden xl:block" : ""}><PassportStampCard {...stamp} portOfEntryLabel={stamp.portOfEntryName} size="sm" /></div>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs font-semibold text-slate-400">Showing {data.passportStamps.length >= 4 ? "a few" : stamps.length} from your passport wall.</p>{renderAction({ destination: { name: "profile", section: "passport-stamps" }, href: "/profile#passport-stamps", className: "inline-flex items-center self-center rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200", children: "See all passports" })}</div></div> : <div className="mt-5 rounded-[1.5rem] border border-lime-300/20 bg-lime-300/[0.08] p-4"><p className="text-sm font-black text-lime-100">Your passport wall is waiting.</p><p className="mt-2 text-sm font-semibold text-slate-300">Start with one country, city, or port of entry and VAIVIA will keep your stamps together on your profile.</p>{renderAction({ destination: { name: "profile", section: "passport-stamps" }, href: "/profile#passport-stamps", className: "mt-4 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200", children: "Add passport stamps" })}</div>}
  </section>;
}

export function ProfileProgressPresentation({ data, renderAction }: Pick<DashboardPresentationProps, "data" | "renderAction">) {
  const initials = data.profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-lime-300/25 bg-slate-950 text-lg font-black text-lime-200 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.16)]">{data.profile.avatarUrl ? <img src={data.profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials || "V"}</span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">Profile</p><h2 className="mt-2 truncate text-2xl font-black text-white">{data.profile.name}</h2><p className="mt-1 truncate text-sm text-slate-400">{data.profile.username ? `@${data.profile.username}` : data.profile.email}</p></div></div><span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)] sm:flex"><UserRound className="h-5 w-5" aria-hidden="true" /></span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4"><p className="text-2xl font-black text-white">{data.passportStamps.length}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Passport stamps</p></div><div className="rounded-[1.35rem] border border-white/10 bg-[#03030a]/70 p-4"><p className="text-2xl font-black text-white">{data.wishlistItems.length}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Wishlist places</p></div></div>{renderAction({ destination: { name: "profile" }, href: "/profile", className: "mt-5 inline-flex w-full items-center justify-center rounded-full bg-lime-300 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200", children: "Open profile" })}</section>;
}

export function WishlistPreviewPresentation({ data, renderAction }: Pick<DashboardPresentationProps, "data" | "renderAction">) {
  const open = data.wishlistItems.filter((item) => item.status === "in_progress");
  const completed = data.wishlistItems.filter((item) => item.status === "completed");
  return <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.35em] text-lime-300">Travel wishlist</p><h2 className="mt-2 text-2xl font-black text-white">Places calling</h2><p className="mt-1 text-sm text-slate-400">Keep dream destinations close to the trips you are planning.</p></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]"><Wand2 className="h-5 w-5" aria-hidden="true" /></span></div>
    {open.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{open.slice(0, 4).map((item) => <Fragment key={item.id}>{renderAction({ destination: { name: "profile", section: "bucket-list" }, href: "/profile#bucket-list", className: "group flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-[#03030a]/70 p-3 transition hover:border-lime-300/30 hover:bg-white/[0.08]", children: <><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lime-300/20 bg-lime-300/10 text-2xl">{item.flagEmoji || "✦"}</span><span className="min-w-0"><span className="block truncate text-sm font-black text-white">{item.placeLabel}</span><span className="mt-1 block truncate text-xs font-semibold text-slate-400">{[item.city, item.region, item.countryName].filter(Boolean).join(", ") || "Wishlist place"}</span></span></> })}</Fragment>)}</div> : <div className="mt-5 rounded-[1.5rem] border border-lime-300/20 bg-lime-300/[0.08] p-4"><p className="text-sm font-black text-lime-100">Your future map is wide open.</p><p className="mt-2 text-sm font-semibold text-slate-300">Add cities, regions, or countries you want to visit and VAIVIA will keep them on your profile.</p></div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs font-semibold text-slate-400">{open.length} in progress · {completed.length} completed</p>{renderAction({ destination: { name: "profile", section: "bucket-list" }, href: "/profile#bucket-list", className: "inline-flex items-center rounded-full bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200", children: "See wishlist" })}</div>
  </section>;
}

export function DashboardPresentation({ data, renderAction, renderTrip, renderTripControls }: DashboardPresentationProps) {
  const trips = useMemo(() => upcomingTrips(data.trips), [data.trips]);
  return <main className="min-h-screen bg-[#0c0115] text-white"><div className="space-y-1.5"><DashboardHero name={data.name} countdownTarget={data.countdownTarget} countdownUnit={data.countdownUnit} /><div className="mx-4 md:mx-8"><div className="space-y-8"><TripCarouselPresentation trips={trips} currentUserId={data.currentUserId} renderAction={renderAction} renderTrip={renderTrip} renderTripControls={renderTripControls} /><UpcomingEventsPresentation events={data.events} canManageEvents={data.canManageEvents} renderAction={renderAction} /><div className="grid gap-6 lg:grid-cols-3"><TripCalendarPresentation trips={trips} renderAction={renderAction} /><PlanningTasksPresentation trips={trips} renderAction={renderAction} /><PassportPreviewPresentation data={data} renderAction={renderAction} /></div><div className="grid gap-6 lg:grid-cols-2"><ProfileProgressPresentation data={data} renderAction={renderAction} /><WishlistPreviewPresentation data={data} renderAction={renderAction} /></div></div></div></div></main>;
}
