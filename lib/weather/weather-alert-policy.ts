import { createHash } from "node:crypto";

import { aggregateAdverseSignals } from "@/lib/weather/adverse-rules";
import type {
    WeatherAlert,
    WeatherAlertSeverity,
    WeatherForecastHour,
} from "@/lib/weather/alerts-contracts";
import { zonedDateTimeToUtc } from "@/lib/timezoneDuration";

export const WEATHER_MONITOR_WINDOW_HOURS = 48;
export const MAX_MONITORED_LOCATIONS = 3;
export const NEARBY_LOCATION_DEDUP_KILOMETERS = 10;
const MATERIAL_EVENT_WINDOW_HOURS = 6;

export type MonitoredLocation = {
    key: string;
    label: string;
    latitude: number;
    longitude: number;
    priority: number;
    source: "itinerary" | "accommodation" | "transportation" | "destination";
    affectedItineraryItemIds: string[];
};

export type ItineraryWeatherLocation = {
    id: string;
    title: string;
    itemDate: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    timeZone?: string | null;
    label: string;
    latitude: number;
    longitude: number;
    key?: string | null;
};

export type AccommodationWeatherLocation = {
    id: string;
    label: string;
    checkInDate: string;
    checkOutDate: string;
    latitude: number;
    longitude: number;
    key?: string | null;
};

export type TransportationWeatherLocation = {
    id: string;
    departureDate?: string | null;
    departureTime?: string | null;
    departureTimeZone?: string | null;
    departureLabel?: string | null;
    departureLatitude?: number | null;
    departureLongitude?: number | null;
    departureKey?: string | null;
    arrivalDate?: string | null;
    arrivalTime?: string | null;
    arrivalTimeZone?: string | null;
    arrivalLabel?: string | null;
    arrivalLatitude?: number | null;
    arrivalLongitude?: number | null;
    arrivalKey?: string | null;
};

export type WeatherNotificationEvent = {
    kind: "official" | "forecast";
    provider: "google" | "vaivia";
    sourceIdentity: string;
    title: string;
    eventType: string;
    description: string;
    severity: WeatherAlertSeverity;
    startsAt: string;
    expiresAt: string;
    certainty: string | null;
    urgency: string | null;
    instructions: string[];
    safetyRecommendations: Array<{
        directive: string;
        subtext: string | null;
    }>;
    sourceName: string;
    sourceAuthorityUrl: string | null;
};

function dateKeyInOffsetTimezone(now: Date, timezone: string) {
    const match = timezone.match(/^UTC([+-])(\d{2}):(\d{2})$/i);
    if (!match) return null;
    const offsetMinutes =
        (Number(match[2]) * 60 + Number(match[3])) *
        (match[1] === "-" ? -1 : 1);
    return new Date(now.getTime() + offsetMinutes * 60_000)
        .toISOString()
        .slice(0, 10);
}

export function getDestinationLocalDateKey(now: Date, timeZone: string) {
    const offsetDate = dateKeyInOffsetTimezone(now, timeZone);
    if (offsetDate) return offsetDate;

    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(now);
        const values = Object.fromEntries(
            parts
                .filter((part) => part.type !== "literal")
                .map((part) => [part.type, part.value])
        );
        return `${values.year}-${values.month}-${values.day}`;
    } catch {
        return null;
    }
}

export function isTripActiveOnDestinationDate({
    now,
    timeZone,
    startDate,
    endDate,
}: {
    now: Date;
    timeZone: string;
    startDate: string | null;
    endDate: string | null;
}) {
    const localDate = getDestinationLocalDateKey(now, timeZone);
    if (!localDate || !startDate) return false;
    const effectiveEndDate = endDate || startDate;
    return localDate >= startDate && localDate <= effectiveEndDate;
}

export function getMemberTripDateRange({
    tripStartDate,
    tripEndDate,
    joiningLegs,
}: {
    tripStartDate: string | null;
    tripEndDate: string | null;
    joiningLegs: Array<{ startDate: string | null; endDate: string | null }>;
}) {
    const validLegs = joiningLegs.filter((leg) => leg.startDate);
    if (validLegs.length === 0) {
        return {
            startDate: tripStartDate,
            endDate: tripEndDate || tripStartDate,
        };
    }

    return {
        startDate: validLegs.reduce<string | null>(
            (earliest, leg) =>
                !earliest || (leg.startDate && leg.startDate < earliest)
                    ? leg.startDate
                    : earliest,
            null
        ),
        endDate: validLegs.reduce<string | null>((latest, leg) => {
            const end = leg.endDate || leg.startDate;
            return !latest || (end && end > latest) ? end : latest;
        }, null),
    };
}

