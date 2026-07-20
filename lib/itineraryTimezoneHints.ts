type ItineraryTimezoneItem = {
    item_date: string;
    end_date?: string | null;
    category?: string | null;
    transportation_mode?: string | null;
    source_table?: "itinerary_items" | "transportation_items";
    timezone?: string | null;
    departure_timezone?: string | null;
    arrival_timezone?: string | null;
};

type PrioritizedTimezoneHint = {
    timezone: string;
    priority: number;
};

const TRANSPORTATION_DEPARTURE_PRIORITY = 1;
const TRANSPORTATION_ARRIVAL_PRIORITY = 2;
const SCHEDULED_ITEM_PRIORITY = 3;
const MAX_DATE_RANGE_DAYS = 3660;

function isDateKey(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    return (
        !Number.isNaN(parsedDate.getTime()) &&
        parsedDate.toISOString().slice(0, 10) === value
    );
}

function addUtcDay(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1));

    return date.toISOString().slice(0, 10);
}

function setTimezoneHint(
    hints: Map<string, PrioritizedTimezoneHint>,
    dateKey: string,
    timezone: string | null | undefined,
    priority: number
) {
    const normalizedTimezone = timezone?.trim();
    if (!isDateKey(dateKey) || !normalizedTimezone) return;

    const existingHint = hints.get(dateKey);
    if (existingHint && existingHint.priority >= priority) return;

    hints.set(dateKey, { timezone: normalizedTimezone, priority });
}

function setScheduledItemDateRange(
    hints: Map<string, PrioritizedTimezoneHint>,
    item: ItineraryTimezoneItem
) {
    const timezone = item.timezone?.trim();
    if (!timezone || !isDateKey(item.item_date)) return;

    const endDate =
        item.end_date && isDateKey(item.end_date) && item.end_date >= item.item_date
            ? item.end_date
            : item.item_date;
    let dateKey = item.item_date;

    for (let dayIndex = 0; dayIndex <= MAX_DATE_RANGE_DAYS; dayIndex += 1) {
        setTimezoneHint(hints, dateKey, timezone, SCHEDULED_ITEM_PRIORITY);
        if (dateKey === endDate) break;
        dateKey = addUtcDay(dateKey);
    }
}

/**
 * Builds date-to-timezone hints from timezone data already saved on the trip
 * itinerary. Explicit scheduled-item timezones take precedence. On a
 * transportation day, an arrival timezone takes precedence over departure,
 * and the last known timezone carries forward through the trip end date.
 */
export function buildItineraryTimezoneHints(
    items: ItineraryTimezoneItem[],
    tripEndDate?: string | null
) {
    const hints = new Map<string, PrioritizedTimezoneHint>();

    items.forEach((item) => {
        const isTransportation =
            item.source_table === "transportation_items" ||
            item.category === "transportation" ||
            Boolean(item.transportation_mode);

        if (!isTransportation) {
            setScheduledItemDateRange(hints, item);
            return;
        }

        setTimezoneHint(
            hints,
            item.item_date,
            item.departure_timezone || item.timezone,
            TRANSPORTATION_DEPARTURE_PRIORITY
        );
        setTimezoneHint(
            hints,
            item.end_date || item.item_date,
            item.arrival_timezone,
            TRANSPORTATION_ARRIVAL_PRIORITY
        );
    });

    const knownDates = Array.from(hints.keys()).sort();
    const firstKnownDate = knownDates[0];
    const lastKnownDate = knownDates.at(-1);
    const fillThroughDate =
        tripEndDate && isDateKey(tripEndDate) && tripEndDate > (lastKnownDate || "")
            ? tripEndDate
            : lastKnownDate;

    if (firstKnownDate && fillThroughDate) {
        let dateKey = firstKnownDate;
        let latestTimezone = "";

        for (let dayIndex = 0; dayIndex <= MAX_DATE_RANGE_DAYS; dayIndex += 1) {
            const exactHint = hints.get(dateKey);
            if (exactHint) {
                latestTimezone = exactHint.timezone;
            } else if (latestTimezone) {
                hints.set(dateKey, { timezone: latestTimezone, priority: 0 });
            }

            if (dateKey === fillThroughDate) break;
            dateKey = addUtcDay(dateKey);
        }
    }

    return Object.fromEntries(
        Array.from(hints.entries()).map(([dateKey, hint]) => [
            dateKey,
            hint.timezone,
        ])
    );
}
