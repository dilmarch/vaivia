"use client";

import Link from "next/link";
import Script from "next/script";
import type { CSSProperties } from "react";
import {
    AlertTriangle,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Columns3,
    Copy,
    ExternalLink,
    List,
    Lock,
    Pencil,
    Trash2,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import { AirlineIcon } from "@/components/AirlineIcon";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import JourneyMap from "@/components/JourneyMap";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import SuggestedIdeasPanel from "@/components/SuggestedIdeasPanel";
import { TrackFlightButton } from "@/components/TrackFlightButton";
import TransportationEditForm from "@/components/TransportationEditForm";
import TransportationForm, {
    type FlightLeg,
    type TransportationFormInitialValues,
} from "@/components/TransportationForm";
import {
    ensureReadableColor,
    getAirlineBrandTheme,
    getReadableTextColor,
} from "@/lib/airlineBrandTheme";
import { getIataAirportCode } from "@/lib/airportCodes";
import { getAirlineCodeFromFlightNumber } from "@/lib/airlineIcons";
import { getZonedDurationLabel } from "@/lib/timezoneDuration";
import type { TripAudienceMode, TripAudienceOption } from "@/lib/tripAudience";
import type {
    TransportationTraveler,
    TransportationTravelerOptions,
} from "@/lib/travelers";
import { getInitials } from "@/lib/travelers";
import {
    FALLBACK_CATEGORY_COLOR,
    FALLBACK_CATEGORY_LABEL,
} from "@/lib/itineraryCategories";
import type { TripIdea } from "@/lib/tripIdeas";
import type { MoveTargetTrip } from "@/lib/tripMove";

export type ItineraryCalendarItem = {
    id: string;
    title: string;
    item_date: string;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    category: string;
    category_id?: string | null;
    category_name?: string | null;
    category_color_hex?: string | null;
    category_color_key?: string | null;
    category_owner_id?: string | null;
    status: string;
    location?: string | null;
    timezone?: string | null;
    url?: string | null;
    ticket_website?: string | null;
    location_website?: string | null;
    cover_image_url?: string | null;
    notes?: string | null;
    formatted_address?: string | null;
    google_place_id?: string | null;
    transportation_mode?: string | null;
    airline_name?: string | null;
    airline_code?: string | null;
    flight_number?: string | null;
    reservation_code?: string | null;
    cost?: number | null;
    currency?: string | null;
    travelers?: TransportationTraveler[];
    participants?: TransportationTraveler[];
    audience_selected_options?: TripAudienceOption[];
    duration?: string | null;
    departure_location?: string | null;
    arrival_location?: string | null;
    departure_timezone?: string | null;
    arrival_timezone?: string | null;
    departure_terminal?: string | null;
    arrival_terminal?: string | null;
    source_table?: "itinerary_items" | "transportation_items";
    is_private?: boolean | null;
    audience_mode?: TripAudienceMode | null;
};

export type CalendarAccommodation = {
    id: string;
    hotel_name: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    address?: string | null;
    check_in_date: string;
    check_out_date: string;
    status?: string | null;
};

export type CalendarMemberLocationLeg = {
    id: string;
    locationKey?: string | null;
    name: string;
    cityName?: string | null;
    countryCode?: string | null;
    iconEmoji?: string | null;
    startDate?: string | null;
    endDate?: string | null;
};

export type CalendarMemberLocation = {
    memberId: string;
    name: string;
    avatarUrl?: string | null;
    legs: CalendarMemberLocationLeg[];
};

type ItineraryCalendarProps = {
    tripId: string;
    items: ItineraryCalendarItem[];
    accommodations?: CalendarAccommodation[];
    memberLocations?: CalendarMemberLocation[];
    tripStartDate?: string | null;
    tripDestination?: string | null;
    title?: string;
    listOnly?: boolean;
    defaultView?: CalendarView;
    deleteAction: (formData: FormData) => Promise<void>;
    createAction: (formData: FormData) => Promise<void>;
    createTransportationAction?: (formData: FormData) => Promise<void>;
    updateTransportationAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    travelerOptions?: TransportationTravelerOptions;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    onQuickAddDateChange?: (dateKey: string) => void;
    ideas?: TripIdea[];
    promoteIdeaAction?: (formData: FormData) => Promise<void>;
    toggleIdeaReactionAction?: (formData: FormData) => Promise<void>;
    toggleIdeaAttendedAction?: (formData: FormData) => Promise<void>;
    onEditMemberLocationLeg?: (locationKey: string) => void;
};

type CalendarView = "list" | "day" | "week";
type ItineraryCalendarSegment = {
    item: ItineraryCalendarItem;
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    timeLabel: string;
};

type PositionedCalendarSegment = ItineraryCalendarSegment & {
    overlapColumn: number;
    overlapCount: number;
};

type DisplayEventRange = {
    startDateKey: string;
    endDateKey: string;
    startMinutes: number | null;
    endMinutes: number | null;
    timeLabel: string;
    sortKey: string;
};

type ListEventEntry = {
    item: ItineraryCalendarItem;
    dateKey: string;
    timeLabel: string;
    sortKey: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES_IN_DAY = 24 * 60;
const INITIAL_LIST_DAYS = 7;
const LIST_LOAD_INCREMENT_DAYS = 14;

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function parseDateKey(dateString: string) {
    return new Date(`${dateString}T00:00:00`);
}

function addDays(date: Date, days: number) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function startOfWeek(date: Date) {
    return addDays(date, -date.getDay());
}

function formatDateHeader(dateString: string) {
    return parseDateKey(dateString).toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function formatItemDateRange(item: ItineraryCalendarItem) {
    const startDate = formatDateHeader(item.item_date);
    if (!item.end_date || item.end_date === item.item_date) return startDate;
    return `${startDate} - ${formatDateHeader(item.end_date)}`;
}

function formatItemTimeRange(item: ItineraryCalendarItem) {
    const startTime = formatTime(item.start_time);
    if (!item.end_time) return startTime;
    return `${startTime} - ${formatTime(item.end_time)}`;
}

function getTicketWebsite(item: ItineraryCalendarItem) {
    return item.ticket_website || item.url || "";
}

function getLocationMapsUrl(item: ItineraryCalendarItem) {
    const query = item.formatted_address || item.location || "";
    if (!query && !item.google_place_id) return "";

    const params = new URLSearchParams({
        api: "1",
        query: query || item.google_place_id || "",
    });

    if (item.google_place_id) {
        params.set("query_place_id", item.google_place_id);
    }

    return `https://www.google.com/maps/search/?${params.toString()}`;
}

function isEventbriteUrl(url: string) {
    try {
        return new URL(url).hostname.toLowerCase().includes("eventbrite");
    } catch {
        return false;
    }
}

function isEventbriteImageProxyUrl(url: string) {
    try {
        const parsedUrl = new URL(url);
        return (
            parsedUrl.hostname.toLowerCase().includes("eventbrite") &&
            parsedUrl.pathname.includes("/_next/image")
        );
    } catch {
        return false;
    }
}

function getUsableSavedCoverImage(item: ItineraryCalendarItem) {
    if (!item.cover_image_url) return null;
    if (isEventbriteImageProxyUrl(item.cover_image_url)) return null;
    return item.cover_image_url;
}

async function getPreviewImage(url: string) {
    if (!url) return null;

    try {
        const response = await fetch(
            `/api/link-preview?url=${encodeURIComponent(url)}`
        );
        const data: { imageUrl?: string | null } = await response.json();
        return data.imageUrl || null;
    } catch {
        return null;
    }
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatViewTitle(view: CalendarView, anchorDate: Date) {
    if (view === "week") {
        const weekStart = startOfWeek(anchorDate);
        const weekEnd = addDays(weekStart, 6);

        return `${weekStart.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
        })} - ${weekEnd.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            year: "numeric",
        })}`;
    }

    return anchorDate.toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function formatDateRange(startDate: Date, endDate: Date) {
    return `${startDate.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
    })} - ${endDate.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })}`;
}

function formatTime(timeString?: string | null) {
    if (!timeString) return "No time";

    const [hours, minutes] = timeString.split(":");
    const date = new Date();
    date.setHours(Number(hours));
    date.setMinutes(Number(minutes));

    return date.toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatTimeWithZone(
    timeString?: string | null,
    timezone?: string | null,
    dateKey?: string | null
) {
    const timeLabel = formatTime(timeString);
    if (!timezone || timeLabel === "No time") return timeLabel;

    try {
        const [hours, minutes] = (timeString || "").split(":").map(Number);
        const date = dateKey ? parseDateKey(dateKey) : new Date();
        date.setHours(hours);
        date.setMinutes(minutes);

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

function getTimezoneDisplayName(timezone: string) {
    return timezone.split("/").at(-1)?.replace(/_/g, " ") || timezone;
}

function getTimezoneOffsetLabel(
    targetTimezone: string,
    activeTimezone: string,
    date: Date
) {
    if (targetTimezone === activeTimezone) return "Active time zone";

    const differenceMinutes =
        getTimezoneOffsetMinutes(targetTimezone, date) -
        getTimezoneOffsetMinutes(activeTimezone, date);
    const sign = differenceMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(differenceMinutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = absoluteMinutes % 60;
    const minuteLabel = minutes ? ` ${minutes}m` : "";

    return `${sign}${hours}h${minuteLabel}`;
}

function getTimezoneGmtOffsetLabel(timezone: string, date: Date) {
    const offsetMinutes = getTimezoneOffsetMinutes(timezone, date);
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
    const minutes = String(absoluteMinutes % 60).padStart(2, "0");

    return `GMT${sign}${hours}:${minutes}`;
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim().replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, ""))
        .filter(Boolean);
}

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hour12: false,
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
            .map((part) => [part.type, part.value])
    );

    const localizedDateAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour) % 24,
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((localizedDateAsUtc - date.getTime()) / 60000);
}

function zonedDateTimeToUtc(dateKey: string, timeString: string, timezone: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);
    let utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    for (let index = 0; index < 2; index += 1) {
        const offsetMinutes = getTimezoneOffsetMinutes(timezone, utcDate);
        utcDate = new Date(
            Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60000
        );
    }

    return utcDate;
}

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60000);
}

function getDatePartsInTimezone(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return {
        dateKey: `${values.year}-${values.month}-${values.day}`,
        minutes: (Number(values.hour) % 24) * 60 + Number(values.minute),
    };
}

function formatInstantInTimezone(date: Date, timezone: string) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatMinutesAsTime(minutes: number) {
    const boundedMinutes = Math.max(0, Math.min(minutes, MINUTES_IN_DAY));
    const hours = Math.floor(boundedMinutes / 60);
    const minuteValue = boundedMinutes % 60;

    if (boundedMinutes === MINUTES_IN_DAY) {
        return "12:00 AM";
    }

    return new Date(2000, 0, 1, hours, minuteValue).toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
    });
}

function itemTouchesDate(item: ItineraryCalendarItem, dateKey: string) {
    const endDate = item.end_date || item.item_date;
    return item.item_date <= dateKey && endDate >= dateKey;
}

function getTripTimezone(items: ItineraryCalendarItem[]) {
    return sortItems(items).find((item) => item.timezone)?.timezone || null;
}

function getDisplayEventRange(
    item: ItineraryCalendarItem,
    displayTimezone: string
): DisplayEventRange {
    if (!item.start_time) {
        return {
            startDateKey: item.item_date,
            endDateKey: item.end_date || item.item_date,
            startMinutes: null,
            endMinutes: null,
            timeLabel: "No time",
            sortKey: `${item.item_date}T99:99-${item.title}`,
        };
    }

    const isTransportationItem =
        item.source_table === "transportation_items" ||
        item.category === "transportation";
    const startTimezone =
        (isTransportationItem ? item.departure_timezone : null) ||
        item.timezone ||
        displayTimezone;
    const endTimezone =
        (isTransportationItem ? item.arrival_timezone : null) ||
        startTimezone;
    const startInstant = zonedDateTimeToUtc(
        item.item_date,
        item.start_time,
        startTimezone
    );
    let endInstant = item.end_time
        ? zonedDateTimeToUtc(
              item.end_date || item.item_date,
              item.end_time,
              endTimezone
          )
        : addMinutes(startInstant, 60);

    if (endInstant <= startInstant) {
        endInstant = addMinutes(endInstant, MINUTES_IN_DAY);
    }

    const displayStart = getDatePartsInTimezone(startInstant, displayTimezone);
    const displayEnd = getDatePartsInTimezone(endInstant, displayTimezone);

    return {
        startDateKey: displayStart.dateKey,
        endDateKey: displayEnd.dateKey,
        startMinutes: displayStart.minutes,
        endMinutes: displayEnd.minutes,
        timeLabel: `${formatInstantInTimezone(
            startInstant,
            displayTimezone
        )} - ${formatInstantInTimezone(endInstant, displayTimezone)}`,
        sortKey: `${displayStart.dateKey}T${String(displayStart.minutes).padStart(
            4,
            "0"
        )}-${item.title}`,
    };
}

function getStatusClasses(status: string) {
    if (["confirmed", "booked"].includes(status.toLowerCase())) {
        return "border-emerald-300/40 bg-emerald-300/15 text-emerald-100";
    }

    if (status.toLowerCase() === "tentative") {
        return "border-amber-300/60 bg-amber-300/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)]";
    }

    return "border-sky-300/40 bg-sky-300/15 text-sky-100";
}

function isTentativeStatus(status: string) {
    return status.toLowerCase() === "tentative";
}

function formatStatusLabel(status: string) {
    return status.trim().toUpperCase();
}

function getTentativeStripeStyle(
    baseColor = "#ffffff",
    stripeColor = "rgba(255,255,255,0.78)"
) {
    return {
        backgroundImage: `repeating-linear-gradient(135deg, ${baseColor} 0, ${baseColor} 10px, ${stripeColor} 10px, ${stripeColor} 20px)`,
    } as CSSProperties;
}

