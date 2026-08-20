import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { AirlineIcon } from "@/components/AirlineIcon";
import {
  ensureReadableColor,
  getAirlineBrandTheme,
  getReadableTextColor,
} from "@/lib/airlineBrandTheme";
import {
  ItineraryAssignedAvatars,
  ItineraryPrivateBadge,
  getItineraryStatusClasses,
  getItineraryTentativeStyle,
  type ItineraryCardPerson,
} from "./ItineraryEventCardPresentation";

export type FlightCardPresentationData = {
  titleLabel: string;
  airlineCode?: string | null;
  airlineName?: string | null;
  flightNumber?: string | null;
  routeLabel?: string | null;
  originName?: string | null;
  destinationName?: string | null;
  departureTimeLabel: string;
  arrivalTimeLabel: string;
  duration?: string | null;
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  arrivalDateLabel?: string | null;
  arrivalWarning?: {
    tone: "warning" | "danger";
    text: string;
  } | null;
};

export function TransportationCardPresentation({
  flight,
  status,
  isPrivate = false,
  people = [],
  reservationCode,
  actionRow,
  renderPrimaryAction,
}: {
  flight: FlightCardPresentationData;
  status: string;
  isPrivate?: boolean;
  people?: ItineraryCardPerson[];
  reservationCode?: ReactNode;
  actionRow?: ReactNode;
  renderPrimaryAction?: (props: {
    children: ReactNode;
    className: string;
    "aria-label": string;
  }) => ReactNode;
}) {
  const airlineTheme = getAirlineBrandTheme(flight.airlineCode);
  const cardThemeStyle = {
    "--airline-card-primary": airlineTheme.primary,
    "--airline-card-accent": airlineTheme.accent,
    "--airline-card-text": getReadableTextColor(airlineTheme.accent),
    "--airline-card-primary-text": getReadableTextColor(airlineTheme.primary),
    "--airline-card-muted": ensureReadableColor({
      foreground: "#475569",
      background: airlineTheme.accent,
    }),
    ...getItineraryTentativeStyle(status, airlineTheme.accent),
  } as CSSProperties;
  const primaryClassName =
    "w-full rounded-md p-4 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-[var(--airline-card-primary)] focus:ring-offset-2";
  const primaryContent = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-white/70 bg-white/90 text-xl shadow-sm">
              ✈️
            </span>
            <AirlineIcon
              airlineCode={flight.airlineCode}
              airlineName={flight.airlineName}
              flightNumber={flight.flightNumber}
            />
          </div>
          <div className="min-w-0">
            <h3 className="vaivia-airline-card-text font-semibold text-[var(--airline-card-text)]">
              {flight.titleLabel}
            </h3>
            {flight.routeLabel ? (
              <p className="vaivia-airline-card-muted mt-1 text-sm text-[var(--airline-card-muted)]">
                {flight.routeLabel}
              </p>
            ) : null}
            {reservationCode ? <div className="mt-2">{reservationCode}</div> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-md border border-white/70 bg-white/85 p-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Departure
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {flight.departureTimeLabel}
          </p>
          {flight.originName ? (
            <p className="mt-1 text-xs text-slate-600">{flight.originName}</p>
          ) : null}
          {flight.departureTerminal ? (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {flight.departureTerminal}
            </p>
          ) : null}
        </div>

        {flight.duration ? (
          <div className="vaivia-airline-card-primary-chip rounded-full bg-[var(--airline-card-primary)] px-3 py-1 text-center text-xs font-semibold text-[var(--airline-card-primary-text)] shadow-sm">
            {flight.duration}
          </div>
        ) : null}

        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Arrival
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {flight.arrivalTimeLabel}
          </p>
          {flight.destinationName ? (
            <p className="mt-1 text-xs text-slate-600">
              {flight.destinationName}
            </p>
          ) : null}
          {flight.arrivalTerminal ? (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {flight.arrivalTerminal}
            </p>
          ) : null}
        </div>
      </div>

      {flight.arrivalWarning ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${
            flight.arrivalWarning.tone === "danger"
              ? "border-red-400/50 bg-red-500/15 text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.14)]"
              : "border-amber-300/50 bg-amber-300/15 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.14)]"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{flight.arrivalWarning.text}</span>
        </div>
      ) : flight.arrivalDateLabel ? (
        <p className="vaivia-airline-card-muted mt-3 text-xs font-medium text-[var(--airline-card-muted)]">
          Arrives {flight.arrivalDateLabel}
        </p>
      ) : null}
    </>
  );

  return (
    <div
      data-itinerary-status={status.toLowerCase()}
      style={cardThemeStyle}
      className="vaivia-airline-branded-card relative rounded-md border border-white/70 border-l-[16px] border-l-[var(--airline-card-primary)] bg-[var(--airline-card-accent)] text-[var(--airline-card-text)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute right-3 top-3 z-10 flex shrink-0 flex-wrap justify-end gap-2">
        {isPrivate ? <ItineraryPrivateBadge compact iconOnly /> : null}
        <span
          className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getItineraryStatusClasses(status)}`}
        >
          {status.trim().toUpperCase()}
        </span>
      </div>
      {renderPrimaryAction ? (
        renderPrimaryAction({
          children: primaryContent,
          className: primaryClassName,
          "aria-label": `View ${flight.titleLabel}`,
        })
      ) : (
        <div className={primaryClassName}>{primaryContent}</div>
      )}
      <ItineraryAssignedAvatars people={people} />
      {actionRow ? (
        <div className="flex flex-wrap justify-start gap-2 px-4 pb-4 pr-20">
          {actionRow}
        </div>
      ) : null}
    </div>
  );
}