export function isNotificationWorthyOfficialAlert(
    alert: WeatherAlert,
    now = new Date(),
    windowHours = WEATHER_MONITOR_WINDOW_HOURS
) {
    const windowEnd = now.getTime() + windowHours * 3_600_000;
    const startsAt = alert.startsAt ? Date.parse(alert.startsAt) : now.getTime();
    const expiresAt = alert.expiresAt
        ? Date.parse(alert.expiresAt)
        : windowEnd;
    if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) return false;
    if (expiresAt <= now.getTime() || startsAt > windowEnd) return false;
    if (alert.urgency === "PAST" || alert.certainty === "UNLIKELY") return false;
    if (alert.severity === "MINOR" || alert.severity === "UNKNOWN") return false;

    if (alert.severity === "EXTREME" || alert.severity === "SEVERE") {
        return true;
    }

    return (
        alert.severity === "MODERATE" &&
        (alert.urgency === "IMMEDIATE" || alert.urgency === "EXPECTED") &&
        (alert.certainty === "OBSERVED" ||
            alert.certainty === "VERY_LIKELY" ||
            alert.certainty === "LIKELY")
    );
}

function datePlusDays(dateKey: string, days: number) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function validCoordinatePair(latitude: unknown, longitude: unknown) {
    return (
        typeof latitude === "number" &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        typeof longitude === "number" &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
    );
}

function scheduledInstant(
    date: string | null | undefined,
    time: string | null | undefined,
    timeZone: string | null | undefined
) {
    if (!date || !time || !timeZone) return null;
    try {
        const value = zonedDateTimeToUtc(date, time, timeZone);
        return Number.isFinite(value.getTime()) ? value : null;
    } catch {
        return null;
    }
}

function locationKey(
    explicit: string | null | undefined,
    latitude: number,
    longitude: number
) {
    return (
        explicit?.trim() ||
        `${Math.round(latitude * 10_000) / 10_000},${Math.round(longitude * 10_000) / 10_000}`
    );
}

function distanceKilometers(first: MonitoredLocation, second: MonitoredLocation) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLatitude = radians(second.latitude - first.latitude);
    const deltaLongitude = radians(second.longitude - first.longitude);
    const startLatitude = radians(first.latitude);
    const endLatitude = radians(second.latitude);
    const value =
        Math.sin(deltaLatitude / 2) ** 2 +
        Math.cos(startLatitude) *
            Math.cos(endLatitude) *
            Math.sin(deltaLongitude / 2) ** 2;
    return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function deduplicateMonitoredLocations(
    locations: MonitoredLocation[],
    maximum = MAX_MONITORED_LOCATIONS
) {
    const selected: MonitoredLocation[] = [];
    const sorted = locations.toSorted((first, second) =>
        first.priority === second.priority
            ? first.label.localeCompare(second.label)
            : first.priority - second.priority
    );

    for (const location of sorted) {
        const duplicate = selected.find(
            (current) =>
                current.key === location.key ||
                distanceKilometers(current, location) <=
                    NEARBY_LOCATION_DEDUP_KILOMETERS
        );
        if (duplicate) {
            duplicate.affectedItineraryItemIds = Array.from(
                new Set([
                    ...duplicate.affectedItineraryItemIds,
                    ...location.affectedItineraryItemIds,
                ])
            ).sort();
            continue;
        }
        selected.push({
            ...location,
            affectedItineraryItemIds: Array.from(
                new Set(location.affectedItineraryItemIds)
            ).sort(),
        });
        if (selected.length >= maximum) break;
    }

    return selected;
}