function canDuplicateScheduledItem(item: ItineraryCalendarItem) {
    return item.source_table !== "transportation_items";
}

function getTransportationDuplicateInitialValues(
    item: ItineraryCalendarItem
): TransportationFormInitialValues {
    const flightDisplay = getFlightDisplayData(item);
    const fallbackLeg: FlightLeg = {
        departureLocation:
            item.departure_location || flightDisplay?.originName || item.location || "",
        departureDate: item.item_date || flightDisplay?.departureDate || "",
        departureTime: item.start_time || flightDisplay?.departureTime || "",
        departureTimezone:
            item.departure_timezone || flightDisplay?.departureTimeZone || item.timezone || "",
        arrivalLocation: item.arrival_location || flightDisplay?.destinationName || "",
        arrivalDate: item.end_date || flightDisplay?.arrivalDate || item.item_date || "",
        arrivalTime: item.end_time || flightDisplay?.arrivalTime || "",
        arrivalTimezone: item.arrival_timezone || flightDisplay?.arrivalTimeZone || "",
        departureTerminal:
            item.departure_terminal || flightDisplay?.departureTerminal || "",
        arrivalTerminal: item.arrival_terminal || flightDisplay?.arrivalTerminal || "",
        flightNumber: item.flight_number || flightDisplay?.flightNumber || "",
        airlineName: item.airline_name || flightDisplay?.airlineName || "",
    };
    const flightLegs =
        flightDisplay?.legs.length && flightDisplay.legs.length > 1
            ? flightDisplay.legs.map((leg) => ({
                  departureLocation: leg.originName || "",
                  departureDate: leg.departureDate || item.item_date || "",
                  departureTime: leg.departureTime || "",
                  departureTimezone:
                      leg.departureTimeZone || item.departure_timezone || "",
                  arrivalLocation: leg.destinationName || "",
                  arrivalDate: leg.arrivalDate || leg.departureDate || item.end_date || "",
                  arrivalTime: leg.arrivalTime || "",
                  arrivalTimezone: leg.arrivalTimeZone || item.arrival_timezone || "",
                  departureTerminal: leg.departureTerminal || "",
                  arrivalTerminal: leg.arrivalTerminal || "",
                  flightNumber: leg.flightNumber || "",
                  airlineName: leg.airlineName || "",
              }))
            : [fallbackLeg];

    return {
        mode: item.transportation_mode || flightDisplay?.mode || "airplane",
        status: item.status || "planned",
        reservationCode: item.reservation_code || null,
        cost: item.cost ?? null,
        currency: item.currency || null,
        isPrivate: item.is_private || false,
        audienceMode: item.audience_mode || "everyone",
        audienceSelectedOptions: item.audience_selected_options || [],
        flightLegs,
    };
}

