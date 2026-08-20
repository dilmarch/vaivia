import type { LucideIcon } from "lucide-react";
import { ArrowRight, CloudSun, Flag, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

export type TripOverviewLocation = {
  id: string;
  flag: string;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type TripOverviewPerson = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  initial: string;
};

export type TripOverviewTransportation = {
  id: string;
  modeEmoji: string;
  departureLabel?: string | null;
  arrivalLabel?: string | null;
  summary: string;
  detail?: string | null;
  pauseLabel?: string | null;
};

export type TripOverviewStay = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  label: string;
  kind: "booked" | "missing" | "tentative";
  omitCheckIn?: boolean;
};

export type TripOverviewActionRenderProps = {
  children: ReactNode;
  className: string;
};

export function formatTripOverviewDate(dateString?: string | null) {
  if (!dateString) return "Not set";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TripOverviewPresentation({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-3 pb-8 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
      {children}
    </section>
  );
}

export function TripOverviewLocationDatesPresentation({
  locations,
  startDate,
  endDate,
  missingDateLabel,
  renderLocationsAction,
}: {
  locations: TripOverviewLocation[];
  startDate?: string | null;
  endDate?: string | null;
  missingDateLabel: string;
  renderLocationsAction?: (props: TripOverviewActionRenderProps) => ReactNode;
}) {
  const locationClassName =
    "rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-left text-white shadow-xl shadow-black/15 transition hover:border-lime-300/30 hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-lime-300/45";
  const locationContent = (
    <>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
        Trip Legs
      </p>
      <div className="mt-3 min-h-10 space-y-2">
        {locations.length > 0 ? (
          <>
            {locations.slice(0, 3).map((location) => (
              <div
                key={location.id}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/45 px-2.5 py-1.5"
              >
                <span className="text-xl leading-none">{location.flag}</span>
                <span className="truncate text-xs font-black text-slate-100">
                  {location.startDate
                    ? formatTripOverviewDate(location.startDate)
                    : missingDateLabel}
                </span>
              </div>
            ))}
            {locations.length > 3 ? (
              <p className="pl-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-100/80">
                +{locations.length - 3} more
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-2.5 py-1.5 text-lime-100">
            <Flag className="h-4 w-4" aria-hidden="true" />
            <span className="truncate text-xs font-black">Add a leg</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="grid grid-cols-[0.85fr_1.15fr] gap-3">
      {renderLocationsAction ? (
        renderLocationsAction({
          children: locationContent,
          className: locationClassName,
        })
      ) : (
        <div className={locationClassName}>{locationContent}</div>
      )}

      <div className="space-y-2 rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-white shadow-xl shadow-black/15">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
            Departing
          </p>
          <p className="mt-1 text-sm font-black">
            {startDate ? formatTripOverviewDate(startDate) : missingDateLabel}
          </p>
        </div>
        <div className="border-t border-white/10 pt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
            Returning
          </p>
          <p className="mt-1 text-sm font-black">
            {endDate ? formatTripOverviewDate(endDate) : missingDateLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function TripOverviewPersonAvatar({ person }: { person: TripOverviewPerson }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-lg shadow-black/20"
      title={person.label}
    >
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        person.initial
      )}
    </span>
  );
}

export function TripOverviewPeoplePresentation({
  title,
  people,
  emptyText,
  inviteMode = false,
  inviteAction,
  renderAction,
}: {
  title: string;
  people: TripOverviewPerson[];
  emptyText: string;
  inviteMode?: boolean;
  inviteAction?: ReactNode;
  renderAction?: (props: TripOverviewActionRenderProps) => ReactNode;
}) {
  const visiblePeople = people.slice(0, 5);
  const hiddenCount = Math.max(people.length - visiblePeople.length, 0);
  const className =
    "min-w-0 rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-3 text-left text-white shadow-xl shadow-black/15 transition hover:border-lime-300/30 hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-lime-300/45";
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
          <span>{title}</span>
        </p>
        <span className="text-xs font-black text-slate-400">{people.length}</span>
      </div>
      {people.length > 0 ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
          {inviteMode && inviteAction ? (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300/10 text-lime-100 transition hover:bg-lime-300 hover:text-slate-950"
              aria-label="Invite someone"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          {visiblePeople.map((person) => (
            <TripOverviewPersonAvatar key={person.id} person={person} />
          ))}
          {hiddenCount > 0 ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-[10px] font-black text-lime-100">
              +{hiddenCount}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold leading-5 text-slate-400">
          {inviteMode && inviteAction ? (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300/10 text-lime-100 transition hover:bg-lime-300 hover:text-slate-950"
              aria-label="Invite someone"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          <span>{emptyText}</span>
        </p>
      )}
    </>
  );

  return renderAction ? (
    renderAction({ children: content, className })
  ) : (
    <div className={className}>{content}</div>
  );
}

export function TripOverviewCountdownPresentation({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="vaivia-countdown-card relative overflow-hidden rounded-[1.35rem] border border-lime-300/30 bg-lime-300 p-5 text-slate-950 shadow-[0_0_50px_rgba(var(--vaivia-neon-rgb),0.22)]">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/35 blur-2xl" />
      <div className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-fuchsia-400/20 blur-2xl" />
      {children}
    </div>
  );
}

export function TripOverviewWeatherUnavailablePresentation({
  destinationName,
  message = "Weather forecast unavailable for this destination",
}: {
  destinationName: string;
  message?: string;
}) {
  return (
    <section
      className="md:col-span-2 xl:col-span-3 rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 text-white shadow-xl shadow-black/15"
      aria-labelledby="trip-weather-title"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-300">
          <CloudSun className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="trip-weather-title" className="text-sm font-black">
            Weather in {destinationName}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-400" role="status">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}

export function TripOverviewTilePresentation({
  title,
  description,
  icon: Icon,
  buttonLabel,
  children,
  disabled = false,
  alignTop = false,
  renderAction,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  children?: ReactNode;
  disabled?: boolean;
  alignTop?: boolean;
  renderAction?: (props: TripOverviewActionRenderProps) => ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950/75 text-lime-200 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.12)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-white">{title}</span>
          <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-400">
            {description}
          </span>
        </span>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
      <span
        className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-3 py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] transition ${
          disabled
            ? "border border-white/10 bg-white/[0.04] text-slate-500"
            : "bg-lime-300 text-slate-950 group-hover:bg-lime-200"
        }`}
      >
        {buttonLabel}
      </span>
    </>
  );
  const className = `group flex min-h-40 flex-col ${
    alignTop ? "justify-start" : "justify-between"
  } rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-left shadow-xl shadow-black/15 transition hover:border-lime-300/30 hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-lime-300/45`;

  if (renderAction && !disabled) {
    return renderAction({ children: content, className });
  }

  return <div className={className}>{content}</div>;
}

export function TripOverviewTransportTimeline({
  items,
}: {
  items: TripOverviewTransportation[];
}) {
  if (items.length === 0) {
    return (
      <div className="relative pl-5">
        <div className="relative rounded-xl border border-white/10 bg-slate-950/45 px-2.5 py-2 text-[11px] font-semibold leading-4 text-slate-300">
          <TimelineDot />
          <p className="font-black text-slate-100">nothing booked</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            add a transportation item to the itinerary
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-2.5 pl-5 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:border-l before:border-dotted before:border-lime-300/45">
      {items.map((item) => (
        <div
          key={item.id}
          className="space-y-1.5 text-[11px] font-semibold leading-4 text-slate-300"
        >
          <div className="relative rounded-xl border border-white/10 bg-slate-950/45 px-2.5 py-2 text-slate-200">
            <TimelineDot />
            {item.departureLabel && item.arrivalLabel ? (
              <p className="flex flex-wrap items-center gap-1.5 font-black text-slate-100">
                <span>{item.modeEmoji}</span>
                <span>{item.departureLabel}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-lime-200" aria-hidden="true" />
                <span>{item.arrivalLabel}</span>
              </p>
            ) : (
              <p className="font-black text-slate-100">{item.summary}</p>
            )}
            {item.detail ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                {item.detail}
              </p>
            ) : null}
          </div>
          {item.pauseLabel ? (
            <p className="pl-2 text-[10px] font-bold uppercase tracking-[0.08em] text-lime-100/80">
              {item.pauseLabel}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TimelineDot() {
  return (
    <span
      className="absolute -left-[19px] top-3 flex h-3 w-3 items-center justify-center rounded-full border border-lime-300/70 bg-[#0c0115] shadow-[0_0_10px_rgba(var(--vaivia-neon-rgb),0.25)]"
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
    </span>
  );
}

function StayTimelineDot() {
  return (
    <span
      className="absolute -left-[19px] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-lime-300/70 bg-[#0c0115] shadow-[0_0_10px_rgba(var(--vaivia-neon-rgb),0.25)]"
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
    </span>
  );
}

export function TripOverviewStayTimeline({ items }: { items: TripOverviewStay[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] font-semibold leading-4 text-slate-400">
        None booked yet
      </p>
    );
  }

  return (
    <div className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:border-l before:border-dotted before:border-lime-300/45">
      {items.map((item) => (
        <div
          key={item.id}
          className="space-y-1.5 text-[11px] font-semibold leading-4 text-slate-300"
        >
          {!item.omitCheckIn ? (
            <p className="relative flex items-start">
              <StayTimelineDot />
              <span>{formatTripOverviewDate(item.checkInDate)}</span>
            </p>
          ) : null}
          <p className="rounded-xl border border-white/10 bg-slate-950/45 px-2.5 py-2 text-slate-200">
            <span className="mr-1.5">
              {item.kind === "booked" ? "🏨" : item.kind === "tentative" ? "⚠️" : "❗"}
            </span>
            <span>{item.label}</span>
          </p>
          <p className="relative flex items-start">
            <StayTimelineDot />
            <span>{formatTripOverviewDate(item.checkOutDate)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

export function TripOverviewComparisonPresentation({
  renderFlightsAction,
  flightsDisabled = false,
}: {
  renderFlightsAction?: (props: TripOverviewActionRenderProps) => ReactNode;
  flightsDisabled?: boolean;
}) {
  const flightsClassName = `rounded-[1.35rem] border p-4 text-center text-sm font-black leading-5 shadow-[0_0_32px_rgba(var(--vaivia-neon-rgb),0.18)] transition focus:outline-none focus:ring-2 focus:ring-lime-300/45 ${
    flightsDisabled
      ? "border-white/10 bg-white/[0.04] text-slate-500"
      : "border-lime-300/25 bg-lime-300 text-slate-950 hover:bg-lime-200"
  }`;
  const flightsContent = (
    <>
      Compare flights
      <span
        className={`mt-1 block text-[11px] font-black uppercase tracking-[0.12em] ${
          flightsDisabled ? "text-slate-500" : "text-slate-800/75"
        }`}
      >
        Add flights to compare
      </span>
    </>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {renderFlightsAction && !flightsDisabled ? (
        renderFlightsAction({ children: flightsContent, className: flightsClassName })
      ) : (
        <div className={flightsClassName}>{flightsContent}</div>
      )}
      <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 text-center text-sm font-black leading-5 text-slate-500 shadow-xl shadow-black/15">
        Compare stays
        <span className="mt-1 block text-[11px] font-black uppercase tracking-[0.12em]">
          Coming soon
        </span>
      </div>
    </div>
  );
}
