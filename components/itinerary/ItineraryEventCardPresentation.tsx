import type { CSSProperties, ReactNode } from "react";
import { Lock } from "lucide-react";

export type ItineraryCardPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  initials: string;
};

export function getItineraryStatusClasses(status: string) {
  const normalized = status.toLowerCase();
  if (["confirmed", "booked"].includes(normalized)) {
    return "border-emerald-300/40 bg-emerald-300/15 text-emerald-100";
  }
  if (normalized === "tentative") {
    return "border-amber-300/60 bg-amber-300/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)]";
  }
  return "border-sky-300/40 bg-sky-300/15 text-sky-100";
}

export function getItineraryTentativeStyle(
  status: string,
  baseColor = "#080b16",
  stripeColor = "rgba(251,191,36,0.16)",
) {
  if (status.toLowerCase() !== "tentative") return undefined;
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${baseColor} 0, ${baseColor} 10px, ${stripeColor} 10px, ${stripeColor} 20px)`,
  } as CSSProperties;
}

export function ItineraryPrivateBadge({
  compact = false,
  iconOnly = false,
  className = "",
}: {
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  if (iconOnly) {
    return (
      <span
        className={`vaivia-private-tag inline-flex items-center justify-center rounded-full border border-white/20 bg-slate-950/85 text-lime-200 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.16)] ${
          compact ? "h-7 w-7" : "h-8 w-8"
        } ${className}`}
        title="Private item"
        aria-label="Private item"
      >
        <Lock
          className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span
      className={`vaivia-private-tag inline-flex items-center gap-1 rounded-full border border-white/20 bg-slate-950/80 font-bold uppercase tracking-[0.12em] text-lime-100 shadow-sm ${
        compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-xs"
      } ${className}`}
      title="Private item"
      aria-label="Private item"
    >
      <Lock
        className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
        aria-hidden="true"
      />
      Private
    </span>
  );
}

export function ItineraryAssignedAvatars({
  people,
}: {
  people: ItineraryCardPerson[];
}) {
  if (people.length === 0) return null;
  const visiblePeople = people.slice(0, 4);
  const overflowCount = people.length - visiblePeople.length;

  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center justify-end -space-x-2"
      aria-label={people.map((person) => person.name).join(", ") || "Selected travellers"}
    >
      {visiblePeople.map((person) => (
        <span
          key={person.id}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_18px_rgba(0,0,0,0.28)]"
          title={person.name}
        >
          {person.avatarUrl ? (
            // Shared web/mobile presentation intentionally uses a browser image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            person.initials
          )}
        </span>
      ))}
      {overflowCount > 0 ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 bg-slate-950 text-[10px] font-black text-lime-200 shadow-[0_0_18px_rgba(0,0,0,0.28)]">
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}

type ActionRenderer = (props: {
  children: ReactNode;
  className: string;
  "aria-label": string;
}) => ReactNode;

export type ItineraryEventCardPresentationProps = {
  title: string;
  status: string;
  timeLabel: string;
  categoryLabel: string;
  categoryColor: string;
  location?: string | null;
  timezone?: string | null;
  noteLines?: string[];
  leadingVisual?: ReactNode;
  isTransportation?: boolean;
  isPrivate?: boolean;
  people?: ItineraryCardPerson[];
  compact?: boolean;
  fillHeight?: boolean;
  hideTimezone?: boolean;
  reservationCode?: ReactNode;
  actionRow?: ReactNode;
  renderPrimaryAction?: ActionRenderer;
};

export function ItineraryEventCardPresentation({
  title,
  status,
  timeLabel,
  categoryLabel,
  categoryColor,
  location,
  timezone,
  noteLines = [],
  leadingVisual,
  isTransportation = false,
  isPrivate = false,
  people = [],
  compact = false,
  fillHeight = false,
  hideTimezone = false,
  reservationCode,
  actionRow,
  renderPrimaryAction,
}: ItineraryEventCardPresentationProps) {
  const cardStyle = {
    borderLeftColor: categoryColor,
    ...getItineraryTentativeStyle(status),
  } as CSSProperties;
  const primaryContent = (
    <>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          {leadingVisual}
          <div className="min-w-0">
            <p className="text-xs font-medium text-lime-200/80">{timeLabel}</p>
            <h3
              className={`mt-1 font-semibold text-white ${compact ? "text-sm" : "text-base"}`}
            >
              {title}
            </h3>
            {location ? (
              <p className="mt-1 truncate text-xs text-slate-300">{location}</p>
            ) : null}
            {isTransportation && reservationCode ? (
              <div className="mt-2">{reservationCode}</div>
            ) : null}
          </div>
        </div>
      </div>

      {!compact ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-white/10 bg-white/[0.08] px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
              {categoryLabel}
            </span>
          </div>
          {(!hideTimezone || isTransportation) && timezone ? (
            <p className="mt-2 text-xs text-slate-400">{timezone}</p>
          ) : null}
          {noteLines.length > 0 ? (
            <div
              className={`mt-3 space-y-1 text-sm leading-6 ${
                isTransportation
                  ? "rounded-md border border-white/10 bg-white/[0.06] p-3 text-slate-300"
                  : "text-slate-300"
              }`}
            >
              {noteLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className={
                    line.endsWith(":")
                      ? "pt-1 text-xs font-semibold uppercase tracking-wide text-lime-200/80 first:pt-0"
                      : ""
                  }
                >
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
  const primaryClassName = `w-full p-3 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
    fillHeight
      ? "flex min-h-0 flex-1 flex-col justify-start overflow-hidden"
      : ""
  }`;

  return (
    <div
      data-itinerary-status={status.toLowerCase()}
      style={cardStyle}
      className={`relative w-full border border-l-[16px] border-white/10 bg-[#080b16]/95 text-left text-white shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition duration-200 hover:-translate-y-0.5 hover:border-lime-300/20 hover:shadow-[0_24px_60px_rgba(0,0,0,0.38)] ${
        fillHeight ? "flex h-full flex-col justify-start overflow-hidden" : ""
      } rounded-[1.25rem]`}
    >
      <div className="absolute right-3 top-3 z-10 flex shrink-0 flex-wrap justify-end gap-2">
        {isPrivate ? <ItineraryPrivateBadge compact iconOnly /> : null}
        <span
          className={`rounded-md border px-2 py-1 text-xs font-medium ${getItineraryStatusClasses(status)}`}
        >
          {status.trim().toUpperCase()}
        </span>
      </div>
      {renderPrimaryAction ? (
        renderPrimaryAction({
          children: primaryContent,
          className: primaryClassName,
          "aria-label": `View ${title}`,
        })
      ) : (
        <div className={primaryClassName}>{primaryContent}</div>
      )}
      <ItineraryAssignedAvatars people={people} />
      {actionRow ? (
        <div className={compact ? "px-2 pb-2 pr-16" : "px-3 pb-3 pr-16"}>
          {actionRow}
        </div>
      ) : null}
    </div>
  );
}

export function FlightDepartureBufferPresentation({
  timeLabel,
  departureLocation,
  compact = false,
  fillHeight = false,
}: {
  timeLabel: string;
  departureLocation?: string | null;
  compact?: boolean;
  fillHeight?: boolean;
}) {
  return (
    <div
      data-flight-departure-buffer
      className={`relative w-full overflow-hidden rounded-[1.25rem] border border-sky-300/25 border-l-[16px] border-l-sky-300 bg-sky-300/10 text-left text-white shadow-[0_18px_45px_rgba(0,0,0,0.22)] ${
        fillHeight ? "flex h-full flex-col justify-start" : ""
      }`}
    >
      <div className={compact ? "p-3" : "p-4"}>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-200">
          {timeLabel}
        </p>
        <h3 className={`mt-1 font-black ${compact ? "text-sm" : "text-base"}`}>
          Depart for airport
        </h3>
        <p className="mt-1 text-xs font-semibold text-slate-300">
          Four-hour flight buffer · {departureLocation || "Airport"}
        </p>
      </div>
    </div>
  );
}