function PrivateLockBadge({
    compact = false,
    className = "",
}: {
    compact?: boolean;
    className?: string;
}) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border border-white/20 bg-slate-950/80 font-bold uppercase tracking-[0.12em] text-white shadow-sm ${
                compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-xs"
            } ${className}`}
            title="Private item"
        >
            <Lock className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
            Private
        </span>
    );
}

function getItemCategoryLabel(item: ItineraryCalendarItem) {
    return item.category_name || item.category || FALLBACK_CATEGORY_LABEL;
}

function getItemCategoryColor(item: ItineraryCalendarItem) {
    return item.category_color_hex || FALLBACK_CATEGORY_COLOR;
}

function getTransportationEmoji(mode?: string | null) {
    if (mode === "airplane") return "✈️";
    if (mode === "train") return "🚆";
    if (mode === "bus") return "🚌";
    if (mode === "tram") return "🚊";
    if (mode === "ferry") return "⛴️";
    if (mode === "taxi") return "🚕";
    if (mode === "bicycle") return "🚲";
    return null;
}

type FlightLegDisplay = {
    originName?: string;
    destinationName?: string;
    airlineName?: string;
    airlineCode?: string;
    flightNumber?: string;
    departureDate?: string;
    departureTime?: string;
    departureTimeZone?: string;
    arrivalDate?: string;
    arrivalTime?: string;
    arrivalTimeZone?: string;
    departureTerminal?: string;
    arrivalTerminal?: string;
    duration?: string;
};

type FlightDisplayData = {
    airlineName?: string;
    airlineCode?: string;
    flightNumber?: string;
    originName?: string;
    destinationName?: string;
    departureDate?: string;
    departureTime?: string;
    departureTimeZone?: string;
    arrivalDate?: string;
    arrivalTime?: string;
    arrivalTimeZone?: string;
    duration?: string;
    departureTerminal?: string;
    arrivalTerminal?: string;
    status: string;
    mode?: string | null;
    routeLabel: string;
    routeCodeLabel: string;
    titleLabel: string;
    legs: FlightLegDisplay[];
    customNotes?: string;
};

function isFlightTransportationItem(item: ItineraryCalendarItem) {
    const mode = item.transportation_mode?.toLowerCase() || "";
    return ["airplane", "flight", "plane"].includes(mode);
}

function getNoteValue(notes: string | null | undefined, label: string) {
    if (!notes) return "";
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
        notes.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, "im"))?.[1]?.trim() ||
        ""
    );
}

function parseDateTimeValue(value?: string) {
    if (!value) return {};
    const [date, time] = value.trim().split(/\s+/);
    return { date, time };
}

function splitRouteLabel(route?: string | null) {
    if (!route) return {};
    const [originName, destinationName] = route.split("→").map((part) => part.trim());
    return { originName, destinationName };
}

function parseGeneratedFlightLegs(notes?: string | null): FlightLegDisplay[] {
    if (!notes?.includes("Leg ")) return [];

    const lines = notes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const legs: FlightLegDisplay[] = [];
    let currentLeg: FlightLegDisplay | null = null;

    lines.forEach((line) => {
        const legMatch = line.match(/^Leg\s+\d+:\s*(.+?)\s*→\s*(.+)$/i);
        if (legMatch) {
            currentLeg = {
                originName: legMatch[1],
                destinationName: legMatch[2],
            };
            legs.push(currentLeg);
            return;
        }

        if (!currentLeg) return;

        const value = line.split(":").slice(1).join(":").trim();
        if (line.startsWith("Flight:")) currentLeg.flightNumber = value;
        if (line.startsWith("Airline:")) {
            const [airlineName, airlineCode] = value.split("/").map((part) => part.trim());
            currentLeg.airlineName = airlineName;
            currentLeg.airlineCode = airlineCode;
        }
        if (line.startsWith("Departure:")) {
            const { date, time } = parseDateTimeValue(value);
            currentLeg.departureDate = date;
            currentLeg.departureTime = time;
        }
        if (line.startsWith("Arrival:")) {
            const { date, time } = parseDateTimeValue(value);
            currentLeg.arrivalDate = date;
            currentLeg.arrivalTime = time;
        }
        if (line.startsWith("Departure time zone:")) currentLeg.departureTimeZone = value;
        if (line.startsWith("Arrival time zone:")) currentLeg.arrivalTimeZone = value;
        if (line.startsWith("Departure terminal:")) currentLeg.departureTerminal = value;
        if (line.startsWith("Arrival terminal:")) currentLeg.arrivalTerminal = value;
        if (line.startsWith("Duration:")) currentLeg.duration = value;
    });

    return legs;
}

function isGeneratedFlightNotes(notes?: string | null) {
    if (!notes?.trim()) return false;
    const lines = notes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.every((line) =>
        /^(Duration|Departure time zone|Arrival time zone|Flight legs|Leg \d+|Flight|Airline|Departure|Arrival|Departure terminal|Arrival terminal):/i.test(
            line
        )
    );
}

function getDisplayNotes(item: ItineraryCalendarItem) {
    if (!item.notes) return "";
    if (!isFlightTransportationItem(item)) return item.notes;
    if (isGeneratedFlightNotes(item.notes)) return "";

    const generatedLinePattern =
        /^(Duration|Departure time zone|Arrival time zone|Flight legs|Leg \d+|Flight|Airline|Departure|Arrival|Departure terminal|Arrival terminal):/i;
    const customLines = item.notes
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !generatedLinePattern.test(line));

    if (customLines.length > 0) {
        return customLines.join("\n");
    }

    return "";
}

function formatOptionalDate(date?: string | null) {
    return date ? formatDateHeader(date) : "";
}

function getDateDifferenceDays(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) return 0;
    return Math.round(
        (parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) /
            86400000
    );
}

function getTransportationModeLabel(mode?: string | null) {
    if (mode === "airplane" || mode === "flight") return "Flight";
    if (!mode) return "Transportation";
    return mode[0].toUpperCase() + mode.slice(1);
}

function getFlightDisplayData(item: ItineraryCalendarItem): FlightDisplayData | null {
    if (!isFlightTransportationItem(item)) return null;

    const legs = parseGeneratedFlightLegs(item.notes);
    const firstLeg = legs[0];
    const lastLeg = legs.at(-1);
    const routeParts = splitRouteLabel(item.location);
    const flightNumber = item.flight_number || firstLeg?.flightNumber || "";
    const storedAirlineCode =
        getAirlineCodeFromFlightNumber(item.airline_code) || item.airline_code || "";
    const legAirlineCode =
        getAirlineCodeFromFlightNumber(firstLeg?.airlineCode) ||
        firstLeg?.airlineCode ||
        "";
    const inferredAirlineCode =
        getAirlineCodeFromFlightNumber(flightNumber) ||
        getAirlineCodeFromFlightNumber(item.title);
    const airlineCode =
        storedAirlineCode ||
        legAirlineCode ||
        inferredAirlineCode ||
        "";
    const airlineName = item.airline_name || firstLeg?.airlineName || "";
    const originName =
        item.departure_location || firstLeg?.originName || routeParts.originName || "";
    const destinationName =
        item.arrival_location ||
        lastLeg?.destinationName ||
        routeParts.destinationName ||
        "";
    const departureDate = item.item_date || firstLeg?.departureDate || "";
    const departureTime = item.start_time || firstLeg?.departureTime || "";
    const arrivalDate = item.end_date || lastLeg?.arrivalDate || item.item_date || "";
    const arrivalTime = item.end_time || lastLeg?.arrivalTime || "";
    const departureTimeZone =
        item.departure_timezone ||
        firstLeg?.departureTimeZone ||
        item.timezone ||
        getNoteValue(item.notes, "Departure time zone");
    const arrivalTimeZone =
        item.arrival_timezone ||
        lastLeg?.arrivalTimeZone ||
        getNoteValue(item.notes, "Arrival time zone");
    const computedDuration = getZonedDurationLabel({
        startDate: departureDate,
        startTime: departureTime,
        startTimezone: departureTimeZone,
        endDate: arrivalDate,
        endTime: arrivalTime,
        endTimezone: arrivalTimeZone,
    });
    const duration =
        computedDuration ||
        item.duration ||
        getNoteValue(item.notes, "Duration") ||
        lastLeg?.duration ||
        "";
    const departureTerminal =
        item.departure_terminal ||
        firstLeg?.departureTerminal ||
        getNoteValue(item.notes, "Departure terminal") ||
        getNoteValue(item.notes, "Departure terminal/platform");
    const arrivalTerminal =
        item.arrival_terminal ||
        lastLeg?.arrivalTerminal ||
        getNoteValue(item.notes, "Arrival terminal") ||
        getNoteValue(item.notes, "Arrival terminal/platform");
    const routeLabel = [originName, destinationName].filter(Boolean).join(" → ");
    const routeCodeLabel = [
        getIataAirportCode(originName) || originName,
        getIataAirportCode(destinationName) || destinationName,
    ]
        .filter(Boolean)
        .join(" → ");
    const titleLabel =
        [airlineName, flightNumber].filter(Boolean).join(" ") ||
        [airlineCode, flightNumber].filter(Boolean).join(" ") ||
        item.title;

    return {
        airlineName,
        airlineCode,
        flightNumber,
        originName,
        destinationName,
        departureDate,
        departureTime,
        departureTimeZone,
        arrivalDate,
        arrivalTime,
        arrivalTimeZone,
        duration,
        departureTerminal,
        arrivalTerminal,
        status: item.status,
        mode: item.transportation_mode,
        routeLabel,
        routeCodeLabel,
        titleLabel,
        legs,
        customNotes: getDisplayNotes(item),
    };
}

function formatAirportWithCode(airportName?: string | null) {
    if (!airportName) return "";

    const airportCode = getIataAirportCode(airportName);
    if (!airportCode) return airportName;

    if (airportName.trim().toUpperCase() === airportCode) return airportCode;

    return `${airportCode} - ${airportName}`;
}

function formatAirportRouteWithCodes(
    originName?: string | null,
    destinationName?: string | null
) {
    return [formatAirportWithCode(originName), formatAirportWithCode(destinationName)]
        .filter(Boolean)
        .join(" → ");
}

function getUniqueFlightAirlines(flight: FlightDisplayData) {
    const airlines = [
        {
            airlineCode: flight.airlineCode,
            airlineName: flight.airlineName,
            flightNumber: flight.flightNumber,
        },
        ...flight.legs.map((leg) => ({
            airlineCode: leg.airlineCode,
            airlineName: leg.airlineName,
            flightNumber: leg.flightNumber,
        })),
    ];
    const seen = new Set<string>();

    return airlines.filter((airline) => {
        const key =
            airline.airlineCode?.toUpperCase() ||
            airline.airlineName?.toLowerCase() ||
            "";
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getItemTimezones(item: ItineraryCalendarItem) {
    const timezones = new Set<string>();
    const flight = getFlightDisplayData(item);

    [
        item.timezone,
        item.departure_timezone,
        item.arrival_timezone,
        flight?.departureTimeZone,
        flight?.arrivalTimeZone,
    ].forEach((timezone) => {
        if (timezone) timezones.add(timezone);
    });

    return Array.from(timezones);
}

function itemOverlapsDateRange(
    item: ItineraryCalendarItem,
    startKey: string,
    endKey: string
) {
    const flight = getFlightDisplayData(item);
    const itemStartKey = flight?.departureDate || item.item_date;
    const itemEndKey = flight?.arrivalDate || item.end_date || item.item_date;

    return itemStartKey <= endKey && itemEndKey >= startKey;
}

function getVisibleDateRange(
    view: CalendarView,
    anchorDate: Date,
    weekStart: Date,
    listStartDate: Date,
    listEndDate: Date,
    items: ItineraryCalendarItem[]
) {
    if (view === "day") {
        const dateKey = getLocalDateKey(anchorDate);
        return { startKey: dateKey, endKey: dateKey };
    }

    if (view === "week") {
        return {
            startKey: getLocalDateKey(weekStart),
            endKey: getLocalDateKey(addDays(weekStart, 6)),
        };
    }

    const itemDateKeys = items.flatMap((item) => {
        const flight = getFlightDisplayData(item);
        return [
            flight?.departureDate || item.item_date,
            flight?.arrivalDate || item.end_date || item.item_date,
        ].filter(Boolean);
    });

    if (itemDateKeys.length === 0) {
        return {
            startKey: getLocalDateKey(listStartDate),
            endKey: getLocalDateKey(listEndDate),
        };
    }

    return {
        startKey: itemDateKeys.reduce((earliest, dateKey) =>
            dateKey < earliest ? dateKey : earliest
        ),
        endKey: itemDateKeys.reduce((latest, dateKey) =>
            dateKey > latest ? dateKey : latest
        ),
    };
}

function getDestinationTimezonesForScope(
    items: ItineraryCalendarItem[],
    startKey: string,
    endKey: string,
    fallbackTimezone: string
) {
    const timezones = new Set<string>();

    items
        .filter((item) => itemOverlapsDateRange(item, startKey, endKey))
        .forEach((item) => {
            getItemTimezones(item).forEach((timezone) => timezones.add(timezone));
        });

    if (timezones.size === 0 && fallbackTimezone) {
        timezones.add(fallbackTimezone);
    }

    return Array.from(timezones);
}

function AirlineLogo({
    airlineCode,
    airlineName,
    flightNumber,
    compact = false,
}: {
    airlineCode?: string | null;
    airlineName?: string | null;
    flightNumber?: string | null;
    compact?: boolean;
}) {
    return (
        <AirlineIcon
            flightNumber={flightNumber}
            airlineCode={airlineCode}
            airlineName={airlineName}
            compact={compact}
        />
    );
}

function FlightIconStack({ flight }: { flight: FlightDisplayData }) {
    const airlines = getUniqueFlightAirlines(flight);

    return (
        <span className="flex shrink-0 flex-col items-center gap-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-base">
                ✈️
            </span>
            {airlines.map((airline) => (
                <AirlineLogo
                    key={
                        airline.flightNumber ||
                        airline.airlineCode ||
                        airline.airlineName
                    }
                    airlineCode={airline.airlineCode}
                    airlineName={airline.airlineName}
                    flightNumber={airline.flightNumber}
                    compact
                />
            ))}
        </span>
    );
}

function FlightListCard({
    item,
    flight,
    onOpen,
}: {
    item: ItineraryCalendarItem;
    flight: FlightDisplayData;
    onOpen: (item: ItineraryCalendarItem) => void;
}) {
    const arrivalDateLabel = formatOptionalDate(flight.arrivalDate);
    const arrivalDayDifference = getDateDifferenceDays(
        flight.departureDate,
        flight.arrivalDate
    );
    const arrivalWarning =
        arrivalDayDifference > 0 && flight.arrivalDate
            ? {
                  className:
                      arrivalDayDifference >= 2
                          ? "border-red-400/50 bg-red-500/15 text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.14)]"
                          : "border-amber-300/50 bg-amber-300/15 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.14)]",
                  text:
                      arrivalDayDifference >= 2
                          ? `Flight arrives two days later on ${formatDateHeader(
                                flight.arrivalDate
                            )}`
                          : `Flight arrives the next day on ${formatDateHeader(
                                flight.arrivalDate
                            )}`,
              }
            : null;
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
        ...(isTentativeStatus(item.status)
            ? getTentativeStripeStyle(airlineTheme.accent)
            : {}),
    } as CSSProperties;

    return (
        <div
            style={cardThemeStyle}
            className="relative rounded-md border border-white/70 border-l-[16px] border-l-[var(--airline-card-primary)] bg-[var(--airline-card-accent)] text-[var(--airline-card-text)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
            <div className="absolute right-3 top-3 z-10 flex shrink-0 flex-wrap justify-end gap-2">
                {item.is_private ? <PrivateLockBadge compact /> : null}
                <span
                    className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${getStatusClasses(
                        item.status
                    )}`}
                >
                    {formatStatusLabel(item.status)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onOpen(item)}
                className="w-full rounded-md p-4 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-[var(--airline-card-primary)] focus:ring-offset-2"
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-white/70 bg-white/90 text-xl shadow-sm">
                                ✈️
                            </span>
                            <AirlineLogo
                                airlineCode={flight.airlineCode}
                                airlineName={flight.airlineName}
                                flightNumber={flight.flightNumber}
                            />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-[var(--airline-card-text)]">
                                {flight.titleLabel}
                            </h3>
                            {flight.routeLabel && (
                                <p className="mt-1 text-sm text-[var(--airline-card-muted)]">
                                    {flight.routeLabel}
                                </p>
                            )}
                            {item.reservation_code && (
                                <div className="mt-2">
                                    <ReservationCodeCopy
                                        code={item.reservation_code}
                                        compact
                                        light
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-md border border-white/70 bg-white/85 p-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Departure
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                            {formatTimeWithZone(
                                flight.departureTime,
                                flight.departureTimeZone,
                                flight.departureDate
                            )}
                        </p>
                        {flight.originName && (
                            <p className="mt-1 text-xs text-slate-600">
                                {flight.originName}
                            </p>
                        )}
                        {flight.departureTerminal && (
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                {flight.departureTerminal}
                            </p>
                        )}
                    </div>

                    {flight.duration && (
                        <div className="rounded-full bg-[var(--airline-card-primary)] px-3 py-1 text-center text-xs font-semibold text-[var(--airline-card-primary-text)] shadow-sm">
                            {flight.duration}
                        </div>
                    )}

                    <div className="sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Arrival
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                            {formatTimeWithZone(
                                flight.arrivalTime,
                                flight.arrivalTimeZone,
                                flight.arrivalDate
                            )}
                        </p>
                        {flight.destinationName && (
                            <p className="mt-1 text-xs text-slate-600">
                                {flight.destinationName}
                            </p>
                        )}
                        {flight.arrivalTerminal && (
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                {flight.arrivalTerminal}
                            </p>
                        )}
                    </div>
                </div>

                {arrivalWarning ? (
                    <div
                        className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${arrivalWarning.className}`}
                    >
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{arrivalWarning.text}</span>
                    </div>
                ) : (
                    arrivalDateLabel && (
                        <p className="mt-3 text-xs font-medium text-[var(--airline-card-muted)]">
                            Arrives {arrivalDateLabel}
                        </p>
                    )
                )}
            </button>
            <AssignedItemAvatars item={item} />
            <div className="flex flex-wrap justify-start gap-2 px-4 pb-4 pr-20">
                {flight.flightNumber && (
                    <TrackFlightButton
                        flightNumber={flight.flightNumber}
                        departureDate={flight.departureDate}
                        departureTime={flight.departureTime}
                        departureTimezone={flight.departureTimeZone}
                        originAirportCode={flight.originName}
                        destinationAirportCode={flight.destinationName}
                        className="min-h-8 !border-white/10 !bg-white/[0.08] px-3 py-1.5 text-xs !text-slate-100 shadow-none hover:!border-lime-300/30 hover:!bg-white/[0.14] hover:!text-white"
                    />
                )}
                <EventCardActions item={item} onOpen={onOpen} />
            </div>
        </div>
    );
}

function sortItems(items: ItineraryCalendarItem[]) {
    return [...items].sort((a, b) => {
        const dateSort = a.item_date.localeCompare(b.item_date);
        if (dateSort !== 0) return dateSort;

        return (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    });
}

function isScheduledItineraryItem(item: ItineraryCalendarItem) {
    const status = item.status.toLowerCase();

    if (item.category === "transportation" || item.transportation_mode) {
        return Boolean(item.item_date && item.start_time);
    }

    return (
        Boolean(item.item_date && item.start_time) &&
        ["booked", "confirmed", "tentative"].includes(status)
    );
}

function groupListEntriesByDate(entries: ListEventEntry[]) {
    return [...entries]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .reduce<Record<string, ListEventEntry[]>>((groups, entry) => {
            groups[entry.dateKey] = [...(groups[entry.dateKey] || []), entry];
            return groups;
        }, {});
}

function getListEntriesForDateRange(
    items: ItineraryCalendarItem[],
    startDate: Date,
    endDate: Date,
    displayTimezone: string
) {
    const startKey = getLocalDateKey(startDate);
    const endKey = getLocalDateKey(endDate);

    return items
        .map((item) => {
            const range = getDisplayEventRange(item, displayTimezone);

            return {
                item,
                dateKey: range.startDateKey,
                timeLabel: range.timeLabel,
                sortKey: range.sortKey,
                endDateKey: range.endDateKey,
            };
        })
        .filter(
            (entry) => entry.dateKey <= endKey && entry.endDateKey >= startKey
        );
}

function getListEntriesForAllItems(
    items: ItineraryCalendarItem[],
    displayTimezone: string
) {
    return items
        .map((item) => {
            const range = getDisplayEventRange(item, displayTimezone);

            return {
                item,
                dateKey: range.startDateKey,
                timeLabel: range.timeLabel,
                sortKey: range.sortKey,
                endDateKey: range.endDateKey,
            };
        })
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function getInitialAnchorDate(tripStartDate?: string | null) {
    if (!tripStartDate) return new Date();
    return parseDateKey(tripStartDate);
}

function getInitialListDate(tripStartDate?: string | null) {
    const today = new Date();
    const todayKey = getLocalDateKey(today);

    if (!tripStartDate || tripStartDate <= todayKey) return parseDateKey(todayKey);
    return parseDateKey(tripStartDate);
}

function getEventSegmentsForDate(
    item: ItineraryCalendarItem,
    dateKey: string,
    displayTimezone: string
): ItineraryCalendarSegment[] {
    if (!item.start_time) return [];

    const range = getDisplayEventRange(item, displayTimezone);
    if (range.startDateKey > dateKey || range.endDateKey < dateKey) return [];

    const startMinutes = range.startMinutes ?? 0;
    const endMinutes = range.endMinutes ?? startMinutes + 60;
    let segmentStart = 0;
    let segmentEnd = MINUTES_IN_DAY;

    if (dateKey === range.startDateKey) {
        segmentStart = startMinutes;
    }

    if (dateKey === range.endDateKey) {
        segmentEnd = endMinutes;
    }

    if (range.startDateKey === range.endDateKey) {
        segmentStart = startMinutes;
        segmentEnd = Math.max(endMinutes, startMinutes + 30);
    }

    if (segmentEnd <= segmentStart) return [];

    return [
        {
            item,
            dateKey,
            startMinutes: segmentStart,
            endMinutes: segmentEnd,
            timeLabel: `${formatMinutesAsTime(segmentStart)} - ${formatMinutesAsTime(
                segmentEnd
            )}`,
        },
    ];
}

function getTransportationTimezoneWarning(
    items: ItineraryCalendarItem[],
    dateKey: string,
    displayTimezone: string
) {
    const item = items.find((candidate) => {
        if (candidate.category !== "transportation") return false;
        if (getEventSegmentsForDate(candidate, dateKey, displayTimezone).length === 0) {
            return false;
        }

        const flight = getFlightDisplayData(candidate);
        const departureTimezone =
            flight?.departureTimeZone ||
            candidate.departure_timezone ||
            candidate.timezone ||
            "";
        const arrivalTimezone =
            flight?.arrivalTimeZone || candidate.arrival_timezone || "";

        return Boolean(
            departureTimezone &&
                arrivalTimezone &&
                departureTimezone !== arrivalTimezone
        );
    });

    if (!item) return null;

    const flight = getFlightDisplayData(item);
    const departureTimezone =
        flight?.departureTimeZone || item.departure_timezone || item.timezone || "";
    const departureTime = flight?.departureTime || item.start_time || "";

    return {
        dayTimezone: departureTimezone || displayTimezone,
        modeLabel: getTransportationModeLabel(item.transportation_mode),
        departureTime,
        departureTimezone,
    };
}

function getOvernightTransportationWarning(
    items: ItineraryCalendarItem[],
    dateKey: string,
    displayTimezone: string
) {
    const item = items.find((candidate) => {
        if (candidate.category !== "transportation") return false;
        if (getEventSegmentsForDate(candidate, dateKey, displayTimezone).length === 0) {
            return false;
        }

        const flight = getFlightDisplayData(candidate);
        const departureDate = flight?.departureDate || candidate.item_date;
        const arrivalDate = flight?.arrivalDate || candidate.end_date;

        return Boolean(
            departureDate &&
                arrivalDate &&
                arrivalDate > departureDate &&
                dateKey >= arrivalDate
        );
    });

    if (!item) return null;

    return {
        modeLabel: getTransportationModeLabel(item.transportation_mode).toUpperCase(),
    };
}

function getDayCalendarWarningMessage(
    items: ItineraryCalendarItem[],
    dateKey: string,
    displayTimezone: string
) {
    const timezoneWarning = getTransportationTimezoneWarning(
        items,
        dateKey,
        displayTimezone
    );
    const overnightWarning = getOvernightTransportationWarning(
        items,
        dateKey,
        displayTimezone
    );
    const messages: string[] = [];

    if (timezoneWarning) {
        messages.push(
            `The day begins in ${getTimezoneDisplayName(
                timezoneWarning.dayTimezone
            )} Time Zone. ${timezoneWarning.modeLabel} departs at ${formatTime(
                timezoneWarning.departureTime
            )} ${getTimezoneDisplayName(
                timezoneWarning.departureTimezone
            )} Time Zone.`
        );
    }

    if (overnightWarning) {
        messages.push(
            `${overnightWarning.modeLabel} TRIP begins the day before and continues overnight.`
        );
    }

    return messages.join(" ");
}

function cleanLocationLabel(value?: string | null) {
    if (!value) return "";

    return value
        .split("→")
        .at(-1)
        ?.split(",")
        .at(0)
        ?.trim()
        .replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "") || "";
}

function getMemberLocationLabel(leg: CalendarMemberLocationLeg) {
    return cleanLocationLabel(leg.cityName || leg.name);
}

function getMemberLocationSegments(
    weekDates: Date[],
    legs: CalendarMemberLocationLeg[]
) {
    const weekKeys = weekDates.map(getLocalDateKey);
    const datedLegs = legs
        .filter((leg) => leg.startDate || leg.endDate)
        .sort((a, b) => {
            const dateSort = String(a.startDate || a.endDate || "").localeCompare(
                String(b.startDate || b.endDate || "")
            );
            if (dateSort !== 0) return dateSort;
            return getMemberLocationLabel(a).localeCompare(
                getMemberLocationLabel(b)
            );
        });

    const entries = weekKeys.map((dateKey) => {
        const matchingLeg = datedLegs.find((leg) => {
            const startDate = leg.startDate || leg.endDate;
            const endDate = leg.endDate || leg.startDate;
            if (!startDate || !endDate) return false;
            return startDate <= dateKey && endDate >= dateKey;
        });

        if (!matchingLeg) return null;

        const label = getMemberLocationLabel(matchingLeg);
        if (!label) return null;

        return {
            label: `${matchingLeg.iconEmoji ? `${matchingLeg.iconEmoji} ` : ""}${label}`,
            locationKey: matchingLeg.locationKey || matchingLeg.id,
        };
    });

    const segments: Array<{
        label: string;
        locationKey?: string | null;
        startIndex: number;
        endIndex: number;
    }> = [];
    let index = 0;

    while (index < entries.length) {
        const entry = entries[index];
        if (!entry) {
            index += 1;
            continue;
        }

        let endIndex = index;
        while (
            endIndex + 1 < entries.length &&
            entries[endIndex + 1]?.label === entry.label &&
            entries[endIndex + 1]?.locationKey === entry.locationKey
        ) {
            endIndex += 1;
        }

        segments.push({
            label: entry.label,
            locationKey: entry.locationKey,
            startIndex: index,
            endIndex,
        });
        index = endIndex + 1;
    }

    return segments;
}

function CalendarMemberAvatar({
    name,
    avatarUrl,
}: {
    name: string;
    avatarUrl?: string | null;
}) {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-lime-300/30 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.12)]">
            {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
                getInitials(name)
            )}
        </span>
    );
}

function segmentsOverlap(
    first: ItineraryCalendarSegment,
    second: ItineraryCalendarSegment
) {
    return (
        first.startMinutes < second.endMinutes &&
        second.startMinutes < first.endMinutes
    );
}

function getPositionedCalendarSegments(
    segments: ItineraryCalendarSegment[]
): PositionedCalendarSegment[] {
    return segments.map((segment, index) => {
        const overlappingSegments = segments
            .map((candidate, candidateIndex) => ({
                segment: candidate,
                index: candidateIndex,
            }))
            .filter((candidate) => segmentsOverlap(segment, candidate.segment))
            .sort((a, b) => {
                const startSort =
                    a.segment.startMinutes - b.segment.startMinutes;
                if (startSort !== 0) return startSort;

                const endSort = a.segment.endMinutes - b.segment.endMinutes;
                if (endSort !== 0) return endSort;

                return a.segment.item.title.localeCompare(b.segment.item.title);
            });
        const overlapColumn = Math.max(
            overlappingSegments.findIndex(
                (candidate) => candidate.index === index
            ),
            0
        );

        return {
            ...segment,
            overlapColumn,
            overlapCount: Math.max(overlappingSegments.length, 1),
        };
    });
}

function EventCardActions({
    item,
    compact = false,
    onOpen,
}: {
    item: ItineraryCalendarItem;
    compact?: boolean;
    onOpen: (item: ItineraryCalendarItem) => void;
}) {
    const ticketWebsite = getTicketWebsite(item);
    const mapsUrl = getLocationMapsUrl(item);
    const venueWebsite =
        item.location_website && item.location_website !== ticketWebsite
            ? item.location_website
            : "";
    const buttonClass = `inline-flex items-center justify-center rounded-md border text-xs font-semibold transition ${
        compact ? "min-h-7 px-2 py-1" : "min-h-8 px-3 py-1.5"
    }`;
    const subtleButtonClass =
        "border-white/10 bg-white/[0.08] text-slate-100 hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white";

    return (
        <div className="flex flex-wrap justify-start gap-2">
            <button
                type="button"
                onClick={() => onOpen(item)}
                className={`${buttonClass} ${subtleButtonClass}`}
            >
                Details
            </button>
            {ticketWebsite && (
                <a
                    href={ticketWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonClass} border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.18)] hover:bg-lime-200`}
                >
                    Buy Tickets
                </a>
            )}
            {mapsUrl && (
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonClass} ${subtleButtonClass}`}
                >
                    Location
                </a>
            )}
            {venueWebsite && (
                <a
                    href={venueWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonClass} ${subtleButtonClass}`}
                >
                    Venue
                </a>
            )}
        </div>
    );
}