export function selectRelevantWeatherLocations({
    now,
    tripTimeZone,
    primaryDestination,
    itinerary,
    accommodations,
    transportation,
}: {
    now: Date;
    tripTimeZone: string;
    primaryDestination: Omit<MonitoredLocation, "priority" | "source" | "affectedItineraryItemIds"> | null;
    itinerary: ItineraryWeatherLocation[];
    accommodations: AccommodationWeatherLocation[];
    transportation: TransportationWeatherLocation[];
}) {
    const locations: MonitoredLocation[] = [];
    const windowEnd = now.getTime() + WEATHER_MONITOR_WINDOW_HOURS * 3_600_000;
    const localDate = getDestinationLocalDateKey(now, tripTimeZone);
    const localWindowEndDate = localDate ? datePlusDays(localDate, 2) : null;

    for (const item of itinerary) {
        if (!validCoordinatePair(item.latitude, item.longitude)) continue;
        const instant = scheduledInstant(
            item.itemDate,
            item.startTime,
            item.timeZone || tripTimeZone
        );
        const dateRelevant = Boolean(
            localDate &&
            localWindowEndDate &&
            item.itemDate >= localDate &&
            item.itemDate <= localWindowEndDate
        );
        const timeRelevant = Boolean(
            instant &&
                instant.getTime() >= now.getTime() - 3_600_000 &&
                instant.getTime() <= windowEnd
        );
        // Exact scheduled times take precedence. Date-only items use the
        // destination-local calendar fallback because no reliable instant exists.
        if (instant ? !timeRelevant : !dateRelevant) continue;
        locations.push({
            key: locationKey(item.key, item.latitude, item.longitude),
            label: item.label || item.title,
            latitude: item.latitude,
            longitude: item.longitude,
            priority: item.itemDate === localDate ? 0 : 1,
            source: "itinerary",
            affectedItineraryItemIds: [item.id],
        });
    }

    for (const stay of accommodations) {
        if (!validCoordinatePair(stay.latitude, stay.longitude) || !localDate) {
            continue;
        }
        const current =
            stay.checkInDate <= localDate && stay.checkOutDate >= localDate;
        const upcoming = Boolean(
            localWindowEndDate &&
                stay.checkInDate > localDate &&
                stay.checkInDate <= localWindowEndDate
        );
        if (!current && !upcoming) continue;
        locations.push({
            key: locationKey(stay.key, stay.latitude, stay.longitude),
            label: stay.label,
            latitude: stay.latitude,
            longitude: stay.longitude,
            priority: current ? 0 : 1,
            source: "accommodation",
            affectedItineraryItemIds: [stay.id],
        });
    }

    for (const item of transportation) {
        const endpoints = [
            {
                date: item.departureDate,
                time: item.departureTime,
                timeZone: item.departureTimeZone,
                label: item.departureLabel,
                latitude: item.departureLatitude,
                longitude: item.departureLongitude,
                key: item.departureKey,
            },
            {
                date: item.arrivalDate,
                time: item.arrivalTime,
                timeZone: item.arrivalTimeZone,
                label: item.arrivalLabel,
                latitude: item.arrivalLatitude,
                longitude: item.arrivalLongitude,
                key: item.arrivalKey,
            },
        ];
        for (const endpoint of endpoints) {
            if (!validCoordinatePair(endpoint.latitude, endpoint.longitude)) {
                continue;
            }
            const instant = scheduledInstant(
                endpoint.date,
                endpoint.time,
                endpoint.timeZone
            );
            if (
                !instant ||
                instant.getTime() < now.getTime() - 3_600_000 ||
                instant.getTime() > windowEnd
            ) {
                continue;
            }
            locations.push({
                key: locationKey(
                    endpoint.key,
                    endpoint.latitude as number,
                    endpoint.longitude as number
                ),
                label: endpoint.label || "Upcoming transport location",
                latitude: endpoint.latitude as number,
                longitude: endpoint.longitude as number,
                priority: 1,
                source: "transportation",
                affectedItineraryItemIds: [item.id],
            });
        }
    }

    if (
        primaryDestination &&
        validCoordinatePair(
            primaryDestination.latitude,
            primaryDestination.longitude
        )
    ) {
        locations.push({
            ...primaryDestination,
            priority: 2,
            source: "destination",
            affectedItineraryItemIds: [],
        });
    }

    return deduplicateMonitoredLocations(locations);
}

export function weatherEventsForMonitoringData({
    officialAlerts,
    hourlyForecast,
    now,
}: {
    officialAlerts: WeatherAlert[];
    hourlyForecast: WeatherForecastHour[];
    now: Date;
}): WeatherNotificationEvent[] {
    const official = officialAlerts
        .filter((alert) => isNotificationWorthyOfficialAlert(alert, now))
        .map<WeatherNotificationEvent>((alert) => ({
            kind: "official",
            provider: "google",
            sourceIdentity: alert.providerAlertId,
            title: alert.title,
            eventType: alert.eventType,
            description: alert.description,
            severity: alert.severity,
            startsAt: alert.startsAt || now.toISOString(),
            expiresAt:
                alert.expiresAt ||
                new Date(
                    now.getTime() + WEATHER_MONITOR_WINDOW_HOURS * 3_600_000
                ).toISOString(),
            certainty: alert.certainty,
            urgency: alert.urgency,
            instructions: alert.instructions,
            safetyRecommendations: alert.safetyRecommendations,
            sourceName: alert.sourceName,
            sourceAuthorityUrl: alert.sourceAuthorityUrl,
        }));

    // Official alerts are authoritative and suppress forecast-derived warnings
    // for the same monitored location during this run.
    if (official.length > 0) return official;

    return aggregateAdverseSignals(hourlyForecast).map((event) => ({
        ...event,
        provider: "vaivia" as const,
        sourceIdentity: event.ruleId,
        certainty: null,
        urgency: null,
        instructions: [],
        safetyRecommendations: [],
        sourceName: "VAIVIA forecast-derived travel signal",
        sourceAuthorityUrl: null,
    }));
}

function materialWindowBucket(value: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "unknown";
    const bucketMs = MATERIAL_EVENT_WINDOW_HOURS * 3_600_000;
    return new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString();
}

export function buildWeatherNotificationDeduplicationKey({
    userId,
    tripId,
    location,
    event,
}: {
    userId: string;
    tripId: string;
    location: MonitoredLocation;
    event: WeatherNotificationEvent;
}) {
    const affectedPlanFingerprint = createHash("sha256")
        .update(location.affectedItineraryItemIds.toSorted().join("|"))
        .digest("hex")
        .slice(0, 12);
    const identity = [
        userId,
        tripId,
        location.key,
        event.provider,
        event.sourceIdentity,
        materialWindowBucket(event.startsAt),
        materialWindowBucket(event.expiresAt),
        event.severity,
        affectedPlanFingerprint,
    ].join("|");
    return `weather:${createHash("sha256").update(identity).digest("hex")}`;
}
