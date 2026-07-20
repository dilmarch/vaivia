import type {
    CalendarAccommodation,
    ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import { getAccommodationMapsUrl } from "@/lib/accommodations";

const HOLD_DURATION_MINUTES = 2 * 60;
const ARRIVAL_BUFFER_MINUTES = 60;
const MINUTES_IN_DAY = 24 * 60;

type LocalDateTime = {
    dateKey: string;
    time: string;
};

function parseDateKey(dateKey: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
}

function parseTime(time: string | null | undefined) {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time?.trim() || "");
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
}

function formatDateKey(date: Date) {
    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

function shiftLocalDateTime(
    dateKey: string,
    minutes: number,
    offsetMinutes: number
): LocalDateTime | null {
    const date = parseDateKey(dateKey);
    if (!date) return null;

    const totalMinutes = minutes + offsetMinutes;
    const dayOffset = Math.floor(totalMinutes / MINUTES_IN_DAY);
    const minuteOfDay =
        ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    date.setUTCDate(date.getUTCDate() + dayOffset);

    return {
        dateKey: formatDateKey(date),
        time: `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(
            minuteOfDay % 60
        ).padStart(2, "0")}`,
    };
}

function isTransportationArrival(item: ItineraryCalendarItem) {
    const status = item.status.trim().toLowerCase();

    return (
        status !== "cancelled" &&
        status !== "canceled" &&
        Boolean(item.end_time) &&
        (item.source_table === "transportation_items" ||
            item.category === "transportation" ||
            Boolean(item.transportation_mode))
    );
}

function getCheckInStartMinutes(
    accommodation: CalendarAccommodation,
    items: ItineraryCalendarItem[]
) {
    const statedCheckInMinutes = parseTime(accommodation.check_in_time_start);
    if (statedCheckInMinutes === null) return null;

    const latestArrivalMinutes = items.reduce<number | null>((latest, item) => {
        if (!isTransportationArrival(item)) return latest;

        const arrivalDate = item.end_date || item.item_date;
        if (arrivalDate !== accommodation.check_in_date) return latest;

        const arrivalMinutes = parseTime(item.end_time);
        if (arrivalMinutes === null) return latest;

        return latest === null ? arrivalMinutes : Math.max(latest, arrivalMinutes);
    }, null);

    if (latestArrivalMinutes === null) return statedCheckInMinutes;

    return Math.max(
        statedCheckInMinutes,
        latestArrivalMinutes + ARRIVAL_BUFFER_MINUTES
    );
}

function getAccommodationLocation(accommodation: CalendarAccommodation) {
    return (
        accommodation.address ||
        [accommodation.city, accommodation.region, accommodation.country]
            .filter(Boolean)
            .join(", ") ||
        null
    );
}

function buildHoldItem({
    accommodation,
    kind,
    start,
    end,
    timezone,
}: {
    accommodation: CalendarAccommodation;
    kind: "check_in" | "check_out";
    start: LocalDateTime;
    end: LocalDateTime;
    timezone?: string | null;
}): ItineraryCalendarItem {
    const hotelName = accommodation.hotel_name?.trim() || "your stay";

    return {
        id: `accommodation-hold:${accommodation.id}:${kind}`,
        title:
            kind === "check_in"
                ? `Check in to ${hotelName}`
                : `Check out of ${hotelName}`,
        item_date: start.dateKey,
        end_date: end.dateKey === start.dateKey ? null : end.dateKey,
        start_time: start.time,
        end_time: end.time,
        category: "accommodation",
        category_name: "Stay",
        category_color_hex: "#bef264",
        status: "confirmed",
        timezone: timezone || null,
        location: getAccommodationLocation(accommodation),
        formatted_address: accommodation.address || null,
        google_place_id: accommodation.google_place_id || null,
        location_website: getAccommodationMapsUrl(accommodation) || null,
        accommodation_id: accommodation.id,
        accommodation_hold_kind: kind,
    };
}

export function buildAccommodationItineraryHolds({
    accommodations,
    items,
    timezoneByAccommodationId = {},
}: {
    accommodations: CalendarAccommodation[];
    items: ItineraryCalendarItem[];
    timezoneByAccommodationId?: Readonly<Record<string, string | null | undefined>>;
}) {
    return accommodations.flatMap((accommodation) => {
        if (
            ["cancelled", "canceled"].includes(
                accommodation.status?.trim().toLowerCase() || ""
            )
        ) {
            return [];
        }

        const holds: ItineraryCalendarItem[] = [];
        const timezone = timezoneByAccommodationId[accommodation.id] || null;
        const checkInStartMinutes = getCheckInStartMinutes(accommodation, items);

        if (checkInStartMinutes !== null) {
            const start = shiftLocalDateTime(
                accommodation.check_in_date,
                checkInStartMinutes,
                0
            );
            const end = shiftLocalDateTime(
                accommodation.check_in_date,
                checkInStartMinutes,
                HOLD_DURATION_MINUTES
            );

            if (start && end) {
                holds.push(
                    buildHoldItem({
                        accommodation,
                        kind: "check_in",
                        start,
                        end,
                        timezone,
                    })
                );
            }
        }

        const checkOutMinutes = parseTime(accommodation.check_out_time);
        if (checkOutMinutes !== null) {
            const start = shiftLocalDateTime(
                accommodation.check_out_date,
                checkOutMinutes,
                -HOLD_DURATION_MINUTES
            );
            const end = shiftLocalDateTime(
                accommodation.check_out_date,
                checkOutMinutes,
                0
            );

            if (start && end) {
                holds.push(
                    buildHoldItem({
                        accommodation,
                        kind: "check_out",
                        start,
                        end,
                        timezone,
                    })
                );
            }
        }

        return holds;
    });
}