function EventCard({
    item,
    compact = false,
    fillHeight = false,
    hideTimezone = false,
    timeLabel,
    onOpen,
}: {
    item: ItineraryCalendarItem;
    compact?: boolean;
    fillHeight?: boolean;
    hideTimezone?: boolean;
    timeLabel?: string;
    onOpen: (item: ItineraryCalendarItem) => void;
}) {
    const transportationEmoji = getTransportationEmoji(item.transportation_mode);
    const flightDisplay = getFlightDisplayData(item);
    const displayNotes = getDisplayNotes(item);
    const noteLines = displayNotes
        ?.split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const transportationDepartureLabel =
        compact && item.category === "transportation"
            ? flightDisplay
                ? formatTimeWithZone(
                      flightDisplay.departureTime,
                      flightDisplay.departureTimeZone,
                      flightDisplay.departureDate
                  )
                : formatTimeWithZone(item.start_time, item.timezone, item.item_date)
            : "";

    if (flightDisplay && !compact) {
        return <FlightListCard item={item} flight={flightDisplay} onOpen={onOpen} />;
    }

    const airlineTheme = flightDisplay
        ? getAirlineBrandTheme(flightDisplay.airlineCode)
        : null;
    const flightCardThemeStyle = airlineTheme
        ? ({
              "--airline-card-primary": airlineTheme.primary,
              "--airline-card-accent": airlineTheme.accent,
              "--airline-card-text": getReadableTextColor(airlineTheme.accent),
              "--airline-card-muted": ensureReadableColor({
                  foreground: "#475569",
                  background: airlineTheme.accent,
              }),
              ...(isTentativeStatus(item.status)
                  ? getTentativeStripeStyle(airlineTheme.accent)
                  : {}),
          } as CSSProperties)
        : isTentativeStatus(item.status)
          ? getTentativeStripeStyle("#080b16", "rgba(251,191,36,0.16)")
          : undefined;

    if (flightDisplay && compact) {
        return (
            <div
                style={flightCardThemeStyle}
                className={`relative w-full rounded-md border border-slate-200 border-l-[16px] border-l-[var(--airline-card-primary)] bg-[var(--airline-card-accent)] text-[var(--airline-card-text)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    fillHeight ? "flex h-full flex-col justify-start overflow-hidden" : ""
                }`}
            >
                <div className="absolute right-3 top-3 z-10 flex shrink-0 flex-wrap justify-end gap-2">
                    {item.is_private ? <PrivateLockBadge compact /> : null}
                    <span
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${getStatusClasses(
                            item.status
                        )}`}
                    >
                        {formatStatusLabel(item.status)}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className={`w-full p-3 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                        fillHeight
                            ? "flex min-h-0 flex-1 flex-col justify-start overflow-hidden"
                            : ""
                    }`}
                >
                    <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 gap-3">
                            <FlightIconStack flight={flightDisplay} />
                            <div className="min-w-0">
                                {transportationDepartureLabel && (
                                    <p className="text-sm font-semibold text-[var(--airline-card-text)]">
                                        Departs {transportationDepartureLabel}
                                    </p>
                                )}
                                <h3 className="mt-1 text-sm font-semibold text-[var(--airline-card-text)]">
                                    {flightDisplay.flightNumber || item.title}
                                </h3>
                                {(flightDisplay.routeCodeLabel || item.location) && (
                                    <p className="mt-1 truncate text-xs text-[var(--airline-card-muted)]">
                                        {flightDisplay.routeCodeLabel || item.location}
                                    </p>
                                )}
                                {flightDisplay.duration && (
                                    <p className="mt-1 text-xs font-semibold text-[var(--airline-card-text)]">
                                        Duration: {flightDisplay.duration}
                                    </p>
                                )}
                                {item.reservation_code && (
                                    <div className="mt-2">
                                        <ReservationCodeCopy
                                            code={item.reservation_code}
                                            compact
                                            light
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </button>
                <AssignedItemAvatars item={item} />
                <div className="flex flex-wrap justify-start gap-2 px-3 pb-3 pr-16">
                    {flightDisplay.flightNumber && (
                        <TrackFlightButton
                            flightNumber={flightDisplay.flightNumber}
                            departureDate={flightDisplay.departureDate}
                            departureTime={flightDisplay.departureTime}
                            departureTimezone={flightDisplay.departureTimeZone}
                            originAirportCode={flightDisplay.originName}
                            destinationAirportCode={flightDisplay.destinationName}
                            className="min-h-7 !border-white/10 !bg-white/[0.08] px-2 py-1 text-xs !text-slate-100 shadow-none hover:!border-lime-300/30 hover:!bg-white/[0.14] hover:!text-white"
                        />
                    )}
                    <EventCardActions item={item} compact onOpen={onOpen} />
                </div>
            </div>
        );
    }

    return (
        <div
            style={
                flightCardThemeStyle ||
                ({
                    borderLeftColor: getItemCategoryColor(item),
                } as CSSProperties)
            }
            className={`w-full border-l-[16px] text-left ${
                flightDisplay
                    ? "border-l-[var(--airline-card-primary)] bg-[var(--airline-card-accent)] text-[var(--airline-card-text)]"
                    : "bg-[#080b16]/95 text-white"
            } ${
                fillHeight ? "flex h-full flex-col justify-start overflow-hidden" : ""
            } relative rounded-[1.25rem] border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition duration-200 hover:-translate-y-0.5 hover:border-lime-300/20 hover:shadow-[0_24px_60px_rgba(0,0,0,0.38)]`}
        >
            <div className="absolute right-3 top-3 z-10 flex shrink-0 flex-wrap justify-end gap-2">
                {item.is_private ? <PrivateLockBadge compact /> : null}
                <span
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${getStatusClasses(
                        item.status
                    )}`}
                >
                    {formatStatusLabel(item.status)}
                </span>
            </div>
            <button
                type="button"
                onClick={() => onOpen(item)}
                className={`w-full p-3 pr-28 text-left focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                    fillHeight
                        ? "flex min-h-0 flex-1 flex-col justify-start overflow-hidden"
                        : ""
                }`}
            >
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 gap-3">
                    {flightDisplay && compact ? (
                        <FlightIconStack flight={flightDisplay} />
                    ) : item.transportation_mode === "airplane" ? (
                        <AirlineLogo
                            airlineCode={item.airline_code}
                            airlineName={item.airline_name}
                            flightNumber={item.flight_number}
                            compact={compact}
                        />
                    ) : (
                        transportationEmoji && (
                            <span
                                className={`flex shrink-0 items-center justify-center rounded-md border ${
                                    flightDisplay
                                        ? "border-slate-200 bg-slate-50"
                                        : "border-white/10 bg-white/[0.08] shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.10)]"
                                } ${
                                    compact ? "h-8 w-8 text-base" : "h-10 w-10 text-xl"
                                }`}
                            >
                                {transportationEmoji}
                            </span>
                        )
                    )}
                    <div className="min-w-0">
                    <p
                        className={`text-xs font-medium ${
                            flightDisplay
                                ? "text-[var(--airline-card-muted)]"
                                : "text-lime-200/80"
                        }`}
                    >
                        {timeLabel ||
                            `${formatTime(item.start_time)}${
                                item.end_time ? ` - ${formatTime(item.end_time)}` : ""
                            }`}
                    </p>
                    {transportationDepartureLabel && (
                        <p
                            className={`mt-1 text-sm font-semibold ${
                                flightDisplay
                                    ? "text-[var(--airline-card-text)]"
                                    : "text-white"
                            }`}
                        >
                            Departs {transportationDepartureLabel}
                        </p>
                    )}
                    <h3
                        className={`mt-1 font-semibold ${
                            flightDisplay
                                ? "text-[var(--airline-card-text)]"
                                : "text-white"
                        } ${
                            compact ? "text-sm" : "text-base"
                        }`}
                    >
                        {item.title}
                    </h3>
                    {item.location && (
                        <p
                            className={`mt-1 truncate text-xs ${
                                flightDisplay
                                    ? "text-[var(--airline-card-muted)]"
                                    : "text-slate-300"
                            }`}
                        >
                            {item.location}
                        </p>
                    )}
                    {item.category === "transportation" && item.reservation_code && (
                        <div className="mt-2">
                            <ReservationCodeCopy
                                code={item.reservation_code}
                                compact={compact}
                                light={Boolean(flightDisplay)}
                            />
                        </div>
                    )}
                    </div>
                </div>
            </div>

            {!compact && (
                <>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md border border-white/10 bg-white/[0.08] px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                            {getItemCategoryLabel(item)}
                        </span>
                    </div>

                    {(!hideTimezone || item.category === "transportation") &&
                        item.timezone && (
                        <p className="mt-2 text-xs text-slate-400">{item.timezone}</p>
                    )}

                    {noteLines && noteLines.length > 0 && (
                        <div
                            className={`mt-3 space-y-1 text-sm leading-6 ${
                                item.category === "transportation"
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
                    )}

                </>
            )}
            </button>
            <AssignedItemAvatars item={item} />
            <div className={compact ? "px-2 pb-2 pr-16" : "px-3 pb-3 pr-16"}>
                <EventCardActions item={item} compact={compact} onOpen={onOpen} />
            </div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;

    return (
        <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm text-slate-800">{value}</dd>
        </div>
    );
}

function ReservationCodeCopy({
    code,
    compact = false,
    light = false,
}: {
    code?: string | null;
    compact?: boolean;
    light?: boolean;
}) {
    const [isCopied, setIsCopied] = useState(false);
    if (!code) return null;

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(code || "");
            setIsCopied(true);
            window.setTimeout(() => setIsCopied(false), 1600);
        } catch {
            setIsCopied(false);
        }
    }

    return (
        <span
            onClick={(event) => {
                event.stopPropagation();
                void copyCode();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={`inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md border transition ${
                compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-xs"
            } ${
                light
                    ? "border-slate-200 bg-white/90 text-slate-900 hover:bg-slate-50"
                    : "border-white/10 bg-white/[0.08] text-slate-100 hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white"
            }`}
            title={isCopied ? "Copied" : "Copy reservation code"}
        >
            <span className="min-w-0 truncate">
                <span className="font-black tracking-wide">{code}</span>
            </span>
            <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                    light
                        ? "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                        : "text-slate-200 hover:bg-white/[0.14] hover:text-white"
                }`}
                aria-hidden="true"
            >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {isCopied ? (
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wide">
                    Copied
                </span>
            ) : null}
        </span>
    );
}

function getItemPeople(item: ItineraryCalendarItem) {
    return item.participants && item.participants.length > 0
        ? item.participants
        : item.travelers || [];
}

function getTransportationAudienceText(item: ItineraryCalendarItem) {
    if (item.audience_mode === "just_me" || item.is_private) return "Just You";
    if (item.audience_mode !== "custom") return "";

    return getItemPeople(item)
        .map((person) => person.name || person.guest_name || "")
        .filter(Boolean)
        .join(", ");
}

function TransportationAudienceText({
    item,
    light = false,
}: {
    item: ItineraryCalendarItem;
    light?: boolean;
}) {
    const label = getTransportationAudienceText(item);
    if (!label) return null;

    return (
        <p
            className={`mt-1 truncate text-xs font-semibold ${
                light
                    ? "text-slate-600"
                    : "text-[color:var(--airline-card-muted,#64748b)]"
            }`}
        >
            {label}
        </p>
    );
}

function getAssignedItemPeople(item: ItineraryCalendarItem) {
    return getItemPeople(item);
}

function AssignedItemAvatars({ item }: { item: ItineraryCalendarItem }) {
    const people = getAssignedItemPeople(item);
    if (people.length === 0) return null;

    const visiblePeople = people.slice(0, 4);
    const overflowCount = people.length - visiblePeople.length;
    const label = people.map((person) => person.name || person.guest_name).join(", ");

    return (
        <div
            className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center justify-end -space-x-2"
            aria-label={label || "Selected travellers"}
        >
            {visiblePeople.map((person, index) => {
                const name = person.name || person.guest_name || "Traveller";

                return (
                    <span
                        key={`${person.type}:${person.user_id || person.family_member_id || person.guest_name || index}`}
                        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-slate-950 text-[10px] font-black uppercase text-lime-200 shadow-[0_0_18px_rgba(0,0,0,0.28)]"
                        title={name}
                    >
                        {person.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={person.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            getInitials(name)
                        )}
                    </span>
                );
            })}
            {overflowCount > 0 ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 bg-slate-950 text-[10px] font-black text-lime-200 shadow-[0_0_18px_rgba(0,0,0,0.28)]">
                    +{overflowCount}
                </span>
            ) : null}
        </div>
    );
}

function FlightDetailGridRow({
    label,
    value,
}: {
    label: string;
    value?: string | null;
}) {
    if (!value) return null;

    return (
        <div className="vaivia-transport-light-card rounded-md border border-white/70 bg-white/90 p-3 text-slate-950 shadow-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
        </div>
    );
}

function FlightModalContent({
    item,
    flight,
}: {
    item: ItineraryCalendarItem;
    flight: FlightDisplayData;
}) {
    const originLabel = formatAirportWithCode(flight.originName);
    const destinationLabel = formatAirportWithCode(flight.destinationName);
    const routeLabelWithCodes = formatAirportRouteWithCodes(
        flight.originName,
        flight.destinationName
    );

    return (
        <div className="vaivia-transport-detail-light space-y-5 p-5 text-slate-950">
            <section className="vaivia-transport-light-card flex items-center gap-3 rounded-md border border-white/60 border-l-4 border-l-[var(--airline-primary)] bg-white/90 p-4 text-slate-950 shadow-sm ring-1 ring-black/5">
                <AirlineLogo
                    airlineCode={flight.airlineCode}
                    airlineName={flight.airlineName}
                    flightNumber={flight.flightNumber}
                />
                <div>
                    <p className="text-lg font-semibold text-slate-950">
                        {flight.airlineName || flight.titleLabel}
                    </p>
                    {flight.flightNumber && (
                        <p className="text-sm font-medium text-slate-600">
                            {flight.flightNumber}
                        </p>
                    )}
                    {routeLabelWithCodes && (
                        <p className="mt-1 text-sm text-slate-600">
                            {routeLabelWithCodes}
                        </p>
                    )}
                    {item.reservation_code && (
                        <div className="mt-3">
                            <ReservationCodeCopy code={item.reservation_code} light />
                            <TransportationAudienceText item={item} light />
                        </div>
                    )}
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <div className="vaivia-transport-light-card rounded-md border border-white/70 bg-white/90 p-4 text-slate-950 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Departure
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {formatTime(flight.departureTime)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                        {formatOptionalDate(flight.departureDate)}
                    </p>
                    {originLabel && (
                        <p className="mt-3 font-medium text-slate-900">
                            {originLabel}
                        </p>
                    )}
                    {flight.departureTimeZone && (
                        <p className="mt-1 text-xs text-slate-500">
                            {flight.departureTimeZone}
                        </p>
                    )}
                </div>

                {flight.duration && (
                    <div className="justify-self-center rounded-full bg-[var(--airline-primary)] px-4 py-2 text-sm font-semibold text-[var(--airline-primary-text)] shadow-sm">
                        {flight.duration}
                    </div>
                )}

                <div className="vaivia-transport-light-card rounded-md border border-white/70 bg-white/90 p-4 text-slate-950 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Arrival
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {formatTime(flight.arrivalTime)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                        {formatOptionalDate(flight.arrivalDate)}
                    </p>
                    {destinationLabel && (
                        <p className="mt-3 font-medium text-slate-900">
                            {destinationLabel}
                        </p>
                    )}
                    {flight.arrivalTimeZone && (
                        <p className="mt-1 text-xs text-slate-500">
                            {flight.arrivalTimeZone}
                        </p>
                    )}
                </div>
            </section>

            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Flight details
                </h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FlightDetailGridRow label="Airline" value={flight.airlineName} />
                    <FlightDetailGridRow label="Flight number" value={flight.flightNumber} />
                    {item.reservation_code && (
                        <div className="vaivia-transport-light-card rounded-md border border-white/70 bg-white/90 p-3 text-slate-950 shadow-sm">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Reservation code
                            </dt>
                            <dd className="mt-2">
                                <ReservationCodeCopy code={item.reservation_code} light />
                                <TransportationAudienceText item={item} light />
                            </dd>
                        </div>
                    )}
                    <FlightDetailGridRow label="Duration" value={flight.duration} />
                    <FlightDetailGridRow
                        label="Departure time zone"
                        value={flight.departureTimeZone}
                    />
                    <FlightDetailGridRow
                        label="Arrival time zone"
                        value={flight.arrivalTimeZone}
                    />
                    <FlightDetailGridRow
                        label="Arrival terminal"
                        value={flight.arrivalTerminal}
                    />
                    <FlightDetailGridRow
                        label="Status"
                        value={formatStatusLabel(item.status)}
                    />
                    <FlightDetailGridRow
                        label="Transportation mode"
                        value={flight.mode || "airplane"}
                    />
                </dl>
            </section>

            {flight.legs.length > 1 && (
                <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Flight legs
                    </h3>
                    <div className="mt-3 space-y-3">
                        {flight.legs.map((leg, index) => (
                            <div
                                key={`${leg.flightNumber || index}-${leg.originName}`}
                                className="vaivia-transport-light-card rounded-md border border-white/70 bg-white/90 p-3 text-slate-950 shadow-sm"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-semibold text-slate-950">
                                            {[leg.airlineName, leg.flightNumber]
                                                .filter(Boolean)
                                                .join(" ") || `Leg ${index + 1}`}
                                        </p>
                                        {formatAirportRouteWithCodes(
                                            leg.originName,
                                            leg.destinationName
                                        ) ? (
                                            <p className="mt-1 text-sm text-slate-600">
                                                {formatAirportRouteWithCodes(
                                                    leg.originName,
                                                    leg.destinationName
                                                )}
                                            </p>
                                        ) : null}
                                    </div>
                                    {leg.duration && (
                                        <span className="vaivia-transport-preserve-color rounded-full bg-[var(--airline-primary)] px-3 py-1 text-xs font-semibold text-[var(--airline-primary-text)]">
                                            {leg.duration}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {[
                                        leg.departureTime
                                            ? `Departs ${formatTime(leg.departureTime)}`
                                            : "",
                                        leg.arrivalTime
                                            ? `Arrives ${formatTime(leg.arrivalTime)}`
                                            : "",
                                        leg.arrivalTerminal,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {flight.customNotes && (
                <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Custom notes
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {flight.customNotes}
                    </p>
                </section>
            )}
        </div>
    );
}

function ItineraryItemModal({
    item,
    tripId,
    deleteAction,
    updateTransportationAction,
    moveItemAction,
    moveTargetTrips,
    travelerOptions,
    audienceOptions,
    currentUserTripMemberId,
    onDuplicateItem,
    onDuplicateTransportationItem,
    onClose,
}: {
    item: ItineraryCalendarItem;
    tripId: string;
    deleteAction: (formData: FormData) => Promise<void>;
    updateTransportationAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    travelerOptions: TransportationTravelerOptions;
    audienceOptions: TripAudienceOption[];
    currentUserTripMemberId: string | null;
    onDuplicateItem: (item: ItineraryCalendarItem) => void;
    onDuplicateTransportationItem: (item: ItineraryCalendarItem) => void;
    onClose: () => void;
}) {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isEditingTransportation, setIsEditingTransportation] = useState(false);
    const savedCoverImage = getUsableSavedCoverImage(item);
    const [coverImageUrl, setCoverImageUrl] = useState<string | null>(savedCoverImage);
    const ticketWebsite = getTicketWebsite(item);
    const locationWebsite = item.location_website || "";
    const flightDisplay = getFlightDisplayData(item);
    const displayNotes = getDisplayNotes(item);
    const airlineTheme = flightDisplay
        ? getAirlineBrandTheme(flightDisplay.airlineCode)
        : null;
    const modalThemeStyle = airlineTheme
        ? ({
              "--airline-primary": airlineTheme.primary,
              "--airline-accent": airlineTheme.accent,
              "--airline-primary-text": getReadableTextColor(airlineTheme.primary),
              "--airline-accent-text": ensureReadableColor({
                  foreground: getReadableTextColor(airlineTheme.accent),
                  background: airlineTheme.accent,
              }),
          } as CSSProperties)
        : undefined;

    useEffect(() => {
        let isMounted = true;

        async function resolveCoverImage() {
            const eventbriteImage = isEventbriteUrl(ticketWebsite)
                ? await getPreviewImage(ticketWebsite)
                : null;

            const locationImage = eventbriteImage
                ? null
                : await getPreviewImage(locationWebsite);

            const nextCoverImage = eventbriteImage || locationImage || savedCoverImage;

            if (isMounted) {
                setCoverImageUrl(nextCoverImage);
            }
        }

        void resolveCoverImage();

        return () => {
            isMounted = false;
        };
    }, [locationWebsite, savedCoverImage, ticketWebsite]);

    return (
        <AnimatedModal
            onClose={onClose}
            className="bg-slate-950/40"
            panelClassName={`max-w-2xl rounded-md border-0 shadow-xl ${
                flightDisplay
                    ? "bg-[var(--airline-accent)] text-[var(--airline-accent-text)]"
                    : "bg-white text-slate-950"
            }`}
            labelledBy="itinerary-item-title"
        >
            {({ requestClose }) => (
                <div style={modalThemeStyle}>
                {coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={coverImageUrl}
                        alt=""
                        className="aspect-[16/9] w-full rounded-t-md object-cover"
                    />
                )}

                <div
                    className={`flex items-start justify-between gap-4 border-b p-5 ${
                        flightDisplay
                            ? "border-white/20 bg-[var(--airline-primary)] text-[var(--airline-primary-text)]"
                            : "border-slate-200"
                    }`}
                >
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <p
                                className={`text-xs font-semibold uppercase tracking-wide ${
                                    flightDisplay
                                        ? "text-[var(--airline-primary-text)]/80"
                                        : "text-slate-500"
                                }`}
                            >
                                {getItemCategoryLabel(item)} / {formatStatusLabel(item.status)}
                            </p>
                            {item.is_private ? (
                                <PrivateLockBadge compact className="border-white/30 bg-slate-950/70" />
                            ) : null}
                        </div>
                        <h2
                            id="itinerary-item-title"
                            className={`mt-2 text-2xl font-semibold ${
                                flightDisplay
                                    ? "text-[var(--airline-primary-text)]"
                                    : "text-slate-950"
                            }`}
                        >
                            {item.title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${
                            flightDisplay
                                ? "border-white/30 text-[var(--airline-primary-text)] hover:bg-white/10"
                                : "border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                        aria-label="Close details"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                {isEditingTransportation ? (
                    <div className="p-5">
                        <TransportationEditForm
                            tripId={tripId}
                            itemId={item.id}
                            submitAction={updateTransportationAction}
                            initialItem={{
                                ...item,
                                airline_name:
                                    item.airline_name || flightDisplay?.airlineName || null,
                                airline_code:
                                    item.airline_code || flightDisplay?.airlineCode || null,
                                flight_number:
                                    item.flight_number || flightDisplay?.flightNumber || null,
                                departure_terminal:
                                    item.departure_terminal ||
                                    flightDisplay?.departureTerminal ||
                                    null,
                                arrival_terminal:
                                    item.arrival_terminal ||
                                    flightDisplay?.arrivalTerminal ||
                                    null,
                                departure_location:
                                    item.departure_location ||
                                    flightDisplay?.originName ||
                                    null,
                                arrival_location:
                                    item.arrival_location ||
                                    flightDisplay?.destinationName ||
                                    null,
                                departure_timezone:
                                    item.departure_timezone ||
                                    flightDisplay?.departureTimeZone ||
                                    null,
                                arrival_timezone:
                                    item.arrival_timezone ||
                                    flightDisplay?.arrivalTimeZone ||
                                    null,
                                reservation_code: item.reservation_code || null,
                                cost: item.cost ?? null,
                                currency: item.currency || null,
                                travelers: item.travelers || [],
                                audience_mode: item.audience_mode || "everyone",
                                audience_selected_options:
                                    item.audience_selected_options || [],
                            }}
                            travelerOptions={travelerOptions}
                            audienceOptions={audienceOptions}
                            currentUserTripMemberId={currentUserTripMemberId}
                            moveItemAction={moveItemAction}
                            moveTargetTrips={moveTargetTrips}
                            onCancel={() => setIsEditingTransportation(false)}
                        />
                    </div>
                ) : flightDisplay ? (
                    <FlightModalContent item={item} flight={flightDisplay} />
                ) : (
                    <div className="vaivia-transport-detail-light space-y-5 p-5 text-slate-950">
                        {(item.transportation_mode ||
                            item.airline_code ||
                            item.flight_number) && (
                            <div className="vaivia-transport-light-card flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-950">
                                {item.transportation_mode === "airplane" ? (
                                    <AirlineLogo
                                        airlineCode={item.airline_code}
                                        airlineName={item.airline_name}
                                        flightNumber={item.flight_number}
                                    />
                                ) : (
                                    <span className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-xl">
                                        {getTransportationEmoji(item.transportation_mode)}
                                    </span>
                                )}
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                        {item.airline_name || item.transportation_mode}
                                    </p>
                                    {(item.flight_number || item.airline_code) && (
                                        <p className="text-xs text-slate-500">
                                            {[item.flight_number, item.airline_code]
                                                .filter(Boolean)
                                                .join(" / ")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <dl className="grid gap-4 sm:grid-cols-2">
                            <DetailRow label="Date" value={formatItemDateRange(item)} />
                            <DetailRow label="Time" value={formatItemTimeRange(item)} />
                            <DetailRow label="Location" value={item.location} />
                            <DetailRow label="Address" value={item.formatted_address} />
                            <DetailRow label="Time zone" value={item.timezone} />
                            {item.reservation_code && (
                                <div className="text-slate-950">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Reservation code
                                    </dt>
                                    <dd className="mt-2">
                                        <ReservationCodeCopy
                                            code={item.reservation_code}
                                            light
                                        />
                                        <TransportationAudienceText item={item} light />
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {(locationWebsite || ticketWebsite) && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {locationWebsite && (
                                    <a
                                        href={locationWebsite}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                                    >
                                        Location website
                                    </a>
                                )}
                                {ticketWebsite && (
                                    <a
                                        href={ticketWebsite}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-md border border-slate-200 p-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                                    >
                                        Ticket website
                                    </a>
                                )}
                            </div>
                        )}

                        {displayNotes && (
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Notes
                                </h3>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                                    {displayNotes}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {!isEditingTransportation && isConfirmingDelete && (
                    <div className="mx-5 mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                        <p className="font-medium">Delete this itinerary item?</p>
                        <p className="mt-1 text-red-800">This cannot be undone.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <form action={deleteAction}>
                                <input type="hidden" name="trip_id" value={tripId} />
                                <input type="hidden" name="item_id" value={item.id} />
                                <button
                                    type="submit"
                                    className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-800"
                                >
                                    Confirm delete
                                </button>
                            </form>
                            <button
                                type="button"
                                onClick={() => setIsConfirmingDelete(false)}
                                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {!isEditingTransportation && (
                    <div
                        className={`flex flex-col gap-2 border-t p-5 sm:flex-row sm:justify-end ${
                            flightDisplay
                                ? "border-white/50 bg-white/60 text-slate-950"
                                : "border-slate-200"
                        }`}
                    >
                    {item.source_table === "transportation_items" ? (
                        <button
                            type="button"
                            onClick={() => onDuplicateTransportationItem(item)}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:w-auto"
                        >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            DUPLICATE
                        </button>
                    ) : canDuplicateScheduledItem(item) ? (
                        <button
                            type="button"
                            onClick={() => onDuplicateItem(item)}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:w-auto"
                        >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            DUPLICATE
                        </button>
                    ) : null}
                    <MoveTripItemButton
                        itemType={
                            item.source_table === "transportation_items"
                                ? "transportation"
                                : "itinerary"
                        }
                        itemId={
                            item.source_table === "transportation_items"
                                ? item.id.replace("transportation:", "")
                                : item.id
                        }
                        currentTripId={tripId}
                        targetTrips={moveTargetTrips}
                        moveAction={moveItemAction}
                        itemLabel={item.title}
                    />
                    {item.source_table === "transportation_items" ? (
                        <button
                            type="button"
                            onClick={() => setIsEditingTransportation(true)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            EDIT
                        </button>
                    ) : (
                        <Link
                            href={`/trips/${tripId}/itinerary/${encodeURIComponent(
                                item.id
                            )}/edit`}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            EDIT
                        </Link>
                    )}
                    {flightDisplay && (
                        <TrackFlightButton
                            flightNumber={flightDisplay.flightNumber}
                            departureDate={flightDisplay.departureDate}
                            departureTime={flightDisplay.departureTime}
                            departureTimezone={flightDisplay.departureTimeZone}
                            originAirportCode={flightDisplay.originName}
                            destinationAirportCode={flightDisplay.destinationName}
                            className="h-10 gap-2 px-4"
                        />
                    )}
                    <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(true)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        DELETE
                    </button>
                    {locationWebsite && (
                        <a
                            href={locationWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            LOCATION
                        </a>
                    )}
                    {ticketWebsite && (
                        <a
                            href={ticketWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            TICKETS
                        </a>
                    )}
                    </div>
                )}
                </div>
            )}
        </AnimatedModal>
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

function ListView({
    groupedPastEvents,
    groupedEarlierItems,
    groupedUpcomingItems,
    hasFutureItems,
    onOpenItem,
}: {
    groupedPastEvents: Record<string, ListEventEntry[]>;
    groupedEarlierItems: Record<string, ListEventEntry[]>;
    groupedUpcomingItems: Record<string, ListEventEntry[]>;
    hasFutureItems: boolean;
    onOpenItem: (item: ItineraryCalendarItem) => void;
}) {
    const pastDateKeys = Object.keys(groupedPastEvents);
    const earlierDateKeys = Object.keys(groupedEarlierItems);
    const upcomingDateKeys = Object.keys(groupedUpcomingItems);
    const [showPastEvents, setShowPastEvents] = useState(false);
    const pastEventCount = pastDateKeys.reduce(
        (count, dateKey) => count + groupedPastEvents[dateKey].length,
        0
    );

    if (
        pastDateKeys.length === 0 &&
        earlierDateKeys.length === 0 &&
        upcomingDateKeys.length === 0
    ) {
        return <EmptyState />;
    }

    return (
        <div className="space-y-6">
            {pastDateKeys.length > 0 && (
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
                                {pastDateKeys.map((dateKey) => (
                                    <section key={dateKey} className="space-y-3">
                                        <h3 className="border-b border-lime-300/20 pb-3 text-2xl font-black tracking-tight text-lime-300">
                                            {formatDateHeader(dateKey)}
                                        </h3>
                                        <div className="space-y-3">
                                            {groupedPastEvents[dateKey].map((entry) => (
                                                <EventCard
                                                    key={entry.item.id}
                                                    item={entry.item}
                                                    hideTimezone
                                                    timeLabel={entry.timeLabel}
                                                    onOpen={onOpenItem}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {earlierDateKeys.length > 0 && (
                    <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                            Earlier events
                        </p>
                        {earlierDateKeys.map((dateKey) => (
                            <section key={dateKey} className="space-y-3">
                                <h3 className="border-b border-lime-300/20 pb-3 text-2xl font-black tracking-tight text-lime-300">
                                    {formatDateHeader(dateKey)}
                                </h3>
                                <div className="space-y-3">
                                    {groupedEarlierItems[dateKey].map((entry) => (
                                        <EventCard
                                            key={entry.item.id}
                                            item={entry.item}
                                            hideTimezone
                                            timeLabel={entry.timeLabel}
                                            onOpen={onOpenItem}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                {upcomingDateKeys.map((dateKey) => (
                    <section key={dateKey} className="space-y-3">
                        <h3 className="border-b border-lime-300/20 pb-3 text-2xl font-black tracking-tight text-lime-300">
                            {formatDateHeader(dateKey)}
                        </h3>
                        <div className="space-y-3">
                            {groupedUpcomingItems[dateKey].map((entry) => (
                                <EventCard
                                    key={entry.item.id}
                                    item={entry.item}
                                    hideTimezone
                                    timeLabel={entry.timeLabel}
                                    onOpen={onOpenItem}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            {hasFutureItems && (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                    Loading more as you scroll...
                </div>
            )}
        </div>
    );
}

function DayColumn({
    date,
    items,
    displayTimezone,
    showDateHeader = false,
    showTimeRail = true,
    showWarnings = true,
    onOpenItem,
}: {
    date: Date;
    items: ItineraryCalendarItem[];
    displayTimezone: string;
    showDateHeader?: boolean;
    showTimeRail?: boolean;
    showWarnings?: boolean;
    onOpenItem: (item: ItineraryCalendarItem) => void;
}) {
    const dateKey = getLocalDateKey(date);
    const untimedItems = sortItems(
        items.filter((item) => !item.start_time && itemTouchesDate(item, dateKey))
    );
    const timedSegments = items
        .flatMap((item) => getEventSegmentsForDate(item, dateKey, displayTimezone))
        .sort((a, b) => a.startMinutes - b.startMinutes);
    const positionedTimedSegments = getPositionedCalendarSegments(timedSegments);
    const timezoneWarning = getTransportationTimezoneWarning(
        items,
        dateKey,
        displayTimezone
    );
    const overnightWarning = getOvernightTransportationWarning(
        items,
        dateKey,
        displayTimezone
    );

    return (
        <div className="min-w-0 border-white/10 bg-slate-900/85">
            {showDateHeader && (
                <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-3 py-3 backdrop-blur">
                    <p className="text-sm font-bold text-lime-300">
                        {formatShortDate(date)}
                    </p>
                </div>
            )}

            {showWarnings && timezoneWarning && (
                <div className="border-b border-red-400/50 bg-red-500/15 px-3 py-3 text-sm text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_30px_rgba(239,68,68,0.10)]">
                    <p className="font-semibold">
                        <span className="mr-1" aria-hidden="true">
                            ⚠️
                        </span>
                        The day begins in{" "}
                        {getTimezoneDisplayName(timezoneWarning.dayTimezone)} Time Zone.
                    </p>
                    <p className="mt-1">
                        {timezoneWarning.modeLabel} departs at{" "}
                        {formatTime(timezoneWarning.departureTime)}{" "}
                        {getTimezoneDisplayName(timezoneWarning.departureTimezone)} Time
                        Zone.
                    </p>
                </div>
            )}

            {showWarnings && overnightWarning && (
                <div className="border-b border-amber-300/50 bg-amber-300/15 px-3 py-3 text-sm font-semibold text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_30px_rgba(251,191,36,0.10)]">
                    <span className="mr-1" aria-hidden="true">
                        ⚠️
                    </span>
                    {overnightWarning.modeLabel} TRIP begins the day before and continues
                    overnight.
                </div>
            )}

            {untimedItems.length > 0 && (
                <div className="space-y-2 border-b border-white/10 bg-slate-950/50 p-3">
                    {untimedItems.map((item) => (
                        <EventCard
                            key={item.id}
                            item={item}
                            compact
                            onOpen={onOpenItem}
                        />
                    ))}
                </div>
            )}

            <div className="relative min-h-[1920px]">
                {HOURS.map((hour) => (
                    <div
                        key={hour}
                        className={`grid h-20 border-b border-white/10 ${
                            showTimeRail ? "grid-cols-[52px_1fr]" : "grid-cols-1"
                        }`}
                    >
                        {showTimeRail && (
                            <div className="border-r border-white/10 bg-slate-950/30 px-2 pt-1 text-[11px] font-medium text-slate-400">
                                {hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}
                                {hour >= 12 ? " PM" : " AM"}
                            </div>
                        )}
                        <div className="bg-slate-900/55" />
                    </div>
                ))}

                {positionedTimedSegments.map((segment) => {
                    const top = (segment.startMinutes / 60) * 80;
                    const duration = Math.max(
                        segment.endMinutes - segment.startMinutes,
                        30
                    );
                    const height = Math.max((duration / 60) * 80, 44);
                    const columnWidth = 100 / segment.overlapCount;
                    const columnLeft = columnWidth * segment.overlapColumn;
                    const horizontalGap = segment.overlapCount > 1 ? "4px" : "0px";

                    return (
                        <div
                            key={`${segment.item.id}-${segment.dateKey}-${segment.startMinutes}`}
                            className={`pointer-events-none absolute ${
                                showTimeRail ? "left-[60px]" : "left-2"
                            } right-2`}
                            style={{ top, height }}
                        >
                            <div
                                className="pointer-events-auto absolute h-full"
                                style={{
                                    left: `${columnLeft}%`,
                                    width: `calc(${columnWidth}% - ${horizontalGap})`,
                                }}
                            >
                                <EventCard
                                    item={segment.item}
                                    compact
                                    fillHeight
                                    timeLabel={segment.timeLabel}
                                    onOpen={onOpenItem}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function WeekViewGrid({
    weekDates,
    items,
    memberLocations,
    displayTimezone,
    onOpenItem,
    onEditMemberLocationLeg,
    showFixedColumn = true,
}: {
    weekDates: Date[];
    items: ItineraryCalendarItem[];
    memberLocations: CalendarMemberLocation[];
    displayTimezone: string;
    onOpenItem: (item: ItineraryCalendarItem) => void;
    onEditMemberLocationLeg?: (locationKey: string) => void;
    showFixedColumn?: boolean;
}) {
    const timeRailWidth = 64;
    const dayColumnWidth = 176;
    const minGridWidth =
        (showFixedColumn ? timeRailWidth : 0) + dayColumnWidth * 7;

    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 shadow-xl shadow-black/20">
            <div
                className="grid"
                style={{
                    minWidth: minGridWidth,
                    gridTemplateColumns: showFixedColumn
                        ? `${timeRailWidth}px repeat(7, minmax(${dayColumnWidth}px, 1fr))`
                        : `repeat(7, minmax(${dayColumnWidth}px, 1fr))`,
                }}
            >
                {showFixedColumn ? (
                    <div className="sticky left-0 z-20 border-b border-r border-white/10 bg-slate-950/95" />
                ) : null}
                {weekDates.map((date) => (
                    <div
                        key={getLocalDateKey(date)}
                        className="border-b border-r border-white/10 bg-slate-950/95 px-3 py-3"
                    >
                        <p className="text-sm font-black text-lime-300">
                            {formatShortDate(date)}
                        </p>
                    </div>
                ))}

                {showFixedColumn ? (
                    <div className="sticky left-0 z-20 border-b border-r border-white/10 bg-slate-950/95" />
                ) : null}
                {weekDates.map((date) => {
                    const dateKey = getLocalDateKey(date);
                    const warningMessage = getDayCalendarWarningMessage(
                        items,
                        dateKey,
                        displayTimezone
                    );

                    return (
                        <div
                            key={`${dateKey}-warning`}
                            className="flex min-h-12 items-center justify-center border-b border-r border-white/10 bg-slate-900/90 px-3 py-2"
                        >
                            {warningMessage ? (
                                <div className="group/warning relative inline-flex">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-full border border-red-400/50 bg-red-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.16)] transition hover:border-red-300 hover:bg-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-300/60"
                                        aria-label={`Attention: ${warningMessage}`}
                                    >
                                    <span aria-hidden="true">⚠️</span>
                                    Attention
                                    </button>
                                    <div
                                        role="tooltip"
                                        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.5rem)] z-30 w-72 -translate-x-1/2 rounded-2xl border border-red-300/30 bg-slate-950 px-4 py-3 text-left text-xs font-semibold leading-5 text-red-50 opacity-0 shadow-2xl shadow-black/40 transition group-hover/warning:opacity-100 group-focus-within/warning:opacity-100"
                                    >
                                        {warningMessage}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}

                {memberLocations.map((member) => {
                    const memberSegments = getMemberLocationSegments(
                        weekDates,
                        member.legs
                    );

                    return (
                        <div
                            key={`${member.memberId}-week-location`}
                            className="contents"
                        >
                            {showFixedColumn ? (
                                <div className="sticky left-0 z-20 flex min-h-14 items-center justify-center border-b border-r border-white/10 bg-slate-950/95 px-2 py-2">
                                    <CalendarMemberAvatar
                                        name={member.name}
                                        avatarUrl={member.avatarUrl}
                                    />
                                </div>
                            ) : null}
                            <div className="relative col-span-7 min-h-14 border-b border-white/10 bg-slate-950/55">
                                <div className="absolute inset-0 grid grid-cols-7 divide-x divide-white/10" />
                                {memberSegments.length > 0 ? (
                                    memberSegments.map((segment) => {
                                        const leftPercent =
                                            (segment.startIndex / 7) * 100;
                                        const widthPercent =
                                            ((segment.endIndex -
                                                segment.startIndex +
                                                1) /
                                            7) *
                                            100;
                                        const segmentClassName =
                                            "absolute top-3 h-8 rounded-full border border-lime-300/30 bg-lime-300/[0.12] px-3 py-1.5 text-center text-xs font-black uppercase tracking-[0.1em] text-lime-100 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.10)]";
                                        const segmentStyle = {
                                            left: `calc(${leftPercent}% + 6px)`,
                                            width: `calc(${widthPercent}% - 12px)`,
                                        };

                                        if (
                                            segment.locationKey &&
                                            onEditMemberLocationLeg
                                        ) {
                                            return (
                                                <button
                                                    key={`${member.memberId}-${segment.locationKey}-${segment.startIndex}-${segment.endIndex}`}
                                                    type="button"
                                                    onClick={() =>
                                                        onEditMemberLocationLeg(
                                                            segment.locationKey as string
                                                        )
                                                    }
                                                    className={`${segmentClassName} transition hover:border-lime-200 hover:bg-lime-300/[0.18] focus:outline-none focus:ring-2 focus:ring-lime-300/60`}
                                                    style={segmentStyle}
                                                    title={`${member.name}: ${segment.label}`}
                                                    aria-label={`Edit ${member.name}'s ${segment.label} leg`}
                                                >
                                                    <span className="block truncate">
                                                        {segment.label}
                                                    </span>
                                                </button>
                                            );
                                        }

                                        return (
                                            <div
                                                key={`${member.memberId}-${segment.label}-${segment.startIndex}-${segment.endIndex}`}
                                                className={segmentClassName}
                                                style={segmentStyle}
                                                title={`${member.name}: ${segment.label}`}
                                            >
                                                <span className="block truncate">
                                                    {segment.label}
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : null}
                            </div>
                        </div>
                    );
                })}

                {showFixedColumn ? (
                    <div className="sticky left-0 z-10 border-r border-white/10 bg-slate-950/95">
                        <div className="relative min-h-[1920px]">
                            {HOURS.map((hour) => (
                                <div
                                    key={hour}
                                    className="h-20 border-b border-white/10 px-2 pt-1 text-[11px] font-semibold text-slate-400"
                                >
                                    {hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}
                                    {hour >= 12 ? " PM" : " AM"}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {weekDates.map((date) => (
                    <div
                        key={`${getLocalDateKey(date)}-column`}
                        className="border-r border-white/10"
                    >
                        <DayColumn
                            date={date}
                            items={items}
                            displayTimezone={displayTimezone}
                            showTimeRail={false}
                            showWarnings={false}
                            onOpenItem={onOpenItem}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function WeekViewFixedRail({
    memberLocations,
}: {
    memberLocations: CalendarMemberLocation[];
}) {
    return (
        <div
            className="sticky left-0 z-30 shrink-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/95 shadow-xl shadow-black/30"
            style={{ width: 64 }}
            aria-hidden="true"
        >
            <div className="border-b border-white/10 bg-slate-950/95 px-3 py-3">
                <p className="invisible text-sm font-black">Time</p>
            </div>
            <div className="min-h-12 border-b border-white/10 bg-slate-900/90" />
            {memberLocations.map((member) => (
                <div
                    key={`${member.memberId}-week-fixed-rail`}
                    className="flex min-h-14 items-center justify-center border-b border-white/10 bg-slate-950/95 px-2 py-2"
                >
                    <CalendarMemberAvatar
                        name={member.name}
                        avatarUrl={member.avatarUrl}
                    />
                </div>
            ))}
            <div className="relative min-h-[1920px]">
                {HOURS.map((hour) => (
                    <div
                        key={hour}
                        className="h-20 border-b border-white/10 px-2 pt-1 text-[11px] font-semibold text-slate-400"
                    >
                        {hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}
                        {hour >= 12 ? " PM" : " AM"}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ItineraryCalendar({
    tripId,
    items,
    memberLocations = [],
    tripStartDate,
    tripDestination,
    title = "Itinerary",
    listOnly = false,
    defaultView = "list",
    deleteAction,
    createAction,
    createTransportationAction,
    updateTransportationAction,
    moveItemAction,
    moveTargetTrips,
    travelerOptions = { users: [], familyMembers: [] },
    audienceOptions = [],
    currentUserTripMemberId = null,
    onQuickAddDateChange,
    ideas = [],
    promoteIdeaAction,
    toggleIdeaReactionAction,
    toggleIdeaAttendedAction,
    onEditMemberLocationLeg,
}: ItineraryCalendarProps) {
    const [view, setView] = useState<CalendarView>(defaultView);
    const effectiveView: CalendarView = listOnly ? "list" : view;
    const [browserTimezone, setBrowserTimezone] = useState("UTC");
    const [activeTimezone, setActiveTimezone] = useState("UTC");
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [destinationTimezone, setDestinationTimezone] = useState<string | null>(
        null
    );
    const [anchorDate, setAnchorDate] = useState(() =>
        getInitialAnchorDate(tripStartDate)
    );
    const [listStartDate, setListStartDate] = useState(() =>
        getInitialListDate(tripStartDate)
    );
    const [listDayCount, setListDayCount] = useState(INITIAL_LIST_DAYS);
    const [motionKey, setMotionKey] = useState(0);
    const [selectedItem, setSelectedItem] = useState<ItineraryCalendarItem | null>(
        null
    );
    const [duplicatingItem, setDuplicatingItem] =
        useState<ItineraryCalendarItem | null>(null);
    const [duplicatingTransportationItem, setDuplicatingTransportationItem] =
        useState<ItineraryCalendarItem | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const weekScrollRef = useRef<HTMLDivElement | null>(null);
    const primaryDestination = useMemo(
        () => parseDestinationList(tripDestination)[0] || "",
        [tripDestination]
    );
    const tripTimezone = useMemo(
        () => destinationTimezone || getTripTimezone(items) || browserTimezone,
        [browserTimezone, destinationTimezone, items]
    );
    const displayTimezone = activeTimezone || tripTimezone;
    const scheduledItems = useMemo(
        () => items.filter(isScheduledItineraryItem),
        [items]
    );
    const selectedDaySuggestionItems = useMemo(() => {
        const selectedDateKey = getLocalDateKey(anchorDate);

        return scheduledItems.filter((item) => {
            const startDateKey = item.item_date;
            const endDateKey = item.end_date || startDateKey;

            return startDateKey <= selectedDateKey && endDateKey >= selectedDateKey;
        });
    }, [anchorDate, scheduledItems]);
    const weekStart = startOfWeek(anchorDate);
    const weekStartKey = getLocalDateKey(weekStart);
    const scrollableWeekStarts = useMemo(
        () => {
            const selectedWeekStart = parseDateKey(weekStartKey);
            return [-2, -1, 0, 1, 2].map((weekOffset) =>
                addDays(selectedWeekStart, weekOffset * 7)
            );
        },
        [weekStartKey]
    );
    const listEndDate = addDays(listStartDate, listDayCount - 1);
    const visibleDateRange = useMemo(
        () =>
            getVisibleDateRange(
                effectiveView,
                anchorDate,
                weekStart,
                listStartDate,
                listEndDate,
                items
            ),
        [anchorDate, effectiveView, items, listEndDate, listStartDate, weekStart]
    );
    const destinationTimezones = useMemo(
        () =>
            getDestinationTimezonesForScope(
                items,
                visibleDateRange.startKey,
                visibleDateRange.endKey,
                tripTimezone
            ),
        [items, tripTimezone, visibleDateRange.endKey, visibleDateRange.startKey]
    );
    const selectedTimezoneDate =
        effectiveView === "list" ? listStartDate : anchorDate;
    const quickAddDateKey =
        effectiveView === "day"
            ? getLocalDateKey(anchorDate)
            : effectiveView === "week"
              ? getLocalDateKey(weekStart)
              : getLocalDateKey(listStartDate);
    const currentTimezoneOption = useMemo(
        () => ({
            key: `current-${browserTimezone}`,
            timezone: browserTimezone,
            cityLabel: getTimezoneDisplayName(browserTimezone),
            metadataLabel: "Current location",
        }),
        [browserTimezone]
    );
    const destinationTimezoneOptions = useMemo(
        () =>
            destinationTimezones.map((timezone, index) => ({
                key: `destination-${index}-${timezone}`,
                timezone,
                cityLabel: getTimezoneDisplayName(timezone),
                metadataLabel: `Destination ${index + 1}`,
            })),
        [destinationTimezones]
    );
    const timezoneOptions = useMemo(
        () => [currentTimezoneOption, ...destinationTimezoneOptions],
        [currentTimezoneOption, destinationTimezoneOptions]
    );
    const listStartKey = getLocalDateKey(listStartDate);
    const todayKey = getLocalDateKey(new Date());
    const listBeforeStartItems = useMemo(
        () =>
            listOnly
                ? []
                : getListEntriesForAllItems(items, displayTimezone).filter(
                      (entry) => entry.endDateKey < listStartKey
                  ),
        [displayTimezone, items, listOnly, listStartKey]
    );
    const listPastEvents = useMemo(
        () => listBeforeStartItems.filter((entry) => entry.endDateKey < todayKey),
        [listBeforeStartItems, todayKey]
    );
    const listEarlierItems = useMemo(
        () =>
            listBeforeStartItems.filter(
                (entry) => entry.endDateKey >= todayKey
            ),
        [listBeforeStartItems, todayKey]
    );
    const listUpcomingItems = useMemo(
        () =>
            listOnly
                ? getListEntriesForAllItems(items, displayTimezone)
                : getListEntriesForDateRange(
                      items,
                      listStartDate,
                      listEndDate,
                      displayTimezone
                  ),
        [displayTimezone, items, listOnly, listStartDate, listEndDate]
    );
    const groupedPastEvents = useMemo(
        () => groupListEntriesByDate(listPastEvents),
        [listPastEvents]
    );
    const groupedEarlierItems = useMemo(
        () => groupListEntriesByDate(listEarlierItems),
        [listEarlierItems]
    );
    const groupedUpcomingItems = useMemo(
        () => groupListEntriesByDate(listUpcomingItems),
        [listUpcomingItems]
    );
    const hasFutureItems = useMemo(() => {
        if (listOnly) return false;
        const listEndKey = getLocalDateKey(listEndDate);
        return items.some(
            (item) => getDisplayEventRange(item, displayTimezone).startDateKey > listEndKey
        );
    }, [displayTimezone, items, listEndDate, listOnly]);

    useEffect(() => {
        setBrowserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    }, []);

    useEffect(() => {
        onQuickAddDateChange?.(quickAddDateKey);
    }, [onQuickAddDateChange, quickAddDateKey]);

    useEffect(() => {
        const hasActiveTimezone = timezoneOptions.some(
            (option) => option.timezone === activeTimezone
        );

        if (!hasActiveTimezone && timezoneOptions[0]) {
            setActiveTimezone(timezoneOptions[0].timezone);
        }
    }, [activeTimezone, timezoneOptions]);

    useEffect(() => {
        if (!primaryDestination) {
            setDestinationTimezone(null);
            return;
        }

        if (!isGoogleReady || !window.google?.maps?.Geocoder) return;

        let isCancelled = false;
        const geocoder = new window.google.maps.Geocoder();

        async function resolveDestinationTimezone() {
            try {
                const geocodeResult = await geocoder.geocode({
                    address: primaryDestination,
                });
                const location = geocodeResult.results?.[0]?.geometry.location;

                if (!location) return;

                const response = await fetch("/api/timezone", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        lat: location.lat(),
                        lng: location.lng(),
                    }),
                });

                if (!response.ok) return;

                const data: { timeZoneId?: string } = await response.json();

                if (!isCancelled && data.timeZoneId) {
                    setDestinationTimezone(data.timeZoneId);
                }
            } catch {
                if (!isCancelled) {
                    setDestinationTimezone(null);
                }
            }
        }

        void resolveDestinationTimezone();

        return () => {
            isCancelled = true;
        };
    }, [isGoogleReady, primaryDestination]);

    useEffect(() => {
        if (view !== "list") return;
        const target = loadMoreRef.current;
        if (!target || !hasFutureItems) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setListDayCount((dayCount) => dayCount + LIST_LOAD_INCREMENT_DAYS);
                }
            },
            { rootMargin: "320px" }
        );

        observer.observe(target);

        return () => {
            observer.disconnect();
        };
    }, [hasFutureItems, view]);

    useEffect(() => {
        if (effectiveView !== "week") return;
        const scrollContainer = weekScrollRef.current;
        if (!scrollContainer) return;

        const currentWeek = scrollContainer.querySelector<HTMLElement>(
            "[data-current-week='true']"
        );
        if (!currentWeek) return;

        const left =
            currentWeek.offsetLeft -
            Math.max((scrollContainer.clientWidth - currentWeek.clientWidth) / 2, 0);

        window.requestAnimationFrame(() => {
            scrollContainer.scrollTo({
                left,
                behavior: "smooth",
            });
        });
    }, [effectiveView, motionKey, weekStartKey]);

    function updateAnchorDate(nextDate: Date) {
        setAnchorDate(nextDate);
        setMotionKey((key) => key + 1);
    }

    function updateListStartDate(nextDate: Date) {
        setListStartDate(nextDate);
        setListDayCount(INITIAL_LIST_DAYS);
        setMotionKey((key) => key + 1);
    }

    function shiftBackward() {
        if (effectiveView === "list") {
            updateListStartDate(addDays(listStartDate, -7));
            return;
        }

        updateAnchorDate(addDays(anchorDate, effectiveView === "day" ? -1 : -7));
    }

    function shiftForward() {
        if (effectiveView === "list") {
            updateListStartDate(addDays(listStartDate, 7));
            return;
        }

        updateAnchorDate(addDays(anchorDate, effectiveView === "day" ? 1 : 7));
    }

    function goToToday() {
        if (effectiveView === "list") {
            updateListStartDate(parseDateKey(getLocalDateKey(new Date())));
            return;
        }

        updateAnchorDate(new Date());
    }

    function selectDate(dateString: string) {
        if (!dateString) return;
        if (effectiveView === "list") {
            updateListStartDate(parseDateKey(dateString));
            return;
        }

        updateAnchorDate(parseDateKey(dateString));
    }

    function changeView(nextView: CalendarView) {
        setView(nextView);
        setMotionKey((key) => key + 1);
    }

    function changeActiveTimezone(nextTimezone: string) {
        setActiveTimezone(nextTimezone);
        setMotionKey((key) => key + 1);
    }

    function renderTimezoneCard(option: {
        key: string;
        timezone: string;
        cityLabel: string;
        metadataLabel: string;
    }) {
        const isActive = activeTimezone === option.timezone;

        return (
            <button
                key={option.key}
                type="button"
                title={`${option.metadataLabel}: ${option.cityLabel}, ${option.timezone}`}
                aria-pressed={isActive}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                onClick={() => changeActiveTimezone(option.timezone)}
                className={`min-h-20 rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10 ${
                    isActive
                        ? "border-lime-300/40 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                        : "border-white/10 bg-white/[0.06] text-slate-300 hover:text-white"
                }`}
            >
                <span className="block truncate text-sm font-semibold">
                    {option.cityLabel}
                </span>
                <span className={`mt-0.5 block truncate text-[11px] ${isActive ? "text-slate-700" : "text-slate-400"}`}>
                    {getTimezoneGmtOffsetLabel(option.timezone, selectedTimezoneDate)}
                </span>
                <span className={`mt-1 block text-[10px] font-bold uppercase leading-tight ${isActive ? "text-slate-700" : "text-slate-500"}`}>
                    {option.metadataLabel}
                </span>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${isActive ? "bg-slate-950 text-white" : "bg-white/10 text-slate-300"}`}>
                    {getTimezoneOffsetLabel(
                        option.timezone,
                        activeTimezone,
                        selectedTimezoneDate
                    )}
                </span>
            </button>
        );
    }

    return (
        <section className="vaivia-itinerary-calendar overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/30">
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(255,54,190,0.18),transparent_26%),radial-gradient(circle_at_8%_100%,rgba(var(--vaivia-neon-soft-rgb),0.10),transparent_28%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)] p-4 sm:p-6">
                <div className="flex flex-col gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.55em] text-lime-200/80">
                            Travel plan
                        </p>
                        <h2 className="mt-2 text-3xl font-black text-white">
                            {title}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                            {effectiveView === "list"
                                ? formatDateRange(listStartDate, listEndDate)
                                : formatViewTitle(effectiveView, anchorDate)}
                        </p>
                    </div>

                    {!listOnly && (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="grid grid-cols-3 rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-inner shadow-black/20">
                                    {[
                                        { key: "list", label: "List", icon: List },
                                        { key: "day", label: "Day", icon: CalendarDays },
                                        { key: "week", label: "Week", icon: Columns3 },
                                    ].map(({ key, label, icon: Icon }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() =>
                                                changeView(key as CalendarView)
                                            }
                                            className={`flex min-h-9 items-center justify-center gap-2 rounded-full px-3 text-sm font-black uppercase tracking-wide transition ${
                                                view === key
                                                    ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
                                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                                            }`}
                                        >
                                            <Icon
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <label className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 text-sm font-bold text-slate-200">
                                    <span>Date</span>
                                    <input
                                        id="itineraryViewDate"
                                        name="itineraryViewDate"
                                        type="date"
                                        autoComplete="off"
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        value={
                                            effectiveView === "list"
                                                ? getLocalDateKey(listStartDate)
                                                : getLocalDateKey(anchorDate)
                                        }
                                        onChange={(event) =>
                                            selectDate(event.target.value)
                                        }
                                        className="bg-transparent text-sm text-white outline-none [color-scheme:dark]"
                                    />
                                </label>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={shiftBackward}
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                                        aria-label="Previous"
                                    >
                                        <ChevronLeft
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={goToToday}
                                        className="h-9 rounded-full bg-lime-300 px-4 text-xs font-black uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                                    >
                                        TODAY
                                    </button>
                                    <button
                                        type="button"
                                        onClick={shiftForward}
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10"
                                        aria-label="Next"
                                    >
                                        <ChevronRight
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-3 shadow-inner shadow-black/20">
                                <p className="mb-3 text-sm font-black uppercase tracking-wide text-white">
                                    Viewing time zone
                                </p>
                                <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_1fr]">
                                    <section>
                                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                            Current location
                                        </p>
                                        {renderTimezoneCard(currentTimezoneOption)}
                                    </section>

                                    <section>
                                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                            Destination time zones
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {destinationTimezoneOptions.map((option) =>
                                                renderTimezoneCard(option)
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div
                key={`${effectiveView}-${motionKey}`}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
                {effectiveView === "list" && (
                    <div className="p-4 sm:p-6">
                        {listOnly && <JourneyMap items={items} />}
                        <ListView
                            groupedPastEvents={groupedPastEvents}
                            groupedEarlierItems={groupedEarlierItems}
                            groupedUpcomingItems={groupedUpcomingItems}
                            hasFutureItems={hasFutureItems}
                            onOpenItem={setSelectedItem}
                        />
                        <div ref={loadMoreRef} className="h-1" />
                    </div>
                )}

                {!listOnly && effectiveView === "day" && (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                        <div className="overflow-x-auto">
                            <div className="min-w-[680px]">
                                <DayColumn
                                    date={anchorDate}
                                    items={scheduledItems}
                                    displayTimezone={displayTimezone}
                                    showDateHeader
                                    onOpenItem={setSelectedItem}
                                />
                            </div>
                        </div>
                        {promoteIdeaAction ? (
                            <SuggestedIdeasPanel
                                tripId={tripId}
                                ideas={ideas}
                                selectedDate={anchorDate}
                                dayItems={selectedDaySuggestionItems}
                                promoteIdeaAction={promoteIdeaAction}
                                toggleReactionAction={toggleIdeaReactionAction}
                                toggleAttendedAction={toggleIdeaAttendedAction}
                            />
                        ) : null}
                    </div>
                )}

                {!listOnly && effectiveView === "week" && (
                    <div
                        ref={weekScrollRef}
                        className="overflow-x-auto rounded-[1.35rem] [scrollbar-color:rgba(var(--vaivia-neon-rgb),0.65)_rgba(15,23,42,0.7)] [scrollbar-width:thin]"
                        aria-label="Scrollable week calendar"
                    >
                        <div className="flex w-max gap-3 pb-2">
                            <WeekViewFixedRail memberLocations={memberLocations} />
                            <div className="flex w-max">
                                {scrollableWeekStarts.map((scrollWeekStart) => {
                                    const scrollWeekStartKey =
                                        getLocalDateKey(scrollWeekStart);
                                    const scrollWeekDates = Array.from(
                                        { length: 7 },
                                        (_, index) => addDays(scrollWeekStart, index)
                                    );

                                    return (
                                        <div
                                            key={scrollWeekStartKey}
                                            data-current-week={
                                                scrollWeekStartKey === weekStartKey
                                                    ? "true"
                                                    : undefined
                                            }
                                            className="w-max shrink-0 scroll-ml-24 scroll-mr-4"
                                        >
                                            <WeekViewGrid
                                                weekDates={scrollWeekDates}
                                                items={items}
                                                memberLocations={memberLocations}
                                                displayTimezone={displayTimezone}
                                                onOpenItem={setSelectedItem}
                                                onEditMemberLocationLeg={
                                                    onEditMemberLocationLeg
                                                }
                                                showFixedColumn={false}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {selectedItem && (
                <ItineraryItemModal
                    item={selectedItem}
                    tripId={tripId}
                    deleteAction={deleteAction}
                    updateTransportationAction={updateTransportationAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    travelerOptions={travelerOptions}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                    onDuplicateItem={(item) => {
                        setSelectedItem(null);
                        setDuplicatingItem({
                            ...item,
                            title: `${item.title || "Untitled event"} (copy)`,
                        });
                    }}
                    onDuplicateTransportationItem={(item) => {
                        setSelectedItem(null);
                        setDuplicatingTransportationItem(item);
                    }}
                    onClose={() => setSelectedItem(null)}
                />
            )}
            {duplicatingTransportationItem && createTransportationAction ? (
                <TransportationForm
                    key={`transportation-${duplicatingTransportationItem.id}`}
                    tripId={tripId}
                    submitAction={createTransportationAction}
                    isOpen
                    onClose={() => setDuplicatingTransportationItem(null)}
                    defaultDate={duplicatingTransportationItem.item_date}
                    initialItem={getTransportationDuplicateInitialValues(
                        duplicatingTransportationItem
                    )}
                    submitLabel="Duplicate transportation"
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                />
            ) : null}
            {duplicatingItem && (
                <ItineraryItemForm
                    key={`${duplicatingItem.id}-${duplicatingItem.title}`}
                    tripId={tripId}
                    submitAction={createAction}
                    initialItem={duplicatingItem}
                    submitLabel="Duplicate scheduled activity/event"
                    showLauncher={false}
                    duplicateMode
                    onClose={() => setDuplicatingItem(null)}
                />
            )}
        </section>
    );
}
