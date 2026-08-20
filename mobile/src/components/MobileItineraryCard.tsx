import { AirlineIcon } from "@/components/AirlineIcon";
import {
  FlightDepartureBufferPresentation,
  ItineraryEventCardPresentation,
  type ItineraryCardPerson,
} from "@/components/itinerary/ItineraryEventCardPresentation";
import { StayCardPresentation } from "@/components/itinerary/StayCardPresentation";
import {
  TransportationCardPresentation,
  type FlightCardPresentationData,
} from "@/components/itinerary/TransportationCardPresentation";
import { getAirlineCodeFromFlightNumber } from "@/lib/airlineIcons";
import { stripStructuredFlightNotes } from "@/lib/flightNotes";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";
import {
  getTransportationModeEmoji,
  resolveTransportationMode,
} from "@/lib/transportationModes";
import type { MobileItineraryItem } from "@/lib/mobileApi/contracts";

type MobileItineraryCardProps = {
  item: MobileItineraryItem;
  timeLabel?: string;
};

function formatTime(time?: string | null) {
  if (!time) return "No time";
  const [hours, minutes] = time.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeWithZone(
  time?: string | null,
  timezone?: string | null,
  dateKey?: string | null,
) {
  const timeLabel = formatTime(time);
  if (!timezone || timeLabel === "No time") return timeLabel;
  try {
    const [hours, minutes] = (time || "").split(":").map(Number);
    const date = new Date(`${dateKey || "2000-01-01"}T00:00:00`);
    date.setHours(hours, minutes);
    const zonePart = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    return zonePart ? `${timeLabel} ${zonePart}` : `${timeLabel} ${timezone}`;
  } catch {
    return `${timeLabel} ${timezone}`;
  }
}

function formatDateHeader(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getDateDifferenceDays(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return 0;
  return Math.round(
    (new Date(`${endDate}T00:00:00`).getTime() -
      new Date(`${startDate}T00:00:00`).getTime()) /
      86_400_000,
  );
}

function peopleForPresentation(item: MobileItineraryItem): ItineraryCardPerson[] {
  return (item.people || []).map((person) => ({
    id: person.id,
    name: person.name,
    avatarUrl: person.avatar_url,
    initials: person.initials,
  }));
}

function DisabledAction({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${children} unavailable`}
      className="inline-flex min-h-8 cursor-not-allowed items-center justify-center rounded-md border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-slate-100 opacity-60"
    >
      {children}
    </button>
  );
}

function ReservationCode({ code }: { code: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-900">
      <span className="min-w-0 truncate font-black tracking-wide">{code}</span>
    </span>
  );
}

function isFlight(item: MobileItineraryItem) {
  return (
    item.source === "transportation" &&
    resolveTransportationMode(item.transportation_mode, item.title) === "airplane"
  );
}

function getFlightPresentation(item: MobileItineraryItem): FlightCardPresentationData {
  const airlineCode =
    item.airline_code ||
    getAirlineCodeFromFlightNumber(item.flight_number) ||
    getAirlineCodeFromFlightNumber(item.title);
  const titleLabel =
    [item.airline_name, item.flight_number].filter(Boolean).join(" ") || item.title;
  const routeLabel = [item.departure_location, item.arrival_location]
    .filter(Boolean)
    .join(" → ");
  const startTimezone = item.departure_timezone || item.timezone;
  const endTimezone =
    item.arrival_timezone || item.departure_timezone || item.timezone;
  const duration =
    (item.start_time && item.end_time && startTimezone && endTimezone
      ? getZonedDurationLabel({
          startDate: item.item_date,
          startTime: item.start_time,
          startTimezone,
          endDate: item.end_date || item.item_date,
          endTime: item.end_time,
          endTimezone,
        })
      : "") || item.duration;
  const arrivalDayDifference = getDateDifferenceDays(item.item_date, item.end_date);
  const arrivalWarning =
    arrivalDayDifference > 0 && item.end_date
      ? {
          tone: arrivalDayDifference >= 2 ? ("danger" as const) : ("warning" as const),
          text:
            arrivalDayDifference >= 2
              ? `Flight arrives two days later on ${formatDateHeader(item.end_date)}`
              : `Flight arrives the next day on ${formatDateHeader(item.end_date)}`,
        }
      : null;

  return {
    titleLabel,
    airlineCode,
    airlineName: item.airline_name,
    flightNumber: item.flight_number,
    routeLabel,
    originName: item.departure_location,
    destinationName: item.arrival_location,
    departureTimeLabel: formatTimeWithZone(
      item.start_time,
      item.departure_timezone || item.timezone,
      item.item_date,
    ),
    arrivalTimeLabel: formatTimeWithZone(
      item.end_time,
      item.arrival_timezone || item.departure_timezone || item.timezone,
      item.end_date || item.item_date,
    ),
    duration,
    departureTerminal: item.departure_terminal,
    arrivalTerminal: item.arrival_terminal,
    arrivalDateLabel: item.end_date ? formatDateHeader(item.end_date) : null,
    arrivalWarning,
  };
}

export function MobileItineraryCard({ item, timeLabel }: MobileItineraryCardProps) {
  const resolvedTimeLabel =
    timeLabel ||
    `${formatTime(item.start_time)}${
      item.end_time ? ` - ${formatTime(item.end_time)}` : ""
    }`;

  if (item.is_flight_departure_buffer) {
    return (
      <FlightDepartureBufferPresentation
        timeLabel={resolvedTimeLabel}
        departureLocation={item.departure_location}
      />
    );
  }

  if (item.accommodation_hold_kind) {
    return (
      <StayCardPresentation
        kind={item.accommodation_hold_kind}
        title={item.title}
        timeLabel={resolvedTimeLabel}
        location={item.location}
        actionRow={<DisabledAction>Details</DisabledAction>}
      />
    );
  }

  if (isFlight(item)) {
    return (
      <TransportationCardPresentation
        flight={getFlightPresentation(item)}
        status={item.status || "tentative"}
        isPrivate={item.is_private}
        people={peopleForPresentation(item)}
        reservationCode={
          item.reservation_code ? <ReservationCode code={item.reservation_code} /> : null
        }
        actionRow={
          <>
            {item.flight_number ? <DisabledAction>Track flight</DisabledAction> : null}
            <DisabledAction>Details</DisabledAction>
          </>
        }
      />
    );
  }

  const modeEmoji =
    item.source === "transportation"
      ? getTransportationModeEmoji(
          resolveTransportationMode(item.transportation_mode, item.title),
        )
      : null;
  const leadingVisual =
    item.source === "transportation" && modeEmoji !== "🧭" ? (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.08] text-xl shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.10)]">
        {modeEmoji}
      </span>
    ) : item.airline_code || item.flight_number ? (
      <AirlineIcon
        airlineCode={item.airline_code}
        airlineName={item.airline_name}
        flightNumber={item.flight_number}
      />
    ) : null;
  const displayNotes =
    item.source === "transportation"
      ? stripStructuredFlightNotes(item.notes || "")
      : item.notes || "";

  return (
    <ItineraryEventCardPresentation
      title={item.title}
      status={item.status || "planned"}
      timeLabel={
        item.source === "transportation"
          ? [
              item.start_time
                ? formatTimeWithZone(
                    item.start_time,
                    item.departure_timezone || item.timezone,
                    item.item_date,
                  )
                : "",
              item.end_time
                ? formatTimeWithZone(
                    item.end_time,
                    item.arrival_timezone || item.departure_timezone || item.timezone,
                    item.end_date || item.item_date,
                  )
                : "",
            ]
              .filter(Boolean)
              .join(" - ")
          : resolvedTimeLabel
      }
      categoryLabel={item.category_name || item.category || "Itinerary"}
      categoryColor={item.category_color_hex || "#7c3cff"}
      location={item.location}
      timezone={item.timezone}
      noteLines={displayNotes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)}
      leadingVisual={leadingVisual}
      isTransportation={item.source === "transportation"}
      isPrivate={item.is_private}
      people={peopleForPresentation(item)}
      hideTimezone
      reservationCode={
        item.reservation_code ? <ReservationCode code={item.reservation_code} /> : null
      }
      actionRow={<DisabledAction>Details</DisabledAction>}
    />
  );
}
